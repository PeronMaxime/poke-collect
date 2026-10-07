import Fastify from 'fastify';
import cors from '@fastify/cors';
import { ZodError } from 'zod';
import type { Db } from '@poke/db';
import { createAuth } from './auth';
import { ContentCache } from './content-cache';
import type { Env } from './env';
import { GameError } from './game/errors';
import { authRoutes } from './plugins/auth-routes';
import { sessionHooks } from './plugins/session';
import { adminRoutes } from './routes/admin';
import { battleRoutes } from './routes/battles';
import { breedingRoutes } from './routes/breeding';
import { gameRoutes } from './routes/game';
import { playerRoutes } from './routes/player';
import { progressionRoutes } from './routes/progression';
import { shopRoutes } from './routes/shop';

export interface AppOptions {
  db: Db;
  env: Env;
  logger?: boolean;
  /** Horloge injectable (tests : faire avancer le temps sans attendre). */
  now?: () => Date;
}

export async function buildApp({ db, env, logger = false, now = () => new Date() }: AppOptions) {
  const app = Fastify({ logger });
  const auth = createAuth(db, env);
  const content = new ContentCache(db);
  const hooks = sessionHooks(auth);

  app.decorateRequest('user', null);
  await app.register(cors, { origin: env.trustedOrigins, credentials: true });

  app.setErrorHandler((err, _request, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: 'VALIDATION', issues: err.issues });
    }
    if (err instanceof GameError) {
      return reply.code(err.status).send({ error: err.code, ...err.details });
    }
    app.log.error(err);
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    return reply
      .code(status)
      .send({ error: status >= 500 ? 'INTERNAL' : 'REQUEST', message: (err as Error).message });
  });

  app.get('/api/health', async () => ({ ok: true }));
  /** Fournisseurs OAuth activés, pour n'afficher que les boutons utiles. */
  app.get('/api/config', async () => ({
    oauthProviders: [env.google && 'google', env.discord && 'discord'].filter(Boolean),
  }));
  await app.register(authRoutes, { auth });
  await app.register(playerRoutes, { db, content, hooks, now });
  await app.register(gameRoutes, { db, content, hooks, now });
  await app.register(breedingRoutes, { db, content, hooks, now });
  await app.register(battleRoutes, { db, content, hooks, now });
  await app.register(shopRoutes, { db, content, hooks, now });
  await app.register(progressionRoutes, { db, content, hooks, now });
  await app.register(adminRoutes, { db, content, hooks });

  return { app, auth, content };
}
