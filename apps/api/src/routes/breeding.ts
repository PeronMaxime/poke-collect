import type { FastifyInstance } from 'fastify';
import { and, asc, eq, gt } from 'drizzle-orm';
import { z } from 'zod';
import { candies } from '@poke/db';
import type { Db } from '@poke/db';
import {
  depositDaycareInputSchema,
  feedCandiesInputSchema,
  transferPokemonInputSchema,
} from '@poke/shared';
import type {
  CandyDto,
  CollectEggsResponse,
  DaycareResponse,
  HatchEggsResponse,
  PokemonDto,
  TransferPokemonResponse,
} from '@poke/shared';
import type { ContentCache } from '../content-cache';
import {
  collectEggs,
  daycareSlotCount,
  depositDaycare,
  feedCandies,
  hatchEggs,
  loadDaycare,
  pendingEggs,
  toDaycareDto,
  toEggDto,
  transferPokemon,
  withdrawDaycare,
} from '../game/daycare';
import { claimedRewards, eggsHatchedCount, pokemonActivities, toPokemonDto } from '../game/store';
import type { sessionHooks } from '../plugins/session';

interface Deps {
  db: Db;
  content: ContentCache;
  hooks: ReturnType<typeof sessionHooks>;
  now: () => Date;
}

const slotParams = z.object({ slot: z.coerce.number().int().min(0).max(30) });
const uuidParams = z.object({ id: z.uuid() });

/** Pension, œufs, transfert de Pokémon et Bonbons de lignée. */
export async function breedingRoutes(app: FastifyInstance, { db, content, hooks, now }: Deps) {
  app.addHook('preHandler', hooks.requireUser);

  app.get('/api/daycare', async (request): Promise<DaycareResponse> => {
    const userId = request.user!.id;
    const ctx = await content.get();
    const [{ slots, parents }, eggRows, eggsHatched, claimed] = await Promise.all([
      loadDaycare(db, userId),
      pendingEggs(db, userId),
      eggsHatchedCount(db, userId),
      claimedRewards(db, userId),
    ]);
    return {
      slots: daycareSlotCount(ctx, claimed),
      maxEggs: ctx.balance.breeding.maxEggs,
      eggsHatched,
      serverTime: now().toISOString(),
      pensions: slots.map((s) => toDaycareDto(ctx, s, parents)),
      eggs: eggRows.map(toEggDto),
    };
  });

  app.post('/api/daycare', async (request, reply) => {
    const input = depositDaycareInputSchema.parse(request.body);
    const userId = request.user!.id;
    const row = await depositDaycare(db, content, userId, input, now());
    const { parents } = await loadDaycare(db, userId);
    return reply.code(201).send(toDaycareDto(await content.get(), row, parents));
  });

  app.post('/api/daycare/:slot/collect', async (request): Promise<CollectEggsResponse> => {
    const { slot } = slotParams.parse(request.params);
    const result = await collectEggs(db, content, request.user!.id, slot, now());
    return { eggs: result.eggs.map(toEggDto), lost: result.lost };
  });

  app.delete('/api/daycare/:slot', async (request): Promise<CollectEggsResponse> => {
    const { slot } = slotParams.parse(request.params);
    const result = await withdrawDaycare(db, content, request.user!.id, slot, now());
    return { eggs: result.eggs.map(toEggDto), lost: result.lost };
  });

  app.post('/api/eggs/hatch', async (request): Promise<HatchEggsResponse> => {
    const { hatched, newSpeciesIds } = await hatchEggs(db, content, request.user!.id, now());
    return { hatched: hatched.map((r) => toPokemonDto(r)), newSpeciesIds };
  });

  app.post('/api/pokemon/transfer', async (request): Promise<TransferPokemonResponse> => {
    const { ids } = transferPokemonInputSchema.parse(request.body);
    return transferPokemon(db, content, request.user!.id, ids);
  });

  app.get('/api/candies', async (request): Promise<CandyDto[]> =>
    db
      .select({ lineageId: candies.lineageId, quantity: candies.quantity })
      .from(candies)
      .where(and(eq(candies.ownerId, request.user!.id), gt(candies.quantity, 0)))
      .orderBy(asc(candies.lineageId)),
  );

  app.post('/api/pokemon/:id/candies', async (request): Promise<PokemonDto> => {
    const { id } = uuidParams.parse(request.params);
    const { count } = feedCandiesInputSchema.parse(request.body);
    const userId = request.user!.id;
    const row = await feedCandies(db, content, userId, id, count);
    const busy = await pokemonActivities(db, userId);
    return toPokemonDto(row, busy.get(row.id));
  });
}
