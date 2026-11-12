import type { AbilityParam } from '@poke/content';
import type { GameContext } from '../context';
import type { PlayerBonuses } from '../progression';
import { activeAbilityEffects } from './effects';
import type { AbilityEnv } from './env';
import { ABILITY_PARAMS } from './params';

/**
 * Valeur d'un paramètre une fois les talents actifs appliqués : multiplicateurs, bonus, durées.
 */

/**
 * Somme des valeurs d'un paramètre pour l'activité. Avec `self`, compte aussi les effets
 * réservés au Pokémon d'index `self` ; sans, seulement ceux qui visent toute l'équipe.
 */
export function abilityModifier(
  ctx: GameContext,
  env: AbilityEnv,
  param: AbilityParam,
  self?: number,
): number {
  const info = ABILITY_PARAMS[param];
  if (!info.activities.includes(env.activity)) return 0;
  let total = 0;
  for (const { holder, effect } of activeAbilityEffects(ctx, env)) {
    if (effect.type !== 'modifier' || effect.param !== param) continue;
    if (info.selfScope && effect.scope === 'self' && holder !== self) continue;
    total += effect.value;
  }
  return total;
}

/** Multiplicateur d'un paramètre en % (+10 → ×1,1), jamais négatif. */
export function abilityMultiplier(
  ctx: GameContext,
  env: AbilityEnv,
  param: AbilityParam,
  self?: number,
): number {
  return Math.max(0, 1 + abilityModifier(ctx, env, param, self) / 100);
}

/** Bonus du joueur augmentés des bonus de capture, d'XP et d'argent des talents de l'équipe. */
export function abilityBonuses(
  ctx: GameContext,
  env: AbilityEnv,
  bonuses: PlayerBonuses,
): PlayerBonuses {
  const result = { ...bonuses };
  for (const type of ['capture', 'xp', 'money'] as const) {
    result[type] = Math.max(0, result[type] + abilityModifier(ctx, env, type) / 100);
  }
  return result;
}

/** Bonheur gagné (les pertes ne sont pas modifiées). */
export function abilityHappiness(ctx: GameContext, env: AbilityEnv, delta: number): number {
  return delta > 0 ? Math.round(delta * abilityMultiplier(ctx, env, 'happiness')) : delta;
}

/** Quantité entière multipliée par un paramètre (arrondie au plus proche). */
export function scaledByAbility(
  ctx: GameContext,
  env: AbilityEnv,
  param: AbilityParam,
  count: number,
): number {
  return Math.max(0, Math.round(count * abilityMultiplier(ctx, env, param)));
}

/** Valeur fixe d'un paramètre (IV, niveaux, points de %), arrondie et bornée. */
export function abilityFlat(
  ctx: GameContext,
  env: AbilityEnv,
  param: AbilityParam,
  min: number,
  max: number,
): number {
  return Math.min(max, Math.max(min, Math.round(abilityModifier(ctx, env, param))));
}

/**
 * Durée en minutes multipliée par un paramètre, arrondie à la seconde (2 min − 10 % → 1 min 48 s) ;
 * au moins une seconde si elle était positive.
 */
export function durationWithAbility(
  ctx: GameContext,
  env: AbilityEnv,
  param: AbilityParam,
  minutes: number,
  self?: number,
): number {
  if (minutes <= 0) return minutes;
  const seconds = Math.round(minutes * 60 * abilityMultiplier(ctx, env, param, self));
  return Math.max(1, seconds) / 60;
}
