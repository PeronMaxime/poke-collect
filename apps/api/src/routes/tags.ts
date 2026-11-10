import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { tagInputSchema } from '@poke/shared';
import type { PokemonTagDto } from '@poke/shared';
import { createTag, deleteTag, listTags, updateTag } from '../game/tags';
import { currentUserId } from './deps';
import type { RouteDeps } from './deps';

const uuidParams = z.object({ id: z.uuid() });

/** Étiquettes du joueur : créées, renommées et supprimées depuis le PC. */
export async function tagRoutes(app: FastifyInstance, { db, hooks }: RouteDeps) {
  app.addHook('preHandler', hooks.requireUser);

  app.get('/api/tags', async (request): Promise<PokemonTagDto[]> =>
    listTags(db, currentUserId(request)),
  );

  app.post('/api/tags', async (request, reply) => {
    const input = tagInputSchema.parse(request.body);
    return reply.code(201).send(await createTag(db, currentUserId(request), input));
  });

  app.put('/api/tags/:id', async (request): Promise<PokemonTagDto> => {
    const { id } = uuidParams.parse(request.params);
    const input = tagInputSchema.parse(request.body);
    return updateTag(db, currentUserId(request), id, input);
  });

  /** Les Pokémon qui la portaient la perdent. */
  app.delete('/api/tags/:id', async (request, reply) => {
    const { id } = uuidParams.parse(request.params);
    await deleteTag(db, currentUserId(request), id);
    return reply.code(204).send();
  });
}
