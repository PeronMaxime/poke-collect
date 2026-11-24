import { describe, expect, inject, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { totpCode } from '../../api/src/testing/totp';
import { renderGame } from './game';
import { clearSession } from './setup';

/**
 * Entrée dans le jeu : un compte administrateur (second facteur activé) donne son code après le
 * mot de passe ; un nom de dresseur réservé est refusé.
 */
describe('connexion au jeu', () => {
  it('compte avec second facteur : code demandé, puis choix du nom (réservé refusé)', async () => {
    clearSession();
    const { email, password, totpURI } = inject('admin');
    renderGame();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Email'), email);
    await user.type(screen.getByLabelText('Mot de passe'), password);
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));

    const code = await screen.findByLabelText('Code de l’application d’authentification');
    await user.type(code, totpCode(totpURI));
    await user.click(screen.getByRole('button', { name: 'Valider' }));

    const name = await screen.findByLabelText('Nom de dresseur');
    await user.type(name, 'Admin');
    await user.click(screen.getByRole('button', { name: 'Commencer l’aventure' }));
    expect(await screen.findByText('Ce nom est réservé')).toBeTruthy();
  });
});
