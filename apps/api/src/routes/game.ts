import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
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
  expeditionHistory,
  expeditionsOverview,
  requireStartedProfile,
  setFavoriteZone,
  startExpedition,
  toExpeditionDto,
} from '../game/expeditions';
import {
  listInventory,
  listPokedex,
  listPokedexForms,
  listPokemon,
  toPokemonDto,
  updatePokemon,
} from '../game/store';
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
    const dtos: PokemonDto[] = await listPokemon(db, userId);
    // Empreinte du contenu : la collection est la plus lourde réponse du jeu et change rarement
    // d'un rechargement à l'autre, le navigateur renvoie alors `If-None-Match` et reçoit un 304.
    const body = JSON.stringify(dtos);
    const etag = `W/"pokemon-${createHash('sha1').update(body).digest('base64url')}"`;
    reply.header('etag', etag).header('cache-control', 'private, no-cache');
    if (request.headers['if-none-match'] === etag) return reply.code(304).send();
    return reply.type('application/json; charset=utf-8').send(body);
  });

  app.patch('/api/pokemon/:id', async (request): Promise<PokemonDto> => {
    const { id } = uuidParams.parse(request.params);
    const input = updatePokemonInputSchema.parse(request.body);
    return updatePokemon(db, currentUserId(request), id, input);
  });

  app.get('/api/pokedex', async (request): Promise<PokedexEntryDto[]> =>
    listPokedex(db, currentUserId(request)),
  );

  app.get('/api/pokedex/forms', async (request): Promise<PokedexFormEntryDto[]> =>
    listPokedexForms(db, currentUserId(request)),
  );

  app.get('/api/inventory', async (request): Promise<InventoryEntryDto[]> =>
    listInventory(db, currentUserId(request)),
  );

  app.get('/api/expeditions', async (request): Promise<ExpeditionsResponse> =>
    expeditionsOverview(db, content, currentUserId(request), now()),
  );

  /** Met une zone en favori (ou l'en retire) : elle s'affiche en tête de la page Expéditions. */
  app.put('/api/expeditions/favorites/:zoneId', async (request) => {
    const { zoneId } = z.object({ zoneId: z.string().min(1).max(100) }).parse(request.params);
    const { favorite } = favoriteZoneInputSchema.parse(request.body);
    return setFavoriteZone(db, content, currentUserId(request), zoneId, favorite);
  });

  /** Dernières expéditions réclamées (historique). */
  app.get('/api/expeditions/history', async (request): Promise<ExpeditionDto[]> =>
    expeditionHistory(db, currentUserId(request)),
  );

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
