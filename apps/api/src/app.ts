import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { sql } from 'drizzle-orm';
import { ZodError } from 'zod';
import type { Db } from '@poke/db';
import { createAuth } from './auth';
import { ContentCache } from './content-cache';
import type { Env } from './env';
import { GameError } from './game/errors';
import { webPushSender } from './game/push';
import type { PushSender } from './game/push';
import { authRoutes } from './plugins/auth-routes';
import { sessionHooks } from './plugins/session';
import { adminRoutes } from './routes/admin';
import { battleRoutes } from './routes/battles';
import { breedingRoutes } from './routes/breeding';
import { gameRoutes } from './routes/game';
import { museumRoutes } from './routes/museum';
import { playerRoutes } from './routes/player';
import { progressionRoutes } from './routes/progression';
import { pushRoutes } from './routes/push';
import { shopRoutes } from './routes/shop';
import { spriteRoutes } from './routes/sprites';

export interface AppOptions {
  db: Db;
  env: Env;
  logger?: boolean;
  /** Horloge injectable (tests : faire avancer le temps sans attendre). */
  now?: () => Date;
  /** Envoi des notifications push (tests : faux expéditeur) ; par défaut, Web Push. */
  pushSender?: PushSender;
  /** Appelé après chaque publication de contenu (développement : écrire l'instantané). */
  onContentPublished?: () => Promise<void>;
}

export async function buildApp({
  db,
  env,
  logger = false,
  now = () => new Date(),
  pushSender,
  onContentPublished,
}: AppOptions) {
  const app = Fastify({ logger, trustProxy: env.trustProxy });
  const auth = createAuth(db, env);
  const content = new ContentCache(db);
  const hooks = sessionHooks(auth);
  const push = env.vapid ? (pushSender ?? webPushSender(env.vapid)) : null;

  app.decorateRequest('user', null);
  await app.register(cors, { origin: env.trustedOrigins, credentials: true });
  // Garde-fou contre les abus ; l'authentification a en plus ses propres limites (Better Auth).
  if (env.rateLimitPerMinute > 0) {
    await app.register(rateLimit, { max: env.rateLimitPerMinute, timeWindow: '1 minute' });
  }

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

  /** Supervision : l'API répond et la base est joignable. */
  app.get('/api/health', { config: { rateLimit: false } }, async (_request, reply) => {
    try {
      await db.execute(sql`select 1`);
      return { ok: true };
    } catch (err) {
      app.log.error(err, 'Santé : base injoignable');
      return reply.code(503).send({ ok: false });
    }
  });
  /** Fournisseurs OAuth activés, pour n'afficher que les boutons utiles. */
  app.get('/api/config', async () => ({
    oauthProviders: [env.google && 'google', env.discord && 'discord'].filter(Boolean),
  }));
  await app.register(spriteRoutes);
  await app.register(authRoutes, { auth });
  await app.register(playerRoutes, { db, content, hooks, now });
  await app.register(gameRoutes, { db, content, hooks, now });
  await app.register(breedingRoutes, { db, content, hooks, now });
  await app.register(museumRoutes, { db, content, hooks, now });
  await app.register(battleRoutes, { db, content, hooks, now });
  await app.register(shopRoutes, { db, content, hooks, now });
  await app.register(progressionRoutes, { db, content, hooks, now });
  await app.register(pushRoutes, {
    db,
    hooks,
    now,
    publicKey: env.vapid?.publicKey ?? null,
    send: push,
  });
  await app.register(adminRoutes, { db, content, hooks, now, onContentPublished });

  return { app, auth, content, push };
}
