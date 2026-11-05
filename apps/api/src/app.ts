import Fastify, { LogController } from 'fastify';
import cors from '@fastify/cors';
import { sql } from 'drizzle-orm';
import { ZodError } from 'zod';
import type { Db } from '@poke/db';
import { createAuth } from './auth';
import { ContentCache } from './content-cache';
import type { Env } from './env';
import type { Mailer } from './mail';
import { GameError } from './game/errors';
import { startSpeciesCountsFlush } from './game/capture-stats';
import { PlayerSettler } from './game/settle';
import { pgErrorCode } from './game/tx';
import { webPushSender } from './game/push';
import type { PushSender } from './game/push';
import { authRoutes } from './plugins/auth-routes';
import { sessionHooks } from './plugins/session';
import { betaProfileRoutes } from './beta-profiles';
import { Monitoring, registerMonitoring, routeLabel } from './monitoring';
import { registerRateLimits } from './rate-limit';
import { adminRoutes } from './routes/admin';
import { battleRoutes } from './routes/battles';
import { dungeonRoutes } from './routes/dungeons';
import { breedingRoutes } from './routes/breeding';
import { centerRoutes } from './routes/center';
import { gameRoutes } from './routes/game';
import { leaderboardRoutes } from './routes/leaderboard';
import { tagRoutes } from './routes/tags';
import { teamRoutes } from './routes/teams';
import { trainerRoutes } from './routes/trainers';
import { farmRoutes } from './routes/farm';
import { museumRoutes } from './routes/museum';
import { assistantRoutes } from './routes/assistants';
import { playerRoutes } from './routes/player';
import { progressionRoutes } from './routes/progression';
import { pushRoutes } from './routes/push';
import { shopRoutes } from './routes/shop';
import { guildRoutes } from './routes/guilds';
import { spriteRoutes } from './routes/sprites';

export interface AppOptions {
  db: Db;
  env: Env;
  logger?: boolean;
  /** Horloge injectable (tests : faire avancer le temps sans attendre). */
  now?: () => Date;
  /** Envoi des notifications push (tests : faux expéditeur) ; par défaut, Web Push. */
  pushSender?: PushSender;
  /** Envoi des e-mails ; absent : pas de réinitialisation du mot de passe. */
  mailer?: Mailer | null;
  /** Appelé après chaque publication de contenu (développement : écrire l'instantané). */
  onContentPublished?: () => Promise<void>;
}

/**
 * Erreurs Postgres attendues sous charge, traduites pour le jeu : doublon d'index unique (deux
 * demandes simultanées), interblocage ou délai dépassé (le jeu réessaie seul ses lectures).
 */
function pgErrorResponse(
  code: string | undefined,
): { status: number; error: string; retryAfter?: number } | null {
  switch (code) {
    case '23505': // unique_violation
      return { status: 409, error: 'CONFLICT' };
    case '40P01': // deadlock_detected
    case '40001': // serialization_failure
    case '57014': // query_canceled (statement_timeout)
    case '55P03': // lock_not_available (lock_timeout)
    case '25P03': // idle_in_transaction_session_timeout
      return { status: 503, error: 'BUSY', retryAfter: 1 };
    default:
      return null;
  }
}

export async function buildApp({
  db,
  env,
  logger = false,
  now = () => new Date(),
  pushSender,
  mailer = null,
  onContentPublished,
}: AppOptions) {
  // Plus de ligne par requête réussie : les journaux ne gardent que les requêtes lentes, les refus
  // 429 et les erreurs (voir `registerMonitoring`), donc bien plus longtemps.
  const app = Fastify({
    logger,
    logController: new LogController({ disableRequestLogging: true }),
    trustProxy: env.trustProxy,
  });
  const monitoring = new Monitoring();
  registerMonitoring(app, monitoring);
  const auth = createAuth(db, env, mailer);
  const content = new ContentCache(db);
  // Combats terminés, places fermées et Balls des expéditions en cours sont rattrapés avant les
  // requêtes du joueur (jeu fermé entre-temps compris), sans toucher la base s'il n'y a rien à faire.
  const hooks = sessionHooks(auth, db, now, new PlayerSettler(db, content, now));
  const push = env.vapid ? (pushSender ?? webPushSender(env.vapid)) : null;

  // Compteurs globaux des espèces : écrits toutes les 30 s (et à l'arrêt), hors des transactions.
  const stopSpeciesCounts = startSpeciesCountsFlush(db, 30_000, (err) =>
    app.log.error(err, 'Compteurs des espèces'),
  );
  app.addHook('onClose', stopSpeciesCounts);

  app.decorateRequest('user', null);
  await app.register(cors, { origin: env.trustedOrigins, credentials: true });
  // Garde-fous contre les abus : une limite par joueur (cookie de session) et une, plus large,
  // par adresse IP. L'authentification a en plus ses propres limites (Better Auth).
  await registerRateLimits(app, {
    perPlayer: env.rateLimitPerMinute,
    perIp: env.rateLimitPerIpPerMinute,
  });

  app.setErrorHandler((err, request, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: 'VALIDATION', issues: err.issues });
    }
    if (err instanceof GameError) {
      return reply.code(err.status).send({ error: err.code, ...err.details });
    }
    const route = routeLabel(request.method, request.routeOptions.url);
    const pg = pgErrorResponse(pgErrorCode(err));
    if (pg) {
      app.log.warn({ err, code: pgErrorCode(err) }, 'Erreur SQL traduite');
      // Les 503 « occupé » comptent dans les erreurs 5xx : leur détail est gardé pour l'admin.
      if (pg.status >= 500) monitoring.recordError(route, pg.status, err, pgErrorCode(err) ?? null);
      if (pg.retryAfter) void reply.header('retry-after', pg.retryAfter);
      return reply.code(pg.status).send({ error: pg.error });
    }
    app.log.error(err);
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) monitoring.recordError(route, status, err);
    // Une erreur 500 ne renvoie rien d'interne au joueur (requête SQL, paramètres…) : journaux seuls.
    if (status >= 500) return reply.code(status).send({ error: 'INTERNAL' });
    return reply.code(status).send({ error: 'REQUEST', message: (err as Error).message });
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
  /** Fournisseurs OAuth activés et réinitialisation du mot de passe, pour n'afficher que l'utile. */
  app.get('/api/config', async () => ({
    oauthProviders: [env.google && 'google', env.discord && 'discord'].filter(Boolean),
    passwordReset: mailer !== null,
  }));
  await app.register(spriteRoutes);
  await app.register(authRoutes, { auth });
  await app.register(playerRoutes, { db, content, hooks, now });
  await app.register(betaProfileRoutes, {
    db,
    content,
    hooks,
    now,
    secureCookie: env.authUrl.startsWith('https:'),
  });
  await app.register(gameRoutes, { db, content, hooks, now });
  await app.register(tagRoutes, { db, hooks });
  await app.register(teamRoutes, { db, hooks });
  await app.register(breedingRoutes, { db, content, hooks, now });
  await app.register(museumRoutes, { db, content, hooks, now });
  await app.register(centerRoutes, { db, content, hooks, now });
  await app.register(farmRoutes, { db, content, hooks, now });
  await app.register(assistantRoutes, { db, content, hooks, now });
  await app.register(battleRoutes, { db, content, hooks, now });
  await app.register(dungeonRoutes, { db, content, hooks, now });
  await app.register(shopRoutes, { db, content, hooks, now });
  await app.register(guildRoutes, { db, content, hooks, now });
  await app.register(progressionRoutes, { db, content, hooks, now });
  await app.register(leaderboardRoutes, { db, content, hooks });
  await app.register(trainerRoutes, { db, content, hooks });
  await app.register(pushRoutes, {
    db,
    hooks,
    now,
    publicKey: env.vapid?.publicKey ?? null,
    send: push,
  });
  await app.register(adminRoutes, { db, content, hooks, now, onContentPublished, monitoring });

  return { app, auth, content, push, monitoring };
}
