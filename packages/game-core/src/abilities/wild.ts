import type { GameContext } from '../context';
import type { Gender, PokemonInstance } from '../pokemon';
import type { Rng } from '../rng';
import { activeAbilityEffects } from './effects';
import type { AbilityEnv } from './env';

/**
 * Effets des talents sur les rencontres d'expédition : types attirés, Pokémon sauvages modifiés.
 */

/** Multiplicateur de poids des rencontres par type (Magnépiège, Statik…). */
export function attractedTypes(ctx: GameContext, env: AbilityEnv): Map<string, number> {
  const percents = new Map<string, number>();
  for (const { effect } of activeAbilityEffects(ctx, env)) {
    if (effect.type !== 'attractType') continue;
    percents.set(effect.pokemonType, (percents.get(effect.pokemonType) ?? 0) + effect.percent);
  }
  return new Map([...percents].map(([t, p]) => [t, Math.max(0, 1 + p / 100)]));
}

/**
 * Synchro et Joli Sourire : appliqués à un Pokémon sauvage tout juste généré. Aucun tirage sans
 * effet actif (les seeds des équipes sans ces talents restent inchangés).
 */
export function applyWildAbilities(
  ctx: GameContext,
  env: AbilityEnv,
  rng: Rng,
  wild: PokemonInstance,
): void {
  for (const { holder, effect } of activeAbilityEffects(ctx, env)) {
    const member = env.team[holder]!;
    if (effect.type === 'syncNature' && member.nature) {
      if (rng.chance(effect.chance)) wild.nature = member.nature;
    } else if (effect.type === 'attractGender' && wild.gender !== 'genderless') {
      const opposite: Gender | null =
        member.gender === 'male' ? 'female' : member.gender === 'female' ? 'male' : null;
      const species = ctx.species(wild.speciesId, wild.formId);
      // Espèces exclusivement mâles ou femelles : pas de changement possible.
      const mixed = species && species.genderRate > 0 && species.genderRate < 8;
      if (opposite && mixed && rng.chance(effect.chance)) wild.gender = opposite;
    }
  }
}
