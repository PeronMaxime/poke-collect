import { z } from 'zod';
import type { Stats } from '@poke/data';
import type { Gender } from '@poke/game-core';
import type { PokedexEntryDto, PokedexFormEntryDto } from './pokemon';
import type { FavoritePokemonDto } from './profile';

/**
 * Fiche Dresseur, vitrine, et fiches des autres dresseurs.
 */

/** Statistiques cumulées du joueur (calculées à partir de son historique). */
export interface TrainerCardResponse {
  /** Pokémon capturés en expédition (transférés compris). */
  captures: number;
  /** Pokémon actuellement possédés, dont chromatiques. */
  pokemonOwned: number;
  shiniesOwned: number;
  /** Pokémon chromatiques rencontrés en expédition mais pas capturés. */
  shiniesMissed: number;
  expeditionsCompleted: number;
  battlesWon: number;
  battlesLost: number;
  /** Dresseurs différents battus au moins une fois. */
  trainersDefeated: number;
  eggsHatched: number;
  fossilsRevived: number;
  questsCompleted: number;
  /** Poké Dollars dépensés en boutique. */
  moneySpent: number;
  /** Donjons réussis au total (toutes victoires confondues). */
  dungeonsCleared: number;
  /** Méga-Gemmes différentes possédées (sac ou tenues par un Pokémon). */
  megaStonesOwned: number;
  /** Pokémon mis en avant, dans l'ordre choisi (les Pokémon transférés en sont retirés). */
  featured: FeaturedPokemonDto[];
  /** Guilde du dresseur. */
  guild: { id: string; name: string } | null;
}

export const FEATURED_POKEMON_MAX = 6;

export const featuredPokemonInputSchema = z.object({
  pokemonIds: z
    .array(z.uuid())
    .max(FEATURED_POKEMON_MAX)
    .refine((ids) => new Set(ids).size === ids.length, 'Pokémon en double'),
});

export type FeaturedPokemonInput = z.infer<typeof featuredPokemonInputSchema>;

/** Pokémon du PC mis en avant sur la Fiche Dresseur (visible des autres joueurs). */
export interface FeaturedPokemonDto {
  id: string;
  speciesId: number;
  formId: number | null;
  level: number;
  isShiny: boolean;
  gender: Gender;
  nature: string;
  ability: string;
  ivs: Stats;
  caughtAt: string;
}

/** Résultat de la recherche d'un dresseur par son nom. */
export interface TrainerSearchResultDto {
  trainerName: string;
  /** Pokémon favori (le starter s'il n'en a pas choisi). */
  favorite: FavoritePokemonDto | null;
}

export const trainerSearchQuerySchema = z.object({ q: z.string().trim().min(1).max(16) });

/** Fiche Dresseur d'un joueur (la sienne ou celle d'un autre). */
export interface TrainerProfileResponse {
  trainerName: string;
  /** Pokémon favori (le starter s'il n'en a pas choisi). */
  favorite: FavoritePokemonDto | null;
  createdAt: string;
  currency: number;
  isMe: boolean;
  /** Avancement, pour les badges et les régions débloquées. */
  progress: {
    caughtSpeciesIds: number[];
    caughtShinySpeciesIds: number[];
    defeatedTrainerIds: string[];
    eggsHatched: number;
    /** Étapes validées de chaque quête commencée. */
    questSteps: Record<string, number>;
    /** Régions ouvertes pour de bon. */
    openedRegionIds: string[];
  };
  card: TrainerCardResponse;
}

/** Pokédex d'un autre joueur (lecture seule). */
export interface TrainerPokedexResponse {
  entries: PokedexEntryDto[];
  forms: PokedexFormEntryDto[];
}
