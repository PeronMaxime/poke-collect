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
}

/**
 * Ouvre la base : Postgres si `databaseUrl` est fourni (Docker, Neon…),
 * sinon PGlite (Postgres embarqué en WebAssembly), pratique sans Docker et pour les tests.
 */
export function createDb({
  databaseUrl,
  pgliteDataDir = '.data/pglite',
}: CreateDbOptions = {}): DbHandle {
  if (databaseUrl) {
    const client = postgres(databaseUrl, { max: 10 });
    const db = drizzlePostgres(client, { schema });
    return {
      db: db as unknown as Db,
      driver: 'postgres',
      migrate: () => migratePostgres(db, { migrationsFolder: MIGRATIONS_FOLDER }),
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
