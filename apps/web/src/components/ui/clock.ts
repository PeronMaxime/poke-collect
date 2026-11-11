import { useCallback, useSyncExternalStore } from 'react';

/**
 * L'heure courante pour les comptes à rebours (`useNow`), tenue par une horloge commune à tous
 * les composants.
 */

/**
 * Horloge partagée : un seul intervalle par durée, quel que soit le nombre de composants qui
 * l'écoutent (au lieu d'un `setInterval` par composant, donc par carte d'une grille).
 */
interface Clock {
  now: number;
  timer: number | undefined;
  listeners: Set<() => void>;
}

const clocks = new Map<number, Clock>();

function clockFor(intervalMs: number): Clock {
  let clock = clocks.get(intervalMs);
  if (!clock) {
    clock = { now: Date.now(), timer: undefined, listeners: new Set() };
    clocks.set(intervalMs, clock);
  }
  return clock;
}

function subscribeClock(intervalMs: number, listener: () => void): () => void {
  const clock = clockFor(intervalMs);
  clock.listeners.add(listener);
  if (clock.timer === undefined) {
    // Premier abonné : l'heure gardée est peut-être ancienne, on la remet à jour tout de suite.
    clock.now = Date.now();
    clock.timer = window.setInterval(() => {
      clock.now = Date.now();
      for (const notify of clock.listeners) notify();
    }, intervalMs);
  }
  return () => {
    clock.listeners.delete(listener);
    if (clock.listeners.size === 0 && clock.timer !== undefined) {
      window.clearInterval(clock.timer);
      clock.timer = undefined;
    }
  };
}

function clockSnapshot(intervalMs: number): number {
  const clock = clockFor(intervalMs);
  // Sans abonné, l'horloge ne tourne pas : une heure plus vieille qu'un tour est rafraîchie
  // (premier rendu d'un composant), sinon la valeur reste stable entre deux lectures.
  if (clock.timer === undefined && Date.now() - clock.now >= intervalMs) clock.now = Date.now();
  return clock.now;
}

/** Heure de l'horloge partagée, à la seconde près, sans abonnement (décision ponctuelle au rendu). */
export const sharedNow = () => clockSnapshot(1000);

/**
 * Heure courante, rafraîchie à chaque `intervalMs` (comptes à rebours). N'utiliser que dans les
 * composants qui affichent vraiment un compte à rebours : chaque tic les redessine.
 */
export function useNow(intervalMs = 1000): number {
  const subscribe = useCallback(
    (listener: () => void) => subscribeClock(intervalMs, listener),
    [intervalMs],
  );
  return useSyncExternalStore(subscribe, () => clockSnapshot(intervalMs));
}
