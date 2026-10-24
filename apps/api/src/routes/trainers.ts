import type { FastifyInstance } from 'fastify';
import { and, asc, eq, inArray, isNotNull, like, sql } from 'drizzle-orm';
import { z } from 'zod';
import { playerProfiles, pokedex, pokedexForms, pokemon } from '@poke/db';
import type { Db } from '@poke/db';
import { featuredPokemonInputSchema, searchKey, trainerSearchQuerySchema } from '@poke/shared';
import type {
  FeaturedPokemonDto,
  TrainerPokedexResponse,
  TrainerProfileResponse,
  TrainerSearchResultDto,
} from '@poke/shared';
import type { ContentCache } from '../content-cache';
import { GameError } from '../game/errors';
import { featuredPokemon, trainerCard } from '../game/stats';
import { playerProgress } from '../game/store';
import type { sessionHooks } from '../plugins/session';

interface Deps {
  db: Db;
  content: ContentCache;
  hooks: ReturnType<typeof sessionHooks>;
}

/** Résultats de recherche affichés au plus. */
const SEARCH_LIMIT = 10;

/** Lettres accentuées et leur version sans accent, pour une recherche qui les ignore. */
const ACCENTED = 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿ';
const UNACCENTED = 'aaaaaaceeeeiiiinooooouuuuyy';

const nameParams = z.object({ name: z.string().trim().min(1).max(16) });

/** Dresseur ayant commencé l'aventure, retrouvé par son nom (sans tenir compte de la casse). */
async function findTrainer(db: Db, name: string) {
  const [profile] = await db
    .select()
    .from(playerProfiles)
    .where(
      and(
        eq(sql`lower(${playerProfiles.trainerName})`, name.toLowerCase()),
        isNotNull(playerProfiles.starterSpeciesId),
      ),
    );
  if (!profile) throw new GameError(404, 'TRAINER_NOT_FOUND');
  return profile;
}

/** Fiches Dresseur des autres joueurs : recherche, fiche, Pokédex ; vitrine de sa propre fiche. */
export async function trainerRoutes(app: FastifyInstance, { db, content, hooks }: Deps) {
  app.addHook('preHandler', hooks.requireUser);

  app.get('/api/trainers', async (request): Promise<TrainerSearchResultDto[]> => {
    const { q } = trainerSearchQuerySchema.parse(request.query);
    // Ni la casse ni les accents ne comptent : « eloise » trouve « Éloïse ».
    const lower = searchKey(q);
    const pattern = `%${lower.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const name = sql<string>`translate(lower(${playerProfiles.trainerName}), ${ACCENTED}, ${UNACCENTED})`;
    return (
      db
        .select({
          trainerName: playerProfiles.trainerName,
          starterSpeciesId: playerProfiles.starterSpeciesId,
        })
        .from(playerProfiles)
        .where(and(isNotNull(playerProfiles.starterSpeciesId), like(name, pattern)))
        // Nom exact, puis noms qui commencent par la recherche, puis ordre alphabétique.
        .orderBy(sql`${name} = ${lower} desc`, sql`starts_with(${name}, ${lower}) desc`, asc(name))
        .limit(SEARCH_LIMIT)
    );
  });

  app.get('/api/trainers/:name', async (request): Promise<TrainerProfileResponse> => {
    const { name } = nameParams.parse(request.params);
    const profile = await findTrainer(db, name);
    const ctx = await content.get();
    const [progress, card, shiny] = await Promise.all([
      playerProgress(db, ctx, profile.userId),
      trainerCard(db, ctx, profile.userId),
      db
        .select({ speciesId: pokedex.speciesId })
        .from(pokedex)
        .where(and(eq(pokedex.ownerId, profile.userId), eq(pokedex.caughtShiny, true))),
    ]);
    return {
      trainerName: profile.trainerName,
      starterSpeciesId: profile.starterSpeciesId,
      createdAt: profile.createdAt.toISOString(),
      currency: profile.currency,
      isMe: profile.userId === request.user!.id,
      progress: {
        caughtSpeciesIds: [...progress.caughtSpeciesIds],
        caughtShinySpeciesIds: shiny.map((s) => s.speciesId),
        defeatedTrainerIds: [...progress.defeatedTrainerIds],
        eggsHatched: progress.eggsHatched,
        questSteps: Object.fromEntries(progress.questSteps ?? []),
      },
      card,
    };
  });

  app.get('/api/trainers/:name/pokedex', async (request): Promise<TrainerPokedexResponse> => {
    const { name } = nameParams.parse(request.params);
    const { userId } = await findTrainer(db, name);
    const [entries, forms] = await Promise.all([
      db.select().from(pokedex).where(eq(pokedex.ownerId, userId)).orderBy(asc(pokedex.speciesId)),
      db
        .select()
        .from(pokedexForms)
        .where(eq(pokedexForms.ownerId, userId))
        .orderBy(asc(pokedexForms.formId)),
    ]);
    return {
      entries: entries.map(({ ownerId: _, firstCaughtAt, ...r }) => ({
        ...r,
        firstCaughtAt: firstCaughtAt?.toISOString() ?? null,
      })),
      forms: forms.map(({ ownerId: _, firstCaughtAt, ...r }) => ({
        ...r,
        firstCaughtAt: firstCaughtAt.toISOString(),
      })),
    };
  });

  /** Pokémon du PC mis en avant sur sa Fiche Dresseur (remplace la sélection). */
  app.put('/api/trainer-card/featured', async (request): Promise<FeaturedPokemonDto[]> => {
    const { pokemonIds } = featuredPokemonInputSchema.parse(request.body);
    const userId = request.user!.id;
    if (pokemonIds.length > 0) {
      const owned = await db
        .select({ id: pokemon.id })
        .from(pokemon)
        .where(and(eq(pokemon.ownerId, userId), inArray(pokemon.id, pokemonIds)));
      if (owned.length !== pokemonIds.length) throw new GameError(404, 'POKEMON_NOT_FOUND');
    }
    const updated = await db
      .update(playerProfiles)
      .set({ featuredPokemonIds: pokemonIds })
      .where(eq(playerProfiles.userId, userId))
      .returning({ userId: playerProfiles.userId });
    if (updated.length === 0) throw new GameError(409, 'NO_PROFILE');
    return featuredPokemon(db, userId);
  });
}
