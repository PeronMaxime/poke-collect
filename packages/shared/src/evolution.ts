import { z } from 'zod';
import { utcOffsetSchema } from './internal';
import type { PokemonDto } from './pokemon';

/**
 * Évolutions.
 */

export const evolveInputSchema = z.object({
  toSpeciesId: z.int().positive(),
  /** Forme d'arrivée (Raichu d'Alola) ; absente = première évolution vers l'espèce. */
  toFormId: z.int().positive().nullish(),
  /** Décalage de l'heure locale du joueur par rapport à UTC (évolutions de jour ou de nuit). */
  utcOffsetMinutes: utcOffsetSchema,
});

export type EvolveInput = z.infer<typeof evolveInputSchema>;

export interface EvolveResponse {
  pokemon: PokemonDto;
  fromSpeciesId: number;
  fromFormId: number | null;
  /** Objet consommé (pierre, Câble Link…). */
  consumedItemId: string | null;
  /** Espèces obtenues pour la première fois. */
  newSpeciesIds: number[];
  /** Formes (régionales, Méga…) obtenues pour la première fois. */
  newFormIds: number[];
}
