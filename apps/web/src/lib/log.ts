import { ApiError } from './api';

/**
 * Journal d'erreurs centralisé (console du navigateur).
 * Les refus métier de l'API (4xx) sont attendus et affichés à l'écran : simple avertissement.
 */
export function logError(source: string, error: unknown, details?: Record<string, unknown>) {
  const expected = error instanceof ApiError && error.status < 500;
  const log = expected ? console.warn : console.error;
  log(`[dexpedition] ${source}`, error, ...(details ? [details] : []));
}
