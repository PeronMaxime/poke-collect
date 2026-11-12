import type { Db } from '@poke/db';
import { flushSpeciesCounts } from '../game/capture-stats';

/**
 * Compteurs d'espèces : ils sont cumulés dans la mémoire du processus (voir
 * `game/capture-stats.ts`) et écrits en base toutes les `intervalMs`. Chaque processus écrit les
 * siens : cette tâche tourne partout, même là où les autres tâches de fond sont coupées.
 */

/** Écriture périodique des compteurs ; la fonction retournée l'arrête après une dernière écriture. */
export function startSpeciesCountsFlush(
  db: Db,
  intervalMs: number,
  onError: (err: unknown) => void,
): () => Promise<void> {
  const timer = setInterval(() => {
    flushSpeciesCounts(db).catch(onError);
  }, intervalMs);
  timer.unref();
  return async () => {
    clearInterval(timer);
    await flushSpeciesCounts(db).catch(onError);
  };
}
