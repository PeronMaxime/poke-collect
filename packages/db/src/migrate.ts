/** Applique les migrations : `pnpm db:migrate` (utilise DATABASE_URL, sinon PGlite). */
import { createDb } from './client';

const handle = createDb({
  databaseUrl: process.env.DATABASE_URL,
  pgliteDataDir: process.env.PGLITE_DATA_DIR,
});
await handle.migrate();
await handle.close();
console.log(`Migrations appliquées (${handle.driver}).`);
