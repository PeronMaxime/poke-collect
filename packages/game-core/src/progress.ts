import type { UnlockCondition, Zone } from '@poke/content';
import type { GameContext } from './context';

/** Avancement du joueur utile aux conditions de déblocage. */
export interface PlayerProgress {
  caughtSpeciesIds: ReadonlySet<number>;
  /** Dresseurs battus au moins une fois. */
  defeatedTrainerIds: ReadonlySet<string>;
  /** Œufs éclos depuis le début de la partie. */
  eggsHatched: number;
  /** Étapes validées de chaque quête commencée (voir `questStepsDone`) ; absent : aucune. */
  questSteps?: ReadonlyMap<string, number>;
}

export interface DexProgress {
  caught: number;
  total: number;
  percent: number;
}

export function regionDexProgress(
  ctx: GameContext,
  regionId: string,
  progress: Pick<PlayerProgress, 'caughtSpeciesIds'>,
): DexProgress {
  const ids = ctx.region(regionId)?.speciesIds ?? [];
  const caught = ids.filter((id) => progress.caughtSpeciesIds.has(id)).length;
  return { caught, total: ids.length, percent: ids.length ? (caught / ids.length) * 100 : 0 };
}

/** Badges obtenus : victoires contre les dresseurs qui en donnent un. */
export function earnedBadges(
  ctx: GameContext,
  progress: Pick<PlayerProgress, 'defeatedTrainerIds'>,
) {
  return ctx.trainers.filter((t) => t.badge && progress.defeatedTrainerIds.has(t.id));
}

export function isUnlocked(
  ctx: GameContext,
  condition: UnlockCondition,
  progress: PlayerProgress,
): boolean {
  switch (condition.type) {
    case 'always':
      return true;
    case 'regionDexPercent':
      return regionDexProgress(ctx, condition.regionId, progress).percent >= condition.percent;
    case 'trainerDefeated':
      return progress.defeatedTrainerIds.has(condition.trainerId);
    case 'badgeCount':
      return earnedBadges(ctx, progress).length >= condition.count;
    case 'speciesCaught':
      return progress.caughtSpeciesIds.size >= condition.count;
    case 'eggsHatched':
      return progress.eggsHatched >= condition.count;
    case 'questStepsDone':
      return (progress.questSteps?.get(condition.questId) ?? 0) >= condition.count;
    case 'questCompleted': {
      const quest = ctx.quest(condition.questId);
      return !!quest && (progress.questSteps?.get(quest.id) ?? 0) >= quest.steps.length;
    }
    case 'allOf':
      return condition.conditions.every((c) => isUnlocked(ctx, c, progress));
  }
}

/** Une zone est accessible si sa région et elle-même sont débloquées. */
export function isZoneUnlocked(ctx: GameContext, zone: Zone, progress: PlayerProgress): boolean {
  const region = ctx.region(zone.regionId);
  return (
    !!region && isUnlocked(ctx, region.unlock, progress) && isUnlocked(ctx, zone.unlock, progress)
  );
}
