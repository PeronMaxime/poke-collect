import { z } from 'zod';
import { slugSchema } from '@poke/content';

/**
 * Centre Pokémon : soins et rappels.
 */

/** Pokémon K.O. à soigner (dans la limite des places libres du Centre). */
export const healPokemonInputSchema = z.object({ pokemonIds: z.array(z.uuid()).min(1).max(999) });

export type HealPokemonInput = z.infer<typeof healPokemonInputSchema>;

/** Pokémon K.O. ranimés par un objet `revive` (un objet par Pokémon). */
export const revivePokemonInputSchema = z.object({
  itemId: slugSchema,
  pokemonIds: z.array(z.uuid()).min(1).max(100),
});

export type RevivePokemonInput = z.infer<typeof revivePokemonInputSchema>;
