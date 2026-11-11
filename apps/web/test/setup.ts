import { afterEach, inject } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

/**
 * Préparation de chaque fichier de tests d'écran (jsdom).
 *
 * - `fetch` : le jeu appelle `/api/...` en relatif, avec le cookie de session du navigateur. Ici,
 *   les appels partent vers l'API de test (`global-setup.ts`) et le cookie est tenu à la main.
 * - API du navigateur absentes de jsdom : remplacées par le strict nécessaire.
 */

// Tous les fichiers tournent en parallèle contre la même API : le premier affichage d'un écran
// peut dépasser la seconde d'attente par défaut des `findBy…`.
configure({ asyncUtilTimeout: 5_000 });

/** Origine du jeu en développement, la seule que l'authentification de test accepte. */
const TEST_ORIGIN = 'http://localhost:5173';
const apiUrl = inject('apiUrl');
const nodeFetch = globalThis.fetch;
/** Cookies de la session en cours (nom → valeur), remis à chaque appel. */
const cookies = new Map<string, string>();

/** Oublie la session : le test suivant repart déconnecté. */
export function clearSession() {
  cookies.clear();
}

globalThis.fetch = async (input, init = {}) => {
  const path = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  // Le signal d'abandon de jsdom n'est pas celui de Node : `fetch` le refuserait.
  const { signal: _, ...rest } = init;
  const headers = new Headers(rest.headers);
  // Même origine que le jeu en développement (exigée par l'authentification).
  headers.set('origin', TEST_ORIGIN);
  if (cookies.size) {
    headers.set('cookie', [...cookies].map(([name, value]) => `${name}=${value}`).join('; '));
  }
  const res = await nodeFetch(new URL(path, apiUrl), { ...rest, headers });
  for (const cookie of res.headers.getSetCookie()) {
    const [pair = ''] = cookie.split(';');
    const at = pair.indexOf('=');
    cookies.set(pair.slice(0, at), pair.slice(at + 1));
  }
  return res;
};

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
globalThis.IntersectionObserver ??= NoopObserver as unknown as typeof IntersectionObserver;
globalThis.ResizeObserver ??= NoopObserver as unknown as typeof ResizeObserver;
window.matchMedia ??= (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  }) as MediaQueryList;
window.scrollTo = () => {};
Element.prototype.scrollIntoView ??= () => {};

afterEach(() => {
  cleanup();
  localStorage.clear();
  window.location.hash = '';
});
