import { beforeAll, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { newPlayer, renderGame } from './game';

/**
 * Bâtiments d'un joueur tout neuf, après le découpage de leurs écrans : chaque morceau (champs,
 * places du Musée, pension, couveuse, œufs du sac) est bien affiché, avec ses actions grisées
 * tant qu'il n'y a rien à planter, à déposer ou à faire éclore.
 */
describe('bâtiments', () => {
  beforeAll(async () => {
    await newPlayer();
  });

  it('ferme : un champ, ses assistants et ses parcelles vides', async () => {
    renderGame('#farm');
    const title = await screen.findByRole('heading', { name: 'Champ 1' });
    const field = within(title.closest('.tile') as HTMLElement);
    expect(field.getByText('Arrosage')).toBeTruthy();
    expect(field.getByText('Récolte')).toBeTruthy();
    const plots = field.getAllByTitle('Aucune baie à planter.');
    expect(plots).toHaveLength(9);
    for (const p of plots) expect((p as HTMLButtonElement).disabled).toBe(true);
  });

  it('Musée : deux places libres et aucun fossile', async () => {
    renderGame('#museum');
    expect(await screen.findByText('Tes fossiles')).toBeTruthy();
    const main = screen.getByRole('main');
    expect(within(main).getAllByText('Place libre')).toHaveLength(2);
    expect(within(main).getByText(/Aucun fossile dans ton sac/)).toBeTruthy();
  });

  it('pension : une pension à remplir, une couveuse vide et le sac sans œuf', async () => {
    renderGame('#daycare');
    const main = within(await screen.findByRole('main'));
    expect(await main.findByRole('button', { name: /Déposer un Pokémon/ })).toBeTruthy();
    expect(main.getAllByText('Libre')).toHaveLength(6);
    expect((main.getByRole('button', { name: 'Faire éclore' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(main.getByText(/Aucun œuf dans le sac/)).toBeTruthy();
  });
});
