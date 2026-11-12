import { and, eq, gt, inArray, isNull } from 'drizzle-orm';
import { expeditions, pityCounters, pokemon } from '@poke/db';
import type { Db } from '@poke/db';
import {
  BALL_CATEGORIES,
  planBall,
  captureSnapshot,
  checkTeam,
  encounterMinutes,
  expeditionEnv,
  expeditionMinMinutes,
  isZoneUnlocked,
  maxExpeditionBerries,
  planHasBall,
  zoneSpeciesIds,
  zoneWeather,
} from '@poke/game-core';
import type { BallPlan, GameContext } from '@poke/game-core';
import type { StartExpeditionInput } from '@poke/shared';
import type { ContentCache } from '../../content-cache';
import { GameError } from '../errors';
import { playerTransaction } from '../tx';
import {
  addItems,
  assertAvailable,
  caughtDex,
  itemQuantity,
  playerProgress,
  takeItems,
  toInstance,
} from '../store';
import type { ExpeditionRow } from './views';
import { expeditionSlots, newSeed, requireStartedProfile, startHour } from './basics';
import { minutesAfter } from './common';
import { playerRoamers, shinyChains } from './state';

/**
 * Départ et annulation d'une expédition.
 *
 * Le départ fige tout ce qui détermine le résultat (graine, version du contenu, équipe, heure
 * locale, chaîne chromatique, fuyards de la zone) et occupe l'équipe. Une expédition s'annule
 * tant que sa durée minimale n'est pas écoulée ; ensuite elle se réclame.
 */

/** Premier emplacement d'expédition libre du joueur. */
async function freeSlot(db: Db, ctx: GameContext, userId: string): Promise<number> {
  const active = await db
    .select({ slotIndex: expeditions.slotIndex })
    .from(expeditions)
    .where(and(eq(expeditions.ownerId, userId), isNull(expeditions.claimedAt)));
  const used = new Set(active.map((e) => e.slotIndex));
  const slots = await expeditionSlots(db, ctx, userId);
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
 * Lance une expédition : vérifie la zone, l'équipe et le stock, réserve les baies (les Balls
 * sont retirées du sac au fil des rencontres, voir `settleExpeditionBalls`), enregistre la version de contenu active, un seed tiré côté serveur et le maillon de la
 * chaîne de zone. Elle court jusqu'à la durée maximale ; le joueur peut l'arrêter dès la durée
 * minimum passée.
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
  // Les catégories d'IV non réglées restent absentes (et non `undefined`) dans le plan enregistré.
  const ballPlan = Object.fromEntries(
    Object.entries(input.balls).filter(([, ballItemId]) => ballItemId !== undefined),
  ) as BallPlan;
  for (const category of BALL_CATEGORIES) {
    const ballItemId = planBall(ballPlan, category);
    if (ballItemId && !ctx.itemEffect(ballItemId, 'ball')) throw new GameError(400, 'NOT_A_BALL');
  }
  if (input.berryItemId && !ctx.itemEffect(input.berryItemId, 'captureBoost')) {
    throw new GameError(400, 'NOT_A_BERRY');
  }
  if (input.encounterBerryItemId && !ctx.itemEffect(input.encounterBerryItemId, 'encounterBoost')) {
    throw new GameError(400, 'NOT_A_BERRY');
  }

  return playerTransaction(db, userId, async (tx) => {
    const slotIndex = await freeSlot(tx, ctx, userId);
    const team = await availableTeam(tx, userId, input.team, now);
    const hour = startHour(now, input.utcOffsetMinutes);
    // Météo de la zone au départ, retrouvée à la réclamation (même version de contenu).
    const site = { ...zone, weather: zoneWeather(zone, now) };
    const check = checkTeam(ctx, site, team, hour);
    if (check.errors.length > 0) throw new GameError(400, 'TEAM_INVALID', { errors: check.errors });

    // Autant que demandé, dans la limite du stock et de ce qui peut servir d'ici la durée maximale.
    const reserve = async (itemId: string | null | undefined, wanted: number, limit: number) => {
      if (!itemId) return 0;
      const quantity = Math.min(wanted, limit, await itemQuantity(tx, userId, itemId));
      if (!(await takeItems(tx, userId, itemId, quantity)))
        throw new GameError(409, 'STOCK_CHANGED');
      return quantity;
    };
    const { maxDurationMinutes, encounterIntervalGrowthMinutes } = ctx.balance.expeditions;
    const env = expeditionEnv(site, team, hour);
    const berryLimit = maxExpeditionBerries(ctx);
    const encounterBerries = await reserve(
      input.encounterBerryItemId,
      input.encounterBerryCount ?? 1,
      berryLimit,
    );
    const berries = await reserve(input.berryItemId, input.berryCount ?? 1, berryLimit);
    const chain =
      (await shinyChains(tx, ctx, userId, now, { zoneId: zone.id })).get(zone.id)?.chain ?? 0;
    // Fuyards de la zone au départ : ils partent avec l'expédition.
    const roamers = (await playerRoamers(tx, ctx, userId, now, progress))
      .filter((r) => r.zoneId === zone.id)
      .map(({ questId, pokemonIndex }) => ({ questId, pokemonIndex }));
    // Pokédex et pitié figés : chaque retrait de Balls rejoue les mêmes rencontres.
    const species = [
      ...zoneSpeciesIds(zone),
      ...roamers.flatMap(({ questId, pokemonIndex }) => {
        const target = ctx.quest(questId)?.rewards.pokemon[pokemonIndex];
        return target ? [target.speciesId] : [];
      }),
    ];
    const pityRows = await tx
      .select()
      .from(pityCounters)
      .where(and(eq(pityCounters.ownerId, userId), inArray(pityCounters.speciesId, species)));
    const snapshot = captureSnapshot(
      await caughtDex(tx, userId),
      Object.fromEntries(pityRows.map((r) => [r.speciesId, r.misses])),
      species,
    );
    const firstEncounter = minutesAfter(
      now,
      encounterMinutes(
        ctx,
        1,
        env,
        encounterBerries > 0
          ? { itemId: input.encounterBerryItemId!, quantity: encounterBerries }
          : null,
        encounterIntervalGrowthMinutes,
      ),
    );
    const endsAt = minutesAfter(now, maxDurationMinutes);

    const [row] = await tx
      .insert(expeditions)
      .values({
        ownerId: userId,
        zoneId: zone.id,
        slotIndex,
        team: input.team,
        durationMinutes: zone.minDurationMinutes,
        ballItemId: null,
        balls: 0,
        ballPlan,
        autoTransfer: input.autoTransfer ?? null,
        captureSnapshot: snapshot,
        // Rejouée au fil de l'eau pour retirer les Balls, ou pour annoncer un fuyard croisé.
        nextThrowAt:
          (planHasBall(ballPlan) || roamers.length > 0) && firstEncounter <= endsAt
            ? firstEncounter
            : null,
        berryItemId: berries > 0 ? input.berryItemId : null,
        berries,
        encounterBerryItemId: encounterBerries > 0 ? input.encounterBerryItemId : null,
        encounterBerries,
        encounterIntervalGrowthMinutes,
        contentVersionId: ctx.content.versionId,
        startedAt: now,
        minEndsAt: minutesAfter(now, expeditionMinMinutes(ctx, zone.minDurationMinutes, env)),
        endsAt,
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
 * Annule une expédition en cours : elle disparaît sans résultat, l'équipe redevient disponible
 * et les Balls (déjà lancées ou réservées) et baies sont rendues. Passé la durée minimum, elle se réclame.
 */
export async function cancelExpedition(
  db: Db,
  userId: string,
  expeditionId: string,
  now: Date,
): Promise<void> {
  await playerTransaction(db, userId, async (tx) => {
    const [found] = await tx
      .delete(expeditions)
      .where(
        and(
          eq(expeditions.id, expeditionId),
          eq(expeditions.ownerId, userId),
          isNull(expeditions.claimedAt),
          gt(expeditions.minEndsAt, now),
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
      ...Object.entries(found.ballsUsed).map(([itemId, quantity]) => ({ itemId, quantity })),
      ...(found.berryItemId ? [{ itemId: found.berryItemId, quantity: found.berries }] : []),
      ...(found.encounterBerryItemId
        ? [{ itemId: found.encounterBerryItemId, quantity: found.encounterBerries }]
        : []),
    ]);
  });
}
