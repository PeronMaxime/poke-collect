/**
 * Point d'entrée du jeu : cache des requêtes (nouvelles tentatives, erreurs journalisées), thème,
 * service worker et profil de l'onglet, puis l'application.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { UpdatePrompt } from './components/UpdatePrompt';
import { retryDelay, shouldRetryQuery } from './lib/api';
import { logError } from './lib/log';
import { registerServiceWorker } from './lib/pwa';
import { accountSuspension, keys } from './lib/queries';
import { adoptTabProfileFromUrl } from './lib/tab-profile';
import { watchTheme } from './lib/theme';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Données fraîches 30 s : ouvrir une fiche ou changer d'onglet réutilise le cache au lieu
      // de tout recharger. Les invalidations après une action et les rechargements périodiques
      // (refetchInterval) restent actifs.
      staleTime: 30_000,
      retry: shouldRetryQuery,
      retryDelay,
      refetchOnWindowFocus: false,
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      logError('Requête', error, { queryKey: query.queryKey });
      if (query.queryKey[0] !== keys.me[0]) onSuspended(error);
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, variables, _context, mutation) => {
      logError('Action', error, { mutationKey: mutation.options.mutationKey, variables });
      onSuspended(error);
    },
  }),
});

/**
 * Refus `ACCOUNT_SUSPENDED` reçu en cours de partie : recharger `me` fait afficher l'écran de
 * suspension (voir `App`), sans attendre son rappel périodique.
 */
function onSuspended(error: unknown) {
  if (accountSuspension(error)) void queryClient.invalidateQueries({ queryKey: keys.me });
}

window.addEventListener('error', (e) => logError('Erreur non interceptée', e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => logError('Promesse rejetée', e.reason));
registerServiceWorker();
adoptTabProfileFromUrl();
watchTheme();

createRoot(document.getElementById('root')!, {
  onCaughtError: (error, info) => logError('Rendu', error, { componentStack: info.componentStack }),
  onUncaughtError: (error, info) =>
    logError('Rendu (non intercepté)', error, { componentStack: info.componentStack }),
}).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <App />
        <UpdatePrompt />
      </ErrorBoundary>
    </QueryClientProvider>
  </StrictMode>,
);
