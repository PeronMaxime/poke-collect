import { describe, expect, it } from 'vitest';
import { normalizeMenu, normalizeMenuGroups } from './schemas';

describe('menu du jeu', () => {
  it('place un onglet oublié à côté de son voisin des groupes par défaut', () => {
    const groups = normalizeMenuGroups([
      ['expeditions', 'battles', 'dungeons', 'quests'],
      ['daycare', 'museum'],
      ['pc', 'teams', 'pokedex', 'shop', 'bag'],
      ['trainer', 'leaderboard'],
    ]);
    // Le Centre Pokémon, premier de son groupe, se place avant la Pension ; la ferme après le Musée.
    expect(groups[1]).toEqual(['center', 'daycare', 'museum', 'farm']);
  });

  it('titre chaque section, même sans titre réglé', () => {
    expect(normalizeMenu(undefined).map((s) => s.title)).toEqual([
      'Aventure',
      'Bâtiments',
      'Collection',
      'Dresseur',
    ]);
    // Ancien réglage sans titres : celui du groupe par défaut de son premier onglet.
    const old = normalizeMenu({ groups: [['pc', 'pokedex'], ['expeditions']] });
    expect(old.map((s) => s.title).slice(0, 2)).toEqual(['Collection', 'Aventure']);
    // Titres suivis par groupe, même quand un groupe vide disparaît.
    const titled = normalizeMenu({
      groups: [['inconnu'], ['expeditions'], ['pc']],
      titles: ['Vide', 'Partir', 'Boîte'],
    });
    expect(titled.slice(0, 2)).toEqual([
      expect.objectContaining({ title: 'Partir' }),
      expect.objectContaining({ title: 'Boîte' }),
    ]);
  });
});
