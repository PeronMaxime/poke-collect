import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { depositFossilInputSchema } from '@poke/shared';
import type { FossilRevivalDto, MuseumResponse, ReviveFossilsResponse } from '@poke/shared';
import {
  activeRevivals,
  cancelFossil,
  depositFossil,
  reviveFossils,
  toFossilRevivalDto,
} from '../game/museum';
import { assertTabUnlocked, playerFacilityPlaces, toPokemonDto } from '../game/store';
import { currentUserId } from './deps';
import type { RouteDeps } from './deps';

/**
 * Routes du Musée (/api/museum) : déposer un fossile, le reprendre, récupérer les Pokémon
 * restaurés. Chaque route valide sa requête, appelle le module de jeu et répond.
 */

const uuidParams = z.object({ id: z.uuid() });

/** Musée : restauration des fossiles en Pokémon. */
export async function museumRoutes(app: FastifyInstance, { db, content, hooks, now }: RouteDeps) {
  app.addHook('preHandler', hooks.requireUser);

  app.get('/api/museum', async (request): Promise<MuseumResponse> => {
    const ctx = await content.get();
    const userId = currentUserId(request);
    await hooks.settleAll(userId);
    const [rows, slots] = await Promise.all([
      activeRevivals(db, userId),
      playerFacilityPlaces(db, ctx, userId, 'museum'),
    ]);
    return {
      slots,
      serverTime: now().toISOString(),
      revivals: rows.map(toFossilRevivalDto),
    };
  });

  app.post('/api/museum', async (request, reply) => {
    const { itemId } = depositFossilInputSchema.parse(request.body);
    await assertTabUnlocked(db, await content.get(), currentUserId(request), 'museum');
    const row = await depositFossil(db, content, currentUserId(request), itemId, now());
    return reply.code(201).send(toFossilRevivalDto(row) satisfies FossilRevivalDto);
  });

  app.delete('/api/museum/:id', async (request): Promise<FossilRevivalDto> => {
    const { id } = uuidParams.parse(request.params);
    return toFossilRevivalDto(await cancelFossil(db, currentUserId(request), id, now()));
  });

  app.post('/api/museum/revive', async (request): Promise<ReviveFossilsResponse> => {
    const { revived, ...newInDex } = await reviveFossils(
      db,
      content,
      currentUserId(request),
      now(),
    );
    return { revived: revived.map((r) => toPokemonDto(r)), ...newInDex };
  });
}
