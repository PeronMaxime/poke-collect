import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '@poke/db';
import { ASSISTANT_POSTS, FARM_PLOTS, assistantSlotCount } from '@poke/game-core';
import type { AssistantPost } from '@poke/game-core';
import { assignAssistantInputSchema } from '@poke/shared';
import type { AssistantDto } from '@poke/shared';
import type { ContentCache } from '../content-cache';
import { assignAssistant, listAssistants, removeAssistant } from '../game/assistants';
import { daycareSlotCount } from '../game/daycare';
import { claimedRewards } from '../game/store';
import type { sessionHooks } from '../plugins/session';

interface Deps {
  db: Db;
  content: ContentCache;
  hooks: ReturnType<typeof sessionHooks>;
  now: () => Date;
}

const slotParams = z.object({
  post: z.enum(ASSISTANT_POSTS),
  slot: z.coerce.number().int().min(0).max(30),
});

/** Assistants des pensions, des couveuses, des places du Musée, des Centres Pokémon et de la ferme. */
export async function assistantRoutes(app: FastifyInstance, { db, content, hooks, now }: Deps) {
  app.addHook('preHandler', hooks.requireUser);

  /** Postes ouverts au joueur : pensions, couveuses, places du Musée, Centres Pokémon, ferme. */
  async function slotCount(userId: string, post: AssistantPost): Promise<number> {
    const ctx = await content.get();
    switch (post) {
      case 'daycare':
        return daycareSlotCount(ctx, await claimedRewards(db, userId));
      case 'incubator':
        return assistantSlotCount(post, ctx.balance.breeding.maxEggs);
      case 'museum':
        return ctx.balance.museum.slots;
      case 'center':
        return assistantSlotCount(post, ctx.balance.center.slots);
      case 'farm':
      case 'harvest':
        return assistantSlotCount(post, FARM_PLOTS);
    }
  }

  app.get('/api/assistants', async (request): Promise<AssistantDto[]> =>
    listAssistants(db, request.user!.id),
  );

  app.put('/api/assistants/:post/:slot', async (request): Promise<AssistantDto> => {
    const { post, slot } = slotParams.parse(request.params);
    const { pokemonId } = assignAssistantInputSchema.parse(request.body);
    const userId = request.user!.id;
    const slots = await slotCount(userId, post);
    return assignAssistant(db, await content.get(), userId, post, slot, slots, pokemonId, now());
  });

  app.delete('/api/assistants/:post/:slot', async (request, reply) => {
    const { post, slot } = slotParams.parse(request.params);
    await removeAssistant(db, await content.get(), request.user!.id, post, slot, now());
    return reply.code(204).send();
  });
}
