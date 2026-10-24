import { and, asc, eq, gt, isNotNull, isNull, lte } from 'drizzle-orm';
import { berryPlots } from '@poke/db';
import type { Db } from '@poke/db';
import {
  FARM_PLOTS,
  berryGrowthSpeed,
  berryPlantEffect,
  createRng,
  harvestBonus,
  rollBerryYield,
} from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { BerryPlotDto } from '@poke/shared';
import type { ContentCache } from '../content-cache';
import { assistantHolder } from './assistants';
import { GameError } from './errors';
import { newSeed, requireStartedProfile } from './expeditions';
import { addItems, takeItems } from './store';

/**
 * Ferme à baies : une baie plantée (consommée) pousse tant que le champ a son assistant de type
 * Eau, puis se récolte. Sans assistant, la pousse est en pause : `ready_at` passe à null et
 * `remaining_ms` garde ce qu'il reste à faire. Durées (`grow_ms`, `remaining_ms`) à vitesse normale :
 * le talent de l'assistant qui arrose peut accélérer la pousse (`ready_at` en tient compte).
 */

export type BerryPlotRow = typeof berryPlots.$inferSelect;

/** `speed` : vitesse de pousse actuelle du champ (durées affichées à cette vitesse). */
export function toBerryPlotDto(row: BerryPlotRow, speed = 1): BerryPlotDto {
  return {
    plotIndex: row.plotIndex,
    itemId: row.itemId,
    plantedAt: row.plantedAt.toISOString(),
    growMs: Math.round(row.growMs / speed),
    remainingMs: Math.round(row.remainingMs / speed),
    readyAt: row.readyAt?.toISOString() ?? null,
  };
}

export async function farmPlots(db: Db, userId: string): Promise<BerryPlotRow[]> {
  return db
    .select()
    .from(berryPlots)
    .where(eq(berryPlots.ownerId, userId))
    .orderBy(asc(berryPlots.plotIndex));
}

/** Vitesse de pousse du champ arrosé (talent de l'assistant Eau) ; null = pas arrosé. */
async function wateringSpeed(db: Db, ctx: GameContext, userId: string): Promise<number | null> {
  const waterer = await assistantHolder(db, userId, 'farm', 0);
  return waterer ? berryGrowthSpeed(ctx, waterer) : null;
}

/** Vitesse de pousse actuelle du champ (1 sans assistant). */
export async function farmSpeed(db: Db, ctx: GameContext, userId: string): Promise<number> {
  return (await wateringSpeed(db, ctx, userId)) ?? 1;
}

/** Plante une baie (consommée) dans une parcelle libre. */
export async function plantBerry(
  db: Db,
  content: ContentCache,
  userId: string,
  plotIndex: number,
  itemId: string,
  now: Date,
): Promise<BerryPlotRow> {
  const ctx = await content.get();
  await requireStartedProfile(db, userId);
  if (plotIndex >= FARM_PLOTS) throw new GameError(400, 'NO_SUCH_SLOT');
  const effect = berryPlantEffect(ctx, itemId);
  if (!effect) throw new GameError(400, 'NOT_PLANTABLE');

  return db.transaction(async (tx) => {
    const growMs = effect.minutes * 60_000;
    const speed = await wateringSpeed(tx, ctx, userId);
    const [row] = await tx
      .insert(berryPlots)
      .values({
        ownerId: userId,
        plotIndex,
        itemId,
        plantedAt: now,
        growMs,
        remainingMs: growMs,
        readyAt: speed ? new Date(now.getTime() + Math.round(growMs / speed)) : null,
        yield: rollBerryYield(effect, createRng(newSeed())),
      })
      .onConflictDoNothing()
      .returning();
    if (!row) throw new GameError(409, 'PLOT_TAKEN');
    if (!(await takeItems(tx, userId, itemId, 1))) {
      throw new GameError(409, 'ITEM_MISSING', { itemId });
    }
    return row;
  });
}

/** Arrache une baie pas encore mûre : elle revient dans le sac. */
export async function uprootBerry(db: Db, userId: string, plotIndex: number, now: Date) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .delete(berryPlots)
      .where(and(eq(berryPlots.ownerId, userId), eq(berryPlots.plotIndex, plotIndex)))
      .returning();
    if (!row) throw new GameError(404, 'PLOT_EMPTY');
    if (row.readyAt && row.readyAt <= now) throw new GameError(409, 'BERRY_ALREADY_RIPE');
    await addItems(tx, userId, [{ itemId: row.itemId, quantity: 1 }]);
    return row;
  });
}

/**
 * Récolte la baie mûre d'une parcelle, ou toutes les baies mûres sans `plotIndex` (l'assistant de
 * récolte en ajoute à chaque parcelle).
 */
export async function harvestBerries(
  db: Db,
  content: ContentCache,
  userId: string,
  now: Date,
  plotIndex?: number,
) {
  const ctx = await content.get();
  await requireStartedProfile(db, userId);
  return db.transaction(async (tx) => {
    const bonus = harvestBonus(ctx, await assistantHolder(tx, userId, 'harvest', 0));
    // Verrou : seule la première demande récolte une parcelle donnée.
    const ripe = await tx
      .delete(berryPlots)
      .where(
        and(
          eq(berryPlots.ownerId, userId),
          plotIndex === undefined ? undefined : eq(berryPlots.plotIndex, plotIndex),
          isNotNull(berryPlots.readyAt),
          lte(berryPlots.readyAt, now),
        ),
      )
      .returning();
    if (ripe.length === 0) throw new GameError(409, 'NO_BERRY_READY');
    const harvested = new Map<string, number>();
    for (const p of ripe) {
      harvested.set(p.itemId, (harvested.get(p.itemId) ?? 0) + p.yield + bonus);
    }
    const stacks = [...harvested].map(([itemId, quantity]) => ({ itemId, quantity }));
    await addItems(tx, userId, stacks);
    return stacks;
  });
}

/** Le champ est désormais arrosé : les pousses en pause reprennent, à la vitesse du nouvel assistant. */
export async function resumeFarm(db: Db, ctx: GameContext, userId: string, now: Date) {
  const speed = await farmSpeed(db, ctx, userId);
  const paused = await db
    .select()
    .from(berryPlots)
    .where(and(eq(berryPlots.ownerId, userId), isNull(berryPlots.readyAt)));
  for (const p of paused) {
    await db
      .update(berryPlots)
      .set({ readyAt: new Date(now.getTime() + Math.round(p.remainingMs / speed)) })
      .where(and(eq(berryPlots.ownerId, userId), eq(berryPlots.plotIndex, p.plotIndex)));
  }
}

/**
 * Le champ ne va plus être arrosé : les pousses s'arrêtent là où elles en sont (les mûres le
 * restent). À appeler avant de retirer l'assistant, dont le talent a fixé la vitesse.
 */
export async function pauseFarm(db: Db, ctx: GameContext, userId: string, now: Date) {
  const speed = await farmSpeed(db, ctx, userId);
  const growing = await db
    .select()
    .from(berryPlots)
    .where(and(eq(berryPlots.ownerId, userId), gt(berryPlots.readyAt, now)));
  for (const p of growing) {
    await db
      .update(berryPlots)
      .set({
        readyAt: null,
        remainingMs: Math.round((p.readyAt!.getTime() - now.getTime()) * speed),
      })
      .where(and(eq(berryPlots.ownerId, userId), eq(berryPlots.plotIndex, p.plotIndex)));
  }
}
