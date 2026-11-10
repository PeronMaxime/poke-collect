import { z } from 'zod';

/**
 * Transfert de Pokémon et Bonbons de lignée.
 */

/** Pokémon transférables par requête : au-delà, le client découpe en lots. */
export const TRANSFER_BATCH_MAX = 1000;

export const transferPokemonInputSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(TRANSFER_BATCH_MAX),
});

export type TransferPokemonInput = z.infer<typeof transferPokemonInputSchema>;

export interface CandyDto {
  /** Chaîne d'évolution PokéAPI. */
  lineageId: number;
  quantity: number;
}

export interface TransferPokemonResponse {
  transferred: number;
  /** Bonbons gagnés, par lignée. */
  gained: CandyDto[];
}

export const feedCandiesInputSchema = z.object({ count: z.int().min(1).max(10_000) });

export type FeedCandiesInput = z.infer<typeof feedCandiesInputSchema>;
