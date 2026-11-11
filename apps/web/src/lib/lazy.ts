import { lazy } from 'react';
import type { ComponentType } from 'react';

/**
 * Pages chargées à la demande : le code d'un onglet n'est téléchargé qu'à son ouverture (ou en
 * avance, quand le navigateur n'a rien d'autre à faire), au lieu d'alourdir l'ouverture du jeu.
 */

/**
 * Envoyé sur `window` quand un fichier du jeu n'a pas pu être chargé. Cause la plus fréquente :
 * une mise en ligne a remplacé les fichiers pendant la visite (voir `UpdatePrompt`).
 */
export const CHUNK_ERROR_EVENT = 'dexpedition:chunk-error';

/** Page chargée à la demande ; `preload()` la télécharge sans l'afficher. */
export type LazyPage<P> = ComponentType<P> & { preload(): void };

/**
 * Déclare une page chargée à la demande. `load` importe le fichier et rend le composant :
 * `lazyPage(() => import('./game/ShopPage').then((m) => m.ShopPage))`. L'écran qui l'affiche
 * l'entoure d'un `<Suspense>` ; un échec de chargement remonte à l'`ErrorBoundary`.
 */
export function lazyPage<P extends object>(load: () => Promise<ComponentType<P>>): LazyPage<P> {
  let pending: Promise<{ default: ComponentType<P> }> | null = null;
  const loadOnce = () =>
    (pending ??= load().then(
      (component) => ({ default: component }),
      (err: unknown) => {
        // L'essai suivant (préchargement, puis ouverture) repart du réseau.
        pending = null;
        window.dispatchEvent(new Event(CHUNK_ERROR_EVENT));
        throw err;
      },
    ));
  const page = lazy(loadOnce) as unknown as LazyPage<P>;
  page.preload = () => void loadOnce().catch(() => {});
  return page;
}

/** Précharge des pages quand le navigateur est inactif ; rend de quoi annuler. */
export function preloadWhenIdle(pages: readonly { preload(): void }[]): () => void {
  const run = () => pages.forEach((p) => p.preload());
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(run, { timeout: 10_000 });
    return () => window.cancelIdleCallback(id);
  }
  // Safari : pas de `requestIdleCallback`.
  const id = window.setTimeout(run, 3000);
  return () => window.clearTimeout(id);
}
