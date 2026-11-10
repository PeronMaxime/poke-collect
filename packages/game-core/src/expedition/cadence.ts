import type { ItemStack } from '@poke/content';
import type { GameContext } from '../context';
import { abilityMultiplier } from '../abilities';
import type { AbilityEnv } from '../abilities';
import type { EncounterClock } from './clock';

/**
 * Calcul de la cadence des rencontres : l'intervalle entre deux rencontres s'allonge à chaque
 * heure passée, par paliers. Interne au dossier ; `clock.ts` en est la partie publique.
 */

// Marge d'arrondi : 60 min / 3 min doit bien donner 20 rencontres.
export const EPSILON = 1e-9;

const HOUR_MINUTES = 60;

/**
 * Rythme des rencontres d'une expédition : talents de l'équipe, baies de rencontres, et allongement
 * de l'intervalle (`growthMinutes`, figé au départ, sinon celui de l'équilibrage).
 */
export function encounterClock(
  ctx: GameContext,
  env?: AbilityEnv,
  encounterBerries?: ItemStack | null,
  growthMinutes?: number,
): EncounterClock {
  const { encounterIntervalMinutes, encounterIntervalGrowthMinutes, berryDurationMinutes } =
    ctx.balance.expeditions;
  const effect = encounterBerries && ctx.itemEffect(encounterBerries.itemId, 'encounterBoost');
  return {
    perMinute: (env ? abilityMultiplier(ctx, env, 'encounters') : 1) / encounterIntervalMinutes,
    boost: effect ? effect.multiplier : 1,
    boostMinutes: effect ? encounterBerries.quantity * berryDurationMinutes : 0,
    intervalMinutes: encounterIntervalMinutes,
    intervalGrowthMinutes: growthMinutes ?? encounterIntervalGrowthMinutes ?? 0,
  };
}

/** Rythme (hors baies) pendant l'heure `hour` : les talents s'appliquent à l'intervalle allongé. */
function hourRate(clock: EncounterClock, hour: number): number {
  const growth = clock.intervalGrowthMinutes ?? 0;
  const interval = clock.intervalMinutes ?? 0;
  if (growth <= 0 || interval <= 0) return clock.perMinute;
  return (clock.perMinute * interval) / (interval + growth * hour);
}

/** Tranches de rythme constant, de proche en proche : une par heure, coupée à la fin des baies. */
function* clockSegments(clock: EncounterClock) {
  let start = 0;
  for (let hour = 0; ; hour++) {
    const end = (hour + 1) * HOUR_MINUTES;
    const rate = hourRate(clock, hour);
    if (start < clock.boostMinutes && clock.boostMinutes < end) {
      yield { start, end: clock.boostMinutes, rate: rate * clock.boost };
      start = clock.boostMinutes;
    }
    yield { start, end, rate: start < clock.boostMinutes ? rate * clock.boost : rate };
    start = end;
  }
}

/**
 * Horizon des calculs de rythme : un an. Les tranches horaires sont sans fin et, l'intervalle
 * s'allongeant, le nombre de rencontres ne croît plus qu'en logarithme du temps : sans borne, une
 * n-ième rencontre lointaine (stock de Balls « pour combien de temps ? ») ou une durée infinie
 * bouclerait des millions d'heures, voire sans fin (onglet gelé, 10 nov.). Au-delà : jamais.
 */
const MAX_CLOCK_MINUTES = 366 * 24 * HOUR_MINUTES;

/** Rencontres survenues après `minutes` : le temps sous l'effet d'une baie compte davantage. */
export function encountersAfter(clock: EncounterClock, minutes: number): number {
  const until = Math.min(minutes, MAX_CLOCK_MINUTES);
  if (!(until > 0)) return 0;
  let total = 0;
  for (const s of clockSegments(clock)) {
    if (s.start >= until) break;
    total += s.rate * (Math.min(s.end, until) - s.start);
  }
  return Math.floor(total + EPSILON);
}

/** Moment de la n-ième rencontre (à partir de 1) ; `Infinity` si elle n'arrive pas d'ici un an. */
export function encounterTime(clock: EncounterClock, n: number): number {
  if (n <= 0) return 0;
  if (!(clock.perMinute > 0) || !(n < Infinity)) return Infinity;
  let total = 0;
  for (const s of clockSegments(clock)) {
    if (s.start >= MAX_CLOCK_MINUTES) return Infinity;
    const count = s.rate * (s.end - s.start);
    if (total + count >= n - EPSILON) return Math.max(s.start, s.start + (n - total) / s.rate);
    total += count;
  }
  return Infinity; // jamais atteint : les tranches sont sans fin
}
