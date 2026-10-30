import type { FacilityId, FacilityUnlock } from '@poke/content';
import { ASSISTANT_POST_PLACES } from './abilities';
import type { GameContext } from './context';
import { FARM_PLOTS } from './farm';
import { isUnlocked } from './progress';
import type { PlayerProgress } from './progress';
import { NO_CLAIMS, claimedIncubators, playerSlots } from './progression';
import type { ClaimedRewards } from './progression';

/**
 * Bâtiments à débloquer : emplacements d'expédition, pensions, couveuses, places du Musée,
 * parcelles de la ferme et Centres Pokémon.
 * Chacun part d'un nombre de places (équilibrage) et en gagne à chaque palier de
 * `balance.facilityUnlocks` dont la condition est remplie (évaluation paresseuse, rien à réclamer).
 * Une place déjà occupée au-delà du total (réglage baissé) se vide normalement.
 */

/** Places ajoutées par une unité de palier : une couveuse et un Centre Pokémon comptent 6 places, le reste 1. */
export const FACILITY_UNIT_PLACES: Record<FacilityId, number> = {
  expedition: 1,
  daycare: 1,
  incubator: ASSISTANT_POST_PLACES.incubator,
  museum: 1,
  farm: 1,
  center: ASSISTANT_POST_PLACES.center,
};

/** Paliers du bâtiment, dans l'ordre de l'admin. */
export function facilityUnlocks(ctx: GameContext, facility: FacilityId): FacilityUnlock[] {
  return ctx.balance.facilityUnlocks?.[facility] ?? [];
}

/** Places au départ (hors expéditions et pensions, qui comptent aussi les récompenses). */
function basePlaces(
  ctx: GameContext,
  facility: Exclude<FacilityId, 'expedition' | 'daycare'>,
): number {
  switch (facility) {
    case 'incubator':
      return ctx.balance.breeding.maxEggs;
    case 'museum':
      return ctx.balance.museum.slots;
    case 'farm':
      return ctx.balance.farm?.initialPlots ?? FARM_PLOTS;
    case 'center':
      return ctx.balance.center.slots;
  }
}

/** Places gagnées par les paliers remplis. */
function unlockedPlaces(ctx: GameContext, facility: FacilityId, progress: PlayerProgress): number {
  return facilityUnlocks(ctx, facility)
    .filter((step) => isUnlocked(ctx, step.unlock, progress))
    .reduce((sum, step) => sum + step.amount * FACILITY_UNIT_PLACES[facility], 0);
}

/**
 * Places ouvertes au joueur : départ + paliers remplis (+ récompenses réclamées pour les
 * expéditions, les pensions et les couveuses, + parcelles achetées pour la ferme) ; seules les
 * expéditions ont un maximum.
 */
export function facilityPlaces(
  ctx: GameContext,
  facility: FacilityId,
  progress: PlayerProgress,
  claimed: ClaimedRewards = NO_CLAIMS,
): number {
  if (facility === 'expedition') {
    const total = playerSlots(ctx, claimed).expeditions + unlockedPlaces(ctx, facility, progress);
    return Math.min(ctx.balance.expeditions.maxSlots, total);
  }
  const base =
    facility === 'daycare'
      ? playerSlots(ctx, claimed).daycare
      : basePlaces(ctx, facility) +
        (facility === 'incubator'
          ? claimedIncubators(ctx, claimed) * FACILITY_UNIT_PLACES.incubator
          : 0) +
        (facility === 'farm' ? (claimed.farmPlots ?? 0) : 0);
  return base + unlockedPlaces(ctx, facility, progress);
}
