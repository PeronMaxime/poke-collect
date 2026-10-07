import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { trainerBattles } from '@poke/db';
import type { Db } from '@poke/db';
import { startBattleInputSchema } from '@poke/shared';
import type { BattleDto, BattlesResponse, ClaimBattleResponse } from '@poke/shared';
import type { ContentCache } from '../content-cache';
import {
  battleSlots,
  claimBattle,
  startBattle,
  toBattleDto,
  toRecordDto,
  trainerRecords,
} from '../game/battles';
import { requireStartedProfile } from '../game/expeditions';
import { claimedRewards } from '../game/store';
import type { sessionHooks } from '../plugins/session';

interface Deps {
  db: Db;
  content: ContentCache;
  hooks: ReturnType<typeof sessionHooks>;
  now: () => Date;
}

const uuidParams = z.object({ id: z.uuid() });

/** Combats de dresseurs : lancement, réclamation, bilan contre chaque dresseur. */
export async function battleRoutes(app: FastifyInstance, { db, content, hooks, now }: Deps) {
  app.addHook('preHandler', hooks.requireUser);

  app.get('/api/battles', async (request): Promise<BattlesResponse> => {
    const userId = request.user!.id;
    const ctx = await content.get();
    const [rows, records, claimed] = await Promise.all([
      db
        .select()
        .from(trainerBattles)
        .where(and(eq(trainerBattles.ownerId, userId), isNull(trainerBattles.claimedAt)))
        .orderBy(asc(trainerBattles.slotIndex)),
      trainerRecords(db, userId),
      claimedRewards(db, userId),
    ]);
    return {
      slots: battleSlots(ctx, claimed),
      serverTime: now().toISOString(),
      active: rows.map(toBattleDto),
      records: records.map(toRecordDto),
    };
  });

  /** Derniers combats réclamés (historique). */
  app.get('/api/battles/history', async (request): Promise<BattleDto[]> => {
    const rows = await db
      .select()
      .from(trainerBattles)
      .where(and(eq(trainerBattles.ownerId, request.user!.id), isNotNull(trainerBattles.claimedAt)))
      .orderBy(desc(trainerBattles.claimedAt))
      .limit(20);
    return rows.map(toBattleDto);
  });

  app.post('/api/battles', async (request, reply) => {
    const input = startBattleInputSchema.parse(request.body);
    const row = await startBattle(db, content, request.user!.id, input, now());
    return reply.code(201).send(toBattleDto(row));
  });

  app.post('/api/battles/:id/claim', async (request): Promise<ClaimBattleResponse> => {
    const { id } = uuidParams.parse(request.params);
    const userId = request.user!.id;
    await requireStartedProfile(db, userId);
    const { battle, currency } = await claimBattle(db, content, userId, id, now());
    return { battle: toBattleDto(battle), currency };
  });
}
