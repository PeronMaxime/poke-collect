import { beforeAll, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { newPlayer, renderGame } from './game';

/**
 * Fiche Dresseur et Pokédex d'un joueur tout neuf, après le découpage de leurs écrans : la
 * vitrine s'édite et s'enregistre avec le starter, le favori se choisit parmi le Pokédex
 * capturé, la fiche d'une espèce s'ouvre depuis la grille.
 */
describe('fiche Dresseur et Pokédex', () => {
  beforeAll(async () => {
    await newPlayer();
  });

  it('met le starter en vitrine et l’enregistre', async () => {
    renderGame('#trainer');
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier' }));
    const dialog = within(await screen.findByRole('dialog'));
    const box = within(await dialog.findByRole('region', { name: 'Pokémon du PC' }));
    fireEvent.click(await box.findByTitle('Ajouter Bulbizarre'));
    const save = dialog.getByRole('button', { name: 'Enregistrer' }) as HTMLButtonElement;
    await waitFor(() => expect(save.disabled).toBe(false));
    fireEvent.click(save);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('ouvre le choix du favori avec le starter capturé', async () => {
    renderGame('#trainer');
    fireEvent.click(await screen.findByRole('button', { name: /Pokémon favori/ }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(await dialog.findByRole('button', { name: /Bulbizarre/ })).toBeTruthy();
  });

  it('ouvre la fiche du starter depuis le Pokédex', async () => {
    renderGame('#pokedex');
    fireEvent.click(await screen.findByRole('button', { name: /Bulbizarre/ }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(await dialog.findByRole('heading', { name: 'Bulbizarre' })).toBeTruthy();
    expect(dialog.getByText(/Capturé le/)).toBeTruthy();
  });
});
