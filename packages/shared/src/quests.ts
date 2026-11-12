import type { QuestReward } from '@poke/content';
import type { PlayerSlots, QuestStatus } from '@poke/game-core';

/**
 * Quêtes.
 */

/** Avancement d'une quête visible (débloquée ou commencée) ; les quêtes absentes sont verrouillées. */
export interface QuestProgressDto {
  questId: string;
  status: Exclude<QuestStatus, 'locked'>;
  /** Étapes validées (= index de l'étape en cours). */
  step: number;
  /** Compteur de l'étape en cours (captures, expéditions). */
  count: number;
  stepStartedAt: string;
  completedAt: string | null;
  claimedAt: string | null;
  /** Pokémon de la récompense déjà capturés (combat légendaire ou fuyard). */
  pokemonCaught: number;
  /** Relâcher son légendaire fait recommencer toute la quête (capturé avant sa réécriture). */
  restartOnRelease: boolean;
}

export interface QuestsResponse {
  quests: QuestProgressDto[];
}

export interface ClaimQuestResponse {
  questId: string;
  /** Les Pokémon de la récompense se capturent ensuite (combat légendaire ou fuyard). */
  rewards: QuestReward;
  currency: number;
  slots: PlayerSlots;
}
