import type { Collection, DexMilestone, PermanentBonusType, ProgressReward } from '@poke/content';
import type { GameContext } from './context';
import type { DexProgress, PlayerProgress } from './progress';

/**
 * Progression : paliers du Pokédex et collections thématiques. Leurs récompenses (objets, argent,
 * emplacements, bonus permanents) s'obtiennent en les réclamant ; tout se calcule paresseusement
 * à partir du Pokédex et des récompenses déjà réclamées.
 */

export type RewardKind = 'milestone' | 'collection';

/** Récompenses déjà réclamées par le joueur. */
export interface ClaimedRewards {
  milestoneIds: ReadonlySet<string>;
  collectionIds: ReadonlySet<string>;
}

export const NO_CLAIMS: ClaimedRewards = { milestoneIds: new Set(), collectionIds: new Set() };

/** Espèces d'un Pokédex : une région, ou toutes les régions (Pokédex national). */
export function dexSpeciesIds(ctx: GameContext, regionId: string | null): number[] {
  if (regionId !== null) return ctx.region(regionId)?.speciesIds ?? [];
  return [...new Set(ctx.regions.flatMap((r) => r.speciesIds))];
}

export function dexProgress(
  ctx: GameContext,
  regionId: string | null,
  progress: Pick<PlayerProgress, 'caughtSpeciesIds'>,
): DexProgress {
  const ids = dexSpeciesIds(ctx, regionId);
  const caught = ids.filter((id) => progress.caughtSpeciesIds.has(id)).length;
  return { caught, total: ids.length, percent: ids.length ? (caught / ids.length) * 100 : 0 };
}

export function isMilestoneReached(
  ctx: GameContext,
  milestone: DexMilestone,
  progress: Pick<PlayerProgress, 'caughtSpeciesIds'>,
): boolean {
  return dexProgress(ctx, milestone.regionId, progress).percent >= milestone.percent;
}

export function collectionProgress(
  collection: Collection,
  progress: Pick<PlayerProgress, 'caughtSpeciesIds'>,
): { caught: number; total: number; complete: boolean } {
  const ids = [...new Set(collection.speciesIds)];
  const caught = ids.filter((id) => progress.caughtSpeciesIds.has(id)).length;
  return { caught, total: ids.length, complete: caught === ids.length };
}

/** Paliers triés : par Pokédex (national en dernier), puis par ordre et seuil. */
export function sortedMilestones(ctx: GameContext): DexMilestone[] {
  const regionOrder = new Map(ctx.regions.map((r, i) => [r.id, i]));
  const rank = (m: DexMilestone) =>
    m.regionId === null
      ? ctx.regions.length + 1
      : (regionOrder.get(m.regionId) ?? ctx.regions.length);
  return [...ctx.content.dexMilestones].sort(
    (a, b) => rank(a) - rank(b) || a.order - b.order || a.percent - b.percent,
  );
}

export function sortedCollections(ctx: GameContext): Collection[] {
  return [...ctx.content.collections].sort((a, b) => a.order - b.order);
}

export type RewardState = 'locked' | 'claimable' | 'claimed';

export function milestoneState(
  ctx: GameContext,
  milestone: DexMilestone,
  progress: Pick<PlayerProgress, 'caughtSpeciesIds'>,
  claimed: ClaimedRewards,
): RewardState {
  if (claimed.milestoneIds.has(milestone.id)) return 'claimed';
  return isMilestoneReached(ctx, milestone, progress) ? 'claimable' : 'locked';
}

export function collectionState(
  collection: Collection,
  progress: Pick<PlayerProgress, 'caughtSpeciesIds'>,
  claimed: ClaimedRewards,
): RewardState {
  if (claimed.collectionIds.has(collection.id)) return 'claimed';
  return collectionProgress(collection, progress).complete ? 'claimable' : 'locked';
}

/** Nombre de récompenses prêtes à être réclamées (pastille du menu). */
export function claimableRewardCount(
  ctx: GameContext,
  progress: Pick<PlayerProgress, 'caughtSpeciesIds'>,
  claimed: ClaimedRewards,
): number {
  return (
    ctx.content.dexMilestones.filter(
      (m) => milestoneState(ctx, m, progress, claimed) === 'claimable',
    ).length +
    ctx.content.collections.filter((c) => collectionState(c, progress, claimed) === 'claimable')
      .length
  );
}

/** Récompenses réclamées encore présentes dans le contenu (une récompense supprimée ne compte plus). */
function claimedRewardList(ctx: GameContext, claimed: ClaimedRewards): ProgressReward[] {
  return [
    ...ctx.content.dexMilestones.filter((m) => claimed.milestoneIds.has(m.id)),
    ...ctx.content.collections.filter((c) => claimed.collectionIds.has(c.id)),
  ].map((r) => r.rewards);
}

export interface PlayerSlots {
  expeditions: number;
  battles: number;
  daycare: number;
}

/** Emplacements du joueur : valeur de départ + récompenses réclamées, plafonnés au maximum. */
export function playerSlots(ctx: GameContext, claimed: ClaimedRewards): PlayerSlots {
  const rewards = claimedRewardList(ctx, claimed);
  const total = (key: 'expeditionSlots' | 'battleSlots' | 'daycareSlots') =>
    rewards.reduce((sum, r) => sum + r[key], 0);
  const { expeditions, battles, daycare } = ctx.balance;
  return {
    expeditions: Math.min(
      expeditions.maxSlots,
      expeditions.initialSlots + total('expeditionSlots'),
    ),
    battles: Math.min(battles.maxSlots, battles.initialSlots + total('battleSlots')),
    daycare: Math.min(daycare.maxSlots, daycare.initialSlots + total('daycareSlots')),
  };
}

/** Multiplicateurs permanents (1 = aucun bonus), cumulés de façon additive. */
export type PlayerBonuses = Record<PermanentBonusType, number>;

export const NO_BONUSES: PlayerBonuses = { capture: 1, xp: 1, money: 1 };

export function playerBonuses(ctx: GameContext, claimed: ClaimedRewards): PlayerBonuses {
  const bonuses = { ...NO_BONUSES };
  for (const reward of claimedRewardList(ctx, claimed)) {
    for (const b of reward.bonuses) bonuses[b.type] += b.percent / 100;
  }
  return bonuses;
}
