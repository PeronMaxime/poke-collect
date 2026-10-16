import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '@poke/db';
import { ASSISTANT_POSTS } from '@poke/game-core';
import { assignAssistantInputSchema } from '@poke/shared';
import type { AssistantDto } from '@poke/shared';
import { assignAssistant, listAssistants, removeAssistant } from '../game/assistants';
import type { sessionHooks } from '../plugins/session';

interface Deps {
  db: Db;
  hooks: ReturnType<typeof sessionHooks>;
  now: () => Date;
}

const postParams = z.object({ post: z.enum(ASSISTANT_POSTS) });

/** Assistants de la Pension, de la couveuse et du Musée. */
export async function assistantRoutes(app: FastifyInstance, { db, hooks, now }: Deps) {
  app.addHook('preHandler', hooks.requireUser);

  app.get('/api/assistants', async (request): Promise<AssistantDto[]> =>
    listAssistants(db, request.user!.id),
  );

  app.put('/api/assistants/:post', async (request): Promise<AssistantDto> => {
    const { post } = postParams.parse(request.params);
    const { pokemonId } = assignAssistantInputSchema.parse(request.body);
    return assignAssistant(db, request.user!.id, post, pokemonId, now());
  });

  app.delete('/api/assistants/:post', async (request, reply) => {
    const { post } = postParams.parse(request.params);
    await removeAssistant(db, request.user!.id, post);
    return reply.code(204).send();
  });
}
