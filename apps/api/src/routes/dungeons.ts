import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '@poke/db';
import { startDungeonInputSchema, switchDungeonInputSchema } from '@poke/shared';
import type { ClaimDungeonResponse, DungeonRunDto, DungeonsResponse } from '@poke/shared';
import type { ContentCache } from '../content-cache';
import {
  activeDungeonRun,
  claimDungeonRun,
  dungeonRecords,
  fleeDungeon,
  lastDungeonRun,
  settleFinishedDungeonRun,
  startDungeon,
  switchDungeonMember,
  toDungeonRecordDto,
  toDungeonRunDto,
} from '../game/dungeons';
import { requireStartedProfile } from '../game/expeditions';
import type { sessionHooks } from '../plugins/session';

interface Deps {
  db: Db;
  content: ContentCache;
  hooks: ReturnType<typeof sessionHooks>;
  now: () => Date;
}

const uuidParams = z.object({ id: z.uuid() });

/** Donjons : lancement, changements de Pokémon, fuite, réclamation, bilan par donjon. */
export async function dungeonRoutes(app: FastifyInstance, { db, content, hooks, now }: Deps) {
  app.addHook('preHandler', hooks.requireUser);

  app.get('/api/dungeons', async (request): Promise<DungeonsResponse> => {
    const userId = request.user!.id;
    const [active, records, last] = await Promise.all([
      activeDungeonRun(db, userId),
      dungeonRecords(db, userId),
      lastDungeonRun(db, userId),
    ]);
    return {
      serverTime: now().toISOString(),
      active: active ? toDungeonRunDto(active) : null,
      last: last ? toDungeonRunDto(last) : null,
      records: records.map(toDungeonRecordDto),
    };
  });

  app.post('/api/dungeons', async (request, reply) => {
    const input = startDungeonInputSchema.parse(request.body);
    const userId = request.user!.id;
    // Une tentative terminée pendant l'absence du joueur ne bloque pas la suivante.
    await settleFinishedDungeonRun(db, content, userId, now());
    const row = await startDungeon(db, content, userId, input, now());
    return reply.code(201).send(toDungeonRunDto(row));
  });

  app.post('/api/dungeons/:id/switch', async (request): Promise<DungeonRunDto> => {
    const { id } = uuidParams.parse(request.params);
    const input = switchDungeonInputSchema.parse(request.body);
    return toDungeonRunDto(await switchDungeonMember(db, request.user!.id, id, input, now()));
  });

  /** Fuite, puis réclamation (aucune récompense). */
  app.post('/api/dungeons/:id/flee', async (request): Promise<ClaimDungeonResponse> => {
    const { id } = uuidParams.parse(request.params);
    const userId = request.user!.id;
    await fleeDungeon(db, userId, id, now());
    const { run, currency } = await claimDungeonRun(db, content, userId, id, now());
    return { run: toDungeonRunDto(run), currency };
  });

  app.post('/api/dungeons/:id/claim', async (request): Promise<ClaimDungeonResponse> => {
    const { id } = uuidParams.parse(request.params);
    const userId = request.user!.id;
    await requireStartedProfile(db, userId);
    const { run, currency } = await claimDungeonRun(db, content, userId, id, now());
    return { run: toDungeonRunDto(run), currency };
  });
}
