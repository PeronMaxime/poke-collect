import { describe, expect, it } from 'vitest';
import { applyItemToPokemon, itemUseOptions } from './endgame';
import type { ItemTarget } from './endgame';
import { testContext } from './test-helpers';

const ctx = testContext();

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
  ...patch,
});

describe('objets endgame', () => {
  it('Capsule d’Argent : un IV au choix passe à 31', () => {
    expect(itemUseOptions(ctx, target(), 'bottle-cap')?.stats).toEqual([
      'attack',
      'special-attack',
    ]);
    expect(applyItemToPokemon(ctx, target(), 'bottle-cap', {})).toEqual({
      error: 'CHOICE_REQUIRED',
    });
    expect(applyItemToPokemon(ctx, target(), 'bottle-cap', { stat: 'hp' })).toEqual({
      error: 'NO_EFFECT',
    });
    const result = applyItemToPokemon(ctx, target(), 'bottle-cap', { stat: 'attack' });
    expect(result).toEqual({ patch: { ivs: { ...target().ivs, attack: 31 } } });
  });

  it('Capsule d’Or : les 6 IV passent à 31, sans effet sur un Pokémon parfait', () => {
    const result = applyItemToPokemon(ctx, target(), 'gold-bottle-cap', {});
    expect('patch' in result && Object.values(result.patch.ivs!).every((iv) => iv === 31)).toBe(
      true,
    );
    const perfect = target({ ivs: { ...target().ivs, attack: 31, 'special-attack': 31 } });
    expect(applyItemToPokemon(ctx, perfect, 'gold-bottle-cap', {})).toEqual({ error: 'NO_EFFECT' });
  });

  it('Aromate : change la nature effective (retour à l’origine = plus de surcharge)', () => {
    expect(applyItemToPokemon(ctx, target(), 'adamant-mint', {})).toEqual({
      patch: { natureOverride: 'adamant' },
    });
    const minted = target({ nature: 'adamant', originalNature: 'modest' });
    expect(applyItemToPokemon(ctx, minted, 'adamant-mint', {})).toEqual({ error: 'NO_EFFECT' });
    expect(applyItemToPokemon(ctx, minted, 'modest-mint', {})).toEqual({
      patch: { natureOverride: null },
    });
  });

  it('Pilule et Patch Talent', () => {
    // Artikodin n'a qu'un talent normal : la Pilule est sans effet, le Patch donne Corps Gel.
    expect(applyItemToPokemon(ctx, target(), 'ability-capsule', {})).toEqual({
      error: 'NO_EFFECT',
    });
    expect(applyItemToPokemon(ctx, target(), 'ability-patch', {})).toEqual({
      patch: { ability: 'snow-cloak' },
    });
    const hidden = target({ ability: 'snow-cloak' });
    expect(applyItemToPokemon(ctx, hidden, 'ability-patch', {})).toEqual({ error: 'NO_EFFECT' });
    // Ronflex (143) : deux talents normaux, Vaccin ↔ Isograisse.
    const snorlax = target({ speciesId: 143, ability: 'immunity' });
    expect(itemUseOptions(ctx, snorlax, 'ability-capsule')?.abilities).toEqual(['thick-fat']);
    expect(applyItemToPokemon(ctx, snorlax, 'ability-capsule', {})).toEqual({
      patch: { ability: 'thick-fat' },
    });
  });

  it('refuse un objet sans effet sur les Pokémon', () => {
    expect(applyItemToPokemon(ctx, target(), 'poke-ball', {})).toEqual({
      error: 'NOT_USABLE_ON_POKEMON',
    });
  });
});
