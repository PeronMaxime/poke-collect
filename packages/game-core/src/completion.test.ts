import { describe, expect, it } from 'vitest';
import type { ExpeditionCompletion } from '@poke/content';
import {
  claimableCompletionCount,
  completableZones,
  completionRewardId,
  completionState,
  completionTargets,
  regionCompletion,
  zoneCompletion,
  zoneCompletionPokemon,
} from './completion';
import { facilityPlaces } from './facilities';
import { applyCandies, candiesForLevel, daycareXp } from './breeding';
import { applyTeamXp } from './expedition';
import { generatePokemon, xpForLevel } from './pokemon';
import { createRng } from './rng';
import { NO_CLAIMS, playerBonuses, pokemonXpMultiplier } from './progression';
import type { ClaimedRewards, DexCatches } from './progression';
import { shinyProbability } from './shiny';
import { testContext } from './test-helpers';

const reward = { currency: 0, items: [], expeditionSlots: 0, daycareSlots: 0, bonuses: [] };
const RULES: ExpeditionCompletion[] = [
  {
    id: 'region-complete',
    name: 'Région complétée',
    scope: 'region',
    regionId: null,
    zoneId: null,
    shiny: false,
    rewards: { ...reward, incubators: 1 },
    regionBonuses: [],
  },
  {
    id: 'expedition-chromatique',
    name: 'Expédition chromatique',
    scope: 'zone',
    regionId: null,
    zoneId: null,
    shiny: true,
    rewards: { ...reward, incubators: 0, bonuses: [{ type: 'shiny', percent: 1 }] },
    regionBonuses: [],
  },
];

const ctx = testContext((c) => {
  c.balance.expeditionCompletions = RULES;
});
const [regionRule, shinyRule] = RULES as [ExpeditionCompletion, ExpeditionCompletion];
const kantoZones = completableZones(ctx, 'kanto');
const zone = kantoZones[0]!;

/** Pokédex qui contient tous les Pokémon des expéditions données (en shiny avec `shiny`). */
function catchesOf(zones: typeof kantoZones, shiny = false): DexCatches {
  const list = zones.flatMap((z) => zoneCompletionPokemon(ctx, z));
  const species = new Set(list.filter((p) => p.formId == null).map((p) => p.speciesId));
  const forms = new Set(list.flatMap((p) => (p.formId == null ? [] : [p.formId])));
  return {
    caughtSpeciesIds: species,
    caughtFormIds: forms,
    caughtShinySpeciesIds: shiny ? species : new Set(),
    caughtShinyFormIds: shiny ? forms : new Set(),
  };
}

const claims = (...ids: string[]): ClaimedRewards => ({
  ...NO_CLAIMS,
  completionIds: new Set(ids),
});

describe('complétion des expéditions', () => {
  it('une expédition est complétée quand chacun de ses Pokémon est capturé', () => {
    expect(kantoZones.length).toBeGreaterThan(1);
    const empty = catchesOf([]);
    expect(zoneCompletion(ctx, zone, empty, false).complete).toBe(false);
    const done = zoneCompletion(ctx, zone, catchesOf([zone]), false);
    expect(done).toMatchObject({ complete: true });
    expect(done.caught).toBe(done.total);
    // Capturés en normal seulement : pas complétée en chromatique.
    expect(zoneCompletion(ctx, zone, catchesOf([zone]), true).complete).toBe(false);
    expect(zoneCompletion(ctx, zone, catchesOf([zone], true), true).complete).toBe(true);
  });

  it('une région est complétée quand toutes ses expéditions le sont', () => {
    expect(regionCompletion(ctx, 'kanto', catchesOf([zone]), false).complete).toBe(false);
    const all = regionCompletion(ctx, 'kanto', catchesOf(kantoZones), false);
    expect(all).toEqual({ caught: kantoZones.length, total: kantoZones.length, complete: true });
  });

  it('une récompense par région ou par expédition, réclamable une fois', () => {
    expect(completionTargets(ctx, regionRule).map((t) => t.id)).toContain('kanto');
    expect(completionTargets(ctx, shinyRule).length).toBe(completableZones(ctx, null).length);

    const catches = catchesOf(kantoZones, true);
    expect(completionState(ctx, regionRule, 'kanto', catches, NO_CLAIMS)).toBe('claimable');
    expect(completionState(ctx, shinyRule, zone.id, catches, NO_CLAIMS)).toBe('claimable');
    expect(claimableCompletionCount(ctx, catches, NO_CLAIMS)).toBe(1 + kantoZones.length);

    const claimed = claims(completionRewardId(regionRule.id, 'kanto'));
    expect(completionState(ctx, regionRule, 'kanto', catches, claimed)).toBe('claimed');
    expect(claimableCompletionCount(ctx, catches, claimed)).toBe(kantoZones.length);
  });

  it('une expédition ou une région précise', () => {
    const one = { ...shinyRule, regionId: 'kanto', zoneId: zone.id };
    expect(completionTargets(ctx, one).map((t) => t.id)).toEqual([zone.id]);
    const kanto = { ...regionRule, regionId: 'kanto' };
    expect(completionTargets(ctx, kanto).map((t) => t.id)).toEqual(['kanto']);
  });

  it('les récompenses réclamées donnent des couveuses et un bonus de chance shiny', () => {
    const progress = { ...catchesOf([]), defeatedTrainerIds: new Set<string>(), eggsHatched: 0 };
    const base = facilityPlaces(ctx, 'incubator', progress, NO_CLAIMS);
    const claimed = claims(
      completionRewardId(regionRule.id, 'kanto'),
      completionRewardId(shinyRule.id, kantoZones[0]!.id),
      completionRewardId(shinyRule.id, kantoZones[1]!.id),
    );
    expect(facilityPlaces(ctx, 'incubator', progress, claimed)).toBe(base + 6);
    const { shiny } = playerBonuses(ctx, claimed);
    expect(shiny).toBeCloseTo(1.02);
    expect(shinyProbability(ctx, { bonus: shiny })).toBeCloseTo(shinyProbability(ctx) * 1.02);
    // Une complétion retirée du contenu ne compte plus.
    const removed = testContext((c) => {
      c.balance.expeditionCompletions = [];
    });
    expect(playerBonuses(removed, claimed).shiny).toBe(1);
  });
});

describe('bonus de région des complétions', () => {
  const xpRule: ExpeditionCompletion = {
    id: 'expedition-complete',
    name: 'Expédition complétée',
    scope: 'zone',
    regionId: null,
    zoneId: null,
    shiny: false,
    rewards: { ...reward, incubators: 0 },
    regionBonuses: [{ type: 'xp', percent: 2 }],
  };
  const xpCtx = testContext((c) => {
    c.balance.expeditionCompletions = [...RULES, xpRule];
  });
  const kanto = xpCtx.region('kanto')!;
  const inKanto = kanto.speciesIds[0]!;
  const outside = xpCtx.regions
    .flatMap((r) => r.speciesIds)
    .find((id) => !kanto.speciesIds.includes(id) && xpCtx.species(id))!;
  const claimed = claims(
    completionRewardId(xpRule.id, kantoZones[0]!.id),
    completionRewardId(xpRule.id, kantoZones[1]!.id),
  );

  it('+2 % d’XP par expédition complétée, pour les Pokémon de sa région seulement', () => {
    const bonuses = playerBonuses(xpCtx, claimed);
    expect(bonuses.regionXp?.kanto).toBeCloseTo(0.04);
    expect(bonuses.xp).toBe(1);
    expect(pokemonXpMultiplier(xpCtx, bonuses, inKanto)).toBeCloseTo(1.04);
    expect(pokemonXpMultiplier(xpCtx, bonuses, outside)).toBe(1);
    expect(playerBonuses(xpCtx, NO_CLAIMS).regionXp).toBeUndefined();
  });

  it('s’applique à toutes les sources d’XP', () => {
    const bonuses = playerBonuses(xpCtx, claimed);
    const make = (speciesId: number) =>
      generatePokemon(xpCtx, createRng(1), speciesId, 5, { shinyProbability: 0 });
    const [a, b] = [make(inKanto), make(outside)];
    const team = [a, b].map((p, i) => ({ ...p, id: `p${i}` }));
    const [ra, rb] = applyTeamXp(xpCtx, team, 1000, 0, bonuses);
    expect(ra!.xpGained).toBe(1040);
    expect(rb!.xpGained).toBe(1000);

    const since = new Date(0);
    const later = new Date(3_600_000);
    const perHour = xpCtx.balance.breeding.parentXpPerHour;
    expect(daycareXp(xpCtx, a, since, later, bonuses).xpGained).toBe(Math.floor(perHour * 1.04));
    expect(daycareXp(xpCtx, b, since, later, bonuses).xpGained).toBe(perHour);

    // Un Bonbon vaut 1,04 Bonbon : les Bonbons du niveau le passent, avec un surplus de 0,2 Bonbon.
    const candies = candiesForLevel(xpCtx, 5);
    const nextXp = (p: typeof a) => xpForLevel(xpCtx.species(p.speciesId)!.growthRate, 6);
    const fedA = applyCandies(
      xpCtx,
      { ...a, level: 5, xp: xpForLevel(xpCtx.species(a.speciesId)!.growthRate, 5) },
      candies,
      bonuses,
    );
    const fedB = applyCandies(
      xpCtx,
      { ...b, level: 5, xp: xpForLevel(xpCtx.species(b.speciesId)!.growthRate, 5) },
      candies,
      bonuses,
    );
    expect(fedA.level).toBe(6);
    expect(fedA.xp).toBeGreaterThan(nextXp(a));
    expect(fedB).toEqual({ xp: nextXp(b), level: 6 });
  });
});
