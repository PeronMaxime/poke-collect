import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { FACILITIES, slugSchema } from '@poke/content';
import { facilityPlaces, playerBonuses } from '@poke/game-core';
import {
  claimRewardInputSchema,
  evolveInputSchema,
  megaEvolveInputSchema,
  useItemInputSchema,
} from '@poke/shared';
import type {
  ClaimQuestResponse,
  ClaimRewardResponse,
  EvolveResponse,
  PokemonDto,
  ProgressionResponse,
  QuestsResponse,
  TrainerCardResponse,
  UseItemResponse,
} from '@poke/shared';
import {
  claimReward,
  evolve,
  listRewardClaims,
  megaEvolve,
  megaRevert,
  useItemOnPokemon,
} from '../game/progression';
import { claimQuest, questsState } from '../game/quests';
import { trainerCard } from '../game/stats';
import { claimedRewards, playerProgress, pokemonActivities, toPokemonDto } from '../game/store';
import { currentUserId } from './deps';
import type { RouteDeps } from './deps';

/**
 * Routes de la progression : évolution, Méga-Évolution, objets utilisés sur un Pokémon,
 * récompenses, Fiche Dresseur, quêtes. Chaque route valide sa requête, appelle le module de jeu et
 * répond.
 */

const uuidParams = z.object({ id: z.uuid() });
const questParams = z.object({ id: slugSchema });

/** Évolutions, objets endgame, collections thématiques, complétions d'expédition et quêtes. */
export async function progressionRoutes(
  app: FastifyInstance,
  { db, content, hooks, now }: RouteDeps,
) {
  app.addHook('preHandler', hooks.requireUser);

  app.post('/api/pokemon/:id/evolve', async (request): Promise<EvolveResponse> => {
    const { id } = uuidParams.parse(request.params);
    const input = evolveInputSchema.parse(request.body);
    const userId = currentUserId(request);
    const result = await evolve(db, content, userId, id, input, now());
    const busy = await pokemonActivities(db, userId);
    return {
      pokemon: toPokemonDto(result.row, busy.get(result.row.id)),
      fromSpeciesId: result.fromSpeciesId,
      fromFormId: result.fromFormId,
      consumedItemId: result.consumedItemId,
      newSpeciesIds: result.newSpeciesIds,
      newFormIds: result.newFormIds,
    };
  });

  /** Méga-Évolution : le Pokémon tient la Méga-Gemme choisie. */
  app.post('/api/pokemon/:id/mega', async (request): Promise<EvolveResponse> => {
    const { id } = uuidParams.parse(request.params);
    const input = megaEvolveInputSchema.parse(request.body);
    const userId = currentUserId(request);
    const result = await megaEvolve(db, content, userId, id, input, now());
    return {
      pokemon: toPokemonDto(result.row),
      fromSpeciesId: result.row.speciesId,
      fromFormId: null,
      consumedItemId: input.itemId,
      newSpeciesIds: result.newSpeciesIds,
      newFormIds: result.newFormIds,
    };
  });

  /** Retour à la forme normale : la Méga-Gemme revient dans le sac. */
  app.delete('/api/pokemon/:id/mega', async (request): Promise<PokemonDto> => {
    const { id } = uuidParams.parse(request.params);
    return toPokemonDto(await megaRevert(db, content, currentUserId(request), id));
  });

  /** Récompenses réclamées, emplacements débloqués et bonus permanents. */
  app.get('/api/progression', async (request): Promise<ProgressionResponse> => {
    const userId = currentUserId(request);
    const ctx = await content.get();
    const [claims, claimed, progress] = await Promise.all([
      listRewardClaims(db, userId),
      claimedRewards(db, userId),
      playerProgress(db, ctx, userId),
    ]);
    const facilities = Object.fromEntries(
      FACILITIES.map(({ id }) => [id, facilityPlaces(ctx, id, progress, claimed)]),
    ) as ProgressionResponse['facilities'];
    return {
      claims,
      slots: { expeditions: facilities.expedition, daycare: facilities.daycare },
      facilities,
      bonuses: playerBonuses(ctx, claimed),
    };
  });

  app.post('/api/progression/claim', async (request): Promise<ClaimRewardResponse> => {
    const input = claimRewardInputSchema.parse(request.body);
    const result = await claimReward(db, content, currentUserId(request), input, now());
    return { kind: input.kind, rewardId: input.rewardId, targetId: input.targetId, ...result };
  });

  /** Capsule, Aromate, Pilule / Patch Talent utilisés sur un Pokémon. */
  app.post('/api/pokemon/:id/use-item', async (request): Promise<UseItemResponse> => {
    const { id } = uuidParams.parse(request.params);
    const input = useItemInputSchema.parse(request.body);
    const userId = currentUserId(request);
    const { row, remaining } = await useItemOnPokemon(db, content, userId, id, input);
    return { pokemon: toPokemonDto(row), itemId: input.itemId, remaining };
  });

  /** Quêtes visibles (débloquées ou commencées), avancement à jour. */
  /** Fiche Dresseur : statistiques cumulées. */
  app.get('/api/trainer-card', async (request): Promise<TrainerCardResponse> =>
    trainerCard(db, await content.get(), currentUserId(request)),
  );

  app.get('/api/quests', async (request): Promise<QuestsResponse> => ({
    quests: await questsState(db, content, currentUserId(request), now()),
  }));

  app.post('/api/quests/:id/claim', async (request): Promise<ClaimQuestResponse> => {
    const { id } = questParams.parse(request.params);
    const userId = currentUserId(request);
    const result = await claimQuest(db, content, userId, id, now());
    return { questId: id, rewards: result.rewards, currency: result.currency, slots: result.slots };
  });
}
