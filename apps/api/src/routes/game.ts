import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { expeditions, inventory, pokedex, pokedexForms, pokemon, pokemonTags } from '@poke/db';
import type { Db } from '@poke/db';
import { startExpeditionInputSchema, updatePokemonInputSchema } from '@poke/shared';
import type {
  ClaimExpeditionResponse,
  ExpeditionDto,
  ExpeditionsResponse,
  InventoryEntryDto,
  PokedexEntryDto,
  PokedexFormEntryDto,
  PokemonDto,
} from '@poke/shared';
import type { ContentCache } from '../content-cache';
import {
  cancelExpedition,
  claimExpedition,
  expeditionSlots,
  requireStartedProfile,
  shinyChains,
  startExpedition,
} from '../game/expeditions';
import { claimedRewards, pokemonActivities, toExpeditionDto, toPokemonDto } from '../game/store';
import type { sessionHooks } from '../plugins/session';

interface Deps {
  db: Db;
  content: ContentCache;
  hooks: ReturnType<typeof sessionHooks>;
  now: () => Date;
}

const uuidParams = z.object({ id: z.uuid() });

/** Routes de jeu : toutes exigent une session ; le serveur décide de tous les résultats. */
export async function gameRoutes(app: FastifyInstance, { db, content, hooks, now }: Deps) {
  app.addHook('preHandler', hooks.requireUser);

  app.get('/api/pokemon', async (request): Promise<PokemonDto[]> => {
    const userId = request.user!.id;
    const [rows, busy] = await Promise.all([
      db
        .select()
        .from(pokemon)
        .where(eq(pokemon.ownerId, userId))
        .orderBy(asc(pokemon.caughtAt), asc(pokemon.id)),
      pokemonActivities(db, userId),
    ]);
    return rows.map((r) => toPokemonDto(r, busy.get(r.id)));
  });

  app.patch('/api/pokemon/:id', async (request, reply) => {
    const { id } = uuidParams.parse(request.params);
    const { locked, tagIds: requested } = updatePokemonInputSchema.parse(request.body);
    const userId = request.user!.id;
    const tagIds = requested && [...new Set(requested)];
    if (tagIds?.length) {
      const owned = await db
        .select({ id: pokemonTags.id })
        .from(pokemonTags)
        .where(and(inArray(pokemonTags.id, tagIds), eq(pokemonTags.ownerId, userId)));
      if (owned.length !== tagIds.length) {
        return reply.code(404).send({ error: 'TAG_NOT_FOUND' });
      }
    }
    const [row] = await db
      .update(pokemon)
      .set({ locked, tagIds })
      .where(and(eq(pokemon.id, id), eq(pokemon.ownerId, userId)))
      .returning();
    if (!row) return reply.code(404).send({ error: 'POKEMON_NOT_FOUND' });
    const busy = await pokemonActivities(db, userId);
    return toPokemonDto(row, busy.get(row.id));
  });

  app.get('/api/pokedex', async (request): Promise<PokedexEntryDto[]> => {
    const rows = await db
      .select()
      .from(pokedex)
      .where(eq(pokedex.ownerId, request.user!.id))
      .orderBy(asc(pokedex.speciesId));
    return rows.map(({ ownerId: _, firstCaughtAt, ...r }) => ({
      ...r,
      firstCaughtAt: firstCaughtAt?.toISOString() ?? null,
    }));
  });

  app.get('/api/pokedex/forms', async (request): Promise<PokedexFormEntryDto[]> => {
    const rows = await db
      .select()
      .from(pokedexForms)
      .where(eq(pokedexForms.ownerId, request.user!.id))
      .orderBy(asc(pokedexForms.formId));
    return rows.map(({ ownerId: _, firstCaughtAt, ...r }) => ({
      ...r,
      firstCaughtAt: firstCaughtAt.toISOString(),
    }));
  });

  app.get('/api/inventory', async (request): Promise<InventoryEntryDto[]> =>
    db
      .select({ itemId: inventory.itemId, quantity: inventory.quantity })
      .from(inventory)
      .where(and(eq(inventory.ownerId, request.user!.id), gt(inventory.quantity, 0)))
      .orderBy(asc(inventory.itemId)),
  );

  app.get('/api/expeditions', async (request): Promise<ExpeditionsResponse> => {
    const ctx = await content.get();
    const userId = request.user!.id;
    const at = now();
    const [rows, claimed, chains] = await Promise.all([
      db
        .select()
        .from(expeditions)
        .where(and(eq(expeditions.ownerId, userId), isNull(expeditions.claimedAt)))
        .orderBy(asc(expeditions.slotIndex)),
      claimedRewards(db, userId),
      shinyChains(db, ctx, userId, at),
    ]);
    return {
      slots: expeditionSlots(ctx, claimed),
      serverTime: at.toISOString(),
      active: rows.map(toExpeditionDto),
      chains: [...chains].map(([zoneId, s]) => ({
        zoneId,
        chain: s.chain,
        expiresAt: s.expiresAt?.toISOString() ?? null,
      })),
    };
  });

  /** Dernières expéditions réclamées (historique). */
  app.get('/api/expeditions/history', async (request): Promise<ExpeditionDto[]> => {
    const rows = await db
      .select()
      .from(expeditions)
      .where(and(eq(expeditions.ownerId, request.user!.id), isNotNull(expeditions.claimedAt)))
      .orderBy(desc(expeditions.claimedAt))
      .limit(20);
    return rows.map(toExpeditionDto);
  });

  app.post('/api/expeditions', async (request, reply) => {
    const input = startExpeditionInputSchema.parse(request.body);
    const row = await startExpedition(db, content, request.user!.id, input, now());
    return reply.code(201).send(toExpeditionDto(row));
  });

  app.post('/api/expeditions/:id/cancel', async (request, reply) => {
    const { id } = uuidParams.parse(request.params);
    await cancelExpedition(db, request.user!.id, id, now());
    return reply.code(204).send();
  });

  app.post('/api/expeditions/:id/claim', async (request): Promise<ClaimExpeditionResponse> => {
    const { id } = uuidParams.parse(request.params);
    const userId = request.user!.id;
    await requireStartedProfile(db, userId);
    const { expedition, captured } = await claimExpedition(db, content, userId, id, now());
    return {
      expedition: toExpeditionDto(expedition),
      captured: captured.map((r) => toPokemonDto(r)),
    };
  });
}
