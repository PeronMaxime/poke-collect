import { sql } from 'drizzle-orm';
import { speciesCaptures } from '@poke/db';
import type { Db } from '@poke/db';
import { afterCommit, isTransaction } from './tx';

/**
 * Compteurs globaux `species_captures` (statistiques de l'admin : Pokémon obtenus et transférés par
 * espèce). Partagés par tous les joueurs, ils ne sont plus écrits dans la transaction de chacun
 * (interblocages entre joueurs, attente sur les espèces courantes) : ils sont cumulés en mémoire
 * après la validation de la transaction, puis écrits toutes les 30 s en une requête triée par
 * espèce. Un arrêt brutal perd au plus ces quelques secondes de statistiques.
 */

export interface SpeciesCounts {
  captured: number;
  shiny: number;
  transferred: number;
}

type Tally = Map<number, SpeciesCounts>;

/** Compteurs en attente, par base (les tests ouvrent plusieurs bases dans un même processus). */
const pending = new WeakMap<Db, Tally>();

function merge(into: Tally, counts: ReadonlyMap<number, Partial<SpeciesCounts>>) {
  for (const [speciesId, c] of counts) {
    const total = into.get(speciesId) ?? { captured: 0, shiny: 0, transferred: 0 };
    total.captured += c.captured ?? 0;
    total.shiny += c.shiny ?? 0;
    total.transferred += c.transferred ?? 0;
    into.set(speciesId, total);
  }
}

function tallyOf(root: Db): Tally {
  let tally = pending.get(root);
  if (!tally) pending.set(root, (tally = new Map()));
  return tally;
}

/** Écrit des compteurs en une requête, triée par espèce (verrous toujours pris dans le même ordre). */
async function write(db: Db, tally: Tally): Promise<void> {
  const values = [...tally]
    .filter(([, c]) => c.captured > 0 || c.shiny > 0 || c.transferred > 0)
    .sort(([a], [b]) => a - b)
    .map(([speciesId, c]) => ({ speciesId, ...c }));
  if (values.length === 0) return;
  await db
    .insert(speciesCaptures)
    .values(values)
    .onConflictDoUpdate({
      target: speciesCaptures.speciesId,
      set: {
        captured: sql`${speciesCaptures.captured} + excluded.captured`,
        shiny: sql`${speciesCaptures.shiny} + excluded.shiny`,
        transferred: sql`${speciesCaptures.transferred} + excluded.transferred`,
      },
    });
}

/**
 * Compte des Pokémon obtenus ou transférés. Dans une transaction de `transaction`, comptés à sa
 * validation ; hors transaction, cumulés tout de suite ; dans une autre transaction, écrits avec
 * elle (repli : ordre trié, donc sans interblocage).
 */
export async function countSpecies(
  db: Db,
  counts: ReadonlyMap<number, Partial<SpeciesCounts>>,
): Promise<void> {
  if (counts.size === 0) return;
  if (afterCommit((root) => merge(tallyOf(root), counts))) return;
  if (!isTransaction(db)) {
    merge(tallyOf(db), counts);
    return;
  }
  const tally: Tally = new Map();
  merge(tally, counts);
  await write(db, tally);
}

/** Écrit les compteurs en attente de `db` (en cas d'échec, ils restent pour la prochaine fois). */
export async function flushSpeciesCounts(db: Db): Promise<void> {
  const tally = pending.get(db);
  if (!tally || tally.size === 0) return;
  pending.delete(db);
  try {
    await write(db, tally);
  } catch (err) {
    merge(tallyOf(db), tally);
    throw err;
  }
}

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
