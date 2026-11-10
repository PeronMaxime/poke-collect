import { z } from 'zod';

/**
 * Équipes enregistrées (onglet « Équipe Pkmn »).
 */

export const TEAM_NAME_MAX = 20;

export const MAX_TEAMS = 30;

/** Taille maximale d'une équipe enregistrée (celle d'une équipe d'expédition, de combat ou de donjon). */
export const TEAM_MAX_SIZE = 6;

export const teamInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Nom obligatoire')
    .max(TEAM_NAME_MAX, `Au plus ${TEAM_NAME_MAX} caractères`),
  pokemonIds: z
    .array(z.uuid())
    .max(TEAM_MAX_SIZE)
    .refine((ids) => new Set(ids).size === ids.length, 'Pokémon en double'),
});

export type TeamInput = z.infer<typeof teamInputSchema>;

/**
 * Équipe enregistrée (page « Équipe Pkmn ») : un Pokémon n'appartient qu'à une équipe à la fois.
 * Les Pokémon transférés depuis sont déjà retirés de `pokemonIds`.
 */
export interface PokemonTeamDto {
  id: string;
  name: string;
  pokemonIds: string[];
}
