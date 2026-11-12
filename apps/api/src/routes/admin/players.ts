import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { logAdminAction } from '@poke/db';
import { adminTestItemsInputSchema, adminTestPokemonInputSchema } from '@poke/shared';
import type {
  AdminPlayerDetailResponse,
  AdminPlayerDto,
  AdminTestItemsResponse,
  AdminTestPokemonDeleteResponse,
  AdminTestPokemonResponse,
  AdminTestQuestsResponse,
  AdminTestTrainersResponse,
} from '@poke/shared';
import {
  completeTestQuests,
  deleteTestPokemon,
  giveTestItems,
  giveTestPokemon,
  listPlayers,
  playerDetail,
  unlockTestTrainers,
} from '../../game/admin-players';
import { currentUserId } from '../deps';
import type { AdminDeps } from './admin-deps';

/**
 * Administration des joueurs : liste, fiche, lots de test.
 */

/**
 * Joueurs : liste, fiche d'un joueur, et lots de test (Pokémon, objets, dresseurs, quêtes) réservés
 * aux comptes administrateurs.
 */
export function adminPlayerRoutes(app: FastifyInstance, { db, content, now }: AdminDeps) {
  app.get('/api/admin/players', async (): Promise<AdminPlayerDto[]> => listPlayers(db));

  app.get('/api/admin/players/:userId', async (request, reply) => {
    const { userId } = z.object({ userId: z.string().min(1).max(64) }).parse(request.params);
    const detail: AdminPlayerDetailResponse | null = await playerDetail(
      db,
      await content.get(),
      userId,
    );
    if (!detail) return reply.code(404).send({ error: 'NOT_FOUND' });
    return detail;
  });

  /** Lot de Pokémon de test, pour un compte administrateur seulement. */
  app.post('/api/admin/players/:userId/test-pokemon', async (request) => {
    const { userId } = z.object({ userId: z.string().min(1).max(64) }).parse(request.params);
    const input = adminTestPokemonInputSchema.parse(request.body);
    const result: AdminTestPokemonResponse = await giveTestPokemon(
      db,
      await content.get(),
      userId,
      input,
      now(),
    );
    await logAdminAction(db, {
      adminId: currentUserId(request),
      action: 'player.test_pokemon',
      entity: 'user',
      entityId: userId,
      after: { ...input, added: result.added },
    });
    return result;
  });

  /** Lot de tous les objets du contenu publié, pour un compte administrateur seulement. */
  app.post('/api/admin/players/:userId/test-items', async (request) => {
    const { userId } = z.object({ userId: z.string().min(1).max(64) }).parse(request.params);
    const input = adminTestItemsInputSchema.parse(request.body);
    const result: AdminTestItemsResponse = await giveTestItems(
      db,
      await content.get(),
      userId,
      input,
    );
    await logAdminAction(db, {
      adminId: currentUserId(request),
      action: 'player.test_items',
      entity: 'user',
      entityId: userId,
      after: result,
    });
    return result;
  });

  /** Tous les dresseurs battus une fois, pour un compte administrateur seulement. */
  app.post('/api/admin/players/:userId/test-trainers', async (request) => {
    const { userId } = z.object({ userId: z.string().min(1).max(64) }).parse(request.params);
    const result: AdminTestTrainersResponse = await unlockTestTrainers(
      db,
      await content.get(),
      userId,
      now(),
    );
    await logAdminAction(db, {
      adminId: currentUserId(request),
      action: 'player.test_trainers',
      entity: 'user',
      entityId: userId,
      after: result,
    });
    return result;
  });

  /** Toutes les quêtes terminées (récompenses à réclamer), pour un compte administrateur seulement. */
  app.post('/api/admin/players/:userId/test-quests', async (request) => {
    const { userId } = z.object({ userId: z.string().min(1).max(64) }).parse(request.params);
    const result: AdminTestQuestsResponse = await completeTestQuests(
      db,
      await content.get(),
      userId,
      now(),
    );
    await logAdminAction(db, {
      adminId: currentUserId(request),
      action: 'player.test_quests',
      entity: 'user',
      entityId: userId,
      after: result,
    });
    return result;
  });

  /** Supprime le lot de test du compte (Pokémon occupés gardés). */
  app.delete('/api/admin/players/:userId/test-pokemon', async (request) => {
    const { userId } = z.object({ userId: z.string().min(1).max(64) }).parse(request.params);
    const result: AdminTestPokemonDeleteResponse = await deleteTestPokemon(db, userId);
    await logAdminAction(db, {
      adminId: currentUserId(request),
      action: 'player.test_pokemon_delete',
      entity: 'user',
      entityId: userId,
      after: result,
    });
    return result;
  });
}
