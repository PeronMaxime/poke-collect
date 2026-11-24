import { createHash } from 'node:crypto';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { GameError } from './game/errors';

/**
 * Limites de requêtes par minute : une par joueur (par adresse IP sans session), un budget propre
 * à chaque lecture lourde, un budget d'écritures par joueur, et une limite par adresse IP, toutes
 * sessions confondues. Compteurs en mémoire du processus (remis à zéro au redémarrage).
 */

const WINDOW_MS = 60_000;

/**
 * Lectures lourdes (méthode et motif de route) : chacune a son propre compteur par joueur
 * (`heavyPerMinute`), à la place de la limite générale. Ce sont celles qui parcourent beaucoup de
 * lignes : toute la collection, les recherches sans index, les classements, la fiche et le
 * Pokédex d'un autre dresseur.
 */
const HEAVY_READS = new Set([
  'GET /api/pokemon',
  'GET /api/trainers',
  'GET /api/trainers/:name',
  'GET /api/trainers/:name/pokedex',
  'GET /api/guilds',
  'GET /api/guilds/leaderboard',
  'GET /api/leaderboard/:kind',
]);

/** Méthodes comptées dans le budget d'écritures. */
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Routes hors du budget d'écritures : l'authentification a ses propres limites (Better Auth). */
const WRITES_EXEMPT_PREFIX = '/api/auth/';

/** Cookie de session (Better Auth : `better-auth.session_token`, préfixé `__Secure-` en HTTPS). */
function sessionCookie(request: FastifyRequest): string | null {
  const header = request.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name?.endsWith('session_token') && rest.length > 0) return rest.join('=');
  }
  return null;
}

/**
 * Clé de la limite par joueur : le cookie de session (haché, jamais gardé en clair), sinon
 * l'adresse IP. Un foyer, un réseau mobile ou plusieurs profils d'un même réseau ne se partagent
 * donc plus la même limite. Les profils secondaires (bêta) d'un compte partagent sa session, donc
 * ses compteurs.
 */
function rateLimitKey(request: FastifyRequest): string {
  const cookie = sessionCookie(request);
  if (!cookie) return `ip:${request.ip}`;
  return `s:${createHash('sha256').update(cookie).digest('base64url').slice(0, 22)}`;
}

function limited(retryAfterSeconds: number) {
  return new GameError(429, 'RATE_LIMITED', { retryAfter: retryAfterSeconds });
}

/**
 * Compteurs par fenêtre fixe d'une minute : `hit(clé, max)` compte une requête et renvoie le délai
 * avant la prochaine fenêtre (en secondes) si `max` est dépassé, sinon null.
 */
function fixedWindows(now: () => number) {
  const windows = new Map<string, { count: number; resetAt: number }>();
  return (key: string, max: number): number | null => {
    const at = now();
    if (windows.size > 10_000) {
      for (const [k, w] of windows) if (w.resetAt <= at) windows.delete(k);
    }
    let window = windows.get(key);
    if (!window || window.resetAt <= at) {
      window = { count: 0, resetAt: at + WINDOW_MS };
      windows.set(key, window);
    }
    window.count += 1;
    if (window.count <= max) return null;
    return Math.max(1, Math.ceil((window.resetAt - at) / 1000));
  };
}

/** Réglages des limites ; 0 désactive la limite correspondante. */
interface RateLimits {
  /** Requêtes par minute et par joueur (par IP sans session). */
  perPlayer: number;
  /** Requêtes par minute et par adresse IP, toutes sessions confondues. */
  perIp: number;
  /** Requêtes par minute, par joueur et par lecture lourde (`HEAVY_READS`). */
  heavyPerMinute?: number;
  /** Écritures par minute et par joueur, toutes routes confondues (hors authentification). */
  writesPerMinute?: number;
}

/**
 * Garde-fous contre les abus (l'authentification a en plus ses propres limites, Better Auth) :
 * - `perPlayer` requêtes par minute et par joueur ;
 * - `heavyPerMinute` par lecture lourde, compteur propre à chaque route : une rafale de
 *   recherches n'entame pas le reste, et un script ne peut plus en lancer 600 par minute ;
 * - `writesPerMinute` écritures par joueur, en plus de sa limite générale ;
 * - `perIp` requêtes par minute et par adresse IP, contre les cookies inventés pour contourner la
 *   limite par joueur.
 * Les routes marquées `config.rateLimit: false` (santé, sprites) en sont exclues. À enregistrer
 * avant les routes : les lectures lourdes reçoivent leur budget au moment où elles sont déclarées.
 */
export async function registerRateLimits(
  app: FastifyInstance,
  { perPlayer, perIp, heavyPerMinute = 0, writesPerMinute = 0 }: RateLimits,
  now: () => number = Date.now,
) {
  if (heavyPerMinute > 0) {
    // Avant le greffon : son propre `onRoute` lit ensuite cette configuration.
    app.addHook('onRoute', (route) => {
      const methods = Array.isArray(route.method) ? route.method : [route.method];
      if (!methods.some((m) => HEAVY_READS.has(`${m} ${route.url}`))) return;
      if (route.config?.rateLimit === false) return;
      route.config = {
        ...route.config,
        rateLimit: { max: heavyPerMinute, timeWindow: '1 minute' },
      };
    });
  }
  if (perPlayer > 0 || heavyPerMinute > 0) {
    await app.register(rateLimit, {
      // Sans limite générale, seules les lectures lourdes (configurées par route) sont comptées.
      global: perPlayer > 0,
      max: perPlayer > 0 ? perPlayer : heavyPerMinute,
      timeWindow: '1 minute',
      keyGenerator: rateLimitKey,
      errorResponseBuilder: (_request, context) =>
        limited(Math.max(1, Math.ceil(context.ttl / 1000))),
    });
  }
  if (writesPerMinute > 0) {
    const hit = fixedWindows(now);
    app.addHook('onRequest', async (request, reply) => {
      if (!WRITE_METHODS.has(request.method) || request.url.startsWith(WRITES_EXEMPT_PREFIX))
        return;
      if (request.routeOptions.config?.rateLimit === false) return;
      const retryAfter = hit(rateLimitKey(request), writesPerMinute);
      if (retryAfter === null) return;
      reply.header('retry-after', retryAfter);
      throw limited(retryAfter);
    });
  }
  if (perIp > 0) {
    const hit = fixedWindows(now);
    app.addHook('onRequest', async (request, reply) => {
      if (request.routeOptions.config?.rateLimit === false) return;
      const retryAfter = hit(request.ip, perIp);
      if (retryAfter === null) return;
      reply.header('retry-after', retryAfter);
      throw limited(retryAfter);
    });
  }
}
