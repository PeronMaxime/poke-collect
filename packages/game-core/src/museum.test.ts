import { describe, expect, it } from 'vitest';
import { fossilEffect, reviveFossil } from './museum';
import { testContext } from './test-helpers';

const ctx = testContext();

describe('Musée', () => {
  it('reconnaît les fossiles du contenu', () => {
    expect(fossilEffect(ctx, 'helix-fossil')).toMatchObject({ speciesId: 138, level: 10 });
    expect(fossilEffect(ctx, 'poke-ball')).toBeUndefined();
  });

  it('restaure un Pokémon reproductible à partir du seed', () => {
    const input = { seed: 42, speciesId: 142, formId: null, level: 10 };
    const a = reviveFossil(ctx, input);
    expect(a).toMatchObject({ speciesId: 142, level: 10 });
    expect(reviveFossil(ctx, input)).toEqual(a);
    expect(reviveFossil(ctx, { ...input, seed: 43 })).not.toEqual(a);
  });

  it('applique le Charme Chroma', () => {
    const shiny = testContext((c) => {
      c.balance.shiny.baseRateDenominator = 3;
    });
    const input = { speciesId: 138, formId: null, level: 10, shinyCharm: 3 };
    for (let seed = 0; seed < 20; seed++) {
      expect(reviveFossil(shiny, { ...input, seed }).isShiny).toBe(true);
    }
  });
});
