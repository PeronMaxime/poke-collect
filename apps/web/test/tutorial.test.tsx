import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { api } from '../src/lib/api';
import { renderGame } from './game';
import { clearSession } from './setup';

/**
 * Tutoriel au premier starter : le choix du starter ouvre la popup du tutoriel, qui rappelle le
 * wiki et se ferme avec « Masquer ».
 */
describe('tutoriel au premier starter', () => {
  it('ouvre le tutoriel après le choix du starter, puis le masque', async () => {
    clearSession();
    const stamp = Math.random().toString(36).slice(2, 10);
    await api('/api/auth/sign-up/email', {
      method: 'POST',
      json: { email: `ui-tuto-${stamp}@example.com`, password: 'motdepasse-solide', name: 'UI' },
    });
    await api('/api/profile', { method: 'POST', json: { trainerName: `Tuto${stamp}` } });

    renderGame();
    fireEvent.click(await screen.findByRole('button', { name: /Bulbizarre/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Choisir Bulbizarre' }));

    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByText('Bien débuter')).toBeTruthy();
    expect(dialog.getByText(/reste accessible à tout moment/)).toBeTruthy();
    expect(dialog.getByRole('link', { name: 'Wiki' }).getAttribute('href')).toBe('#wiki/tutoriel');

    fireEvent.click(dialog.getByRole('button', { name: 'Masquer' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
