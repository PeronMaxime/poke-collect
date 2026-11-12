/**
 * Appels à l'API du jeu : `api()` de `@poke/client` (JSON, cookie de session, délai maximal,
 * erreurs en `ApiError`), avec l'en-tête du profil de l'onglet et, en développement, un compteur
 * de requêtes ; les règles de nouvelle tentative des lectures viennent du même paquet.
 */
import { createApi } from '@poke/client';
import { tabProfile } from './tab-profile';

export { ApiError, retryDelay, shouldRetryQuery } from '@poke/client';

const BURST_WINDOW_MS = 5000;
const BURST_LIMIT = 20;
const recentRequests: number[] = [];
let lastBurstWarning = 0;

/**
 * Développement seulement : avertit au-delà de 20 requêtes en 5 s, pour repérer tout retour à
 * une action qui recharge tout (voir docs/plans/PLAN-STABILITE.md, phase B).
 */
function countRequest(path: string) {
  if (!import.meta.env.DEV) return;
  const at = Date.now();
  recentRequests.push(at);
  while (recentRequests[0]! < at - BURST_WINDOW_MS) recentRequests.shift();
  if (recentRequests.length > BURST_LIMIT && at - lastBurstWarning > BURST_WINDOW_MS) {
    lastBurstWarning = at;
    console.warn(
      `[api] ${recentRequests.length} requêtes en ${BURST_WINDOW_MS / 1000} s (dernière : ${path}). Une action recharge-t-elle trop de données ?`,
    );
  }
}

/** Appel à l'API du jeu ; `json` est envoyé en JSON ; un refus lève une `ApiError`. */
export const api = createApi({
  headers: () => {
    const profile = tabProfile();
    return profile ? { 'x-dex-profile': profile } : undefined;
  },
  onRequest: countRequest,
});
