import { createHash } from 'node:crypto';
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
import {
  favoriteZoneInputSchema,
  startExpeditionInputSchema,
  updatePokemonInputSchema,
} from '@poke/shared';
import type {
  ClaimExpeditionResponse,
  ExpeditionDto,
  ExpeditionsResponse,
  InventoryEntryDto,
  PokedexEntryDto,
  PokedexFormEntryDto,
  PokemonDto,
} from '@poke/shared';
import {
  cancelExpedition,
  claimExpedition,
  expeditionPaces,
  expeditionSlots,
  playerRoamers,
  requireStartedProfile,
  shinyChains,
  startExpedition,
} from '../game/expeditions';
import { GameError } from '../game/errors';
import { pokemonActivities, toExpeditionDto, toPokemonDto } from '../game/store';
import { currentUserId } from './deps';
import type { RouteDeps } from './deps';

const uuidParams = z.object({ id: z.uuid() });

/** Routes de jeu : toutes exigent une session ; le serveur décide de tous les résultats. */
export async function gameRoutes(app: FastifyInstance, { db, content, hooks, now }: RouteDeps) {
  app.addHook('preHandler', hooks.requireUser);

  app.get('/api/pokemon', async (request, reply) => {
    const userId = currentUserId(request);
    // Combat terminé pendant l'absence du joueur : son équipe redevient disponible.
    await hooks.settleAll(userId);
    const [rows, busy] = await Promise.all([
      db
        .select()
        .from(pokemon)
        .where(eq(pokemon.ownerId, userId))
        .orderBy(asc(pokemon.caughtAt), asc(pokemon.id)),
      pokemonActivities(db, userId),
    ]);
    const dtos: PokemonDto[] = rows.map((r) => toPokemonDto(r, busy.get(r.id)));
    // Empreinte du contenu : la collection est la plus lourde réponse du jeu et change rarement
    // d'un rechargement à l'autre, le navigateur renvoie alors `If-None-Match` et reçoit un 304.
    const body = JSON.stringify(dtos);
    const etag = `W/"pokemon-${createHash('sha1').update(body).digest('base64url')}"`;
    reply.header('etag', etag).header('cache-control', 'private, no-cache');
    if (request.headers['if-none-match'] === etag) return reply.code(304).send();
    return reply.type('application/json; charset=utf-8').send(body);
  });

  app.patch('/api/pokemon/:id', async (request) => {
    const { id } = uuidParams.parse(request.params);
    const { locked, tagIds: requested } = updatePokemonInputSchema.parse(request.body);
    const userId = currentUserId(request);
    const tagIds = requested && [...new Set(requested)];
    if (tagIds?.length) {
      const owned = await db
        .select({ id: pokemonTags.id })
        .from(pokemonTags)
        .where(and(inArray(pokemonTags.id, tagIds), eq(pokemonTags.ownerId, userId)));
      if (owned.length !== tagIds.length) {
        throw new GameError(404, 'TAG_NOT_FOUND');
      }
    }
    const [row] = await db
      .update(pokemon)
      .set({ locked, tagIds })
      .where(and(eq(pokemon.id, id), eq(pokemon.ownerId, userId)))
      .returning();
    if (!row) throw new GameError(404, 'POKEMON_NOT_FOUND');
    const busy = await pokemonActivities(db, userId);
    return toPokemonDto(row, busy.get(row.id));
  });

  app.get('/api/pokedex', async (request): Promise<PokedexEntryDto[]> => {
    const rows = await db
      .select()
      .from(pokedex)
      .where(eq(pokedex.ownerId, currentUserId(request)))
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
      .where(eq(pokedexForms.ownerId, currentUserId(request)))
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
      .where(and(eq(inventory.ownerId, currentUserId(request)), gt(inventory.quantity, 0)))
      .orderBy(asc(inventory.itemId)),
  );

  app.get('/api/expeditions', async (request): Promise<ExpeditionsResponse> => {
    const ctx = await content.get();
    const userId = currentUserId(request);
    const at = now();
    const [rows, slots, chains, [profile], roamers] = await Promise.all([
      db
        .select()
        .from(expeditions)
        .where(and(eq(expeditions.ownerId, userId), isNull(expeditions.claimedAt)))
        .orderBy(asc(expeditions.slotIndex)),
      expeditionSlots(db, ctx, userId),
      shinyChains(db, ctx, userId, at),
      db
        .select({ favoriteZoneIds: playerProfiles.favoriteZoneIds })
        .from(playerProfiles)
        .where(eq(playerProfiles.userId, userId)),
      playerRoamers(db, ctx, userId, at),
    ]);
    const paces = await expeditionPaces(db, content, userId, rows);
    const chainDto = (s: { chain: number; expiresAt: Date | null }) => ({
      chain: s.chain,
      expiresAt: s.expiresAt?.toISOString() ?? null,
    });
    return {
      slots,
      serverTime: at.toISOString(),
      active: rows.map((r) => toExpeditionDto(r, paces.get(r.id) ?? null)),
      chains: ctx.zones.flatMap((z) => {
        const s = chains.get(z.id);
        return s ? [{ zoneId: z.id, ...chainDto(s) }] : [];
      }),
      favoriteZoneIds: profile?.favoriteZoneIds ?? [],
      roamers: roamers.map((r) => ({
        questId: r.questId,
        speciesId: r.target.speciesId,
        formId: r.target.formId ?? null,
        zoneId: r.zoneId,
        encounterChance: r.target.roaming ?? 0,
        movesAt: r.movesAt.toISOString(),
      })),
    };
  });

  /** Met une zone en favori (ou l'en retire) : elle s'affiche en tête de la page Expéditions. */
  app.put('/api/expeditions/favorites/:zoneId', async (request) => {
    const { zoneId } = z.object({ zoneId: z.string().min(1).max(100) }).parse(request.params);
    const { favorite } = favoriteZoneInputSchema.parse(request.body);
    const ctx = await content.get();
    if (favorite && !ctx.zone(zoneId)) throw new GameError(404, 'ZONE_NOT_FOUND');
    const [updated] = await db
      .update(playerProfiles)
      .set({
        favoriteZoneIds: favorite
          ? sql`array_append(array_remove(${playerProfiles.favoriteZoneIds}, ${zoneId}), ${zoneId})`
          : sql`array_remove(${playerProfiles.favoriteZoneIds}, ${zoneId})`,
      })
      .where(eq(playerProfiles.userId, currentUserId(request)))
      .returning({ favoriteZoneIds: playerProfiles.favoriteZoneIds });
    if (!updated) throw new GameError(409, 'NO_PROFILE');
    return updated;
  });

  /** Dernières expéditions réclamées (historique). */
  app.get('/api/expeditions/history', async (request): Promise<ExpeditionDto[]> => {
    const rows = await db
      .select()
      .from(expeditions)
      .where(and(eq(expeditions.ownerId, currentUserId(request)), isNotNull(expeditions.claimedAt)))
      .orderBy(desc(expeditions.claimedAt))
      .limit(20);
    return rows.map((r) => toExpeditionDto(r));
  });

  app.post('/api/expeditions', async (request, reply) => {
    const input = startExpeditionInputSchema.parse(request.body);
    const row = await startExpedition(db, content, currentUserId(request), input, now());
    hooks.invalidateSettle(currentUserId(request));
    return reply.code(201).send(toExpeditionDto(row));
  });

  app.post('/api/expeditions/:id/cancel', async (request, reply) => {
    const { id } = uuidParams.parse(request.params);
    await cancelExpedition(db, currentUserId(request), id, now());
    return reply.code(204).send();
  });

  app.post('/api/expeditions/:id/claim', async (request): Promise<ClaimExpeditionResponse> => {
    const { id } = uuidParams.parse(request.params);
    const userId = currentUserId(request);
    await requireStartedProfile(db, userId);
    const { expedition, captured } = await claimExpedition(db, content, userId, id, now());
    return {
      expedition: toExpeditionDto(expedition),
      captured: captured.map((r) => toPokemonDto(r)),
    };
  });
}
