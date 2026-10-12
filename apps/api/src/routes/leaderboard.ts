import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '@poke/db';
import { leaderboardKindSchema } from '@poke/shared';
import type { LeaderboardResponse } from '@poke/shared';
import type { ContentCache } from '../content-cache';
import { leaderboard } from '../game/leaderboard';
import type { sessionHooks } from '../plugins/session';

interface Deps {
  db: Db;
  content: ContentCache;
  hooks: ReturnType<typeof sessionHooks>;
}

const kindParams = z.object({ kind: leaderboardKindSchema });

/** Classements entre joueurs. */
export async function leaderboardRoutes(app: FastifyInstance, { db, content, hooks }: Deps) {
  app.addHook('preHandler', hooks.requireUser);

  app.get('/api/leaderboard/:kind', async (request): Promise<LeaderboardResponse> => {
    const { kind } = kindParams.parse(request.params);
    return leaderboard(db, await content.get(), request.user!.id, kind);
  });
}
