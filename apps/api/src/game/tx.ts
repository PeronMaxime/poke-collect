import { AsyncLocalStorage } from 'node:async_hooks';
import { is, sql } from 'drizzle-orm';
import { PgTransaction } from 'drizzle-orm/pg-core';
import type { Db } from '@poke/db';
import { GameError } from './errors';

/**
 * Transactions des actions des joueurs.
 *
 * - **Verrou par joueur** (`pg_advisory_xact_lock`) pris en tête de transaction : les actions d'un
 *   même joueur passent l'une après l'autre (elles vont à vitesse humaine), donc plus de course
 *   entre « vérifier » et « écrire » (Pokémon occupé, dernier Pokémon, double réclamation…).
 * - **Réessais** : un interblocage ou un conflit de sérialisation rejoue la transaction (3 essais),
 *   puis répond 503 `BUSY`.
 * - **Portée** : la transaction en cours est connue des appels qu'elle fait (contenu chargé par
 *   sa connexion au lieu d'en réclamer une autre au pool, compteurs écrits après la validation).
 */

interface TxScope {
  /** Base d'origine (hors transaction), pour ce qui est fait après la validation. */
  root: Db;
  tx: Db;
  onCommit: (() => void)[];
}

const scopes = new AsyncLocalStorage<TxScope>();

/** Transaction ouverte par `transaction` dans l'appel en cours, s'il y en a une. */
export function currentTransaction(): Db | undefined {
  return scopes.getStore()?.tx;
}

/**
 * Programme `fn(root)` après la validation de la transaction en cours (jamais si elle est annulée
 * ou rejouée). Retourne faux hors d'une transaction de `transaction` : à l'appelant d'agir seul.
 */
export function afterCommit(fn: (root: Db) => void): boolean {
  const scope = scopes.getStore();
  if (!scope) return false;
  scope.onCommit.push(() => fn(scope.root));
  return true;
}

/** Vrai si `db` est une transaction (et non la base elle-même). */
export function isTransaction(db: Db): boolean {
  return is(db, PgTransaction);
}

/** Code d'erreur Postgres (SQLSTATE) d'une erreur, éventuellement enveloppée par Drizzle. */
export function pgErrorCode(err: unknown): string | undefined {
  let e: unknown = err;
  for (let depth = 0; depth < 5 && e && typeof e === 'object'; depth++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    e = (e as { cause?: unknown }).cause;
  }
  return undefined;
}

/** Interblocage, conflit de sérialisation : la transaction peut être rejouée telle quelle. */
const RETRYABLE = new Set(['40P01', '40001']);
const ATTEMPTS = 3;

/** Verrouille les joueurs pour la transaction (dans l'ordre, pour ne jamais s'interbloquer). */
export async function lockPlayers(tx: Db, userIds: readonly string[]): Promise<void> {
  for (const id of [...new Set(userIds)].sort()) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`player:${id}`}, 0))`);
  }
}

/**
 * Ouvre une transaction (point de sauvegarde si `db` en est déjà une), verrouille `players` et y
 * exécute `fn`, rejouée en cas d'interblocage. `fn` peut donc être appelée plusieurs fois : elle ne
 * doit modifier que la base (ou des variables qu'elle réinitialise).
 */
export async function transaction<T>(
  db: Db,
  fn: (tx: Db) => Promise<T>,
  { players = [] }: { players?: readonly string[] } = {},
): Promise<T> {
  // Déjà dans une transaction : point de sauvegarde, le verrou est réentrant et les réessais
  // reviennent à la première. Appelée sur la base depuis une transaction en cours, elle passe aussi
  // par celle-ci : une autre connexion attendrait pour de bon le verrou que tient la première.
  const outer = isTransaction(db) ? db : currentTransaction();
  if (outer) {
    return outer.transaction(async (tx) => {
      await lockPlayers(tx as unknown as Db, players);
      return fn(tx as unknown as Db);
    });
  }
  for (let attempt = 1; ; attempt++) {
    const onCommit: (() => void)[] = [];
    try {
      const result = await db.transaction((tx) =>
        scopes.run({ root: db, tx: tx as unknown as Db, onCommit }, async () => {
          await lockPlayers(tx as unknown as Db, players);
          return fn(tx as unknown as Db);
        }),
      );
      for (const done of onCommit) done();
      return result;
    } catch (err) {
      if (!RETRYABLE.has(pgErrorCode(err) ?? '')) throw err;
      if (attempt >= ATTEMPTS) throw new GameError(503, 'BUSY');
      await new Promise((resolve) => setTimeout(resolve, 20 + Math.random() * 80 * attempt));
    }
  }
}

/** Transaction d'une action du joueur `userId` (voir `transaction`). */
export function playerTransaction<T>(
  db: Db,
  userId: string,
  fn: (tx: Db) => Promise<T>,
): Promise<T> {
  return transaction(db, fn, { players: [userId] });
}
