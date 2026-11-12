import { and, count, eq, gt, isNotNull } from 'drizzle-orm';
import { eggs, playerProfiles, questProgress, rewardClaims, trainerProgress } from '@poke/db';
import type { Db } from '@poke/db';
import { tabUnlock } from '@poke/content';
import type { FacilityId, MenuTabId } from '@poke/content';
import {
  facilityPlaces,
  facilityUnlocks,
  isTabUnlocked,
  NO_CLAIMS,
  questStepsDone,
} from '@poke/game-core';
import type {
  ClaimedRewards,
  GameContext,
  PlayerProgress,
  PlayerSlots,
  QuestRecord,
} from '@poke/game-core';
import { GameError } from '../errors';
import { caughtSpeciesIds } from './pokedex';

/**
 * L'avancement d'un joueur : ce qu'il a capturé, vaincu, réclamé et débloqué.
 *
 * `playerProgress` rassemble tout ce dont les règles de déblocage ont besoin (`@poke/game-core`,
 * `progress.ts`) ; les places des bâtiments et les onglets ouverts s'en déduisent. Rien n'est
 * stocké : tout est recalculé depuis le Pokédex, les dresseurs vaincus, les quêtes et les
 * récompenses réclamées.
 */

/** L'avancement d'un joueur dans une quête, tel qu'il est enregistré. */
export type QuestProgressRow = typeof questProgress.$inferSelect;

/**
 * Avancement utile aux conditions de déblocage : Pokédex, dresseurs battus, œufs éclos et étapes
 * validées des quêtes (calculées paresseusement à partir de l'avancement enregistré).
 */
export async function playerProgress(
  db: Db,
  ctx: GameContext,
  ownerId: string,
): Promise<PlayerProgress> {
  const [base, rows] = await Promise.all([baseProgress(db, ownerId), questRows(db, ownerId)]);
  return { ...base, questSteps: questStepsDone(ctx, base, questRecords(ctx, rows)) };
}

/**
 * Refuse de commencer quelque chose dans un onglet pas encore débloqué (déposer, planter, lancer).
 * Récupérer ou annuler ce qui est déjà en cours reste permis.
 */
export async function assertTabUnlocked(
  db: Db,
  ctx: GameContext,
  ownerId: string,
  tab: MenuTabId,
): Promise<void> {
  if (tabUnlock(ctx.content.balance, tab).type === 'always') return;
  if (!isTabUnlocked(ctx, tab, await playerProgress(db, ctx, ownerId))) {
    throw new GameError(403, 'TAB_LOCKED', { tab });
  }
}

/**
 * Places ouvertes d'un bâtiment (emplacements d'expédition, pensions, couveuses, places du Musée,
 * parcelles, Centres) : départ + paliers remplis, + récompenses réclamées pour les expéditions,
 * les pensions et les couveuses, + parcelles achetées pour la ferme.
 */
export async function playerFacilityPlaces(
  db: Db,
  ctx: GameContext,
  ownerId: string,
  facility: FacilityId,
): Promise<number> {
  const [progress, claimed] = await Promise.all([
    facilityUnlocks(ctx, facility).length > 0
      ? playerProgress(db, ctx, ownerId)
      : {
          caughtSpeciesIds: new Set<number>(),
          defeatedTrainerIds: new Set<string>(),
          eggsHatched: 0,
        },
    facility === 'expedition' || facility === 'daycare' || facility === 'incubator'
      ? claimedRewards(db, ownerId)
      : facility === 'farm'
        ? boughtFarmPlots(db, ownerId).then((farmPlots) => ({ ...NO_CLAIMS, farmPlots }))
        : NO_CLAIMS,
  ]);
  return facilityPlaces(ctx, facility, progress, claimed);
}

/** Emplacements d'expédition et pensions ouverts au joueur (récompenses et paliers des bâtiments). */
export async function playerSlotsNow(
  db: Db,
  ctx: GameContext,
  ownerId: string,
): Promise<PlayerSlots> {
  const [expeditions, daycare] = await Promise.all([
    playerFacilityPlaces(db, ctx, ownerId, 'expedition'),
    playerFacilityPlaces(db, ctx, ownerId, 'daycare'),
  ]);
  return { expeditions, daycare };
}

/** Avancement hors quêtes. */
export async function baseProgress(db: Db, ownerId: string): Promise<PlayerProgress> {
  const [caught, defeated, hatched, opened] = await Promise.all([
    caughtSpeciesIds(db, ownerId),
    db
      .select({ trainerId: trainerProgress.trainerId })
      .from(trainerProgress)
      .where(and(eq(trainerProgress.ownerId, ownerId), gt(trainerProgress.wins, 0))),
    eggsHatchedCount(db, ownerId),
    db
      .select({ openedRegions: playerProfiles.openedRegions })
      .from(playerProfiles)
      .where(eq(playerProfiles.userId, ownerId)),
  ]);
  return {
    caughtSpeciesIds: caught,
    defeatedTrainerIds: new Set(defeated.map((d) => d.trainerId)),
    eggsHatched: hatched,
    openedRegionIds: new Set(opened[0]?.openedRegions ?? []),
  };
}

/** Avancement du joueur dans chaque quête qu'il a commencée. */
export async function questRows(db: Db, ownerId: string): Promise<QuestProgressRow[]> {
  return db.select().from(questProgress).where(eq(questProgress.ownerId, ownerId));
}

/**
 * Étape atteinte d'une quête : une quête terminée compte pour toutes ses étapes, même si son
 * contenu en a gagné depuis (quêtes réécrites, 0123 : les lignes gardées s'arrêtaient à l'étape 3).
 */
export function questRowStep(ctx: GameContext, row: QuestProgressRow): number {
  const total = ctx.quest(row.questId)?.steps.length ?? row.step;
  return row.completedAt ? Math.max(row.step, total) : row.step;
}

/** Étape atteinte et compteur de chaque quête, sous la forme que les règles attendent. */
export function questRecords(
  ctx: GameContext,
  rows: readonly QuestProgressRow[],
): Map<string, QuestRecord> {
  return new Map(
    rows.map((r) => [r.questId, { step: questRowStep(ctx, r), count: r.progress.count ?? 0 }]),
  );
}

/** Parcelles de la ferme achetées à la boutique. */
async function boughtFarmPlots(db: Db, ownerId: string): Promise<number> {
  const [row] = await db
    .select({ farmPlots: playerProfiles.farmPlots })
    .from(playerProfiles)
    .where(eq(playerProfiles.userId, ownerId));
  return row?.farmPlots ?? 0;
}

/**
 * Récompenses de progression réclamées : collections, quêtes et complétions d'expédition
 * (emplacements et bonus permanents en découlent), et parcelles achetées.
 */
export async function claimedRewards(db: Db, ownerId: string): Promise<ClaimedRewards> {
  const [rows, quests, farmPlots] = await Promise.all([
    db
      .select({ kind: rewardClaims.kind, rewardId: rewardClaims.rewardId })
      .from(rewardClaims)
      .where(eq(rewardClaims.ownerId, ownerId)),
    db
      .select({ questId: questProgress.questId })
      .from(questProgress)
      .where(and(eq(questProgress.ownerId, ownerId), isNotNull(questProgress.claimedAt))),
    boughtFarmPlots(db, ownerId),
  ]);
  const ids = (kind: string) => new Set(rows.filter((r) => r.kind === kind).map((r) => r.rewardId));
  return {
    collectionIds: ids('collection'),
    questIds: new Set(quests.map((q) => q.questId)),
    completionIds: ids('completion'),
    farmPlots,
  };
}

/** Nombre d'œufs que le joueur a fait éclore. */
export async function eggsHatchedCount(db: Db, ownerId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(eggs)
    .where(and(eq(eggs.ownerId, ownerId), eq(eggs.hatched, true)));
  return row?.n ?? 0;
}
