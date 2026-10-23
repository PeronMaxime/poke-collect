import { randomInt } from 'node:crypto';
import { and, eq, gt, gte, inArray, isNotNull, isNull, or } from 'drizzle-orm';
import { expeditions, pityCounters, playerProfiles, pokemon, questProgress } from '@poke/db';
import type { Db } from '@poke/db';
import {
  MAX_SEED,
  checkTeam,
  expeditionEnv,
  expeditionPlan,
  isZoneUnlocked,
  legendarySite,
  localHour,
  playerBonuses,
  playerSlots,
  questEncounter,
  resolveExpedition,
  resolveQuestExpedition,
  roamerFleeZoneId,
  roamerPositions,
  roamingTarget,
  roamingZones,
  weatherHour,
  zoneChainStatus,
  zoneWeather,
} from '@poke/game-core';
import type {
  ClaimedRewards,
  ExpeditionResult,
  ExpeditionRoamer,
  GameContext,
  PlayerProgress,
  RoamerPosition,
  ZoneChainStatus,
} from '@poke/game-core';
import type {
  ClaimExpeditionInput,
  LegendaryEncounterDto,
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

/** Heure locale du joueur au départ (talents de jour ou de nuit) ; null si le client ne l'envoie pas. */
export function startHour(now: Date, utcOffsetMinutes: number | undefined): number | null {
  return utcOffsetMinutes === undefined ? null : localHour(now, utcOffsetMinutes);
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

/** Clé de chaîne d'une expédition légendaire : chaque quête a sa propre chaîne. */
export const questChainKey = (questId: string) => `quest:${questId}`;

/**
 * Chaînes du joueur (bonus shiny) : par zone, et par quête pour les expéditions légendaires
 * (clé `questChainKey`). Expéditions en cours, ou récupérées depuis moins que le délai de
 * relance ; une chaîne absente repart de 0.
 */
export async function shinyChains(
  db: Db,
  ctx: GameContext,
  userId: string,
  now: Date,
  only?: { zoneId: string } | { questId: string },
): Promise<Map<string, ZoneChainStatus>> {
  const since = new Date(now.getTime() - ctx.balance.shiny.chainWindowMinutes * 60_000);
  const rows = await db
    .select({
      zoneId: expeditions.zoneId,
      questId: expeditions.questId,
      chain: expeditions.shinyChain,
      claimedAt: expeditions.claimedAt,
    })
    .from(expeditions)
    .where(
      and(
        eq(expeditions.ownerId, userId),
        only && 'zoneId' in only ? eq(expeditions.zoneId, only.zoneId) : undefined,
        only && 'questId' in only ? eq(expeditions.questId, only.questId) : undefined,
        or(isNull(expeditions.claimedAt), gte(expeditions.claimedAt, since)),
      ),
    );
  const byZone = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = r.questId ? questChainKey(r.questId) : r.zoneId;
    if (key) byZone.set(key, [...(byZone.get(key) ?? []), r]);
  }
  const chains = new Map<string, ZoneChainStatus>();
  for (const [id, runs] of byZone) {
    const status = zoneChainStatus(ctx, runs, now);
    if (status.chain > 0) chains.set(id, status);
  }
  return chains;
}

/**
 * Pokémon fuyards du joueur et leur zone à l'instant `now` : ceux des quêtes réclamées, sauf ceux
 * partis avec une expédition pas encore réclamée.
 */
export async function playerRoamers(
  db: Db,
  ctx: GameContext,
  userId: string,
  now: Date,
  progress?: PlayerProgress,
): Promise<RoamerPosition[]> {
  const claimedQuests = await db
    .select({
      questId: questProgress.questId,
      pokemonCaught: questProgress.pokemonCaught,
      roamerHideout: questProgress.roamerHideout,
    })
    .from(questProgress)
    .where(and(eq(questProgress.ownerId, userId), isNotNull(questProgress.claimedAt)));
  const roaming = claimedQuests.filter(({ questId, pokemonCaught }) => {
    const quest = ctx.quest(questId);
    return quest && roamingTarget(quest, pokemonCaught);
  });
  if (roaming.length === 0) return [];
  const running = await db
    .select({ roamers: expeditions.roamers })
    .from(expeditions)
    .where(and(eq(expeditions.ownerId, userId), isNull(expeditions.claimedAt)));
  return roamerPositions(ctx, {
    userId,
    claimedQuests: roaming,
    progress: progress ?? (await playerProgress(db, ctx, userId)),
    engagedQuestIds: new Set(running.flatMap((r) => r.roamers.map((x) => x.questId))),
    at: now,
  });
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
  const progress = await playerProgress(db, ctx, userId);
  if (!isZoneUnlocked(ctx, zone, progress)) throw new GameError(403, 'ZONE_LOCKED');
  if (input.ballItemId && !ctx.itemEffect(input.ballItemId, 'ball')) {
    throw new GameError(400, 'NOT_A_BALL');
  }
  if (input.berryItemId && !ctx.itemEffect(input.berryItemId, 'captureBoost')) {
    throw new GameError(400, 'NOT_A_BERRY');
  }

  return db.transaction(async (tx) => {
    const slotIndex = await freeSlot(tx, ctx, userId);
    const team = await availableTeam(tx, userId, input.team, now);
    const hour = startHour(now, input.utcOffsetMinutes);
    // Météo de la zone au départ, retrouvée à la réclamation (même version de contenu).
    const site = { ...zone, weather: zoneWeather(zone, now) };
    const check = checkTeam(ctx, site, input.durationMinutes, team, hour);
    if (check.errors.length > 0) throw new GameError(400, 'TEAM_INVALID', { errors: check.errors });

    // Une Ball (et une baie) par rencontre au maximum : on réserve ce qui sera utilisé.
    const plan = expeditionPlan(ctx, input.durationMinutes, expeditionEnv(site, team, hour));
    const { encounters } = plan;
    const reserve = async (itemId: string | null, max = encounters) => {
      if (!itemId) return 0;
      const quantity = Math.min(encounters, max, await itemQuantity(tx, userId, itemId));
      if (!(await takeItems(tx, userId, itemId, quantity)))
        throw new GameError(409, 'STOCK_CHANGED');
      return quantity;
    };
    const balls = await reserve(input.ballItemId, input.ballCount);
    const berries = await reserve(input.berryItemId);
    const chain =
      (await shinyChains(tx, ctx, userId, now, { zoneId: zone.id })).get(zone.id)?.chain ?? 0;
    // Fuyards de la zone au départ : ils partent avec l'expédition.
    const roamers = (await playerRoamers(tx, ctx, userId, now, progress))
      .filter((r) => r.zoneId === zone.id)
      .map(({ questId, pokemonIndex }) => ({ questId, pokemonIndex }));

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
        endsAt: new Date(now.getTime() + plan.realDurationMinutes * 60_000),
        seed: newSeed(),
        shinyChain: chain,
        localHour: hour,
        roamers,
      })
      .returning();
    return row!;
  });
}

/**
 * Lance l'expédition légendaire d'une quête réclamée (depuis les quêtes uniquement) vers le
 * prochain Pokémon de la récompense pas encore capturé, selon sa configuration (durée, PE
 * minimale, types requis, région de la quête) : un emplacement d'expédition, et le maillon de la
 * chaîne de la quête. La Ball et la baie se choisissent au retour, une fois le légendaire vu.
 * Une seule à la fois par quête.
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

  return db.transaction(async (tx) => {
    const [progress] = await tx
      .select()
      .from(questProgress)
      .where(and(eq(questProgress.ownerId, userId), eq(questProgress.questId, quest.id)));
    if (!progress?.claimedAt) throw new GameError(409, 'QUEST_NOT_CLAIMED');
    const target = quest.rewards.pokemon[progress.pokemonCaught];
    if (!target) throw new GameError(409, 'QUEST_POKEMON_CAUGHT');
    // Un fuyard se trouve dans les expéditions ordinaires, pas dans une expédition légendaire.
    if (target.roaming != null) throw new GameError(409, 'QUEST_POKEMON_ROAMING');
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
    const site = legendarySite(quest, target);
    const hour = startHour(now, input.utcOffsetMinutes);
    const { errors } = checkTeam(ctx, site, durationMinutes, team, hour);
    if (errors.length > 0) throw new GameError(400, 'TEAM_INVALID', { errors });
    const plan = expeditionPlan(ctx, durationMinutes, expeditionEnv(site, team, hour, 'quest'));
    const key = questChainKey(quest.id);
    const chain = (await shinyChains(tx, ctx, userId, now, { questId: quest.id })).get(key);

    const [row] = await tx
      .insert(expeditions)
      .values({
        ownerId: userId,
        questId: quest.id,
        slotIndex,
        team: input.team,
        durationMinutes,
        ballItemId: null,
        balls: 0,
        berryItemId: null,
        berries: 0,
        contentVersionId: ctx.content.versionId,
        startedAt: now,
        endsAt: new Date(now.getTime() + plan.realDurationMinutes * 60_000),
        seed: newSeed(),
        shinyChain: chain?.chain ?? 0,
        localHour: hour,
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
 * Expédition légendaire en attente de décision : lancée sans Ball (les anciennes réservaient
 * leur Ball au départ et se résolvent seules).
 */
const awaitsDecision = (row: ExpeditionRow) => !!row.questId && row.balls === 0;

/** Expédition terminée et pas encore réclamée du joueur, avec son contenu de départ. */
async function finishedExpedition(
  db: Db,
  content: ContentCache,
  userId: string,
  expeditionId: string,
  now: Date,
) {
  const [found] = await db
    .select()
    .from(expeditions)
    .where(and(eq(expeditions.id, expeditionId), eq(expeditions.ownerId, userId)));
  if (!found) throw new GameError(404, 'EXPEDITION_NOT_FOUND');
  if (found.claimedAt) throw new GameError(409, 'ALREADY_CLAIMED');
  if (now < found.endsAt) throw new GameError(409, 'NOT_FINISHED', { endsAt: found.endsAt });
  return { found, ctx: await content.version(found.contentVersionId) };
}

/**
 * Fuyards emportés par une expédition, à la réclamation : ceux qui sont toujours à capturer (le
 * même Pokémon de la récompense, toujours fuyard dans la version de départ).
 */
async function expeditionRoamers(
  db: Db,
  ctx: GameContext,
  userId: string,
  snapshot: readonly { questId: string; pokemonIndex: number }[],
): Promise<ExpeditionRoamer[]> {
  if (snapshot.length === 0) return [];
  const rows = await db
    .select({ questId: questProgress.questId, pokemonCaught: questProgress.pokemonCaught })
    .from(questProgress)
    .where(
      and(
        eq(questProgress.ownerId, userId),
        inArray(
          questProgress.questId,
          snapshot.map((r) => r.questId),
        ),
      ),
    );
  return snapshot.flatMap(({ questId, pokemonIndex }) => {
    const row = rows.find((r) => r.questId === questId);
    const quest = ctx.quest(questId);
    const target =
      row?.pokemonCaught === pokemonIndex && quest && roamingTarget(quest, pokemonIndex);
    return target ? [{ questId, target }] : [];
  });
}

/** Pokémon visé par une expédition légendaire : le prochain de la récompense pas encore capturé. */
async function legendaryTarget(db: Db, ctx: GameContext, userId: string, questId: string) {
  const [questRow] = await db
    .select()
    .from(questProgress)
    .where(and(eq(questProgress.ownerId, userId), eq(questProgress.questId, questId)));
  const target = questRow && ctx.quest(questId)?.rewards.pokemon[questRow.pokemonCaught];
  return { questRow, target };
}

/**
 * Légendaire rencontré au retour d'une expédition légendaire, avant la décision : le joueur voit
 * s'il est shiny, puis lance sa Ball ou prend la fuite (et relance pour allonger la chaîne).
 */
export async function legendaryEncounter(
  db: Db,
  content: ContentCache,
  userId: string,
  expeditionId: string,
  now: Date,
): Promise<LegendaryEncounterDto> {
  const { found, ctx } = await finishedExpedition(db, content, userId, expeditionId, now);
  if (!awaitsDecision(found)) throw new GameError(409, 'NOT_A_LEGENDARY_EXPEDITION');
  const { target } = await legendaryTarget(db, ctx, userId, found.questId!);
  if (!target) throw new GameError(409, 'QUEST_POKEMON_CAUGHT');
  const charm = await shinyCharm(db, ctx, userId);
  const { pokemon: wild, shinyChance } = questEncounter(ctx, {
    target,
    seed: found.seed,
    shiny: { chain: found.shinyChain, charm },
  });
  return {
    expeditionId: found.id,
    questId: found.questId!,
    speciesId: wild.speciesId,
    formId: wild.formId ?? null,
    level: wild.level,
    gender: wild.gender,
    isShiny: wild.isShiny,
    shinyChance,
    shinyChain: found.shinyChain,
  };
}

/**
 * Réclame une expédition terminée : calcule le résultat (seed + contenu de la version de
 * départ) puis l'applique en une transaction. Une expédition ne se réclame qu'une fois.
 * Une expédition légendaire exige la décision du joueur : la Ball (et la baie) à lancer, ou la
 * fuite (`ballItemId` null).
 */
export async function claimExpedition(
  db: Db,
  content: ContentCache,
  userId: string,
  expeditionId: string,
  now: Date,
  decision?: ClaimExpeditionInput,
): Promise<{ expedition: ExpeditionRow; captured: PokemonRow[] }> {
  const { found, ctx } = await finishedExpedition(db, content, userId, expeditionId, now);
  // Expédition légendaire : pas de zone, la quête (de la version de départ) la décrit.
  const quest = found.questId ? ctx.quest(found.questId) : undefined;
  const zone = found.zoneId ? ctx.zone(found.zoneId) : undefined;
  if (!found.questId && !zone) throw new GameError(500, 'ZONE_MISSING_IN_VERSION');
  const deciding = awaitsDecision(found);
  if (deciding) {
    if (!decision) throw new GameError(400, 'DECISION_REQUIRED');
    if (decision.ballItemId && !ctx.itemEffect(decision.ballItemId, 'ball')) {
      throw new GameError(400, 'NOT_A_BALL');
    }
    if (decision.berryItemId && !ctx.itemEffect(decision.berryItemId, 'captureBoost')) {
      throw new GameError(400, 'NOT_A_BERRY');
    }
  }
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

    // Balls et baies engagées : réservées au départ, ou prises maintenant (légendaire, sauf fuite).
    let { ballItemId, balls, berryItemId, berries } = found;
    if (deciding && decision?.ballItemId) {
      ballItemId = decision.ballItemId;
      berryItemId = decision.berryItemId;
      balls = 1;
      berries = berryItemId ? 1 : 0;
      for (const itemId of [ballItemId, berryItemId]) {
        if (itemId && !(await takeItems(tx, userId, itemId, 1))) {
          throw new GameError(409, 'NOT_ENOUGH_ITEMS');
        }
      }
      await tx
        .update(expeditions)
        .set({ ballItemId, balls, berryItemId, berries })
        .where(eq(expeditions.id, found.id));
    }

    const teamRows = found.team.length
      ? await tx
          .select()
          .from(pokemon)
          .where(and(eq(pokemon.ownerId, userId), inArray(pokemon.id, found.team)))
      : [];
    // Dans l'ordre du départ : le premier est en tête (talents « en tête d'équipe »).
    const byId = new Map(teamRows.map((r) => [r.id, toInstance(r)]));
    const team = found.team.flatMap((id) => byId.get(id) ?? []);
    const bonuses = playerBonuses(ctx, await claimedRewards(tx, userId));
    const charm = await shinyCharm(tx, ctx, userId);
    let result: ExpeditionResult;
    let questRow: QuestProgressRow | undefined;
    if (found.questId) {
      // Expédition légendaire : le prochain Pokémon de la récompense pas encore capturé.
      const legendary = await legendaryTarget(tx, ctx, userId, found.questId);
      questRow = legendary.questRow;
      const { target } = legendary;
      result =
        target && (deciding || ballItemId)
          ? resolveQuestExpedition(ctx, {
              target,
              seed: found.seed,
              team,
              ballItemId,
              berryItemId,
              bonuses,
              shiny: { chain: found.shinyChain, charm },
              hour: found.localHour,
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
        hour: found.localHour,
        weather: zoneWeather(zone, found.startedAt),
        roamers: await expeditionRoamers(tx, ctx, userId, found.roamers),
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
    // Fuyard capturé : la quête passe au Pokémon suivant de sa récompense (s'il y en a).
    for (const { questId } of capturedEncounters) {
      const roamer = questId ? found.roamers.find((r) => r.questId === questId) : undefined;
      if (!roamer) continue;
      await tx
        .update(questProgress)
        .set({ pokemonCaught: roamer.pokemonIndex + 1 })
        .where(
          and(
            eq(questProgress.ownerId, userId),
            eq(questProgress.questId, roamer.questId),
            eq(questProgress.pokemonCaught, roamer.pokemonIndex),
          ),
        );
    }
    // Fuyard croisé mais pas capturé : il fuit aussitôt vers une autre zone, jusqu'à l'heure
    // pleine suivante. Pas croisé, il reste où il était (rien à enregistrer).
    const fled = result.encounters.filter((e) => e.questId && !e.pokemon);
    if (zone && fled.length > 0) {
      const progress = await playerProgress(tx, ctx, userId);
      for (const { questId } of fled) {
        const roamer = found.roamers.find((r) => r.questId === questId);
        const regionId = ctx.quest(questId!)?.regionId;
        if (!roamer || !regionId) continue;
        const zoneId = roamerFleeZoneId(roamingZones(ctx, regionId, progress), zone.id, found.seed);
        if (!zoneId) continue;
        await tx
          .update(questProgress)
          .set({
            roamerHideout: { pokemonIndex: roamer.pokemonIndex, hour: weatherHour(now), zoneId },
          })
          .where(
            and(
              eq(questProgress.ownerId, userId),
              eq(questProgress.questId, roamer.questId),
              eq(questProgress.pokemonCaught, roamer.pokemonIndex),
            ),
          );
      }
    }
    const newInDex = await recordPokedex(tx, userId, {
      seen: result.encounters.map((e) => e.speciesId),
      seenShiny: result.encounters.filter((e) => e.isShiny).map((e) => e.speciesId),
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
      ...(ballItemId ? [{ itemId: ballItemId, quantity: balls - result.ballsUsed }] : []),
      ...(berryItemId ? [{ itemId: berryItemId, quantity: berries - result.berriesUsed }] : []),
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
