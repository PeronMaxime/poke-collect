import { describe, expect, it } from 'vitest';
import { baseShinyProbability, playableContent } from './context';
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
    expect(ctx.region('johto')?.speciesIds).toHaveLength(100);
    expect(ctx.region('orre')).toBeUndefined();
    expect(ctx.zones.map((z) => z.id)).toEqual([
      'route-1',
      'foret-de-jade',
      'route-3',
      'mont-selenite',
      'pont-pepite',
      'cap-azuria',
      'routes-5-6',
      'cave-taupiqueur',
      'routes-9-10',
      'tunnel-roche',
      'routes-7-8',
      'tour-pokemon',
      'routes-12-15',
      'piste-cyclable',
      'routes-maritimes',
      'manoir-pokemon',
      'route-23',
      'route-victoire',
      'reserve-chen',
      'ronflex-endormi',
      'parc-safari',
      'dojo-karate',
      'sylphe-sarl',
      'centrale',
      'iles-ecume',
      'mont-braise',
      'grotte-azuree',
      'ile-lointaine',
      'archipel-lointain',
      'route-29',
      'routes-30-31',
      'tour-chetiflor',
      'route-32',
      'caves-jumelles',
      'ruines-alpha',
      'puits-ramoloss',
      'bois-aux-chenes',
      'routes-34-35',
      'antre-noir',
      'routes-36-37',
      'tour-cendree',
      'routes-38-39',
      'routes-42-44',
      'mont-creuset',
      'routes-40-41',
      'phare-oliville',
      'lac-colere',
      'route-de-glace',
      'routes-45-46',
      'routes-26-27',
      'labo-orme',
      'arbre-etrange',
      'parc-naturel',
      'parc-safari-johto',
      'mont-argente',
      'tourb-iles',
      'tour-carillon',
      'autel-bois-aux-chenes',
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
      'electhor',
      'artikodin',
      'sulfura',
      'mewtwo',
      'mew',
      'raikou',
      'entei',
      'suicune',
      'lugia',
      'ho-oh',
      'celebi',
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

describe('playableContent', () => {
  it('ne garde que Kanto et Johto avec le seed (autres régions désactivées)', () => {
    const { content } = testContext();
    const playable = playableContent(content);
    const open = ['kanto', 'johto'];
    expect(playable.regions.map((r) => r.id)).toEqual(open);
    expect(playable.zones.every((z) => open.includes(z.regionId))).toBe(true);
    expect(playable.zones.length).toBeGreaterThan(0);
    expect(playable.trainers.every((t) => open.includes(t.regionId))).toBe(true);
    expect(
      playable.dexMilestones.every((m) => m.regionId === null || open.includes(m.regionId)),
    ).toBe(true);
    expect(content.zones.some((z) => z.regionId === 'hoenn')).toBe(true);
  });

  it('retire les zones, dresseurs et quêtes désactivés un par un', () => {
    const { content } = testContext((c) => {
      c.zones.find((z) => z.id === 'route-1')!.enabled = false;
      c.trainers[0]!.enabled = false;
      c.quests[0]!.enabled = false;
    });
    const playable = playableContent(content);
    expect(playable.zones.map((z) => z.id)).not.toContain('route-1');
    expect(playable.trainers.map((t) => t.id)).not.toContain(content.trainers[0]!.id);
    expect(playable.quests.map((q) => q.id)).not.toContain(content.quests[0]!.id);
    expect(playable.zones.map((z) => z.id)).toContain('foret-de-jade');
  });
});
