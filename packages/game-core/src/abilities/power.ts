import type { GameContext } from '../context';
import { pokemonPower } from '../pokemon';
import type { PokemonInstance } from '../pokemon';
import { effectiveAbility } from './env';
import type { AbilityEnv } from './env';
import { abilityModifier } from './modifiers';

/**
 * PE d'un membre et d'une équipe, talents compris.
 */

type PowerHolder = Pick<
  PokemonInstance,
  'speciesId' | 'formId' | 'level' | 'ivs' | 'nature' | 'ability'
>;

/**
 * PE d'un Pokémon, bonus de PE de son talent compris. Sans environnement (affichage au PC),
 * seuls les effets sans condition comptent.
 */
export function memberPower(
  ctx: GameContext,
  pokemon: PowerHolder,
  env?: AbilityEnv,
  index = 0,
): number {
  const species = ctx.species(pokemon.speciesId, pokemon.formId);
  if (!species) return 0;
  const power = pokemonPower(species, pokemon);
  let percent = 0;
  if (env) {
    percent = abilityModifier(ctx, env, 'power', index);
  } else {
    for (const effect of ctx.ability(effectiveAbility(ctx, pokemon))?.effects ?? []) {
      if (effect.type === 'modifier' && effect.param === 'power' && effect.conditions.length === 0)
        percent += effect.value;
    }
  }
  return percent ? Math.max(0, Math.round(power * (1 + percent / 100))) : power;
}

/** PE de chaque membre dans l'activité (talents de toute l'équipe compris). */
export function teamMemberPowers(
  ctx: GameContext,
  team: readonly PowerHolder[],
  env: AbilityEnv,
): number[] {
  return team.map((m, i) => memberPower(ctx, m, env, i));
}
