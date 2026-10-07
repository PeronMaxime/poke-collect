import { describe, expect, it } from 'vitest';
import { baseShinyProbability } from './context';
import { testContext } from './test-helpers';

describe('createGameContext', () => {
  const ctx = testContext();

  it('expose les régions et les zones du contenu', () => {
    expect(ctx.region('kanto')?.speciesIds).toHaveLength(151);
    expect(ctx.region('johto')).toBeUndefined();
    expect(ctx.zones.map((z) => z.id)).toEqual([
      'route-1',
      'foret-de-jade',
      'mont-selenite',
      'cap-azuria',
    ]);
  });

  it('lit le taux shiny dans les réglages', () => {
    expect(baseShinyProbability(ctx)).toBe(1 / 4096);
  });

  it('applique les surcharges d’espèces', () => {
    const custom = testContext((c) => {
      c.speciesOverrides.push({
        speciesId: 19,
        enabled: false,
        nameFr: 'Ratounet',
        habitat: null,
        rarity: 'common',
        breedable: null,
      });
    });
    expect(custom.species(19)).toMatchObject({ nameFr: 'Ratounet', enabled: false });
    expect(custom.species(16)).toMatchObject({ nameFr: 'Roucool', enabled: true });
    expect(custom.species(9999)).toBeUndefined();
  });

  it('trouve les effets des objets', () => {
    expect(ctx.itemEffect('great-ball', 'ball')?.catchMultiplier).toBe(1.5);
    expect(ctx.itemEffect('razz-berry', 'ball')).toBeUndefined();
    expect(ctx.itemEffect('razz-berry', 'captureBoost')?.multiplier).toBe(1.5);
  });
});
