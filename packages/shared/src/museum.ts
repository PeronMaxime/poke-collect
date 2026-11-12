import { z } from 'zod';
import { slugSchema } from '@poke/content';
import type { PokemonDto } from './pokemon';

/**
 * Musée : fossiles à restaurer.
 */

export const depositFossilInputSchema = z.object({ itemId: slugSchema });

export type DepositFossilInput = z.infer<typeof depositFossilInputSchema>;

/** Fossile en cours de restauration au Musée. */
export interface FossilRevivalDto {
  id: string;
  itemId: string;
  speciesId: number;
  formId: number | null;
  /** Place du Musée. */
  slotIndex: number;
  startedAt: string;
  readyAt: string;
}

export interface MuseumResponse {
  /** Fossiles restaurables en même temps. */
  slots: number;
  serverTime: string;
  revivals: FossilRevivalDto[];
}

export interface ReviveFossilsResponse {
  revived: PokemonDto[];
  /** Espèces obtenues pour la première fois. */
  newSpeciesIds: number[];
  /** Formes (régionales, Méga…) obtenues pour la première fois. */
  newFormIds: number[];
}
