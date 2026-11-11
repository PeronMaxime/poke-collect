import { playerBonuses } from '@poke/game-core';
import type { GameContext, PlayerBonuses } from '@poke/game-core';
import { useClaimedRewards } from '../../lib/queries';

/** Bonus permanents du joueur (collections, quêtes, complétions), pour les aperçus. */
export function usePlayerBonuses(ctx: GameContext): PlayerBonuses {
  return playerBonuses(ctx, useClaimedRewards());
}

export const formatXp = (xp: number) => `${xp.toLocaleString('fr-FR')} XP`;
