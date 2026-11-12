import type { ItemStack } from '@poke/content';
import type { GameContext } from '../context';
import { durationWithAbility } from '../abilities';
import type { AbilityEnv } from '../abilities';
import { EPSILON, encounterClock, encounterTime } from './cadence';

/**
 * Le temps d'une expédition : durée minimale, cadence des rencontres (qui ralentit d'heure en
 * heure), nombre de rencontres au bout d'une durée, baies consommées.
 */

/** Temps avant de pouvoir arrêter l'expédition : au moins le temps d'une rencontre. */
export function expeditionMinMinutes(
  ctx: GameContext,
  minDurationMinutes: number,
  env?: AbilityEnv,
): number {
  const { encounterIntervalMinutes, maxDurationMinutes } = ctx.balance.expeditions;
  const minutes = env
    ? durationWithAbility(ctx, env, 'expeditionDuration', minDurationMinutes)
    : minDurationMinutes;
  return Math.min(maxDurationMinutes, Math.max(encounterIntervalMinutes, minutes));
}

/**
 * Rythme des rencontres : talents de l'équipe, baies de rencontres depuis le départ, et intervalle
 * qui s'allonge à chaque heure passée (par palier).
 */
export interface EncounterClock {
  /** Rencontres par minute pendant la première heure, talents compris (hors baies). */
  perMinute: number;
  boost: number;
  boostMinutes: number;
  /** Intervalle de base et son allongement par heure passée, en minutes ; absents = constant. */
  intervalMinutes?: number;
  intervalGrowthMinutes?: number;
}

/** Intervalle de base entre deux rencontres pendant l'heure `hour` (0 = la première). */
export function encounterIntervalAt(ctx: GameContext, hour: number): number {
  const { encounterIntervalMinutes, encounterIntervalGrowthMinutes } = ctx.balance.expeditions;
  return encounterIntervalMinutes + (encounterIntervalGrowthMinutes ?? 0) * Math.max(0, hour);
}

/**
 * Moment de la n-ième rencontre (à partir de 1), en minutes depuis le départ : talents de l'équipe,
 * baies de rencontres et allongement de l'intervalle (figé au départ, réglage actuel par défaut).
 */
export function encounterMinutes(
  ctx: GameContext,
  n: number,
  env?: AbilityEnv,
  encounterBerries?: ItemStack | null,
  growthMinutes?: number,
): number {
  return encounterTime(encounterClock(ctx, env, encounterBerries, growthMinutes), n);
}

/** Baies entamées après `minutes` : une pour chaque tranche d'effet commencée. */
export function berriesConsumed(ctx: GameContext, quantity: number, minutes: number): number {
  const slices = Math.ceil(minutes / ctx.balance.expeditions.berryDurationMinutes - EPSILON);
  return Math.min(quantity, Math.max(0, slices));
}

/** Baies utiles au plus sur une expédition : de quoi couvrir la durée maximale. */
export function maxExpeditionBerries(ctx: GameContext): number {
  const { maxDurationMinutes, berryDurationMinutes } = ctx.balance.expeditions;
  return Math.ceil(maxDurationMinutes / berryDurationMinutes - EPSILON);
}
