import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  collectEggsInputSchema,
  depositDaycareInputSchema,
  feedCandiesInputSchema,
  incubateEggsInputSchema,
  setDaycareParentInputSchema,
  transferPokemonInputSchema,
} from '@poke/shared';
import type {
  BagEggDto,
  CandyDto,
  CollectEggsResponse,
  DaycareResponse,
  HatchEggsResponse,
  IncubateEggsResponse,
  PokemonDto,
  TransferPokemonResponse,
} from '@poke/shared';
import {
  collectEggs,
  depositDaycare,
  feedCandies,
  hatchEggs,
  incubateEggs,
  isInBag,
  listCandies,
  loadDaycare,
  pendingEggs,
  setDaycareParent,
  toBagEggDto,
  toDaycareDto,
  toEggDto,
  transferPokemon,
  withdrawDaycare,
  withdrawEgg,
} from '../game/daycare';
import { assistantHolders } from '../game/assistants';
import {
  assertTabUnlocked,
  eggsHatchedCount,
  playerFacilityPlaces,
  pokemonActivities,
  toPokemonDto,
} from '../game/store';
import { currentUserId } from './deps';
import type { RouteDeps } from './deps';

/**
 * Routes de l'élevage : pensions (/api/daycare), œufs (/api/eggs), transfert et Bonbons
 * (/api/pokemon/transfer, /api/candies). Chaque route valide sa requête, appelle le module de jeu
 * et répond.
 */

const slotParams = z.object({ slot: z.coerce.number().int().min(0).max(999) });
const uuidParams = z.object({ id: z.uuid() });
const parentParams = slotParams.extend({
  side: z.coerce
    .number()
    .int()
    .min(0)
    .max(1)
    .transform((n) => n as 0 | 1),
});

/** Pension, œufs, transfert de Pokémon et Bonbons de lignée. */
export async function breedingRoutes(app: FastifyInstance, { db, content, hooks, now }: RouteDeps) {
  app.addHook('preHandler', hooks.requireUser);

  app.get('/api/daycare', async (request): Promise<DaycareResponse> => {
    const userId = currentUserId(request);
    const ctx = await content.get();
    await hooks.settleAll(userId);
    const [{ slots, parents }, eggRows, eggsHatched, places, eggPlaces, helpers] =
      await Promise.all([
        loadDaycare(db, userId),
        pendingEggs(db, userId),
        eggsHatchedCount(db, userId),
        playerFacilityPlaces(db, ctx, userId, 'daycare'),
        playerFacilityPlaces(db, ctx, userId, 'incubator'),
        assistantHolders(db, userId, 'daycare'),
      ]);
    return {
      slots: places,
      maxEggs: eggPlaces,
      eggsHatched,
      serverTime: now().toISOString(),
      pensions: slots.map((s) => toDaycareDto(ctx, s, parents, helpers.get(s.slotIndex) ?? null)),
      eggs: eggRows.filter((e) => !isInBag(e)).map(toEggDto),
      bagEggs: eggRows
        .filter(isInBag)
        .sort((x, y) => x.laidAt.getTime() - y.laidAt.getTime() || x.id.localeCompare(y.id))
        .map(toBagEggDto),
    };
  });

  app.post('/api/daycare', async (request, reply) => {
    const input = depositDaycareInputSchema.parse(request.body);
    const userId = currentUserId(request);
    await assertTabUnlocked(db, await content.get(), userId, 'daycare');
    const row = await depositDaycare(db, content, userId, input, now());
    const { parents } = await loadDaycare(db, userId);
    const helper = (await assistantHolders(db, userId, 'daycare')).get(row.slotIndex) ?? null;
    return reply.code(201).send(toDaycareDto(await content.get(), row, parents, helper));
  });

  app.post('/api/daycare/:slot/collect', async (request): Promise<CollectEggsResponse> => {
    const { slot } = slotParams.parse(request.params);
    const { to } = collectEggsInputSchema.parse(request.body ?? {});
    const result = await collectEggs(db, content, currentUserId(request), slot, to, now());
    return { incubated: result.incubated.map(toEggDto), bagged: result.bagged };
  });

  app.delete('/api/daycare/:slot', async (request): Promise<CollectEggsResponse> => {
    const { slot } = slotParams.parse(request.params);
    const result = await withdrawDaycare(db, content, currentUserId(request), slot, now());
    return {
      incubated: result.incubated.map(toEggDto),
      bagged: result.bagged,
      parents: result.parents,
    };
  });

  // Un parent à la fois : déposé (à la place de celui qui y était) ou retiré.
  app.put('/api/daycare/:slot/parents/:side', async (request): Promise<CollectEggsResponse> => {
    const { slot, side } = parentParams.parse(request.params);
    const input = setDaycareParentInputSchema.parse(request.body);
    const userId = currentUserId(request);
    await assertTabUnlocked(db, await content.get(), userId, 'daycare');
    const result = await setDaycareParent(db, content, userId, slot, side, input, now());
    return { ...result, incubated: result.incubated.map(toEggDto) };
  });

  app.delete('/api/daycare/:slot/parents/:side', async (request): Promise<CollectEggsResponse> => {
    const { slot, side } = parentParams.parse(request.params);
    const result = await setDaycareParent(
      db,
      content,
      currentUserId(request),
      slot,
      side,
      null,
      now(),
    );
    return { ...result, incubated: result.incubated.map(toEggDto) };
  });

  app.post('/api/eggs/incubate', async (request): Promise<IncubateEggsResponse> => {
    const { ids } = incubateEggsInputSchema.parse(request.body);
    const incubated = await incubateEggs(db, content, currentUserId(request), ids, now());
    return { incubated: incubated.map(toEggDto) };
  });

  app.delete('/api/eggs/:id', async (request): Promise<BagEggDto> => {
    const { id } = uuidParams.parse(request.params);
    return toBagEggDto(await withdrawEgg(db, currentUserId(request), id, now()));
  });

  app.post('/api/eggs/hatch', async (request): Promise<HatchEggsResponse> => {
    const { hatched, ...newInDex } = await hatchEggs(db, content, currentUserId(request), now());
    return { hatched: hatched.map((r) => toPokemonDto(r)), ...newInDex };
  });

  app.post('/api/pokemon/transfer', async (request): Promise<TransferPokemonResponse> => {
    const { ids } = transferPokemonInputSchema.parse(request.body);
    return transferPokemon(db, content, currentUserId(request), ids);
  });

  app.get('/api/candies', async (request): Promise<CandyDto[]> =>
    listCandies(db, currentUserId(request)),
  );

  app.post('/api/pokemon/:id/candies', async (request): Promise<PokemonDto> => {
    const { id } = uuidParams.parse(request.params);
    const { count } = feedCandiesInputSchema.parse(request.body);
    const userId = currentUserId(request);
    const row = await feedCandies(db, content, userId, id, count);
    const busy = await pokemonActivities(db, userId);
    return toPokemonDto(row, busy.get(row.id));
  });
}
