import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { playerProfiles } from '@poke/db';
import type { Db } from '@poke/db';
import { baseShinyProbability, createRng, generatePokemon, isUnlocked } from '@poke/game-core';
import { chooseStarterInputSchema, createProfileInputSchema } from '@poke/shared';
import type { MeResponse, PlayerProfileDto, PokemonDto, PublicContentDto } from '@poke/shared';
import type { ContentCache } from '../content-cache';
import { GameError, newSeed } from '../game/expeditions';
import {
  addItems,
  insertPokemon,
  playerProgress,
  recordPokedex,
  toPokemonDto,
} from '../game/store';
import type { sessionHooks } from '../plugins/session';

interface Deps {
  db: Db;
  content: ContentCache;
  hooks: ReturnType<typeof sessionHooks>;
  now: () => Date;
}

export function toDto(row: typeof playerProfiles.$inferSelect): PlayerProfileDto {
  return {
    trainerName: row.trainerName,
    regionUnlocked: row.regionUnlocked,
    starterSpeciesId: row.starterSpeciesId,
    regionStarters: row.regionStarters,
    currency: row.currency,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function playerRoutes(app: FastifyInstance, { db, content, hooks, now }: Deps) {
  /** Contenu publié utile à l'affichage côté joueur. */
  app.get('/api/content', async (): Promise<PublicContentDto> => (await content.get()).content);

  app.get('/api/me', { preHandler: hooks.requireUser }, async (request): Promise<MeResponse> => {
    const user = request.user!;
    const [profile] = await db
      .select()
      .from(playerProfiles)
      .where(eq(playerProfiles.userId, user.id));
    return { user, profile: profile ? toDto(profile) : null };
  });

  /** Signal de présence envoyé par le jeu ouvert (la session met à jour `last_seen_at`). */
  app.post('/api/presence', { preHandler: hooks.requireUser }, async (_request, reply) =>
    reply.code(204).send(),
  );

  app.post('/api/profile', { preHandler: hooks.requireUser }, async (request, reply) => {
    const parsed = createProfileInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'VALIDATION', issues: parsed.error.issues });
    }
    const user = request.user!;
    const { trainerName } = parsed.data;

    const [existing] = await db
      .select({ userId: playerProfiles.userId })
      .from(playerProfiles)
      .where(eq(playerProfiles.userId, user.id));
    if (existing) return reply.code(409).send({ error: 'PROFILE_EXISTS' });

    const [taken] = await db
      .select({ userId: playerProfiles.userId })
      .from(playerProfiles)
      .where(eq(sql`lower(${playerProfiles.trainerName})`, trainerName.toLowerCase()));
    if (taken) return reply.code(409).send({ error: 'TRAINER_NAME_TAKEN' });

    // La région de départ vient du contenu publié (première région dans l'ordre).
    const ctx = await content.get();
    const startRegion = ctx.regions[0];
    if (!startRegion) return reply.code(503).send({ error: 'NO_REGION_CONFIGURED' });

    const [created] = await db
      .insert(playerProfiles)
      .values({ userId: user.id, trainerName, regionUnlocked: startRegion.id, createdAt: now() })
      .returning();
    return reply.code(201).send(toDto(created!));
  });

  /** Choix du starter : premier Pokémon, Pokédex, inventaire et argent de départ. */
  app.post('/api/starter', { preHandler: hooks.requireUser }, async (request, reply) => {
    const { speciesId } = chooseStarterInputSchema.parse(request.body);
    const user = request.user!;
    const ctx = await content.get();
    const [profile] = await db
      .select()
      .from(playerProfiles)
      .where(eq(playerProfiles.userId, user.id));
    if (!profile) throw new GameError(409, 'NO_PROFILE');
    if (profile.starterSpeciesId != null) throw new GameError(409, 'STARTER_ALREADY_CHOSEN');
    const region = ctx.region(profile.regionUnlocked);
    if (!region?.starterSpeciesIds.includes(speciesId)) throw new GameError(400, 'INVALID_STARTER');

    const { newPlayer } = ctx.balance;
    const starter = generatePokemon(ctx, createRng(newSeed()), speciesId, newPlayer.starterLevel, {
      shinyProbability: baseShinyProbability(ctx),
    });
    const at = now();

    const created = await db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(playerProfiles)
        .set({
          starterSpeciesId: speciesId,
          currency: sql`${playerProfiles.currency} + ${newPlayer.startingCurrency}`,
        })
        .where(
          sql`${playerProfiles.userId} = ${user.id} and ${playerProfiles.starterSpeciesId} is null`,
        )
        .returning();
      if (!claimed) throw new GameError(409, 'STARTER_ALREADY_CHOSEN');
      const [row] = await insertPokemon(tx, user.id, [starter], {
        origin: 'starter',
        originRegion: region.id,
        at,
      });
      await recordPokedex(tx, user.id, {
        seen: [speciesId],
        caught: [starter],
        at,
      });
      await addItems(tx, user.id, newPlayer.startingInventory);
      return row!;
    });
    const dto: PokemonDto = toPokemonDto(created);
    return reply.code(201).send(dto);
  });

  /**
   * Starter d'une région suivante (Johto…) : un par région, une fois celle-ci débloquée. Seuls les
   * Pokémon du Pokédex d'une région y partent en expédition, il faut donc un premier compagnon.
   */
  app.post<{ Params: { regionId: string } }>(
    '/api/regions/:regionId/starter',
    { preHandler: hooks.requireUser },
    async (request, reply) => {
      const { speciesId } = chooseStarterInputSchema.parse(request.body);
      const user = request.user!;
      const ctx = await content.get();
      const [profile] = await db
        .select()
        .from(playerProfiles)
        .where(eq(playerProfiles.userId, user.id));
      if (!profile) throw new GameError(409, 'NO_PROFILE');
      const region = ctx.region(request.params.regionId);
      if (!region || region.id === profile.regionUnlocked) {
        throw new GameError(404, 'REGION_NOT_FOUND');
      }
      if (!isUnlocked(ctx, region.unlock, await playerProgress(db, ctx, user.id))) {
        throw new GameError(403, 'REGION_LOCKED');
      }
      if (region.id in profile.regionStarters) {
        throw new GameError(409, 'STARTER_ALREADY_CHOSEN');
      }
      if (!region.starterSpeciesIds.includes(speciesId)) {
        throw new GameError(400, 'INVALID_STARTER');
      }

      const starter = generatePokemon(
        ctx,
        createRng(newSeed()),
        speciesId,
        ctx.balance.newPlayer.starterLevel,
        { shinyProbability: baseShinyProbability(ctx) },
      );
      const at = now();
      const created = await db.transaction(async (tx) => {
        const [claimed] = await tx
          .update(playerProfiles)
          .set({
            regionStarters: sql`${playerProfiles.regionStarters} || ${JSON.stringify({ [region.id]: speciesId })}::jsonb`,
          })
          .where(
            sql`${playerProfiles.userId} = ${user.id} and ${playerProfiles.regionStarters} ->> ${region.id} is null`,
          )
          .returning();
        if (!claimed) throw new GameError(409, 'STARTER_ALREADY_CHOSEN');
        const [row] = await insertPokemon(tx, user.id, [starter], {
          origin: 'starter',
          originRegion: region.id,
          at,
        });
        await recordPokedex(tx, user.id, { seen: [speciesId], caught: [starter], at });
        return row!;
      });
      const dto: PokemonDto = toPokemonDto(created);
      return reply.code(201).send(dto);
    },
  );
}
