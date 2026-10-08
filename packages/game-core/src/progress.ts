import { unlockParts } from '@poke/content';
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

/**
 * Seules les espèces du Pokédex d'une région partent en expédition et combattent dans cette région
 * (formes régionales comprises : un Goupix d'Alola reste une espèce de Kanto).
 */
export function isRegionalSpecies(ctx: GameContext, regionId: string, speciesId: number): boolean {
  return ctx.region(regionId)?.speciesIds.includes(speciesId) ?? false;
}

/** Espèces de l'équipe qui n'appartiennent pas au Pokédex de la région (sans doublons). */
export function outOfRegionSpecies(
  ctx: GameContext,
  regionId: string,
  team: readonly { speciesId: number }[],
): number[] {
  return [
    ...new Set(team.map((m) => m.speciesId).filter((id) => !isRegionalSpecies(ctx, regionId, id))),
  ];
}

/** Badges obtenus (d'une région, ou de toutes) : victoires contre les dresseurs qui en donnent un. */
export function earnedBadges(
  ctx: GameContext,
  progress: Pick<PlayerProgress, 'defeatedTrainerIds'>,
  regionId?: string,
) {
  return ctx.trainers.filter(
    (t) =>
      t.badge &&
      (regionId === undefined || t.regionId === regionId) &&
      progress.defeatedTrainerIds.has(t.id),
  );
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
      return earnedBadges(ctx, progress, condition.regionId).length >= condition.count;
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

/** Reste à faire en dessous duquel un objectif de collection seul est « à portée ». */
const SOON_GAP = { dexPercent: 10, species: 15, eggs: 5 };

/**
 * Condition à portée : remplie, ou remplie dès le prochain badge. Chaque brique doit l'être :
 * un badge de plus suffit, le dresseur à battre est déjà (ou sera au prochain badge) affrontable,
 * la quête concernée est ouverte. Les objectifs de collection (Pokédex, captures, œufs) sont
 * à portée à côté d'un badge (zones combinées), ou seuls quand il reste peu à faire.
 */
export function isUnlockedSoon(
  ctx: GameContext,
  condition: UnlockCondition,
  progress: PlayerProgress,
  lookahead = true,
): boolean {
  if (isUnlocked(ctx, condition, progress)) return true;
  const parts = unlockParts(condition);
  const badgeGated = parts.some((p) => p.type === 'badgeCount');
  return parts.every((part) => {
    if (isUnlocked(ctx, part, progress)) return true;
    switch (part.type) {
      case 'badgeCount':
        return lookahead && earnedBadges(ctx, progress, part.regionId).length + 1 >= part.count;
      case 'trainerDefeated': {
        const trainer = ctx.trainer(part.trainerId);
        // Un seul niveau d'anticipation : le déblocage du dresseur n'en anticipe pas d'autre.
        return !!trainer && isUnlockedSoon(ctx, trainer.unlock, progress, false);
      }
      case 'questStepsDone':
      case 'questCompleted': {
        const quest = ctx.quest(part.questId);
        return !!quest && isUnlocked(ctx, quest.unlock, progress);
      }
      case 'regionDexPercent':
        return (
          badgeGated ||
          part.percent - regionDexProgress(ctx, part.regionId, progress).percent <=
            SOON_GAP.dexPercent
        );
      case 'speciesCaught':
        return badgeGated || part.count - progress.caughtSpeciesIds.size <= SOON_GAP.species;
      case 'eggsHatched':
        return badgeGated || part.count - progress.eggsHatched <= SOON_GAP.eggs;
      case 'always':
        return true;
    }
  });
}
