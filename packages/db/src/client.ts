import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { PGlite } from '@electric-sql/pglite';
import postgres from 'postgres';
import * as schema from './schema';

export type Schema = typeof schema;
export type Db = PgDatabase<PgQueryResultHKT, Schema>;

export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../drizzle', import.meta.url));

export interface DbHandle {
  db: Db;
  driver: 'postgres' | 'pglite';
  migrate(): Promise<void>;
  close(): Promise<void>;
}

export interface CreateDbOptions {
  /** URL Postgres (`postgres://…`). Si absente, on utilise PGlite. */
  databaseUrl?: string | undefined;
  /** Dossier de données PGlite ; `memory://` pour une base éphémère (tests). */
  pgliteDataDir?: string;
  /** Délais maximaux (Postgres seulement) ; par défaut `DEFAULT_DB_TIMEOUTS`. */
  timeouts?: Partial<DbTimeouts>;
}

/** Délais maximaux de la connexion Postgres : une requête ou un verrou bloqué n'attend jamais indéfiniment. */
export interface DbTimeouts {
  /** Durée maximale d'une requête (`statement_timeout`), en millisecondes. */
  statementMs: number;
  /** Attente maximale d'un verrou (`lock_timeout`), en millisecondes. */
  lockMs: number;
  /** Transaction ouverte sans rien faire (`idle_in_transaction_session_timeout`), en millisecondes. */
  idleInTransactionMs: number;
  /** Ouverture d'une connexion, en secondes. */
  connectSeconds: number;
}

export const DEFAULT_DB_TIMEOUTS: DbTimeouts = {
  statementMs: 10_000,
  lockMs: 5_000,
  idleInTransactionMs: 30_000,
  connectSeconds: 10,
};

/**
 * Ouvre la base : Postgres si `databaseUrl` est fourni (Docker, Neon…),
 * sinon PGlite (Postgres embarqué en WebAssembly), pratique sans Docker et pour les tests.
 */
export function createDb({
  databaseUrl,
  pgliteDataDir = '.data/pglite',
  timeouts,
}: CreateDbOptions = {}): DbHandle {
  if (databaseUrl) {
    const t = { ...DEFAULT_DB_TIMEOUTS, ...timeouts };
    const client = postgres(databaseUrl, {
      max: 10,
      connect_timeout: t.connectSeconds,
      connection: {
        statement_timeout: t.statementMs,
        lock_timeout: t.lockMs,
        idle_in_transaction_session_timeout: t.idleInTransactionMs,
      },
    });
    const db = drizzlePostgres(client, { schema });
    return {
      db: db as unknown as Db,
      driver: 'postgres',
      // Les migrations (parfois longues : mise à jour de toutes les lignes) ont leur propre
      // connexion, sans délai maximal.
      migrate: async () => {
        const migrator = postgres(databaseUrl, { max: 1, connect_timeout: t.connectSeconds });
        try {
          await migratePostgres(drizzlePostgres(migrator, { schema }), {
            migrationsFolder: MIGRATIONS_FOLDER,
          });
        } finally {
          await migrator.end();
        }
      },
      close: () => client.end(),
    };
  }

  if (!pgliteDataDir.startsWith('memory://')) mkdirSync(pgliteDataDir, { recursive: true });
  const client = new PGlite(pgliteDataDir);
  const db = drizzlePglite(client, { schema });
  return {
    db: db as unknown as Db,
    driver: 'pglite',
    migrate: () => migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER }),
    close: () => client.close(),
  };
}
