import { beforeAll, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { MENU_TABS } from '@poke/content';
import { newPlayer, renderGame } from './game';

/**
 * Chaque onglet du jeu s'affiche pour un joueur tout neuf, sans erreur de rendu ni requête en
 * échec. Filet minimal avant tout découpage d'un écran : les tests d'actions (lancer une
 * expédition, déposer en pension…) s'ajoutent par domaine, à côté de celui-ci.
 */
describe('onglets du jeu', () => {
  beforeAll(async () => {
    await newPlayer();
  });

  it.each(MENU_TABS.map((t) => [t.label, t.id] as const))('%s', async (label, id) => {
    const { container } = renderGame(`#${id}`);
    // L'onglet demandé est bien celui affiché (pas un repli sur les expéditions).
    await waitFor(() =>
      expect(container.querySelector('[aria-current="page"]')?.textContent).toContain(label),
    );
    // Le contenu a fini de charger et rien n'a cassé.
    const main = container.querySelector('main')!;
    await waitFor(() => expect(main.textContent).not.toMatch(/Chargement/));
    await waitFor(() => expect(main.textContent).not.toBe(''));
    expect(screen.queryByText(/quelque chose a planté/)).toBeNull();
    expect(main.textContent).not.toMatch(/Impossible de|Erreur inconnue/);
  });
});
