import { describe, expect, it } from 'vitest';
import { BAG_SECTIONS, normalizeBag, normalizeMenu, normalizeMenuGroups } from './schemas';

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

describe('normalizeBag', () => {
  it('range toutes les rubriques par défaut', () => {
    const { tabs, sectionTitles } = normalizeBag(undefined);
    expect(tabs.map((t) => t.title)).toEqual(['Combat', 'Évolution', 'Élevage', 'Trésors']);
    expect(tabs.flatMap((t) => t.sections).sort()).toEqual([...BAG_SECTIONS].sort());
    expect(sectionTitles.heal).toBe('Soin');
  });

  it('retire inconnues, doublons et onglets vides, ajoute les absentes au dernier onglet', () => {
    const { tabs, sectionTitles } = normalizeBag({
      tabs: [
        { title: 'A', sections: ['ball', 'inconnue', 'ball'] },
        { title: 'Vide', sections: ['inconnue'] },
        { title: 'B', sections: ['heal'] },
      ],
      sectionTitles: { ball: 'Pokéballs', heal: '  ' },
    });
    expect(tabs.map((t) => t.title)).toEqual(['A', 'B']);
    expect(tabs[0]!.sections).toEqual(['ball']);
    expect(tabs[1]!.sections[0]).toBe('heal');
    expect(tabs[1]!.sections).toHaveLength(BAG_SECTIONS.length - 1);
    expect(sectionTitles.ball).toBe('Pokéballs');
    expect(sectionTitles.heal).toBe('Soin');
  });
});
