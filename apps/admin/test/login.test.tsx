import { describe, expect, inject, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { totpCode } from '../../api/src/testing/totp';
import { clearSession } from '../../web/test/setup';
import { routes } from '../src/routes';

/** Connexion à l'admin : mot de passe, puis code de l'application d'authentification. */
describe('connexion à l’admin', () => {
  it('demande le code après le mot de passe, puis ouvre les pages', async () => {
    clearSession();
    const { email, password, totpURI } = inject('admin');
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
    });
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/'] })} />
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Email'), email);
    await user.type(screen.getByLabelText('Mot de passe'), password);
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));

    const codeField = await screen.findByLabelText('Code de l’application d’authentification');
    await user.type(codeField, '000000');
    await user.click(screen.getByRole('button', { name: 'Valider' }));
    expect(await screen.findByText('Code incorrect ou expiré.')).toBeTruthy();

    await user.clear(codeField);
    await user.type(codeField, totpCode(totpURI));
    await user.click(screen.getByRole('button', { name: 'Valider' }));
    await waitFor(() => expect(container.querySelector('nav')).not.toBeNull());
  });
});
