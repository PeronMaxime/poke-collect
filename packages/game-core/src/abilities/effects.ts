import type { AbilityCondition, AbilityEffect, ImposedWeather, Weather } from '@poke/content';
import type { GameContext } from '../context';
import { timeOfDayAt } from '../evolution';
import type { AbilityActivity } from './activities';
import { effectiveAbility } from './env';
import type { AbilityEnv, AbilityHolder } from './env';
import { ABILITY_PARAMS, effectActivities } from './params';

/**
 * Quels effets de talents sont actifs : conditions remplies, activité concernée, assistant utile.
 * La météo de l'activité se résout ici aussi : un talent peut l'imposer, sous conditions.
 */

/**
 * Météo imposée par le premier Pokémon de l'équipe dont le talent en impose une (Sécheresse,
 * ou temps clair qui annule celle du lieu) ; null = aucune.
 */
export function imposedWeather(ctx: GameContext, env: AbilityEnv): ImposedWeather | null {
  for (const [holder, member] of env.team.entries()) {
    for (const effect of ctx.ability(effectiveAbility(ctx, member))?.effects ?? []) {
      if (effect.type !== 'setWeather') continue;
      // Une condition de météo sur un effet qui impose la météo n'aurait pas de sens : ignorée.
      const ok = effect.conditions.every(
        (c) => c.type === 'weather' || conditionMet(ctx, env, holder, c),
      );
      if (ok) return effect.weather;
    }
  }
  return null;
}

/** Météo imposée, sinon celle du lieu ; null = temps clair. */
export const weatherOrClear = (weather: ImposedWeather | null | undefined): Weather | null =>
  weather === 'clear' ? null : (weather ?? null);

/** Météo de l'activité : celle imposée par un talent de l'équipe, sinon celle du lieu. */
export function resolveWeather(ctx: GameContext, env: AbilityEnv): Weather | null {
  if (env.weatherResolved) return env.weather ?? null;
  return weatherOrClear(imposedWeather(ctx, env) ?? env.weather);
}

/** Environnement dont la météo est résolue (talents compris). */
export function withResolvedWeather(ctx: GameContext, env: AbilityEnv): AbilityEnv {
  return env.weatherResolved
    ? env
    : { ...env, weather: resolveWeather(ctx, env), weatherResolved: true };
}

function conditionMet(
  ctx: GameContext,
  env: AbilityEnv,
  holder: number,
  condition: AbilityCondition,
): boolean {
  const any = (list: readonly string[] | undefined, wanted: readonly string[]) =>
    !!list && list.some((t) => wanted.includes(t));
  switch (condition.type) {
    case 'zoneType':
      return any(env.zoneTypes, condition.types);
    case 'opponentType':
      return any(env.opponentTypes, condition.types);
    case 'teamHasType':
      return env.team.some((m) => any(ctx.species(m.speciesId, m.formId)?.types, condition.types));
    case 'timeOfDay':
      return env.hour != null && timeOfDayAt(ctx, env.hour) === condition.time;
    case 'leader':
      return holder === 0;
    case 'solo':
      return env.team.length === 1;
    case 'weather':
      return !!env.weather && condition.weathers.includes(env.weather);
    // Conditions de l'instant (combat) : seulement pour les dégâts, voir `deferredAbilityEffects`.
    case 'hpBelow':
    case 'fullHp':
    case 'attackType':
    case 'attackCategory':
    case 'statused':
    case 'superEffective':
    case 'notVeryEffective':
      return false;
  }
}

export interface ActiveAbilityEffect {
  /** Index du Pokémon qui a le talent dans l'équipe. */
  holder: number;
  effect: AbilityEffect;
}

/**
 * Effets des talents de l'équipe dont les conditions sont remplies, sauf celles des types
 * `deferred`, renvoyées pour être évaluées plus tard (en combat, à chaque attaque).
 */
export function deferredAbilityEffects(
  ctx: GameContext,
  env: AbilityEnv,
  deferred: ReadonlySet<AbilityCondition['type']>,
): (ActiveAbilityEffect & { deferred: AbilityCondition[] })[] {
  const active: (ActiveAbilityEffect & { deferred: AbilityCondition[] })[] = [];
  env = withResolvedWeather(ctx, env);
  env.team.forEach((member, holder) => {
    for (const effect of ctx.ability(effectiveAbility(ctx, member))?.effects ?? []) {
      const later = effect.conditions.filter((c) => deferred.has(c.type));
      const now = effect.conditions.filter((c) => !deferred.has(c.type));
      if (now.every((c) => conditionMet(ctx, env, holder, c))) {
        active.push({ holder, effect, deferred: later });
      }
    }
  });
  return active;
}

/** Effets des talents de l'équipe dont les conditions sont remplies. */
export function activeAbilityEffects(ctx: GameContext, env: AbilityEnv): ActiveAbilityEffect[] {
  const active: ActiveAbilityEffect[] = [];
  env = withResolvedWeather(ctx, env);
  env.team.forEach((member, holder) => {
    for (const effect of ctx.ability(effectiveAbility(ctx, member))?.effects ?? []) {
      if (effect.conditions.every((c) => conditionMet(ctx, env, holder, c))) {
        active.push({ holder, effect });
      }
    }
  });
  return active;
}

/**
 * L'effet agit-il chez l'assistant d'un poste ? Un effet « lui seul » ne vise jamais l'assistant
 * (au Centre Pokémon, il vise le Pokémon soigné).
 */
export const helpsAsAssistant = (effect: AbilityEffect, activity: AbilityActivity): boolean =>
  effectActivities(effect).includes(activity) &&
  !(
    effect.type === 'modifier' &&
    effect.scope === 'self' &&
    ABILITY_PARAMS[effect.param].selfScope
  );

/** Effets des talents de l'équipe qui agissent dans l'activité de `env` (conditions remplies). */
export function activityAbilityEffects(ctx: GameContext, env: AbilityEnv): ActiveAbilityEffect[] {
  return activeAbilityEffects(ctx, env).filter(({ effect }) =>
    effectActivities(effect).includes(env.activity),
  );
}

/** Conditions que le joueur remplit en composant l'équipe : être en tête, partir seul. */
const PLACEMENT_CONDITION_TYPES: ReadonlySet<AbilityCondition['type']> = new Set([
  'leader',
  'solo',
]);

/**
 * Effets du talent de `pokemon` qui agiraient dans l'activité de `env` avec lui dans l'équipe
 * (ajouté à la fin s'il n'en fait pas partie, comparé par référence) : lieu, heure, météo et
 * équipiers comptent ; être en tête ou seul est supposé possible.
 */
export function possibleAbilityEffects(
  ctx: GameContext,
  env: AbilityEnv,
  pokemon: AbilityHolder,
): AbilityEffect[] {
  const team = env.team.includes(pokemon) ? env.team : [...env.team, pokemon];
  const withPokemon = withResolvedWeather(ctx, { ...env, team });
  const holder = team.indexOf(pokemon);
  return (ctx.ability(effectiveAbility(ctx, pokemon))?.effects ?? []).filter(
    (effect) =>
      effectActivities(effect).includes(env.activity) &&
      effect.conditions.every(
        (c) => PLACEMENT_CONDITION_TYPES.has(c.type) || conditionMet(ctx, withPokemon, holder, c),
      ),
  );
}
