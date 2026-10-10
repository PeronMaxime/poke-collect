import { describe, expect, it } from 'vitest';
import { STAT_NAMES } from '@poke/data';
import type { Stats } from '@poke/data';
import {
  captureProbability,
  checkTeam,
  encounterCount,
  encounterProbabilities,
  lootProbabilities,
  lootRollCount,
  matchesCaptureFilter,
  pityMultiplier,
  resolveExpedition,
} from './expedition';
import type { ExpeditionInput } from './expedition';
import { simulateZone } from './simulate';
import { member, testContext } from './test-helpers';

const ctx = testContext();
const route1 = ctx.zone('route-1')!;

describe('quantités selon la durée', () => {
  it('applique le taux horaire et les rendements décroissants', () => {
    const durations = [2, 5, 15, 60, 240, 480];
    expect(durations.map((d) => encounterCount(ctx, d))).toEqual([1, 2, 5, 20, 69, 129]);
    expect(durations.map((d) => lootRollCount(ctx, d))).toEqual([1, 1, 2, 10, 34, 64]);
  });

  it('lit les réglages, pas de valeurs en dur', () => {
    const linear = testContext((c) => {
      c.balance.expeditions.durationExponent = 1;
      c.balance.expeditions.encountersPerHour = 5;
    });
    expect(encounterCount(linear, 60)).toBe(5);
    expect(encounterCount(linear, 480)).toBe(40);
  });
});

describe('lootProbabilities', () => {
  it('cumule la chance de chaque objet sur tous les tirages', () => {
    const short = lootProbabilities(ctx, route1, 2).find((l) => l.itemId === 'poke-ball')!;
    expect(short).toEqual({ itemId: 'poke-ball', probability: 0.7, min: 1, max: 3 });
    // 60 min = 10 tirages.
    const long = lootProbabilities(ctx, route1, 60).find((l) => l.itemId === 'poke-ball')!;
    expect(long.probability).toBeCloseTo(1 - 0.3 ** 10);
  });

  it('est vide sans table de butin', () => {
    expect(lootProbabilities(ctx, { ...route1, lootTableId: null }, 60)).toEqual([]);
  });
});

describe('capture', () => {
  it('suit la formule (taux × Ball × PV restants / 255)', () => {
    // Rattata (255), Poké Ball, PV à 50 % : 255 × 1 × 2/3 / 255.
    expect(captureProbability(ctx, { captureRate: 255, ballMultiplier: 1 })).toBeCloseTo(2 / 3);
    expect(captureProbability(ctx, { captureRate: 45, ballMultiplier: 1.5 })).toBeCloseTo(
      (45 * 1.5 * (2 / 3)) / 255,
    );
  });

  it('ajoute les bonus et plafonne à 1', () => {
    const base = captureProbability(ctx, { captureRate: 45, ballMultiplier: 1 });
    const boosted = captureProbability(ctx, {
      captureRate: 45,
      ballMultiplier: 1,
      boostMultiplier: 1.5,
      affinityCount: 2,
    });
    expect(boosted).toBeCloseTo(base * 1.5 * 1.2);
    expect(captureProbability(ctx, { captureRate: 255, ballMultiplier: 10 })).toBe(1);
  });

  it('augmente le poids de rencontre avec la pitié, avec un plafond', () => {
    expect(pityMultiplier(ctx, 0)).toBe(1);
    expect(pityMultiplier(ctx, 10)).toBeCloseTo(1.5);
    expect(pityMultiplier(ctx, 1000)).toBe(3);
    const base = encounterProbabilities(ctx, route1).find((p) => p.speciesId === 10)!;
    const pity = encounterProbabilities(ctx, route1, new Map([[10, 40]])).find(
      (p) => p.speciesId === 10,
    )!;
    expect(base.probability).toBeCloseTo(0.05);
    expect(pity.probability).toBeGreaterThan(base.probability * 2.5);
  });
});

describe('checkTeam', () => {
  const azuria = ctx.zone('cap-azuria')!;

  it('vérifie la durée, la PE et les types requis', () => {
    const weak = [member('a', 1, 5)];
    const errors = checkTeam(ctx, azuria, 15, weak).errors.map((e) => e.code);
    expect(errors).toEqual(['DURATION_NOT_ALLOWED', 'POWER_TOO_LOW', 'MISSING_TYPES']);

    const strong = [member('a', 7, 30), member('b', 1, 30)];
    const ok = checkTeam(ctx, azuria, 60, strong);
    expect(ok.errors).toEqual([]);
    expect(ok.affinityCount).toBe(1);
  });

  it('refuse une équipe vide, trop grande ou avec doublons', () => {
    expect(checkTeam(ctx, route1, 15, []).errors.map((e) => e.code)).toEqual(['TEAM_EMPTY']);
    const seven = Array.from({ length: 7 }, (_, i) => member(`m${i}`, 19, 5));
    expect(checkTeam(ctx, route1, 15, seven).errors.map((e) => e.code)).toEqual(['TEAM_TOO_LARGE']);
    const dup = [member('a', 19, 5), member('a', 19, 5)];
    expect(checkTeam(ctx, route1, 15, dup).errors.map((e) => e.code)).toEqual(['DUPLICATE_MEMBER']);
  });
  it('n’accepte que les Pokémon du Pokédex de la région', () => {
    const route29 = ctx.zone('route-29')!;
    // Un Roucool (Kanto) ne part pas à Johto, même s'il y apparaît ; un Héricendre, si.
    expect(checkTeam(ctx, route29, 15, [member('a', 16, 10), member('b', 155, 5)]).errors).toEqual([
      { code: 'WRONG_REGION', regionId: 'johto', speciesIds: [16] },
    ]);
    expect(checkTeam(ctx, route29, 15, [member('b', 155, 5)]).errors).toEqual([]);
    expect(checkTeam(ctx, route1, 15, [member('b', 155, 5)]).errors.map((e) => e.code)).toEqual([
      'WRONG_REGION',
    ]);
  });
});

describe('resolveExpedition', () => {
  const input: ExpeditionInput = {
    zone: route1,
    durationMinutes: 60,
    seed: 1234,
    team: [member('starter', 4, 5, { xp: 135 })],
    balls: { itemId: 'poke-ball', quantity: 10 },
    berries: { itemId: 'razz-berry', quantity: 3 },
    pity: {},
  };

  it('est déterministe pour un même seed', () => {
    expect(resolveExpedition(ctx, input)).toEqual(resolveExpedition(ctx, input));
    expect(resolveExpedition(ctx, { ...input, seed: 99 })).not.toEqual(
      resolveExpedition(ctx, input),
    );
  });

  it('consomme une Ball par tentative et une baie tant qu’il en reste', () => {
    const result = resolveExpedition(ctx, input);
    expect(result.encounters).toHaveLength(20);
    expect(result.ballsUsed).toBe(10);
    expect(result.berriesUsed).toBe(3);
    for (const e of result.encounters) {
      expect(route1.encounters.map((x) => x.speciesId)).toContain(e.speciesId);
      expect(e.outcome === 'captured').toBe(e.pokemon !== undefined);
    }
  });

  it('sans Ball, les rencontres sont seulement vues', () => {
    const result = resolveExpedition(ctx, {
      ...input,
      balls: { itemId: 'poke-ball', quantity: 2 },
    });
    expect(result.ballsUsed).toBe(2);
    expect(result.encounters.filter((e) => e.outcome === 'noBall')).toHaveLength(18);
  });

  it('ne tente de capturer que les Pokémon du filtre, sans Ball pour les autres', () => {
    const result = resolveExpedition(ctx, {
      ...input,
      balls: { itemId: 'poke-ball', quantity: 30 },
      captureFilter: { speciesIds: [19], minPerfectIvs: 0, shiny: 'any' },
    });
    const targeted = result.encounters.filter((e) => e.speciesId === 19);
    expect(targeted.length).toBeGreaterThan(0);
    expect(targeted.every((e) => e.outcome !== 'ignored')).toBe(true);
    expect(
      result.encounters.filter((e) => e.speciesId !== 19).every((e) => e.outcome === 'ignored'),
    ).toBe(true);
    expect(result.ballsUsed).toBe(targeted.length);
    expect(Object.keys(result.pity)).toEqual(['19']);
  });

  it('nouveaux Pokémon : tente jusqu’à la première capture, puis ignore l’espèce', () => {
    const result = resolveExpedition(ctx, {
      ...input,
      balls: { itemId: 'poke-ball', quantity: 30 },
      captureFilter: { speciesIds: [], minPerfectIvs: 0, shiny: 'any', newOnly: true },
      caught: { speciesIds: new Set([16]), formIds: new Set() },
    });
    expect(
      result.encounters.filter((e) => e.speciesId === 16).every((e) => e.outcome === 'ignored'),
    ).toBe(true);
    const others = result.encounters.filter((e) => e.speciesId !== 16);
    expect(others.some((e) => e.outcome === 'captured')).toBe(true);
    for (const speciesId of new Set(others.map((e) => e.speciesId))) {
      const outcomes = others.filter((e) => e.speciesId === speciesId).map((e) => e.outcome);
      const first = outcomes.indexOf('captured');
      if (first >= 0) expect(outcomes.slice(first + 1).every((o) => o === 'ignored')).toBe(true);
      else expect(outcomes.every((o) => o === 'escaped')).toBe(true);
    }
  });

  it('met à jour la pitié : +1 par échec, remise à zéro à la capture', () => {
    const result = resolveExpedition(ctx, {
      ...input,
      balls: { itemId: 'poke-ball', quantity: 30 },
      pity: { 19: 4 },
    });
    for (const [speciesId, misses] of Object.entries(result.pity)) {
      const attempts = result.encounters.filter((e) => e.speciesId === Number(speciesId));
      const last = attempts.at(-1)!;
      if (last.outcome === 'captured') expect(misses).toBe(0);
      else expect(misses).toBeGreaterThan(0);
    }
  });

  it('donne du butin, de l’XP et du bonheur', () => {
    const result = resolveExpedition(ctx, input);
    const lootIds = new Set(ctx.lootTable('butin-route')!.entries.map((e) => e.itemId));
    for (const stack of result.loot) expect(lootIds.has(stack.itemId)).toBe(true);
    const [starter] = result.team;
    expect(starter!.xpGained).toBe(result.xpPerMember);
    expect(starter!.xpAfter).toBe(135 + starter!.xpGained);
    expect(starter!.levelAfter).toBeGreaterThanOrEqual(5);
    expect(starter!.happinessAfter).toBe(72);
  });

  it('ignore les espèces désactivées', () => {
    const custom = testContext((c) => {
      for (const id of [10, 16, 21, 29, 32]) {
        c.speciesOverrides.push({
          speciesId: id,
          enabled: false,
          nameFr: null,
          habitat: null,
          rarity: null,
          breedable: null,
        });
      }
    });
    const result = resolveExpedition(custom, { ...input, zone: custom.zone('route-1')! });
    expect(new Set(result.encounters.map((e) => e.speciesId))).toEqual(new Set([19]));
  });
});

describe('simulateZone', () => {
  it('donne des moyennes cohérentes avec les poids de la zone', () => {
    const sim = simulateZone(ctx, {
      zoneId: 'route-1',
      durationMinutes: 60,
      ballItemId: 'poke-ball',
      berryItemId: null,
      affinityCount: 0,
      runs: 2000,
      seed: 1,
    });
    expect(sim.encountersPerRun).toBe(20);
    const rattata = sim.species.find((s) => s.speciesId === 19)!;
    expect(rattata.encounterShare).toBeGreaterThan(0.25);
    expect(rattata.encounterShare).toBeLessThan(0.35);
    expect(rattata.captureRate).toBeGreaterThan(0.6);
    expect(rattata.captureRate).toBeLessThan(0.73);
    const balls = sim.loot.find((l) => l.itemId === 'poke-ball')!;
    expect(balls.dropRate).toBeGreaterThan(0.85); // 2 tirages à 70 %
    expect(sim.xpPerMemberPerRun).toBeGreaterThan(0);
  });

  it('sans Ball, aucune capture', () => {
    const sim = simulateZone(ctx, {
      zoneId: 'route-1',
      durationMinutes: 15,
      ballItemId: null,
      berryItemId: null,
      affinityCount: 0,
      runs: 50,
      seed: 2,
    });
    expect(sim.capturesPerRun).toBe(0);
  });
});

describe('matchesCaptureFilter', () => {
  const ivs = (perfect: number) =>
    Object.fromEntries(STAT_NAMES.map((stat, i) => [stat, i < perfect ? 31 : 10])) as Stats;
  const wild = (speciesId: number, isShiny: boolean, perfect: number, formId?: number) => ({
    speciesId,
    formId: formId ?? null,
    isShiny,
    ivs: ivs(perfect),
  });

  it('laisse tout passer sans filtre', () => {
    expect(matchesCaptureFilter(null, wild(16, false, 0))).toBe(true);
  });

  it('cumule espèces et IV parfaits', () => {
    const filter = { speciesIds: [16], minPerfectIvs: 2, shiny: 'any' as const };
    expect(matchesCaptureFilter(filter, wild(16, false, 2))).toBe(true);
    expect(matchesCaptureFilter(filter, wild(16, false, 1))).toBe(false);
    expect(matchesCaptureFilter(filter, wild(19, false, 6))).toBe(false);
  });

  it('gère les shiny : uniquement, ou toujours en plus des critères', () => {
    const only = { speciesIds: [], minPerfectIvs: 0, shiny: 'only' as const };
    expect(matchesCaptureFilter(only, wild(16, true, 0))).toBe(true);
    expect(matchesCaptureFilter(only, wild(16, false, 6))).toBe(false);
    const always = { speciesIds: [16], minPerfectIvs: 3, shiny: 'always' as const };
    expect(matchesCaptureFilter(always, wild(19, true, 0))).toBe(true);
    expect(matchesCaptureFilter(always, wild(19, false, 6))).toBe(false);
  });

  it('nouveaux Pokémon : espèce, ou forme, absente du Pokédex ; shiny « toujours » prioritaire', () => {
    const caught = { speciesIds: new Set([16, 19]), formIds: new Set([10091]) };
    const newOnly = { speciesIds: [], minPerfectIvs: 0, shiny: 'any' as const, newOnly: true };
    expect(matchesCaptureFilter(newOnly, wild(21, false, 0), caught)).toBe(true);
    expect(matchesCaptureFilter(newOnly, wild(16, false, 6), caught)).toBe(false);
    expect(matchesCaptureFilter(newOnly, wild(19, false, 0, 10091), caught)).toBe(false);
    expect(matchesCaptureFilter(newOnly, wild(19, false, 0, 10092), caught)).toBe(true);
    const always = { ...newOnly, shiny: 'always' as const };
    expect(matchesCaptureFilter(always, wild(16, true, 0), caught)).toBe(true);
    const only = { ...newOnly, shiny: 'only' as const };
    expect(matchesCaptureFilter(only, wild(16, true, 0), caught)).toBe(false);
    expect(matchesCaptureFilter(only, wild(21, true, 0), caught)).toBe(true);
  });
});
