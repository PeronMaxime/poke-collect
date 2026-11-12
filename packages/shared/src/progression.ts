import { z } from 'zod';
import { slugSchema } from '@poke/content';
import type { FacilityId, ProgressReward } from '@poke/content';
import type { PlayerBonuses, PlayerSlots, RewardKind } from '@poke/game-core';

/**
 * Progression : collections et complétions d'expédition à réclamer.
 */

export interface RewardClaimDto {
  kind: RewardKind;
  rewardId: string;
  claimedAt: string;
}

export interface ProgressionResponse {
  claims: RewardClaimDto[];
  /** Emplacements débloqués (départ + récompenses réclamées et paliers des bâtiments). */
  slots: PlayerSlots;
  /**
   * Places ouvertes de chaque bâtiment (départ + paliers remplis, + récompenses pour les
   * expéditions, les pensions et les couveuses).
   */
  facilities: Record<FacilityId, number>;
  /** Multiplicateurs permanents (1 = aucun bonus). */
  bonuses: PlayerBonuses;
}

export const claimRewardInputSchema = z.object({
  kind: z.enum(['collection', 'completion']),
  rewardId: slugSchema,
  /** Complétion d'expédition : l'expédition ou la région complétée. */
  targetId: slugSchema.optional(),
});

export type ClaimRewardInput = z.infer<typeof claimRewardInputSchema>;

export interface ClaimRewardResponse {
  kind: RewardKind;
  rewardId: string;
  targetId?: string;
  rewards: ProgressReward;
  /** Solde après la récompense. */
  currency: number;
  slots: PlayerSlots;
}
