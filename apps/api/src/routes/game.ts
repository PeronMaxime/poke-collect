import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  expeditions,
  inventory,
  playerProfiles,
  pokedex,
  pokedexForms,
  pokemon,
  pokemonTags,
} from '@poke/db';
import type { Db } from '@poke/db';
import {
  claimExpeditionInputSchema,
  favoriteZoneInputSchema,
  startExpeditionInputSchema,
  updatePokemonInputSchema,
} from '@poke/shared';
import type {
  ClaimExpeditionResponse,
  ExpeditionDto,
  ExpeditionsResponse,
  InventoryEntryDto,
  LegendaryEncounterDto,
  PokedexEntryDto,
  PokedexFormEntryDto,
  PokemonDto,
} from '@poke/shared';
import type { ContentCache } from '../content-cache';
import {
  cancelExpedition,
  claimExpedition,
  expeditionSlots,
  legendaryEncounter,
  questChainKey,
  requireStartedProfile,
  shinyChains,
  startExpedition,
} from '../game/expeditions';
import { settleFinishedDungeonRun } from '../game/dungeons';
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
    // Donjon terminé pendant l'absence du joueur : son équipe redevient disponible.
    await settleFinishedDungeonRun(db, content, userId, now());
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
    const [rows, claimed, chains, [profile]] = await Promise.all([
      db
        .select()
        .from(expeditions)
        .where(and(eq(expeditions.ownerId, userId), isNull(expeditions.claimedAt)))
        .orderBy(asc(expeditions.slotIndex)),
      claimedRewards(db, userId),
      shinyChains(db, ctx, userId, at),
      db
        .select({ favoriteZoneIds: playerProfiles.favoriteZoneIds })
        .from(playerProfiles)
        .where(eq(playerProfiles.userId, userId)),
    ]);
    const chainDto = (s: { chain: number; expiresAt: Date | null }) => ({
      chain: s.chain,
      expiresAt: s.expiresAt?.toISOString() ?? null,
    });
    return {
      slots: expeditionSlots(ctx, claimed),
      serverTime: at.toISOString(),
      active: rows.map(toExpeditionDto),
      chains: ctx.zones.flatMap((z) => {
        const s = chains.get(z.id);
        return s ? [{ zoneId: z.id, ...chainDto(s) }] : [];
      }),
      questChains: ctx.quests.flatMap((q) => {
        const s = chains.get(questChainKey(q.id));
        return s ? [{ questId: q.id, ...chainDto(s) }] : [];
      }),
      favoriteZoneIds: profile?.favoriteZoneIds ?? [],
    };
  });

  /** Met une zone en favori (ou l'en retire) : elle s'affiche en tête de la page Expéditions. */
  app.put('/api/expeditions/favorites/:zoneId', async (request, reply) => {
    const { zoneId } = z.object({ zoneId: z.string().min(1).max(100) }).parse(request.params);
    const { favorite } = favoriteZoneInputSchema.parse(request.body);
    const ctx = await content.get();
    if (favorite && !ctx.zone(zoneId)) return reply.code(404).send({ error: 'ZONE_NOT_FOUND' });
    const [updated] = await db
      .update(playerProfiles)
      .set({
        favoriteZoneIds: favorite
          ? sql`array_append(array_remove(${playerProfiles.favoriteZoneIds}, ${zoneId}), ${zoneId})`
          : sql`array_remove(${playerProfiles.favoriteZoneIds}, ${zoneId})`,
      })
      .where(eq(playerProfiles.userId, request.user!.id))
      .returning({ favoriteZoneIds: playerProfiles.favoriteZoneIds });
    if (!updated) return reply.code(409).send({ error: 'NO_PROFILE' });
    return updated;
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

  /** Légendaire rencontré au retour d'une expédition légendaire, avant la Ball ou la fuite. */
  app.get('/api/expeditions/:id/encounter', async (request): Promise<LegendaryEncounterDto> => {
    const { id } = uuidParams.parse(request.params);
    return legendaryEncounter(db, content, request.user!.id, id, now());
  });

  app.post('/api/expeditions/:id/claim', async (request): Promise<ClaimExpeditionResponse> => {
    const { id } = uuidParams.parse(request.params);
    const decision = request.body ? claimExpeditionInputSchema.parse(request.body) : undefined;
    const userId = request.user!.id;
    await requireStartedProfile(db, userId);
    const { expedition, captured } = await claimExpedition(
      db,
      content,
      userId,
      id,
      now(),
      decision,
    );
    return {
      expedition: toExpeditionDto(expedition),
      captured: captured.map((r) => toPokemonDto(r)),
    };
  });
}
