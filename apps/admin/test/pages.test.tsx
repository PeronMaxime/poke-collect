import { beforeAll, describe, expect, inject, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { api } from '../src/lib/api';
import { routes } from '../src/routes';
import { SECTIONS } from '../src/sections';

/** Affiche l'admin sur une page donnée, comme `main.tsx`. */
function renderAdmin(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />
    </QueryClientProvider>,
  );
}

/**
 * Chaque page de l'admin s'affiche pour un administrateur, sans erreur de rendu ni requête en
 * échec. Filet minimal avant tout découpage d'un formulaire : les tests d'édition (modifier,
 * enregistrer, publier) s'ajoutent par page, à côté de celui-ci.
 */
describe('pages de l’admin', () => {
  beforeAll(async () => {
    await api('/api/auth/sign-in/email', { method: 'POST', json: inject('admin') });
  });

  it.each(SECTIONS.map((s) => [s.label, s.path] as const))('%s', async (label, path) => {
    const { container } = renderAdmin(path);
    // Connecté et autorisé : le menu est là, avec la page demandée active.
    await waitFor(() =>
      expect(container.querySelector('nav a[aria-current="page"]')?.textContent).toContain(label),
    );
    const main = container.querySelector('main')!;
    await waitFor(() => expect(main.textContent).not.toMatch(/Chargement/));
    await waitFor(() => expect(main.textContent).not.toBe(''));
    expect(screen.queryByText(/Accès refusé|Impossible de/)).toBeNull();
    expect(main.textContent).not.toMatch(
      /Erreur inconnue|HTTP_\d+|INTERNAL|Serveur injoignable|pas répondu/,
    );
  });
});
