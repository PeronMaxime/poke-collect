import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { rewardClaims } from '@poke/db';
import type { Db } from '@poke/db';
import { playerBonuses, playerSlots } from '@poke/game-core';
import { claimRewardInputSchema, evolveInputSchema } from '@poke/shared';
import type { ClaimRewardResponse, EvolveResponse, ProgressionResponse } from '@poke/shared';
import type { ContentCache } from '../content-cache';
import { claimReward, evolve } from '../game/progression';
import { claimedRewards, pokemonActivities, toPokemonDto } from '../game/store';
import type { sessionHooks } from '../plugins/session';

interface Deps {
  db: Db;
  content: ContentCache;
  hooks: ReturnType<typeof sessionHooks>;
  now: () => Date;
}

const uuidParams = z.object({ id: z.uuid() });

/** Évolutions, paliers du Pokédex et collections thématiques. */
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
}
