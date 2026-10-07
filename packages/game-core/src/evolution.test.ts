import { describe, expect, it } from 'vitest';
import { getSpecies } from '@poke/data';
import {
  checkEvolution,
  evolutionOptions,
  evolvePokemon,
  evolvedAbility,
  localHour,
  methodFromDetail,
  pokemonEvolutions,
  timeOfDayAt,
} from './evolution';
import { member, testContext } from './test-helpers';

const ctx = testContext();
const bag = (items: Record<string, number> = {}, hour = 12) => ({
  itemQuantity: (id: string) => items[id] ?? 0,
  hour,
});
const targets = (speciesId: number) => evolutionOptions(ctx, speciesId).map((o) => o.toSpeciesId);

describe('méthodes PokéAPI', () => {
  it('traduit niveau, objet, échange et bonheur', () => {
    expect(methodFromDetail({ trigger: 'level-up', minLevel: 16 }, 'linking-cord')).toEqual({
      minLevel: 16,
      itemId: null,
      minHappiness: null,
      timeOfDay: null,
    });
    expect(methodFromDetail({ trigger: 'use-item', item: 'moon-stone' }, null)?.itemId).toBe(
      'moon-stone',
    );
    expect(methodFromDetail({ trigger: 'trade' }, 'linking-cord')?.itemId).toBe('linking-cord');
    expect(methodFromDetail({ trigger: 'trade' }, null)).toBeNull();
    expect(
      methodFromDetail({ trigger: 'trade', heldItem: 'metal-coat' }, 'linking-cord')?.itemId,
    ).toBe('metal-coat');
    expect(
      methodFromDetail({ trigger: 'level-up', minHappiness: 160, timeOfDay: 'night' }, null),
    ).toMatchObject({ minHappiness: 160, timeOfDay: 'night' });
  });

  it('ignore les conditions non transposables', () => {
    expect(methodFromDetail({ trigger: 'level-up', location: 'mt-coronet' }, null)).toBeNull();
    expect(methodFromDetail({ trigger: 'level-up', knownMove: 'rollout' }, null)).toBeNull();
    expect(methodFromDetail({ trigger: 'three-critical-hits' }, null)).toBeNull();
    expect(
      methodFromDetail({ trigger: 'level-up', minLevel: 20, timeOfDay: 'dusk' }, null),
    ).toBeNull();
  });
});

describe('évolutions possibles', () => {
  it('suit la chaîne PokéAPI et ignore les espèces non importées', () => {
    expect(targets(1)).toEqual([2]);
    expect(targets(133)).toEqual([134, 135, 136]); // Évoli : pas Mentali, Noctali… (Gén. II+)
    expect(targets(42)).toEqual([]); // Nosferalto → Nostenfer (Gén. II)
    expect(targets(150)).toEqual([]);
  });

  it('remplace l’échange par le Câble Link', () => {
    const [kadabra] = evolutionOptions(ctx, 64);
    expect(kadabra?.methods).toEqual([
      { minLevel: null, itemId: 'linking-cord', minHappiness: null, timeOfDay: null },
    ]);
  });

  it('applique les surcharges du contenu (formes régionales écartées)', () => {
    const [persian] = evolutionOptions(ctx, 52);
    expect(persian).toMatchObject({ source: 'override', methods: [{ minLevel: 28 }] });
    expect(persian?.methods).toHaveLength(1);
  });

  it('désactive ou ajoute une évolution par surcharge', () => {
    const custom = testContext((c) => {
      c.evolutionOverrides.push(
        { id: '1-2', fromSpeciesId: 1, toSpeciesId: 2, enabled: false, methods: [] },
        {
          id: '1-3',
          fromSpeciesId: 1,
          toSpeciesId: 3,
          enabled: true,
          methods: [{ minLevel: 50, itemId: null, minHappiness: null, timeOfDay: null }],
        },
      );
    });
    expect(evolutionOptions(custom, 1).map((o) => o.toSpeciesId)).toEqual([3]);
  });
});

describe('conditions', () => {
  it('vérifie le niveau', () => {
    const [option] = evolutionOptions(ctx, 1);
    expect(checkEvolution(ctx, member('a', 1, 15), option!, bag()).method).toBeNull();
    const check = checkEvolution(ctx, member('a', 1, 15), option!, bag());
    expect(check.methods[0]?.missing).toEqual([{ type: 'level', required: 16, current: 15 }]);
    expect(checkEvolution(ctx, member('a', 1, 16), option!, bag()).method?.minLevel).toBe(16);
  });

  it('exige l’objet dans le sac', () => {
    const [raichu] = evolutionOptions(ctx, 25);
    expect(checkEvolution(ctx, member('p', 25, 5), raichu!, bag()).method).toBeNull();
    expect(
      checkEvolution(ctx, member('p', 25, 5), raichu!, bag({ 'thunder-stone': 1 })).method?.itemId,
    ).toBe('thunder-stone');
  });

  it('préfère une méthode qui ne consomme pas d’objet', () => {
    const custom = testContext((c) => {
      c.evolutionOverrides.push({
        id: '1-2',
        fromSpeciesId: 1,
        toSpeciesId: 2,
        enabled: true,
        methods: [
          { minLevel: null, itemId: 'moon-stone', minHappiness: null, timeOfDay: null },
          { minLevel: 10, itemId: null, minHappiness: null, timeOfDay: null },
        ],
      });
    });
    const [checked] = pokemonEvolutions(custom, member('a', 1, 12), bag({ 'moon-stone': 3 }));
    expect(checked?.method).toMatchObject({ minLevel: 10, itemId: null });
  });

  it('gère le bonheur et le moment de la journée', () => {
    const custom = testContext((c) => {
      c.evolutionOverrides.push({
        id: '133-135',
        fromSpeciesId: 133,
        toSpeciesId: 135,
        enabled: true,
        methods: [{ minLevel: null, itemId: null, minHappiness: 160, timeOfDay: 'night' }],
      });
    });
    const option = evolutionOptions(custom, 133).find((o) => o.toSpeciesId === 135)!;
    const happy = member('e', 133, 10, { happiness: 200 });
    expect(checkEvolution(custom, happy, option, bag({}, 12)).methods[0]?.missing).toEqual([
      { type: 'timeOfDay', required: 'night' },
    ]);
    expect(checkEvolution(custom, happy, option, bag({}, 23)).method).not.toBeNull();
    expect(
      checkEvolution(custom, { ...happy, happiness: 100 }, option, bag({}, 23)).method,
    ).toBeNull();
  });

  it('calcule le jour et la nuit selon l’heure locale', () => {
    expect(timeOfDayAt(ctx, 5)).toBe('night');
    expect(timeOfDayAt(ctx, 6)).toBe('day');
    expect(timeOfDayAt(ctx, 19)).toBe('day');
    expect(timeOfDayAt(ctx, 20)).toBe('night');
    const wrapped = testContext((c) => {
      c.balance.evolution.dayStartHour = 22;
      c.balance.evolution.nightStartHour = 4;
    });
    expect(timeOfDayAt(wrapped, 23)).toBe('day');
    expect(timeOfDayAt(wrapped, 12)).toBe('night');
    expect(localHour(new Date('2026-10-07T22:30:00Z'), 120)).toBe(0);
    expect(localHour(new Date('2026-10-07T02:00:00Z'), -300)).toBe(21);
  });
});

describe('application', () => {
  it('change l’espèce et garde le même emplacement de talent', () => {
    const bulbasaur = getSpecies(1)!;
    const ivysaur = getSpecies(2)!;
    expect(evolvedAbility(bulbasaur, ivysaur, 'chlorophyll')).toBe('chlorophyll');
    expect(evolvedAbility(getSpecies(63)!, getSpecies(64)!, 'inner-focus')).toBe('inner-focus');

    const before = member('a', 1, 16, { ability: 'overgrow', xp: 4000, happiness: 90 });
    const after = evolvePokemon(ctx, before, 2);
    expect(after).toEqual({ ...before, speciesId: 2, ability: 'overgrow' });
  });
});
