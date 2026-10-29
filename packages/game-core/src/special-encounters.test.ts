import { describe, expect, it } from 'vitest';
import { checkBreedingPair } from './breeding';
import { resolveExpedition, specialEncountersFor } from './expedition';
import type { ExpeditionInput } from './expedition';
import { evolutionOptions } from './evolution';
import { isEventForm } from './forms';
import { member, testContext } from './test-helpers';

const ctx = testContext();
const route1 = ctx.zone('route-1')!;
const EEVEE_PARTNER = 10159;
const PIKACHU_ORIGINAL_CAP = 10094;

describe('rencontres spéciales', () => {
  const sure = {
    ...route1,
    specialEncounters: route1.specialEncounters.map((s) => ({ ...s, chance: 100 })),
  };
  const input: ExpeditionInput = {
    zone: sure,
    durationMinutes: 60,
    seed: 1234,
    team: [member('pikachu', 25, 10)],
    balls: { itemId: 'poke-ball', quantity: 30 },
    berries: null,
    pity: {},
  };

  it('exigent le Pokémon requis exact, ni une évolution ni une autre forme', () => {
    expect(specialEncountersFor(ctx, route1, [{ speciesId: 25, formId: null }])).toHaveLength(1);
    expect(specialEncountersFor(ctx, route1, [{ speciesId: 26, formId: null }])).toHaveLength(0);
    expect(
      specialEncountersFor(ctx, route1, [{ speciesId: 25, formId: PIKACHU_ORIGINAL_CAP }]),
    ).toHaveLength(0);
  });

  it('apparaissent une fois au plus, jamais chromatiques, et sont toujours tentées', () => {
    const result = resolveExpedition(ctx, {
      ...input,
      shiny: { chain: 0, charm: 1_000_000, bonus: 1 },
      captureFilter: { speciesIds: [19], minPerfectIvs: 0, shiny: 'any' },
    });
    const specials = result.encounters.filter((e) => e.special);
    expect(specials).toHaveLength(1);
    expect(specials[0]).toMatchObject({ speciesId: 133, formId: EEVEE_PARTNER, isShiny: false });
    expect(specials[0]!.outcome).not.toBe('ignored');
    expect(specials[0]!.level).toBeGreaterThanOrEqual(3);
  });

  it('sans le Pokémon requis, l’expédition reste identique (aucun tirage en plus)', () => {
    const team = [member('starter', 4, 5)];
    expect(resolveExpedition(ctx, { ...input, team })).toEqual(
      resolveExpedition(ctx, { ...input, team, zone: { ...sure, specialEncounters: [] } }),
    );
  });
});

describe('formes événementielles', () => {
  it('n’évoluent pas', () => {
    expect(isEventForm(PIKACHU_ORIGINAL_CAP)).toBe(true);
    expect(isEventForm(10100)).toBe(false); // Raichu d'Alola
    expect(evolutionOptions(ctx, 25, PIKACHU_ORIGINAL_CAP)).toEqual([]);
    expect(evolutionOptions(ctx, 133, EEVEE_PARTNER)).toEqual([]);
    expect(evolutionOptions(ctx, 25, null).length).toBeGreaterThan(0);
  });

  it('donnent un œuf de forme par défaut', () => {
    const mother = { speciesId: 133, formId: EEVEE_PARTNER, gender: 'female' as const };
    const father = { speciesId: 133, formId: null, gender: 'male' as const };
    const outcome = checkBreedingPair(ctx, mother, father);
    expect(outcome).toMatchObject({ ok: true, eggSpeciesId: 133, eggFormId: null });
  });
});
