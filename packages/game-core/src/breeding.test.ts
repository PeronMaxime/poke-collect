import { describe, expect, it } from 'vitest';
import { STAT_NAMES } from '@poke/data';
import {
  applyCandies,
  baseSpeciesId,
  candiesToMaxLevel,
  checkBreedingPair,
  eggsLaid,
  hatchMinutes,
  inheritanceRules,
  resolveEgg,
  transferCandies,
} from './breeding';
import type { DaycareParent } from './breeding';
import { MAX_LEVEL, xpForLevel } from './pokemon';
import { member, testContext } from './test-helpers';

const ctx = testContext();

function parent(
  speciesId: number,
  gender: DaycareParent['gender'],
  extra: Partial<DaycareParent> = {},
): DaycareParent {
  const { id: _, ...instance } = member('x', speciesId, 20, { gender });
  return { ...instance, heldItemId: null, ...extra };
}

describe('compatibilité', () => {
  it('trouve l’espèce de base de la lignée', () => {
    expect(baseSpeciesId(ctx, 3)).toBe(1);
    expect(baseSpeciesId(ctx, 130)).toBe(129);
    // Bébés (Gén. II) : Pichu est la base de Raichu.
    expect(baseSpeciesId(ctx, 26)).toBe(172);
  });

  it('accepte un mâle et une femelle d’un groupe commun ; l’œuf suit la mère', () => {
    // Florizarre ♂ (monstre) × Nidoran♀ (monstre) → Nidoran♀
    expect(checkBreedingPair(ctx, parent(3, 'male'), parent(29, 'female'))).toEqual({
      ok: true,
      eggSpeciesId: 29,
      eggFormId: null,
      motherIndex: 1,
    });
    expect(checkBreedingPair(ctx, parent(130, 'female'), parent(147, 'male'))).toMatchObject({
      ok: true,
      eggSpeciesId: 129,
    });
  });

  it('accepte Métamorph avec n’importe quel Pokémon élevable, y compris asexué', () => {
    expect(checkBreedingPair(ctx, parent(132, 'genderless'), parent(81, 'genderless'))).toEqual({
      ok: true,
      eggSpeciesId: 81,
      eggFormId: null,
      motherIndex: 1,
    });
    expect(checkBreedingPair(ctx, parent(26, 'male'), parent(132, 'genderless'))).toMatchObject({
      ok: true,
      eggSpeciesId: 172,
      motherIndex: 0,
    });
  });

  it('refuse les couples incompatibles', () => {
    const errors = (a: DaycareParent, b: DaycareParent) => {
      const check = checkBreedingPair(ctx, a, b);
      return check.ok ? [] : check.errors.map((e) => e.code);
    };
    expect(errors(parent(1, 'male'), parent(4, 'male'))).toEqual(['INCOMPATIBLE_GENDERS']);
    expect(errors(parent(1, 'male'), parent(129, 'female'))).toEqual(['NO_COMMON_EGG_GROUP']);
    expect(errors(parent(132, 'genderless'), parent(132, 'genderless'))).toEqual(['TWO_DITTOS']);
    expect(errors(parent(150, 'genderless'), parent(132, 'genderless'))).toEqual(['NOT_BREEDABLE']);
    expect(errors(parent(81, 'genderless'), parent(81, 'genderless'))).toEqual([
      'INCOMPATIBLE_GENDERS',
    ]);
    const same = checkBreedingPair(
      ctx,
      { speciesId: 1, gender: 'male', id: 'same' },
      { speciesId: 1, gender: 'female', id: 'same' },
    );
    expect(same).toEqual({ ok: false, errors: [{ code: 'SAME_POKEMON' }] });
  });

  it('respecte la surcharge « élevable » de l’admin', () => {
    const custom = testContext((c) => {
      c.speciesOverrides.push({
        speciesId: 1,
        enabled: true,
        nameFr: null,
        habitat: null,
        rarity: null,
        breedable: false,
      });
    });
    expect(checkBreedingPair(custom, parent(1, 'female'), parent(4, 'male')).ok).toBe(false);
  });
});

describe('héritage', () => {
  it('lit les effets des objets tenus', () => {
    expect(inheritanceRules(ctx, [null, null])).toEqual({ ivCount: 3, natureChance: [0, 0] });
    expect(inheritanceRules(ctx, ['destiny-knot', 'everstone'])).toEqual({
      ivCount: 5,
      natureChance: [0, 1],
    });
  });

  const zero = {
    hp: 0,
    attack: 0,
    defense: 0,
    'special-attack': 0,
    'special-defense': 0,
    speed: 0,
  };
  const max = {
    hp: 31,
    attack: 31,
    defense: 31,
    'special-attack': 31,
    'special-defense': 31,
    speed: 31,
  };
  // Parents à 0 et 31 partout : un IV hérité vaut 0 ou 31 ; un IV aléatoire rarement.
  const inherited = (ivs: Record<string, number>) =>
    STAT_NAMES.filter((s) => ivs[s] === 0 || ivs[s] === 31).length;

  it('est déterministe et transmet au moins le nombre d’IV prévu', () => {
    const parents = [
      parent(1, 'female', { ivs: zero, nature: 'adamant' }),
      parent(4, 'male', { ivs: max, nature: 'modest' }),
    ] as const;
    const input = { seed: 42, speciesId: 1, parents, motherIndex: 0 } as const;
    const a = resolveEgg(ctx, input);
    expect(resolveEgg(ctx, input)).toEqual(a);
    expect(a).toMatchObject({ speciesId: 1, level: 1, xp: 0 });

    for (let seed = 0; seed < 50; seed++) {
      const egg = resolveEgg(ctx, { ...input, seed });
      expect(inherited(egg.ivs)).toBeGreaterThanOrEqual(3);
      const knot = resolveEgg(ctx, {
        ...input,
        seed,
        parents: [{ ...parents[0], heldItemId: 'destiny-knot' }, parents[1]],
      });
      expect(inherited(knot.ivs)).toBeGreaterThanOrEqual(5);
    }
  });

  it('transmet la nature du parent qui tient la Pierre Stase', () => {
    for (let seed = 0; seed < 20; seed++) {
      const egg = resolveEgg(ctx, {
        seed,
        speciesId: 1,
        parents: [
          parent(1, 'female', { nature: 'adamant' }),
          parent(4, 'male', { nature: 'modest', heldItemId: 'everstone' }),
        ],
        motherIndex: 0,
      });
      expect(egg.nature).toBe('modest');
    }
  });

  it('transmet le talent caché de la mère selon la probabilité réglée', () => {
    const always = testContext((c) => {
      c.balance.breeding.hiddenAbilityInheritChance = 1;
    });
    const never = testContext((c) => {
      c.balance.breeding.hiddenAbilityInheritChance = 0;
    });
    const parents = [
      parent(1, 'female', { ability: 'chlorophyll' }),
      parent(4, 'male', { ability: 'blaze' }),
    ] as const;
    for (let seed = 0; seed < 20; seed++) {
      const input = { seed, speciesId: 1, parents, motherIndex: 0 } as const;
      expect(resolveEgg(always, input).ability).toBe('chlorophyll');
      expect(resolveEgg(never, input).ability).toBe('overgrow');
      // Père avec talent caché : rien n'est transmis.
      const fromFather = resolveEgg(always, { ...input, motherIndex: 1 });
      expect(fromFather.ability).toBe('overgrow');
    }
  });
});

describe('durées', () => {
  it('calcule le temps d’éclosion à partir des cycles de l’espèce', () => {
    expect(hatchMinutes(ctx, 129)).toBe(10); // Magicarpe : 5 cycles × 2 min
    expect(hatchMinutes(ctx, 147)).toBe(80); // Minidraco : 40 cycles
  });

  it('compte les œufs pondus depuis le dépôt', () => {
    const start = new Date('2026-01-01T00:00:00Z');
    const at = (min: number) => new Date(start.getTime() + min * 60_000);
    expect(eggsLaid(ctx, start, at(19))).toBe(0);
    expect(eggsLaid(ctx, start, at(20))).toBe(1);
    expect(eggsLaid(ctx, start, at(65))).toBe(3);
  });
});

describe('transfert et Bonbons', () => {
  it('donne des Bonbons, avec un bonus pour les shiny', () => {
    expect(transferCandies(ctx, { isShiny: false })).toBe(1);
    expect(transferCandies(ctx, { isShiny: true })).toBe(11);
  });

  it('convertit les Bonbons en XP, plafonnée au niveau maximal', () => {
    const p = { speciesId: 129, level: 1, xp: 0 }; // courbe « slow »
    expect(applyCandies(ctx, p, 2)).toEqual({ xp: 1000, level: 9 });
    const cap = xpForLevel('slow', MAX_LEVEL);
    expect(applyCandies(ctx, p, 1_000_000)).toEqual({ xp: cap, level: MAX_LEVEL });
    expect(candiesToMaxLevel(ctx, p)).toBe(Math.ceil(cap / 500));
  });
});
