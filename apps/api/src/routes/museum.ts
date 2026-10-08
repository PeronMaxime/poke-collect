import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '@poke/db';
import { depositFossilInputSchema } from '@poke/shared';
import type { FossilRevivalDto, MuseumResponse, ReviveFossilsResponse } from '@poke/shared';
import type { ContentCache } from '../content-cache';
import {
  activeRevivals,
  cancelFossil,
  depositFossil,
  reviveFossils,
  toFossilRevivalDto,
} from '../game/museum';
import { toPokemonDto } from '../game/store';
import type { sessionHooks } from '../plugins/session';

interface Deps {
  db: Db;
  content: ContentCache;
  hooks: ReturnType<typeof sessionHooks>;
  now: () => Date;
}

const uuidParams = z.object({ id: z.uuid() });

/** Musée : restauration des fossiles en Pokémon. */
export async function museumRoutes(app: FastifyInstance, { db, content, hooks, now }: Deps) {
  app.addHook('preHandler', hooks.requireUser);

  app.get('/api/museum', async (request): Promise<MuseumResponse> => {
    const ctx = await content.get();
    const rows = await activeRevivals(db, request.user!.id);
    return {
      slots: ctx.balance.museum.slots,
      serverTime: now().toISOString(),
      revivals: rows.map(toFossilRevivalDto),
    };
  });

  app.post('/api/museum', async (request, reply) => {
    const { itemId } = depositFossilInputSchema.parse(request.body);
    const row = await depositFossil(db, content, request.user!.id, itemId, now());
    return reply.code(201).send(toFossilRevivalDto(row) satisfies FossilRevivalDto);
  });

  app.delete('/api/museum/:id', async (request): Promise<FossilRevivalDto> => {
    const { id } = uuidParams.parse(request.params);
    return toFossilRevivalDto(await cancelFossil(db, request.user!.id, id, now()));
  });

  app.post('/api/museum/revive', async (request): Promise<ReviveFossilsResponse> => {
    const { revived, newSpeciesIds } = await reviveFossils(db, content, request.user!.id, now());
    return { revived: revived.map((r) => toPokemonDto(r)), newSpeciesIds };
  });
}
