import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { api } from '../src/lib/api';
import { App } from '../src/App';
import { clearSession } from './setup';

let players = 0;

/**
 * Crée un joueur tout neuf (compte, dresseur, starter) et ouvre sa session : les appels suivants
 * du jeu sont les siens. Chaque fichier de tests a ainsi son propre joueur, donc son propre état.
 */
export async function newPlayer(): Promise<{ trainerName: string }> {
  clearSession();
  const n = ++players;
  const stamp = Date.now() % 1_000_000;
  const trainerName = `Test${stamp}${n}`;
  await api('/api/auth/sign-up/email', {
    method: 'POST',
    json: { email: `ui-${stamp}-${n}@example.com`, password: 'motdepasse-solide', name: 'UI' },
  });
  await api('/api/profile', { method: 'POST', json: { trainerName } });
  // Bulbizarre, premier starter de Kanto.
  await api('/api/starter', { method: 'POST', json: { speciesId: 1 } });
  return { trainerName };
}

/** Affiche le jeu entier, comme `main.tsx`, avec un cache de requêtes neuf et sans réessai. */
export function renderGame(hash = '') {
  window.location.hash = hash;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: false, refetchOnWindowFocus: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}
