import { z } from 'zod';

/**
 * Assistants des bâtiments.
 */

/**
 * Pokémon affecté à une place d'un bâtiment (`daycare`, `incubator`, `museum`, `center`, `farm`) : son
 * talent agit sur ce qui occupe cette place.
 */
export interface AssistantDto {
  post: 'daycare' | 'incubator' | 'museum' | 'center' | 'farm' | 'harvest';
  /** Place du bâtiment (pension, place de la couveuse, du Musée ou du Centre). */
  slot: number;
  pokemonId: string;
}

export const assignAssistantInputSchema = z.object({ pokemonId: z.uuid() });

export type AssignAssistantInput = z.infer<typeof assignAssistantInputSchema>;
