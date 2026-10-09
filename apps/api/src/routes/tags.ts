import type { FastifyInstance } from 'fastify';
import { and, asc, count, eq } from 'drizzle-orm';
import { z } from 'zod';
import { pokemonTags } from '@poke/db';
import type { Db } from '@poke/db';
import { MAX_TAGS, tagInputSchema } from '@poke/shared';
import type { PokemonTagDto } from '@poke/shared';
import { GameError } from '../game/errors';
import type { sessionHooks } from '../plugins/session';

interface Deps {
  db: Db;
  hooks: ReturnType<typeof sessionHooks>;
}

const uuidParams = z.object({ id: z.uuid() });

const toTagDto = ({ id, label, color }: typeof pokemonTags.$inferSelect): PokemonTagDto => ({
  id,
  label,
  color: color.toLowerCase(),
});

/** Étiquettes du joueur : créées, renommées et supprimées depuis le PC. */
export async function tagRoutes(app: FastifyInstance, { db, hooks }: Deps) {
  app.addHook('preHandler', hooks.requireUser);

  app.get('/api/tags', async (request): Promise<PokemonTagDto[]> => {
    const rows = await db
      .select()
      .from(pokemonTags)
      .where(eq(pokemonTags.ownerId, request.user!.id))
      .orderBy(asc(pokemonTags.createdAt), asc(pokemonTags.id));
    return rows.map(toTagDto);
  });

  app.post('/api/tags', async (request, reply) => {
    const input = tagInputSchema.parse(request.body);
    const userId = request.user!.id;
    const [{ total } = { total: 0 }] = await db
      .select({ total: count() })
      .from(pokemonTags)
      .where(eq(pokemonTags.ownerId, userId));
    if (total >= MAX_TAGS) throw new GameError(409, 'TOO_MANY_TAGS');
    const [row] = await db
      .insert(pokemonTags)
      .values({ ownerId: userId, label: input.label, color: input.color.toLowerCase() })
      .returning();
    return reply.code(201).send(toTagDto(row!));
  });

  app.put('/api/tags/:id', async (request): Promise<PokemonTagDto> => {
    const { id } = uuidParams.parse(request.params);
    const input = tagInputSchema.parse(request.body);
    const [row] = await db
      .update(pokemonTags)
      .set({ label: input.label, color: input.color.toLowerCase() })
      .where(and(eq(pokemonTags.id, id), eq(pokemonTags.ownerId, request.user!.id)))
      .returning();
    if (!row) throw new GameError(404, 'TAG_NOT_FOUND');
    return toTagDto(row);
  });

  /** Les Pokémon qui la portaient perdent leur étiquette (clé étrangère `set null`). */
  app.delete('/api/tags/:id', async (request, reply) => {
    const { id } = uuidParams.parse(request.params);
    const [row] = await db
      .delete(pokemonTags)
      .where(and(eq(pokemonTags.id, id), eq(pokemonTags.ownerId, request.user!.id)))
      .returning({ id: pokemonTags.id });
    if (!row) throw new GameError(404, 'TAG_NOT_FOUND');
    return reply.code(204).send();
  });
}
