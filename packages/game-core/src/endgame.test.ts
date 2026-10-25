import { describe, expect, it } from 'vitest';
import { applyItemToPokemon, itemUseOptions } from './endgame';
import type { ItemTarget } from './endgame';
import { MAX_LEVEL, NO_ABILITY, xpForLevel } from './pokemon';
import { createRng } from './rng';
import { testContext } from './test-helpers';

const ctx = testContext();
const rng = createRng(1);

const target = (patch: Partial<ItemTarget> = {}): ItemTarget => ({
  speciesId: 144, // Artikodin : Pression, talent caché Corps Gel
  ivs: {
    hp: 31,
    attack: 10,
    defense: 31,
    'special-attack': 20,
    'special-defense': 31,
    speed: 31,
  },
  nature: 'hardy',
  originalNature: 'hardy',
  ability: 'pressure',
  happiness: 70,
  level: 50,
  xp: xpForLevel('slow', 50) + 10,
  ...patch,
});

describe('objets endgame', () => {
  it('Capsule d’Argent : un IV au choix passe à 31', () => {
    expect(itemUseOptions(ctx, target(), 'bottle-cap')?.stats).toEqual([
      'attack',
      'special-attack',
    ]);
    expect(applyItemToPokemon(ctx, target(), 'bottle-cap', {}, rng)).toEqual({
      error: 'CHOICE_REQUIRED',
    });
    expect(applyItemToPokemon(ctx, target(), 'bottle-cap', { stat: 'hp' }, rng)).toEqual({
      error: 'NO_EFFECT',
    });
    const result = applyItemToPokemon(ctx, target(), 'bottle-cap', { stat: 'attack' }, rng);
    expect(result).toEqual({ patch: { ivs: { ...target().ivs, attack: 31 } } });
  });

  it('Capsule d’Or : les 6 IV passent à 31, sans effet sur un Pokémon parfait', () => {
    const result = applyItemToPokemon(ctx, target(), 'gold-bottle-cap', {}, rng);
    expect('patch' in result && Object.values(result.patch.ivs!).every((iv) => iv === 31)).toBe(
      true,
    );
    const perfect = target({ ivs: { ...target().ivs, attack: 31, 'special-attack': 31 } });
    expect(applyItemToPokemon(ctx, perfect, 'gold-bottle-cap', {}, rng)).toEqual({
      error: 'NO_EFFECT',
    });
  });

  it('Aromate : change la nature effective (retour à l’origine = plus de surcharge)', () => {
    expect(applyItemToPokemon(ctx, target(), 'adamant-mint', {}, rng)).toEqual({
      patch: { natureOverride: 'adamant' },
    });
    const minted = target({ nature: 'adamant', originalNature: 'modest' });
    expect(applyItemToPokemon(ctx, minted, 'adamant-mint', {}, rng)).toEqual({
      error: 'NO_EFFECT',
    });
    expect(applyItemToPokemon(ctx, minted, 'modest-mint', {}, rng)).toEqual({
      patch: { natureOverride: null },
    });
  });

  it('Pilule et Patch Talent', () => {
    // Artikodin n'a qu'un talent normal : la Pilule le donne s'il n'en a pas, le Patch donne Corps Gel.
    expect(applyItemToPokemon(ctx, target(), 'ability-capsule', {}, rng)).toEqual({
      error: 'NO_EFFECT',
    });
    expect(
      applyItemToPokemon(ctx, target({ ability: NO_ABILITY }), 'ability-capsule', {}, rng),
    ).toEqual({
      patch: { ability: 'pressure' },
    });
    expect(applyItemToPokemon(ctx, target(), 'ability-patch', {}, rng)).toEqual({
      patch: { ability: 'snow-cloak' },
    });
    const hidden = target({ ability: 'snow-cloak' });
    expect(applyItemToPokemon(ctx, hidden, 'ability-patch', {}, rng)).toEqual({
      error: 'NO_EFFECT',
    });
    // Une Pilule ramène un talent normal après le Patch.
    expect(applyItemToPokemon(ctx, hidden, 'ability-capsule', {}, rng)).toEqual({
      patch: { ability: 'pressure' },
    });
    // Ronflex (143) : deux talents normaux, Vaccin ↔ Isograisse.
    const snorlax = target({ speciesId: 143, ability: 'immunity' });
    expect(itemUseOptions(ctx, snorlax, 'ability-capsule')?.abilities).toEqual(['thick-fat']);
    expect(applyItemToPokemon(ctx, snorlax, 'ability-capsule', {}, rng)).toEqual({
      patch: { ability: 'thick-fat' },
    });
    // Sans talent : l'un des deux au hasard.
    const none = target({ speciesId: 143, ability: NO_ABILITY });
    expect(itemUseOptions(ctx, none, 'ability-capsule')?.abilities).toEqual([
      'immunity',
      'thick-fat',
    ]);
    const drawn = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => {
        const result = applyItemToPokemon(ctx, none, 'ability-capsule', {}, createRng(seed));
        return 'patch' in result ? result.patch.ability : undefined;
      }),
    );
    expect(drawn).toEqual(new Set(['immunity', 'thick-fat']));
  });

  it('Super Bonbon : un niveau de plus, XP au début du niveau, pas au-delà de 100', () => {
    expect(applyItemToPokemon(ctx, target(), 'rare-candy', {}, rng)).toEqual({
      patch: { level: 51, xp: xpForLevel('slow', 51) },
    });
    const max = target({ level: MAX_LEVEL, xp: xpForLevel('slow', MAX_LEVEL) });
    expect(applyItemToPokemon(ctx, max, 'rare-candy', {}, rng)).toEqual({ error: 'NO_EFFECT' });
  });

  it('refuse un objet sans effet sur les Pokémon', () => {
    expect(applyItemToPokemon(ctx, target(), 'poke-ball', {}, rng)).toEqual({
      error: 'NOT_USABLE_ON_POKEMON',
    });
  });
});
