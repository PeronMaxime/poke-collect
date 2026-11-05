import { createHash } from 'node:crypto';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { GameError } from './game/errors';

const WINDOW_MS = 60_000;

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
 * donc plus la même limite.
 */
export function rateLimitKey(request: FastifyRequest): string {
  const cookie = sessionCookie(request);
  if (!cookie) return `ip:${request.ip}`;
  return `s:${createHash('sha256').update(cookie).digest('base64url').slice(0, 22)}`;
}

function limited(retryAfterSeconds: number) {
  return new GameError(429, 'RATE_LIMITED', { retryAfter: retryAfterSeconds });
}

/**
 * Garde-fous contre les abus (l'authentification a en plus ses propres limites, Better Auth) :
 * - `perPlayer` requêtes par minute et par joueur (par IP sans session) ;
 * - `perIp` requêtes par minute et par adresse IP, toutes sessions confondues, contre les
 *   cookies inventés pour contourner la limite par joueur.
 * 0 désactive la limite correspondante. Les routes marquées `config.rateLimit: false` (santé,
 * sprites) en sont exclues.
 */
export async function registerRateLimits(
  app: FastifyInstance,
  { perPlayer, perIp }: { perPlayer: number; perIp: number },
  now: () => number = Date.now,
) {
  if (perPlayer > 0) {
    await app.register(rateLimit, {
      max: perPlayer,
      timeWindow: '1 minute',
      keyGenerator: rateLimitKey,
      errorResponseBuilder: (_request, context) =>
        limited(Math.max(1, Math.ceil(context.ttl / 1000))),
    });
  }
  if (perIp > 0) {
    const windows = new Map<string, { count: number; resetAt: number }>();
    app.addHook('onRequest', async (request, reply) => {
      if (request.routeOptions.config?.rateLimit === false) return;
      const at = now();
      if (windows.size > 10_000) {
        for (const [ip, w] of windows) if (w.resetAt <= at) windows.delete(ip);
      }
      let window = windows.get(request.ip);
      if (!window || window.resetAt <= at) {
        window = { count: 0, resetAt: at + WINDOW_MS };
        windows.set(request.ip, window);
      }
      window.count += 1;
      if (window.count > perIp) {
        const retryAfter = Math.max(1, Math.ceil((window.resetAt - at) / 1000));
        reply.header('retry-after', retryAfter);
        throw limited(retryAfter);
      }
    });
  }
}
