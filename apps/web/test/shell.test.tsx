import { beforeAll, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { newPlayer, renderGame } from './game';

/**
 * Coquille du jeu : menu en tiroir du téléphone (ouverture, changement d'onglet, fermeture) et
 * sections du menu repliables.
 */
describe('coquille du jeu', () => {
  beforeAll(async () => {
    await newPlayer();
  });

  it('ouvre le menu du téléphone, change d’onglet, puis le referme', async () => {
    renderGame('#expeditions');
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir le menu' }));
    const close = await screen.findByRole('button', { name: 'Fermer le menu' });
    const drawer = within(close.closest('nav')!);
    fireEvent.click(await drawer.findByRole('link', { name: /^PC/ }));
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Fermer le menu' })).toBeNull(),
    );
  });

  it('replie puis déplie une section du menu', async () => {
    const { container } = renderGame('#expeditions');
    const sidebar = await waitFor(() => {
      const nav = container.querySelector('nav.card');
      expect(nav?.querySelector('[aria-expanded]')).toBeTruthy();
      return nav!;
    });
    const toggle = sidebar.querySelector<HTMLButtonElement>('button[aria-expanded="true"]')!;
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });
});
