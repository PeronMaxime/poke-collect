import { randomInt } from 'node:crypto';
import { and, eq, gt, gte, inArray, isNull, or } from 'drizzle-orm';
import { expeditions, pityCounters, playerProfiles, pokemon, questProgress } from '@poke/db';
import type { Db } from '@poke/db';
import {
  MAX_SEED,
  checkTeam,
  encounterCount,
  isZoneUnlocked,
  legendarySite,
  playerBonuses,
  playerSlots,
  resolveExpedition,
  resolveQuestExpedition,
  zoneChainStatus,
} from '@poke/game-core';
import type {
  ClaimedRewards,
  ExpeditionResult,
  GameContext,
  ZoneChainStatus,
} from '@poke/game-core';
import type {
  StartExpeditionInput,
  StartQuestExpeditionInput,
  StoredExpeditionResult,
} from '@poke/shared';
import type { ContentCache } from '../content-cache';
import { GameError } from './errors';
import { syncQuests } from './quests';
import {
  addItems,
  assertAvailable,
  caughtDex,
  claimedRewards,
  insertPokemon,
  itemQuantity,
  playerProgress,
  recordPokedex,
  shinyCharm,
  takeItems,
  toInstance,
} from './store';
import type { ExpeditionRow, PokemonRow, QuestProgressRow } from './store';

export { GameError };

/** Résultat vide : aucune rencontre, rien d'utilisé. */
const EMPTY_RESULT: ExpeditionResult = {
  encounters: [],
  loot: [],
  team: [],
  xpPerMember: 0,
  pity: {},
  ballsUsed: 0,
  berriesUsed: 0,
  shinyChance: 0,
};

export function newSeed(): number {
  return randomInt(0, MAX_SEED + 1);
}

/** Nombre d'emplacements d'expédition du joueur (départ + paliers et collections réclamés). */
export function expeditionSlots(ctx: GameContext, claimed: ClaimedRewards): number {
  return playerSlots(ctx, claimed).expeditions;
}

export async function requireStartedProfile(db: Db, userId: string) {
  const [profile] = await db.select().from(playerProfiles).where(eq(playerProfiles.userId, userId));
  if (!profile) throw new GameError(409, 'NO_PROFILE');
  if (profile.starterSpeciesId == null) throw new GameError(409, 'NO_STARTER');
  return profile;
}

/**
 * Chaînes de zone du joueur (bonus shiny) : expéditions en cours, ou récupérées depuis moins
 * que le délai de relance. Une zone absente repart de 0.
 */
export async function shinyChains(
  db: Db,
  ctx: GameContext,
  userId: string,
  now: Date,
  zoneId?: string,
): Promise<Map<string, ZoneChainStatus>> {
  const since = new Date(now.getTime() - ctx.balance.shiny.chainWindowMinutes * 60_000);
  const rows = await db
    .select({
      zoneId: expeditions.zoneId,
      chain: expeditions.shinyChain,
      claimedAt: expeditions.claimedAt,
    })
    .from(expeditions)
    .where(
      and(
        eq(expeditions.ownerId, userId),
        isNull(expeditions.questId), // les expéditions légendaires n'entrent pas dans les chaînes
        zoneId ? eq(expeditions.zoneId, zoneId) : undefined,
        or(isNull(expeditions.claimedAt), gte(expeditions.claimedAt, since)),
      ),
    );
  const byZone = new Map<string, typeof rows>();
  for (const r of rows) {
    if (r.zoneId) byZone.set(r.zoneId, [...(byZone.get(r.zoneId) ?? []), r]);
  }
  const chains = new Map<string, ZoneChainStatus>();
  for (const [id, runs] of byZone) {
    const status = zoneChainStatus(ctx, runs, now);
    if (status.chain > 0) chains.set(id, status);
  }
  return chains;
}

/** Premier emplacement d'expédition libre du joueur. */
async function freeSlot(db: Db, ctx: GameContext, userId: string): Promise<number> {
  const active = await db
    .select({ slotIndex: expeditions.slotIndex })
    .from(expeditions)
    .where(and(eq(expeditions.ownerId, userId), isNull(expeditions.claimedAt)));
  const used = new Set(active.map((e) => e.slotIndex));
  const slots = expeditionSlots(ctx, await claimedRewards(db, userId));
  const slotIndex = Array.from({ length: slots }, (_, i) => i).find((i) => !used.has(i));
  if (slotIndex === undefined) throw new GameError(409, 'NO_FREE_SLOT');
  return slotIndex;
}

/** Équipe dans l'ordre choisi : Pokémon possédés et disponibles (ni occupés ni K.O.). */
async function availableTeam(db: Db, userId: string, ids: string[], now: Date) {
  const rows = ids.length
    ? await db
        .select()
        .from(pokemon)
        .where(and(eq(pokemon.ownerId, userId), inArray(pokemon.id, ids)))
    : [];
  if (rows.length !== new Set(ids).size) throw new GameError(404, 'POKEMON_NOT_FOUND');
  await assertAvailable(db, userId, rows, now);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => toInstance(byId.get(id)!));
}

/**
 * Lance une expédition : vérifie la zone, l'équipe et le stock, réserve les Balls et baies,
 * enregistre la version de contenu active, un seed tiré côté serveur et le maillon de la
 * chaîne de zone.
 */
export async function startExpedition(
  db: Db,
  content: ContentCache,
  userId: string,
  input: StartExpeditionInput,
  now: Date,
): Promise<ExpeditionRow> {
  const ctx = await content.get();
  await requireStartedProfile(db, userId);
  const zone = ctx.zone(input.zoneId);
  if (!zone) throw new GameError(404, 'ZONE_NOT_FOUND');
  if (!isZoneUnlocked(ctx, zone, await playerProgress(db, ctx, userId))) {
    throw new GameError(403, 'ZONE_LOCKED');
  }
  if (input.ballItemId && !ctx.itemEffect(input.ballItemId, 'ball')) {
    throw new GameError(400, 'NOT_A_BALL');
  }
  if (input.berryItemId && !ctx.itemEffect(input.berryItemId, 'captureBoost')) {
    throw new GameError(400, 'NOT_A_BERRY');
  }

  return db.transaction(async (tx) => {
    const slotIndex = await freeSlot(tx, ctx, userId);
    const team = await availableTeam(tx, userId, input.team, now);
    const check = checkTeam(ctx, zone, input.durationMinutes, team);
    if (check.errors.length > 0) throw new GameError(400, 'TEAM_INVALID', { errors: check.errors });

    // Une Ball (et une baie) par rencontre au maximum : on réserve ce qui sera utilisé.
    const encounters = encounterCount(ctx, input.durationMinutes);
    const reserve = async (itemId: string | null, max = encounters) => {
      if (!itemId) return 0;
      const quantity = Math.min(encounters, max, await itemQuantity(tx, userId, itemId));
      if (!(await takeItems(tx, userId, itemId, quantity)))
        throw new GameError(409, 'STOCK_CHANGED');
      return quantity;
    };
    const balls = await reserve(input.ballItemId, input.ballCount);
    const berries = await reserve(input.berryItemId);
    const chain = (await shinyChains(tx, ctx, userId, now, zone.id)).get(zone.id)?.chain ?? 0;

    const [row] = await tx
      .insert(expeditions)
      .values({
        ownerId: userId,
        zoneId: zone.id,
        slotIndex,
        team: input.team,
        durationMinutes: input.durationMinutes,
        ballItemId: balls > 0 ? input.ballItemId : null,
        balls,
        berryItemId: berries > 0 ? input.berryItemId : null,
        berries,
        captureFilter: input.captureFilter ?? null,
        contentVersionId: ctx.content.versionId,
        startedAt: now,
        endsAt: new Date(now.getTime() + input.durationMinutes * 60_000),
        seed: newSeed(),
        shinyChain: chain,
      })
      .returning();
    return row!;
  });
}

/**
 * Lance l'expédition légendaire d'une quête réclamée (depuis les quêtes uniquement) vers le
 * prochain Pokémon de la récompense pas encore capturé, selon sa configuration (durée, PE
 * minimale, types requis, région de la quête) : un emplacement d'expédition, une seule Ball et
 * une baie au plus. Une seule à la fois par quête.
 */
export async function startQuestExpedition(
  db: Db,
  content: ContentCache,
  userId: string,
  questId: string,
  input: StartQuestExpeditionInput,
  now: Date,
): Promise<ExpeditionRow> {
  const ctx = await content.get();
  await requireStartedProfile(db, userId);
  const quest = ctx.quest(questId);
  if (!quest) throw new GameError(404, 'QUEST_NOT_FOUND');
  if (!ctx.itemEffect(input.ballItemId, 'ball')) throw new GameError(400, 'NOT_A_BALL');
  if (input.berryItemId && !ctx.itemEffect(input.berryItemId, 'captureBoost')) {
    throw new GameError(400, 'NOT_A_BERRY');
  }

  return db.transaction(async (tx) => {
    const [progress] = await tx
      .select()
      .from(questProgress)
      .where(and(eq(questProgress.ownerId, userId), eq(questProgress.questId, quest.id)));
    if (!progress?.claimedAt) throw new GameError(409, 'QUEST_NOT_CLAIMED');
    const target = quest.rewards.pokemon[progress.pokemonCaught];
    if (!target) throw new GameError(409, 'QUEST_POKEMON_CAUGHT');
    const { durationMinutes } = target.expedition;
    const [running] = await tx
      .select({ id: expeditions.id })
      .from(expeditions)
      .where(
        and(
          eq(expeditions.ownerId, userId),
          eq(expeditions.questId, quest.id),
          isNull(expeditions.claimedAt),
        ),
      );
    if (running) throw new GameError(409, 'QUEST_EXPEDITION_RUNNING');

    const slotIndex = await freeSlot(tx, ctx, userId);
    const team = await availableTeam(tx, userId, input.team, now);
    const { errors } = checkTeam(ctx, legendarySite(quest, target), durationMinutes, team);
    if (errors.length > 0) throw new GameError(400, 'TEAM_INVALID', { errors });

    for (const itemId of [input.ballItemId, input.berryItemId]) {
      if (itemId && !(await takeItems(tx, userId, itemId, 1))) {
        throw new GameError(409, 'NOT_ENOUGH_ITEMS');
      }
    }

    const [row] = await tx
      .insert(expeditions)
      .values({
        ownerId: userId,
        questId: quest.id,
        slotIndex,
        team: input.team,
        durationMinutes,
        ballItemId: input.ballItemId,
        balls: 1,
        berryItemId: input.berryItemId,
        berries: input.berryItemId ? 1 : 0,
        contentVersionId: ctx.content.versionId,
        startedAt: now,
        endsAt: new Date(now.getTime() + durationMinutes * 60_000),
        seed: newSeed(),
      })
      .returning();
    return row!;
  });
}

/**
 * Annule une expédition en cours : elle disparaît sans résultat, l'équipe redevient disponible
 * et les Balls et baies réservées sont rendues. Une expédition terminée se réclame.
 */
export async function cancelExpedition(
  db: Db,
  userId: string,
  expeditionId: string,
  now: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [found] = await tx
      .delete(expeditions)
      .where(
        and(
          eq(expeditions.id, expeditionId),
          eq(expeditions.ownerId, userId),
          isNull(expeditions.claimedAt),
          gt(expeditions.endsAt, now),
        ),
      )
      .returning();
    if (!found) {
      const [existing] = await tx
        .select({ claimedAt: expeditions.claimedAt })
        .from(expeditions)
        .where(and(eq(expeditions.id, expeditionId), eq(expeditions.ownerId, userId)));
      if (!existing) throw new GameError(404, 'EXPEDITION_NOT_FOUND');
      throw new GameError(409, existing.claimedAt ? 'ALREADY_CLAIMED' : 'ALREADY_FINISHED');
    }
    await addItems(tx, userId, [
      ...(found.ballItemId ? [{ itemId: found.ballItemId, quantity: found.balls }] : []),
      ...(found.berryItemId ? [{ itemId: found.berryItemId, quantity: found.berries }] : []),
    ]);
  });
}

/**
 * Réclame une expédition terminée : calcule le résultat (seed + contenu de la version de
 * départ) puis l'applique en une transaction. Une expédition ne se réclame qu'une fois.
 */
export async function claimExpedition(
  db: Db,
  content: ContentCache,
  userId: string,
  expeditionId: string,
  now: Date,
): Promise<{ expedition: ExpeditionRow; captured: PokemonRow[] }> {
  const [found] = await db
    .select()
    .from(expeditions)
    .where(and(eq(expeditions.id, expeditionId), eq(expeditions.ownerId, userId)));
  if (!found) throw new GameError(404, 'EXPEDITION_NOT_FOUND');
  if (found.claimedAt) throw new GameError(409, 'ALREADY_CLAIMED');
  if (now < found.endsAt) throw new GameError(409, 'NOT_FINISHED', { endsAt: found.endsAt });

  const ctx = await content.version(found.contentVersionId);
  // Expédition légendaire : pas de zone, la quête (de la version de départ) la décrit.
  const quest = found.questId ? ctx.quest(found.questId) : undefined;
  const zone = found.zoneId ? ctx.zone(found.zoneId) : undefined;
  if (!found.questId && !zone) throw new GameError(500, 'ZONE_MISSING_IN_VERSION');
  // Les quêtes suivent le contenu publié, pas la version de départ de l'expédition.
  const current = await content.get();

  return db.transaction(async (tx) => {
    // Verrou : seule la première réclamation passe.
    const [locked] = await tx
      .update(expeditions)
      .set({ claimedAt: now })
      .where(and(eq(expeditions.id, found.id), isNull(expeditions.claimedAt)))
      .returning();
    if (!locked) throw new GameError(409, 'ALREADY_CLAIMED');

    const teamRows = found.team.length
      ? await tx
          .select()
          .from(pokemon)
          .where(and(eq(pokemon.ownerId, userId), inArray(pokemon.id, found.team)))
      : [];
    const team = teamRows.map(toInstance);
    const bonuses = playerBonuses(ctx, await claimedRewards(tx, userId));
    const charm = await shinyCharm(tx, ctx, userId);
    let result: ExpeditionResult;
    let questRow: QuestProgressRow | undefined;
    if (found.questId) {
      // Expédition légendaire : le prochain Pokémon de la récompense pas encore capturé.
      [questRow] = await tx
        .select()
        .from(questProgress)
        .where(and(eq(questProgress.ownerId, userId), eq(questProgress.questId, found.questId)));
      const target = questRow && quest?.rewards.pokemon[questRow.pokemonCaught];
      result =
        target && found.ballItemId
          ? resolveQuestExpedition(ctx, {
              target,
              seed: found.seed,
              team,
              ballItemId: found.ballItemId,
              berryItemId: found.berryItemId,
              bonuses,
              shiny: { charm },
            })
          : EMPTY_RESULT; // plus rien à capturer (quête modifiée) : Ball et baie rendues
    } else if (zone) {
      const speciesIds = [...new Set(zone.encounters.map((e) => e.speciesId))];
      const pityRows = await tx
        .select()
        .from(pityCounters)
        .where(and(eq(pityCounters.ownerId, userId), inArray(pityCounters.speciesId, speciesIds)));
      result = resolveExpedition(ctx, {
        zone,
        durationMinutes: found.durationMinutes,
        seed: found.seed,
        team,
        balls: found.ballItemId ? { itemId: found.ballItemId, quantity: found.balls } : null,
        berries: found.berryItemId ? { itemId: found.berryItemId, quantity: found.berries } : null,
        pity: Object.fromEntries(pityRows.map((r) => [r.speciesId, r.misses])),
        bonuses,
        // Chaîne figée au départ ; Charme Chroma possédé à la réclamation.
        shiny: { chain: found.shinyChain, charm },
        captureFilter: found.captureFilter,
        ...(found.captureFilter?.newOnly && { caught: await caughtDex(tx, userId) }),
      });
    } else {
      result = EMPTY_RESULT; // inatteignable : une expédition normale a toujours sa zone
    }

    const capturedEncounters = result.encounters.filter((e) => e.pokemon);
    const captured = await insertPokemon(
      tx,
      userId,
      capturedEncounters.map((e) => e.pokemon!),
      {
        origin: found.questId ? 'quest' : 'capture',
        originRegion: zone?.regionId ?? quest?.regionId ?? null,
        at: now,
      },
    );
    if (questRow && captured.length > 0) {
      await tx
        .update(questProgress)
        .set({ pokemonCaught: questRow.pokemonCaught + captured.length })
        .where(and(eq(questProgress.ownerId, userId), eq(questProgress.questId, questRow.questId)));
    }
    const newInDex = await recordPokedex(tx, userId, {
      seen: result.encounters.map((e) => e.speciesId),
      caught: captured,
      at: now,
    });

    for (const [speciesId, misses] of Object.entries(result.pity)) {
      await tx
        .insert(pityCounters)
        .values({ ownerId: userId, speciesId: Number(speciesId), misses })
        .onConflictDoUpdate({
          target: [pityCounters.ownerId, pityCounters.speciesId],
          set: { misses },
        });
    }

    // Butin + Balls et baies réservées mais non utilisées.
    await addItems(tx, userId, [
      ...result.loot,
      ...(found.ballItemId
        ? [{ itemId: found.ballItemId, quantity: found.balls - result.ballsUsed }]
        : []),
      ...(found.berryItemId
        ? [{ itemId: found.berryItemId, quantity: found.berries - result.berriesUsed }]
        : []),
    ]);

    for (const m of result.team) {
      await tx
        .update(pokemon)
        .set({ xp: m.xpAfter, level: m.levelAfter, happiness: m.happinessAfter })
        .where(eq(pokemon.id, m.id));
    }

    // Une expédition légendaire (sans zone) ne compte pas pour les étapes « action » des quêtes.
    await syncQuests(
      tx,
      current,
      userId,
      now,
      !zone
        ? undefined
        : {
            type: 'expedition',
            zoneId: zone.id,
            team,
            captured: capturedEncounters.map((e) => e.pokemon!),
          },
    );

    let capturedIndex = 0;
    const stored: StoredExpeditionResult = {
      ...result,
      encounters: result.encounters.map((e) =>
        e.pokemon ? { ...e, pokemonId: captured[capturedIndex++]!.id } : e,
      ),
      ...newInDex,
    };
    const [claimed] = await tx
      .update(expeditions)
      .set({ result: stored })
      .where(eq(expeditions.id, found.id))
      .returning();
    return { expedition: claimed!, captured };
  });
}
