import { z } from 'zod';
import type { FavoritePokemonDto } from './profile';

/**
 * Classements des dresseurs.
 */

/** Classements entre joueurs : espèces capturées, argent, badges, espèces chromatiques. */
export const leaderboardKindSchema = z.enum(['species', 'money', 'badges', 'shiny']);

export type LeaderboardKind = z.infer<typeof leaderboardKindSchema>;

export interface LeaderboardEntryDto {
  /** Rang (ex æquo : même rang, le suivant saute d'autant). */
  rank: number;
  trainerName: string;
  /** Pokémon favori (le starter s'il n'en a pas choisi). */
  favorite: FavoritePokemonDto | null;
  value: number;
  isMe: boolean;
}

export interface LeaderboardResponse {
  kind: LeaderboardKind;
  /** Premiers du classement. */
  entries: LeaderboardEntryDto[];
  /** Place du joueur, même hors des premiers (null sans starter choisi). */
  me: LeaderboardEntryDto | null;
  /** Dresseurs classés. */
  total: number;
}
