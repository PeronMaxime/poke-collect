import { z } from 'zod';

/**
 * Étiquettes posées sur les Pokémon, et modification d'un Pokémon (verrou, étiquettes).
 */

export const TAG_LABEL_MAX = 10;

export const MAX_TAGS = 50;

export const updatePokemonInputSchema = z
  .object({ locked: z.boolean(), tagIds: z.array(z.uuid()).max(MAX_TAGS) })
  .partial()
  .refine((v) => v.locked !== undefined || v.tagIds !== undefined, 'Rien à modifier');

export type UpdatePokemonInput = z.infer<typeof updatePokemonInputSchema>;

export const tagInputSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, 'Texte obligatoire')
    .max(TAG_LABEL_MAX, `Au plus ${TAG_LABEL_MAX} caractères`),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, 'Couleur invalide'),
});

export type TagInput = z.infer<typeof tagInputSchema>;

/** Étiquette collée sur des Pokémon du joueur (plusieurs possibles par Pokémon). */
export interface PokemonTagDto {
  id: string;
  label: string;
  /** Couleur de fond, `#rrggbb`. */
  color: string;
}
