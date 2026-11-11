import { useQuery } from '@tanstack/react-query';
import type {
  FavoritePokemonDto,
  FavoritePokemonInput,
  FeaturedPokemonDto,
  FeaturedPokemonInput,
  LeaderboardKind,
  LeaderboardResponse,
  TrainerCardResponse,
  TrainerPokedexResponse,
  TrainerProfileResponse,
  TrainerSearchResultDto,
} from '@poke/shared';
import { api } from '../api';
import { keys } from './keys';

/**
 * Les dresseurs : sa Fiche Dresseur, les classements, la fiche et le Pokédex des autres joueurs.
 */

/** Statistiques cumulées de la Fiche Dresseur. */
export const useTrainerCard = (enabled = true) =>
  useQuery({
    queryKey: keys.trainerCard,
    enabled,
    queryFn: () => api<TrainerCardResponse>('/api/trainer-card'),
  });

/** Classement entre joueurs (rafraîchi au plus toutes les minutes). */
export const useLeaderboard = (kind: LeaderboardKind, enabled = true) =>
  useQuery({
    queryKey: ['leaderboard', kind],
    queryFn: () => api<LeaderboardResponse>(`/api/leaderboard/${kind}`),
    staleTime: 60_000,
    enabled,
  });

/** Fiche Dresseur d'un joueur, retrouvé par son nom. */
export const useTrainerProfile = (name: string) =>
  useQuery({
    queryKey: ['trainers', name.toLowerCase()],
    queryFn: () => api<TrainerProfileResponse>(`/api/trainers/${encodeURIComponent(name)}`),
    staleTime: 60_000,
  });

/** Pokédex d'un autre joueur (lecture seule). */
export const useTrainerPokedex = (name: string) =>
  useQuery({
    queryKey: ['trainers', name.toLowerCase(), 'pokedex'],
    queryFn: () => api<TrainerPokedexResponse>(`/api/trainers/${encodeURIComponent(name)}/pokedex`),
    staleTime: 60_000,
  });

/** Dresseurs dont le nom contient la recherche. */
export const useTrainerSearch = (query: string) =>
  useQuery({
    queryKey: ['trainers', 'search', query.toLowerCase()],
    queryFn: () => api<TrainerSearchResultDto[]>(`/api/trainers?q=${encodeURIComponent(query)}`),
    enabled: query.length > 0,
    staleTime: 30_000,
  });

// --- Requêtes d'action ---------------------------------------------------------------------

/** Choisit son Pokémon favori (`null` : revenir au starter). */
export const setFavoritePokemon = (favorite: FavoritePokemonDto | null) =>
  api<FavoritePokemonDto | null>('/api/trainer-card/favorite', {
    method: 'PUT',
    json: { favorite } satisfies FavoritePokemonInput,
  });

/** Choisit les Pokémon de sa vitrine, dans l'ordre. */
export const setFeaturedPokemon = (pokemonIds: string[]) =>
  api<FeaturedPokemonDto[]>('/api/trainer-card/featured', {
    method: 'PUT',
    json: { pokemonIds } satisfies FeaturedPokemonInput,
  });
