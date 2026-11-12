import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { leaderboardKindSchema } from '@poke/shared';
import type { LeaderboardResponse } from '@poke/shared';
import { leaderboard } from '../game/leaderboard';
import { currentUserId } from './deps';
import type { RouteDeps } from './deps';

/**
 * Routes des classements (/api/leaderboard/:kind). Chaque route valide sa requête, appelle le
 * module de jeu et répond.
 */

const kindParams = z.object({ kind: leaderboardKindSchema });

/** Classements entre joueurs. */
export async function leaderboardRoutes(app: FastifyInstance, { db, content, hooks }: RouteDeps) {
  app.addHook('preHandler', hooks.requireUser);

  app.get('/api/leaderboard/:kind', async (request): Promise<LeaderboardResponse> => {
    const { kind } = kindParams.parse(request.params);
    return leaderboard(db, await content.get(), currentUserId(request), kind);
  });
}
