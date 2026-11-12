/**
 * Client HTTP de l'API, commun au jeu et à l'admin : `createApi()` rend la fonction `api()` (JSON,
 * cookie de session, délai maximal, erreurs en `ApiError`), et `shouldRetryQuery` / `retryDelay`
 * disent à TanStack Query quand réessayer une lecture. Ce que chaque application ajoute (profil
 * de l'onglet, compteur de requêtes) passe par les options de `createApi`.
 */

/** Refus de l'API : statut HTTP et code du catalogue (`packages/shared/src/errors.ts`). */
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

/** Code d'une requête abandonnée faute de réponse à temps (voir `timeoutMs`). */
const TIMEOUT_ERROR = 'TIMEOUT';

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

/** Ce qu'une application ajoute à chaque appel. */
interface ApiOptions {
  /** Délai sans réponse au-delà duquel la requête est abandonnée (`TIMEOUT`), en millisecondes. */
  timeoutMs?: number;
  /** En-têtes ajoutés à chaque requête, relus à chaque appel (profil de l'onglet…). */
  headers?: () => Record<string, string> | undefined;
  /** Appelé avant chaque requête (compteur de requêtes en développement…). */
  onRequest?: (path: string) => void;
}

/** Options d'un appel : celles de `fetch`, plus `json`, envoyé en JSON. */
type ApiInit = RequestInit & { json?: unknown };

/**
 * Fonction d'appel à l'API : `api<T>(chemin, { json })` rend le corps JSON (`undefined` pour un
 * 204). Refus du serveur : `ApiError` avec son code ; coupure : `NETWORK` ; délai dépassé :
 * `TIMEOUT` (statut 0 pour ces deux-là). Une requête abandonnée par l'appelant rejette son
 * `AbortError` tel quel. Par défaut, 20 s au plus : un bouton ne reste jamais figé.
 */
export function createApi({ timeoutMs = 20_000, headers: extra, onRequest }: ApiOptions = {}) {
  return async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
    const { json, headers, ...rest } = init;
    onRequest?.(path);
    const timeout = AbortSignal.timeout(timeoutMs);
    let res: Response;
    try {
      res = await fetch(path, {
        credentials: 'include',
        ...rest,
        signal: requestSignal(timeout, rest.signal),
        headers: {
          ...(json !== undefined && { 'content-type': 'application/json' }),
          ...extra?.(),
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
  };
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

/** Délai avant le réessai : `Retry-After` s'il est donné, sinon 1 s, 2 s, 4 s ; 10 s au plus. */
export function retryDelay(failureCount: number, err: unknown): number {
  const asked = err instanceof ApiError ? err.retryAfterMs : undefined;
  return Math.min(asked ?? 1000 * 2 ** failureCount, MAX_RETRY_DELAY_MS);
}
