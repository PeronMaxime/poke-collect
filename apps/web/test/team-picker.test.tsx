import { beforeAll, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { newPlayer, renderGame } from './game';

/**
 * Choix d'une équipe (`TeamPicker`), commun aux expéditions, combats, donjons et légendaires :
 * depuis le départ d'une expédition, le starter s'ajoute, se retire, revient par la sélection
 * automatique, puis l'équipe validée part.
 */
describe('choix de l’équipe', () => {
  beforeAll(async () => {
    await newPlayer();
  });

  it('choisit le starter, puis lance l’expédition', async () => {
    renderGame('#expeditions');
    const [send] = await screen.findAllByRole('button', { name: 'Envoyer une équipe' });
    fireEvent.click(send!);
    const [pick] = await screen.findAllByRole('button', {
      name: /Choisir l’équipe|Ajouter un Pokémon/,
    });
    fireEvent.click(pick!);

    // La boîte : le starter s'ajoute d'un clic, et se retire de même.
    const [add] = await screen.findAllByTitle(/^Ajouter Bulbizarre/);
    fireEvent.click(add!);
    const [chosen] = await screen.findAllByTitle(/^Retirer Bulbizarre/);
    expect(chosen!.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(chosen!);
    await screen.findAllByTitle(/^Ajouter Bulbizarre/);

    // « Vider » n'a rien à vider ; la sélection automatique remet le starter.
    const bar = within(screen.getByRole('button', { name: 'Valider' }).parentElement!);
    expect(bar.getByRole('button', { name: 'Vider' })).toHaveProperty('disabled', true);
    fireEvent.click(bar.getByRole('button', { name: '⚡ Auto' }));
    await screen.findAllByTitle(/^Retirer Bulbizarre/);
    expect(screen.getAllByText('Équipe prête').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Valider' })).toBeNull());

    // L'équipe validée part : l'emplacement d'expédition est occupé.
    const go = await screen.findByRole('button', { name: 'Partir' });
    await waitFor(() => expect(go).toHaveProperty('disabled', false));
    fireEvent.click(go);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Partir' })).toBeNull());
    expect(screen.queryByText(/quelque chose a planté/)).toBeNull();
  });
});
