import { beforeAll, describe, expect, inject, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
 * Fiches d'édition du contenu : sur chaque page en liste + fiche (`EntityPage`), le premier, le
 * dernier et un élément du milieu s'ouvrent sans erreur de rendu. Filet du découpage des
 * formulaires (phase 6) : chaque fiche passe par des branches différentes selon son contenu.
 */
describe('fiches d’édition de l’admin', () => {
  beforeAll(async () => {
    await api('/api/auth/sign-in/email', { method: 'POST', json: inject('admin') });
  });

  it.each(SECTIONS.map((s) => [s.label, s.path] as const))('%s', async (_label, path) => {
    const { container } = renderAdmin(path);
    const main = await waitFor(() => {
      const el = container.querySelector('main');
      expect(el?.textContent).not.toMatch(/Chargement/);
      expect(el?.textContent).not.toBe('');
      return el!;
    });
    const list = main.querySelector('aside ul');
    if (!list) return; // Page sans liste d'éléments.
    const items = [...list.querySelectorAll<HTMLButtonElement>(':scope > li > button')];
    for (const i of [...new Set([0, Math.floor(items.length / 2), items.length - 1])]) {
      if (!items[i]) continue;
      fireEvent.click(items[i]);
      const editor = main.querySelector('aside + section') as HTMLElement;
      await waitFor(() => expect(within(editor).getAllByRole('heading').length).toBeGreaterThan(0));
      expect(screen.queryByText(/Erreur inconnue|Something went wrong|a planté/)).toBeNull();
    }
  });
});
