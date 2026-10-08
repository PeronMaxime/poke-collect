import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { logError } from './lib/log';
import { registerServiceWorker } from './lib/pwa';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  queryCache: new QueryCache({
    onError: (error, query) => logError('Requête', error, { queryKey: query.queryKey }),
  }),
  mutationCache: new MutationCache({
    onError: (error, variables, _context, mutation) =>
      logError('Action', error, { mutationKey: mutation.options.mutationKey, variables }),
  }),
});

window.addEventListener('error', (e) => logError('Erreur non interceptée', e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => logError('Promesse rejetée', e.reason));
registerServiceWorker();

createRoot(document.getElementById('root')!, {
  onCaughtError: (error, info) => logError('Rendu', error, { componentStack: info.componentStack }),
  onUncaughtError: (error, info) =>
    logError('Rendu (non intercepté)', error, { componentStack: info.componentStack }),
}).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </QueryClientProvider>
  </StrictMode>,
);
