import { z } from 'zod';
import { slugSchema } from '@poke/content';
import { STAT_NAMES } from '@poke/data';
import type { StatName } from '@poke/data';
import type { PokemonDto } from './pokemon';

/**
 * Objets utilisés sur un Pokémon (Capsules, Aromates, Pilule et Patch Talent) et Méga-Évolution.
 */

export const useItemInputSchema = z.object({
  itemId: slugSchema,
  /** Capsule d'Argent : statistique à monter à 31. */
  stat: z.enum(STAT_NAMES as [StatName, ...StatName[]]).optional(),
});

export type UseItemInput = z.infer<typeof useItemInputSchema>;

/** Méga-Évolution : Méga-Gemme du sac donnée à tenir au Pokémon. */
export const megaEvolveInputSchema = z.object({ itemId: slugSchema });

export type MegaEvolveInput = z.infer<typeof megaEvolveInputSchema>;

export interface UseItemResponse {
  pokemon: PokemonDto;
  itemId: string;
  /** Quantité restante dans le sac. */
  remaining: number;
}
