import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  favoritePokemonInputSchema,
  featuredPokemonInputSchema,
  trainerSearchQuerySchema,
} from '@poke/shared';
import type {
  FavoritePokemonDto,
  FeaturedPokemonDto,
  TrainerPokedexResponse,
  TrainerProfileResponse,
  TrainerSearchResultDto,
} from '@poke/shared';
import { setFavorite } from '../game/favorite';
import {
  searchTrainers,
  setFeaturedPokemon,
  trainerPokedex,
  trainerProfile,
} from '../game/trainers';
import { currentUserId } from './deps';
import type { RouteDeps } from './deps';

const nameParams = z.object({ name: z.string().trim().min(1).max(16) });

/** Fiches Dresseur des autres joueurs : recherche, fiche, Pokédex ; vitrine de sa propre fiche. */
export async function trainerRoutes(app: FastifyInstance, { db, content, hooks }: RouteDeps) {
  app.addHook('preHandler', hooks.requireUser);

  app.get('/api/trainers', async (request): Promise<TrainerSearchResultDto[]> => {
    const { q } = trainerSearchQuerySchema.parse(request.query);
    return searchTrainers(db, q);
  });

  app.get('/api/trainers/:name', async (request): Promise<TrainerProfileResponse> => {
    const { name } = nameParams.parse(request.params);
    return trainerProfile(db, () => content.get(), name, currentUserId(request));
  });

  app.get('/api/trainers/:name/pokedex', async (request): Promise<TrainerPokedexResponse> => {
    const { name } = nameParams.parse(request.params);
    return trainerPokedex(db, name);
  });

  /** Pokémon favori de sa Fiche Dresseur (null : revenir au starter). */
  app.put('/api/trainer-card/favorite', async (request): Promise<FavoritePokemonDto | null> => {
    const { favorite } = favoritePokemonInputSchema.parse(request.body);
    return setFavorite(db, currentUserId(request), favorite);
  });

  /** Pokémon du PC mis en avant sur sa Fiche Dresseur (remplace la sélection). */
  app.put('/api/trainer-card/featured', async (request): Promise<FeaturedPokemonDto[]> => {
    const { pokemonIds } = featuredPokemonInputSchema.parse(request.body);
    return setFeaturedPokemon(db, currentUserId(request), pokemonIds);
  });
}
