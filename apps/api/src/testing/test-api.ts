import { eq } from 'drizzle-orm';
import { seedContent } from '@poke/content/seed';
import type { GameContentData } from '@poke/content';
import { createDb, ensureSeedContent, users } from '@poke/db';
import { buildApp } from '../app';
import { loadEnv } from '../env';

/**
 * API de test pour les écrans du jeu et de l'admin (`apps/web/test`, `apps/admin/test`).
 *
 * Lance la vraie API sur un port libre : base PGlite en mémoire, migrations, contenu de test.
 * Les écrans sont ainsi testés contre les vraies routes et les vraies règles, sans fausse API à
 * tenir à jour. Rien n'est partagé avec la base de développement.
 */

export interface TestApi {
  /** Adresse de l'API (`http://127.0.0.1:<port>`). */
  url: string;
  /** Compte administrateur déjà créé, pour les tests de l'admin. */
  admin: { email: string; password: string };
  close(): Promise<void>;
}

/** Origine acceptée par l'authentification (celle du jeu en développement). */
const TEST_ORIGIN = 'http://localhost:5173';

const ADMIN = { email: 'admin@example.com', password: 'motdepasse-solide' };

export async function startTestApi(
  /** Ajustements du contenu de test avant son import (ex. ouvrir tous les onglets). */
  patchContent: (content: GameContentData) => void = () => {},
): Promise<TestApi> {
  const handle = createDb({ pgliteDataDir: 'memory://' });
  await handle.migrate();
  const content = structuredClone(seedContent);
  patchContent(content);
  await ensureSeedContent(handle.db, content);
  const { app } = await buildApp({ db: handle.db, env: loadEnv({ NODE_ENV: 'test' }) });

  const signUp = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: { 'content-type': 'application/json', origin: TEST_ORIGIN },
    payload: { ...ADMIN, name: 'Admin' },
  });
  if (signUp.statusCode !== 200) throw new Error(`Compte admin de test : ${signUp.body}`);
  await handle.db.update(users).set({ role: 'admin' }).where(eq(users.email, ADMIN.email));

  const url = await app.listen({ port: 0, host: '127.0.0.1' });
  return {
    url,
    admin: ADMIN,
    async close() {
      await app.close();
      await handle.close();
    },
  };
}
