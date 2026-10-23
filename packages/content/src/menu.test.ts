import { describe, expect, it } from 'vitest';
import { normalizeMenuGroups } from './schemas';

describe('menu du jeu', () => {
  it('place un onglet oublié à côté de son voisin des groupes par défaut', () => {
    const groups = normalizeMenuGroups([
      ['expeditions', 'battles', 'dungeons', 'quests'],
      ['daycare', 'museum'],
      ['pc', 'teams', 'pokedex', 'shop', 'bag'],
      ['trainer', 'leaderboard'],
    ]);
    // Le Centre Pokémon, premier de son groupe, se place avant la Pension.
    expect(groups[1]).toEqual(['center', 'daycare', 'museum']);
  });
});
