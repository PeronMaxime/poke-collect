import type { ItemEffect } from '@poke/content';
import type { GameContext } from './context';
import { generatePokemon } from './pokemon';
import type { PokemonInstance } from './pokemon';
import { createRng } from './rng';
import { shinyProbability } from './shiny';

/**
 * Musée : un fossile déposé redonne vie à un Pokémon après la durée de son effet. Le Pokémon
 * se calcule à la restauration, à partir du seed tiré au dépôt.
 */

export type FossilEffect = Extract<ItemEffect, { type: 'fossil' }>;

/** Effet « fossile » de l'objet ; absent si l'objet ne se dépose pas au Musée. */
export function fossilEffect(ctx: GameContext, itemId: string): FossilEffect | undefined {
  return ctx.itemEffect(itemId, 'fossil');
}

/** Fossile restauré : généré comme un Pokémon sauvage (Charme Chroma compris). */
export function reviveFossil(
  ctx: GameContext,
  input: {
    seed: number;
    speciesId: number;
    formId: number | null;
    level: number;
    shinyCharm?: number;
  },
): PokemonInstance {
  return generatePokemon(ctx, createRng(input.seed), input.speciesId, input.level, {
    shinyProbability: shinyProbability(ctx, { charm: input.shinyCharm ?? 1 }),
    formId: input.formId,
  });
}
