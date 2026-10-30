import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '@poke/db';
import { plantBerryInputSchema } from '@poke/shared';
import type { BerryPlotDto, FarmResponse, HarvestBerriesResponse } from '@poke/shared';
import type { ContentCache } from '../content-cache';
import {
  farmFieldOf,
  farmPlots,
  farmSpeed,
  farmSpeeds,
  harvestBerries,
  plantBerry,
  toBerryPlotDto,
  uprootBerry,
} from '../game/farm';
import { assertTabUnlocked, playerFacilityPlaces } from '../game/store';
import type { sessionHooks } from '../plugins/session';

interface Deps {
  db: Db;
  content: ContentCache;
  hooks: ReturnType<typeof sessionHooks>;
  now: () => Date;
}

const plotParams = z.object({ plot: z.coerce.number().int().min(0).max(999) });

/** Ferme à baies : plantation, arrachage et récolte. */
export async function farmRoutes(app: FastifyInstance, { db, content, hooks, now }: Deps) {
  app.addHook('preHandler', hooks.requireUser);

  app.get('/api/farm', async (request): Promise<FarmResponse> => {
    const userId = request.user!.id;
    const ctx = await content.get();
    const [rows, speed, plots] = await Promise.all([
      farmPlots(db, userId),
      farmSpeeds(db, ctx, userId),
      playerFacilityPlaces(db, ctx, userId, 'farm'),
    ]);
    return {
      plots,
      serverTime: now().toISOString(),
      planted: rows.map((row) => toBerryPlotDto(row, speed(row.plotIndex))),
    };
  });

  app.post('/api/farm', async (request, reply) => {
    const { plotIndex, itemId } = plantBerryInputSchema.parse(request.body);
    const userId = request.user!.id;
    await assertTabUnlocked(db, await content.get(), userId, 'farm');
    const row = await plantBerry(db, content, userId, plotIndex, itemId, now());
    const speed = await farmSpeed(db, await content.get(), userId, farmFieldOf(plotIndex));
    return reply.code(201).send(toBerryPlotDto(row, speed) satisfies BerryPlotDto);
  });

  app.delete('/api/farm/:plot', async (request): Promise<BerryPlotDto> => {
    const { plot } = plotParams.parse(request.params);
    return toBerryPlotDto(await uprootBerry(db, request.user!.id, plot, now()));
  });

  app.post('/api/farm/harvest', async (request): Promise<HarvestBerriesResponse> => ({
    harvested: await harvestBerries(db, content, request.user!.id, now()),
  }));

  app.post('/api/farm/:plot/harvest', async (request): Promise<HarvestBerriesResponse> => {
    const { plot } = plotParams.parse(request.params);
    return { harvested: await harvestBerries(db, content, request.user!.id, now(), plot) };
  });
}
