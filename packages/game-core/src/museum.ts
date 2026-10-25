import type { ItemEffect } from '@poke/content';
import { abilityFlat, abilityMultiplier, applyWildAbilities } from './abilities';
import type { AbilityEnv, AbilityHolder } from './abilities';
import type { GameContext } from './context';
import { generatePokemon, withPerfectIvs } from './pokemon';
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

const museumEnv = (helper: AbilityHolder | null | undefined): AbilityEnv => ({
  activity: 'museum',
  team: helper ? [helper] : [],
});

/** Durée de restauration d'un fossile, modifiée par le talent de l'assistant du Musée. */
export function restoreMinutes(
  ctx: GameContext,
  effect: Pick<FossilEffect, 'minutes'>,
  helper?: AbilityHolder | null,
): number {
  return Math.max(
    1,
    Math.round(effect.minutes * abilityMultiplier(ctx, museumEnv(helper), 'restoreTime')),
  );
}

/**
 * Fossile restauré : généré comme un Pokémon sauvage (Charme Chroma compris), puis les talents
 * de l'assistant du Musée au dépôt (shiny, IV parfaits, talent caché, Synchro).
 */
export function reviveFossil(
  ctx: GameContext,
  input: {
    seed: number;
    speciesId: number;
    formId: number | null;
    level: number;
    shinyCharm?: number;
    helper?: AbilityHolder | null;
  },
): PokemonInstance {
  const rng = createRng(input.seed);
  const env = museumEnv(input.helper);
  const pokemon = generatePokemon(ctx, rng, input.speciesId, input.level, {
    shinyProbability: Math.min(
      1,
      shinyProbability(ctx, { charm: input.shinyCharm ?? 1 }) *
        abilityMultiplier(ctx, env, 'shinyChance'),
    ),
    formId: input.formId,
  });
  // Tirages en plus seulement si un talent joue : les fossiles déjà déposés restent identiques.
  const perfect = abilityFlat(ctx, env, 'perfectIvs', 0, 6);
  if (perfect > 0) pokemon.ivs = withPerfectIvs(rng, pokemon.ivs, perfect);
  applyWildAbilities(ctx, env, rng, pokemon);
  return pokemon;
}
