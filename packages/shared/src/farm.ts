import { z } from 'zod';
import { slugSchema } from '@poke/content';

/**
 * Ferme à baies.
 */

export const plantBerryInputSchema = z.object({
  plotIndex: z.int().min(0).max(999),
  itemId: slugSchema,
});

export type PlantBerryInput = z.infer<typeof plantBerryInputSchema>;

/** Baie plantée dans une parcelle du champ. */
export interface BerryPlotDto {
  plotIndex: number;
  itemId: string;
  plantedAt: string;
  /** Durée totale de pousse, en millisecondes, à la vitesse actuelle du champ (talent de l'arroseur). */
  growMs: number;
  /** Pousse restante quand elle est en pause (`readyAt` null), en millisecondes. */
  remainingMs: number;
  /** Maturité prévue tant que le champ est arrosé ; null = pousse en pause (pas d'assistant Eau). */
  readyAt: string | null;
}

export interface FarmResponse {
  /** Parcelles du champ. */
  plots: number;
  serverTime: string;
  planted: BerryPlotDto[];
}

export interface HarvestBerriesResponse {
  /** Baies récoltées, par objet (bonus de l'assistant de récolte compris). */
  harvested: { itemId: string; quantity: number }[];
}
