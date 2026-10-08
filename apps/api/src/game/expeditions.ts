import { randomInt } from 'node:crypto';
import { and, eq, gte, inArray, isNull, or } from 'drizzle-orm';
import { expeditions, pityCounters, playerProfiles, pokemon } from '@poke/db';
import type { Db } from '@poke/db';
import {
  MAX_SEED,
  checkTeam,
  encounterCount,
  isZoneUnlocked,
  playerBonuses,
  playerSlots,
  resolveExpedition,
  zoneChainStatus,
} from '@poke/game-core';
import type { ClaimedRewards, GameContext, ZoneChainStatus } from '@poke/game-core';
import type { StartExpeditionInput, StoredExpeditionResult } from '@poke/shared';
import type { ContentCache } from '../content-cache';
import { GameError } from './errors';
import { syncQuests } from './quests';
import {
  addItems,
  assertAvailable,
  claimedRewards,
  insertPokemon,
  itemQuantity,
  playerProgress,
  recordPokedex,
  shinyCharm,
  takeItems,
  toInstance,
} from './store';
import type { ExpeditionRow, PokemonRow } from './store';

export { GameError };

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
        zoneId ? eq(expeditions.zoneId, zoneId) : undefined,
        or(isNull(expeditions.claimedAt), gte(expeditions.claimedAt, since)),
      ),
    );
  const byZone = new Map<string, typeof rows>();
  for (const r of rows) byZone.set(r.zoneId, [...(byZone.get(r.zoneId) ?? []), r]);
  const chains = new Map<string, ZoneChainStatus>();
  for (const [id, runs] of byZone) {
    const status = zoneChainStatus(ctx, runs, now);
    if (status.chain > 0) chains.set(id, status);
  }
  return chains;
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
    const active = await tx
      .select({ slotIndex: expeditions.slotIndex })
      .from(expeditions)
      .where(and(eq(expeditions.ownerId, userId), isNull(expeditions.claimedAt)));
    const used = new Set(active.map((e) => e.slotIndex));
    const slots = expeditionSlots(ctx, await claimedRewards(tx, userId));
    const slotIndex = Array.from({ length: slots }, (_, i) => i).find((i) => !used.has(i));
    if (slotIndex === undefined) throw new GameError(409, 'NO_FREE_SLOT');

    const rows = input.team.length
      ? await tx
          .select()
          .from(pokemon)
          .where(and(eq(pokemon.ownerId, userId), inArray(pokemon.id, input.team)))
      : [];
    if (rows.length !== new Set(input.team).size) throw new GameError(404, 'POKEMON_NOT_FOUND');
    await assertAvailable(tx, userId, rows, now);

    const byId = new Map(rows.map((r) => [r.id, r]));
    const team = input.team.map((id) => toInstance(byId.get(id)!));
    const check = checkTeam(ctx, zone, input.durationMinutes, team);
    if (check.errors.length > 0) throw new GameError(400, 'TEAM_INVALID', { errors: check.errors });

    // Une Ball (et une baie) par rencontre au maximum : on réserve ce qui sera utilisé.
    const encounters = encounterCount(ctx, input.durationMinutes);
    const reserve = async (itemId: string | null) => {
      if (!itemId) return 0;
      const quantity = Math.min(encounters, await itemQuantity(tx, userId, itemId));
      if (!(await takeItems(tx, userId, itemId, quantity)))
        throw new GameError(409, 'STOCK_CHANGED');
      return quantity;
    };
    const balls = await reserve(input.ballItemId);
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
  const zone = ctx.zone(found.zoneId);
  if (!zone) throw new GameError(500, 'ZONE_MISSING_IN_VERSION');
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
    const speciesIds = [...new Set(zone.encounters.map((e) => e.speciesId))];
    const pityRows = await tx
      .select()
      .from(pityCounters)
      .where(and(eq(pityCounters.ownerId, userId), inArray(pityCounters.speciesId, speciesIds)));

    const result = resolveExpedition(ctx, {
      zone,
      durationMinutes: found.durationMinutes,
      seed: found.seed,
      team: teamRows.map(toInstance),
      balls: found.ballItemId ? { itemId: found.ballItemId, quantity: found.balls } : null,
      berries: found.berryItemId ? { itemId: found.berryItemId, quantity: found.berries } : null,
      pity: Object.fromEntries(pityRows.map((r) => [r.speciesId, r.misses])),
      bonuses: playerBonuses(ctx, await claimedRewards(tx, userId)),
      // Chaîne figée au départ ; Charme Chroma possédé à la réclamation.
      shiny: { chain: found.shinyChain, charm: await shinyCharm(tx, ctx, userId) },
    });

    const capturedEncounters = result.encounters.filter((e) => e.pokemon);
    const captured = await insertPokemon(
      tx,
      userId,
      capturedEncounters.map((e) => e.pokemon!),
      { origin: 'capture', originRegion: zone.regionId, at: now },
    );
    const newSpeciesIds = await recordPokedex(tx, userId, {
      seen: result.encounters.map((e) => e.speciesId),
      caught: capturedEncounters.map((e) => e.speciesId),
      caughtShiny: capturedEncounters.filter((e) => e.isShiny).map((e) => e.speciesId),
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

    await syncQuests(tx, current, userId, now, {
      type: 'expedition',
      zoneId: zone.id,
      team: teamRows.map(toInstance),
      captured: capturedEncounters.map((e) => e.pokemon!),
    });

    let capturedIndex = 0;
    const stored: StoredExpeditionResult = {
      ...result,
      encounters: result.encounters.map((e) =>
        e.pokemon ? { ...e, pokemonId: captured[capturedIndex++]!.id } : e,
      ),
      newSpeciesIds,
    };
    const [claimed] = await tx
      .update(expeditions)
      .set({ result: stored })
      .where(eq(expeditions.id, found.id))
      .returning();
    return { expedition: claimed!, captured };
  });
}
