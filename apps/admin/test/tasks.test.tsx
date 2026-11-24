import { beforeAll, describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { signInAdmin } from './sign-in';
import { routes } from '../src/routes';

/**
 * Page « À faire » : la liste de départ s'affiche en rubriques ; une tâche ajoutée apparaît dans
 * « Maintenant », cochée elle passe dans « Faites », et se supprime après confirmation.
 */

function renderTasks() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/tasks'] })} />
    </QueryClientProvider>,
  );
}

const section = (title: string) =>
  screen.getByRole('heading', { name: new RegExp(`^${title}`) }).closest('section')!;

describe('page « À faire »', () => {
  beforeAll(async () => {
    await signInAdmin();
  });

  it('ajoute une tâche, la coche puis la supprime', async () => {
    renderTasks();
    await screen.findByText('Activer le second facteur de chaque administrateur');
    expect(screen.getByRole('heading', { name: /^Plus tard/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une tâche' }));
    fireEvent.change(screen.getByLabelText('Titre'), {
      target: { value: 'Relire les journaux de Caddy' },
    });
    fireEvent.change(screen.getByLabelText(/^Détail/), { target: { value: '$C logs caddy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    await waitFor(() =>
      expect(within(section('Maintenant')).getByText('Relire les journaux de Caddy')).toBeTruthy(),
    );
    expect(screen.getByText('$C logs caddy')).toBeTruthy();

    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Marquer comme faite : Relire les journaux de Caddy' }),
    );
    await screen.findByText(/^Faites \(1\)/);
    expect(within(section('Maintenant')).queryByText('Relire les journaux de Caddy')).toBeNull();

    const item = screen.getByText('Relire les journaux de Caddy').closest('li')!;
    fireEvent.click(within(item).getByRole('button', { name: 'Supprimer…' }));
    fireEvent.click(within(item).getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(screen.queryByText('Relire les journaux de Caddy')).toBeNull());
  });
});
