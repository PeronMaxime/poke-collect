import { tabProfile } from './tab-profile';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly body: unknown,
    /** Délai demandé par le serveur avant de réessayer (en-tête `Retry-After`), en millisecondes. */
    readonly retryAfterMs?: number,
  ) {
    super(code);
  }
}

/** Code d'une coupure réseau (serveur injoignable, connexion perdue) : aucune réponse reçue. */
const NETWORK_ERROR = 'NETWORK';

/** Code d'une requête abandonnée faute de réponse à temps (voir `REQUEST_TIMEOUT_MS`). */
const TIMEOUT_ERROR = 'TIMEOUT';

/** Une requête sans réponse est abandonnée après 20 s : le bouton ne reste jamais figé. */
const REQUEST_TIMEOUT_MS = 20_000;

/** Signal du délai maximal, combiné à celui de l'appelant s'il en donne un. */
function requestSignal(timeout: AbortSignal, signal: AbortSignal | null | undefined): AbortSignal {
  if (!signal) return timeout;
  return typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : signal;
}

/** Secondes de `Retry-After` en millisecondes (la forme « date HTTP » n'est pas utilisée ici). */
function retryAfterMs(res: Response): number | undefined {
  const seconds = Number(res.headers.get('retry-after'));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}

const BURST_WINDOW_MS = 5000;
const BURST_LIMIT = 20;
const recentRequests: number[] = [];
let lastBurstWarning = 0;

/**
 * Développement seulement : avertit au-delà de 20 requêtes en 5 s, pour repérer tout retour à
 * une action qui recharge tout (voir PLAN-STABILITE.md, phase B).
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

export async function api<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers, ...rest } = init;
  countRequest(path);
  const profile = tabProfile();
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(path, {
      credentials: 'include',
      ...rest,
      signal: requestSignal(timeout, rest.signal),
      headers: {
        ...(json !== undefined && { 'content-type': 'application/json' }),
        ...(profile && { 'x-dex-profile': profile }),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch (err) {
    if (timeout.aborted) throw new ApiError(0, TIMEOUT_ERROR, null);
    // Une requête abandonnée volontairement (AbortSignal) n'est pas une coupure réseau.
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, NETWORK_ERROR, null);
  }
  if (res.status === 204) return undefined as T;
  const body: unknown = await res.json().catch(() => {
    // Délai dépassé pendant la lecture de la réponse : pas de corps vide pris pour une réponse.
    if (timeout.aborted) throw new ApiError(0, TIMEOUT_ERROR, null);
    return null;
  });
  if (!res.ok) {
    const code = (body as { error?: string } | null)?.error ?? `HTTP_${res.status}`;
    throw new ApiError(res.status, code, body, retryAfterMs(res));
  }
  return body as T;
}

/**
 * Erreurs passagères : coupure réseau, délai dépassé, limite atteinte, serveur en cours de
 * redémarrage ou occupé (`BUSY`, 503).
 */
function isTransientError(err: unknown): err is ApiError {
  return (
    err instanceof ApiError &&
    (err.code === NETWORK_ERROR ||
      err.code === TIMEOUT_ERROR ||
      [429, 502, 503, 504].includes(err.status))
  );
}

const MAX_RETRIES = 3;
const MAX_RETRY_DELAY_MS = 10_000;

/**
 * Réessais des lectures (TanStack Query) : jusqu'à 3 fois pour une erreur passagère, jamais pour
 * un refus métier (4xx). Les actions (POST…) ne passent pas par là : elles ne sont pas réessayées.
 */
export function shouldRetryQuery(failureCount: number, err: unknown): boolean {
  return failureCount < MAX_RETRIES && isTransientError(err);
}

/** Délai avant le réessai : `Retry-After` s'il est donné, sinon 1 s, 2 s, 4 s. */
export function retryDelay(failureCount: number, err: unknown): number {
  const asked = err instanceof ApiError ? err.retryAfterMs : undefined;
  return Math.min(asked ?? 1000 * 2 ** failureCount, MAX_RETRY_DELAY_MS);
}
