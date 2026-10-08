import { describe, expect, it } from 'vitest';
import { isUnlocked, isUnlockedSoon, isZoneUnlocked, regionDexProgress } from './progress';
import { testContext } from './test-helpers';

const ctx = testContext();
const caught = (n: number, defeated: string[] = []) => ({
  caughtSpeciesIds: new Set(Array.from({ length: n }, (_, i) => i + 1)),
  defeatedTrainerIds: new Set(defeated),
  eggsHatched: 0,
});

describe('déblocages', () => {
  it('calcule l’avancement du Pokédex régional', () => {
    expect(regionDexProgress(ctx, 'kanto', caught(0))).toEqual({
      caught: 0,
      total: 151,
      percent: 0,
    });
    expect(regionDexProgress(ctx, 'kanto', caught(151)).percent).toBe(100);
  });

  it('évalue les conditions de déblocage', () => {
    expect(isUnlocked(ctx, { type: 'always' }, caught(0))).toBe(true);
    const cond = { type: 'regionDexPercent' as const, regionId: 'kanto', percent: 3 };
    expect(isUnlocked(ctx, cond, caught(4))).toBe(false);
    expect(isUnlocked(ctx, cond, caught(5))).toBe(true);
  });

  it('débloque les zones selon le Pokédex', () => {
    const forest = ctx.zone('foret-de-jade')!;
    expect(isZoneUnlocked(ctx, ctx.zone('route-1')!, caught(1))).toBe(true);
    expect(isZoneUnlocked(ctx, forest, caught(1))).toBe(false);
    expect(isZoneUnlocked(ctx, forest, caught(5))).toBe(true);
  });

  it('évalue les victoires et les badges', () => {
    const beatTom = { type: 'trainerDefeated' as const, trainerId: 'gamin-tom' };
    expect(isUnlocked(ctx, beatTom, caught(1))).toBe(false);
    expect(isUnlocked(ctx, beatTom, caught(1, ['gamin-tom']))).toBe(true);
    const oneBadge = { type: 'badgeCount' as const, count: 1 };
    // Tom ne donne pas de badge, Pierre si.
    expect(isUnlocked(ctx, oneBadge, caught(1, ['gamin-tom']))).toBe(false);
    expect(isUnlocked(ctx, oneBadge, caught(1, ['pierre']))).toBe(true);
    // Les badges d'une région ne comptent pas pour une autre.
    const kantoBadge = { ...oneBadge, regionId: 'kanto' };
    expect(isUnlocked(ctx, kantoBadge, caught(1, ['albert']))).toBe(false);
    expect(isUnlocked(ctx, oneBadge, caught(1, ['albert']))).toBe(true);
    expect(isUnlocked(ctx, kantoBadge, caught(1, ['pierre']))).toBe(true);
  });

  it('exige toutes les briques d’une condition combinée', () => {
    const safari = ctx.zone('parc-safari')!; // 5 badges et 60 espèces capturées
    const fiveBadges = ['pierre', 'ondine', 'major-bob', 'erika', 'koga'];
    expect(isZoneUnlocked(ctx, safari, caught(60, fiveBadges.slice(0, 4)))).toBe(false);
    expect(isZoneUnlocked(ctx, safari, caught(59, fiveBadges))).toBe(false);
    expect(isZoneUnlocked(ctx, safari, caught(60, fiveBadges))).toBe(true);
  });

  it('anticipe les déblocages du prochain badge', () => {
    const twoBadges = { type: 'badgeCount' as const, count: 2, regionId: 'kanto' };
    expect(isUnlockedSoon(ctx, twoBadges, caught(1))).toBe(false);
    expect(isUnlockedSoon(ctx, twoBadges, caught(1, ['pierre']))).toBe(true);
    // Les zones combinées apparaissent aussi au prochain badge, objectifs de collection compris.
    const safari = ctx.zone('parc-safari')!.unlock; // 5 badges et 60 espèces capturées
    const fourBadges = ['pierre', 'ondine', 'major-bob', 'erika'];
    expect(isUnlockedSoon(ctx, safari, caught(1, fourBadges.slice(0, 3)))).toBe(false);
    expect(isUnlockedSoon(ctx, safari, caught(1, fourBadges))).toBe(true);
    // Seul, un objectif de collection n'apparaît qu'à l'approche.
    const halfDex = { type: 'regionDexPercent' as const, regionId: 'kanto', percent: 50 };
    expect(isUnlockedSoon(ctx, halfDex, caught(1))).toBe(false);
    expect(isUnlockedSoon(ctx, halfDex, caught(61))).toBe(true);
  });
});
