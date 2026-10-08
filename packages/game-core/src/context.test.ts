import { describe, expect, it } from 'vitest';
import { baseShinyProbability } from './context';
import { testContext } from './test-helpers';

describe('createGameContext', () => {
  const ctx = testContext();

  it('expose les régions et les zones du contenu', () => {
    expect(ctx.region('kanto')?.speciesIds).toHaveLength(151);
    // Régions suivantes : sans légendaires ni mythiques (réservés aux quêtes).
    expect(ctx.regions.map((r) => r.id)).toEqual([
      'kanto',
      'johto',
      'hoenn',
      'sinnoh',
      'unys',
      'kalos',
      'alola',
      'galar',
      'hisui',
      'paldea',
    ]);
    expect(ctx.region('johto')?.speciesIds).toHaveLength(94);
    expect(ctx.region('orre')).toBeUndefined();
    expect(ctx.zones.map((z) => z.id)).toEqual([
      'route-1',
      'foret-de-jade',
      'mont-selenite',
      'cap-azuria',
      'route-victoire',
      'iles-ecume',
      'centrale',
      'mont-braise',
      'grotte-azuree',
      'ile-lointaine',
      'archipel-lointain',
      'route-29',
      'tour-chetiflor',
      'lac-colere',
      'route-101',
      'grotte-granite',
      'route-201',
      'mont-couronne',
      'route-1-unys',
      'desert-delassant',
      'route-2-kalos',
      'tour-maitrise',
      'route-1-alola',
      'mont-lanakila',
      'route-1-galar',
      'terres-sauvages',
      'antre-dynamax',
      'plaine-obsidienne',
      'province-sud-paldea',
      'lac-salinas',
    ]);
    expect(ctx.quests.map((q) => q.id)).toEqual([
      'artikodin',
      'electhor',
      'sulfura',
      'mewtwo',
      'mew',
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
