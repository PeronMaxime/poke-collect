import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { slugSchema } from '@poke/content';
import { rewardClaims } from '@poke/db';
import type { Db } from '@poke/db';
import { playerBonuses, playerSlots } from '@poke/game-core';
import { claimRewardInputSchema, evolveInputSchema, useItemInputSchema } from '@poke/shared';
import type {
  ClaimQuestResponse,
  ClaimRewardResponse,
  EvolveResponse,
  ProgressionResponse,
  QuestsResponse,
  UseItemResponse,
} from '@poke/shared';
import type { ContentCache } from '../content-cache';
import { claimReward, evolve, useItemOnPokemon } from '../game/progression';
import { claimQuest, questsState } from '../game/quests';
import { claimedRewards, pokemonActivities, toPokemonDto } from '../game/store';
import type { sessionHooks } from '../plugins/session';

interface Deps {
  db: Db;
  content: ContentCache;
  hooks: ReturnType<typeof sessionHooks>;
  now: () => Date;
}

const uuidParams = z.object({ id: z.uuid() });
const questParams = z.object({ id: slugSchema });

/** Évolutions, objets endgame, paliers du Pokédex, collections thématiques et quêtes. */
export async function progressionRoutes(app: FastifyInstance, { db, content, hooks, now }: Deps) {
  app.addHook('preHandler', hooks.requireUser);

  app.post('/api/pokemon/:id/evolve', async (request): Promise<EvolveResponse> => {
    const { id } = uuidParams.parse(request.params);
    const input = evolveInputSchema.parse(request.body);
    const userId = request.user!.id;
    const result = await evolve(db, content, userId, id, input, now());
    const busy = await pokemonActivities(db, userId);
    return {
      pokemon: toPokemonDto(result.row, busy.get(result.row.id)),
      fromSpeciesId: result.fromSpeciesId,
      fromFormId: result.fromFormId,
      consumedItemId: result.consumedItemId,
      newSpeciesIds: result.newSpeciesIds,
    };
  });

  /** Récompenses réclamées, emplacements débloqués et bonus permanents. */
  app.get('/api/progression', async (request): Promise<ProgressionResponse> => {
    const userId = request.user!.id;
    const ctx = await content.get();
    const [rows, claimed] = await Promise.all([
      db
        .select({
          kind: rewardClaims.kind,
          rewardId: rewardClaims.rewardId,
          claimedAt: rewardClaims.claimedAt,
        })
        .from(rewardClaims)
        .where(eq(rewardClaims.ownerId, userId)),
      claimedRewards(db, userId),
    ]);
    return {
      claims: rows.map((r) => ({ ...r, claimedAt: r.claimedAt.toISOString() })),
      slots: playerSlots(ctx, claimed),
      bonuses: playerBonuses(ctx, claimed),
    };
  });

  app.post('/api/progression/claim', async (request): Promise<ClaimRewardResponse> => {
    const input = claimRewardInputSchema.parse(request.body);
    const result = await claimReward(db, content, request.user!.id, input, now());
    return { kind: input.kind, rewardId: input.rewardId, ...result };
  });

  /** Capsule, Aromate, Pilule / Patch Talent utilisés sur un Pokémon. */
  app.post('/api/pokemon/:id/use-item', async (request): Promise<UseItemResponse> => {
    const { id } = uuidParams.parse(request.params);
    const input = useItemInputSchema.parse(request.body);
    const userId = request.user!.id;
    const { row, remaining } = await useItemOnPokemon(db, content, userId, id, input);
    return { pokemon: toPokemonDto(row), itemId: input.itemId, remaining };
  });

  /** Quêtes visibles (débloquées ou commencées), avancement à jour. */
  app.get('/api/quests', async (request): Promise<QuestsResponse> => ({
    quests: await questsState(db, content, request.user!.id, now()),
  }));

  app.post('/api/quests/:id/claim', async (request): Promise<ClaimQuestResponse> => {
    const { id } = questParams.parse(request.params);
    const userId = request.user!.id;
    const result = await claimQuest(db, content, userId, id, now());
    return {
      questId: id,
      rewards: result.rewards,
      pokemon: result.pokemon.map((p) => toPokemonDto(p)),
      newSpeciesIds: result.newSpeciesIds,
      currency: result.currency,
      slots: result.slots,
    };
  });
}
