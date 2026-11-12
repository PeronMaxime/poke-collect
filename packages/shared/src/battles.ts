import { z } from 'zod';
import { slugSchema } from '@poke/content';
import type {
  BattleError,
  BattleResult,
  DungeonCommand,
  DungeonOutcome,
  DungeonSetup,
} from '@poke/game-core';
import { MOVE_CATEGORIES } from '@poke/game-core';
import { utcOffsetSchema } from './internal';

/**
 * Combats de dresseurs (et les ordres communs à tous les combats en temps réel).
 */

/** Attaque choisie pour un Pokémon (combats de dresseurs et donjons). */
export const dungeonMoveSchema = z.object({
  type: z.string().min(1).max(32),
  category: z.enum(MOVE_CATEGORIES),
});

/** Équipe dans l'ordre (le premier entre en combat), avec l'attaque de chacun. */
export const startBattleInputSchema = z
  .object({
    trainerId: slugSchema,
    team: z.array(z.uuid()).min(1).max(6),
    moves: z.array(dungeonMoveSchema).min(1).max(6),
    /** Heure locale du joueur (talents de jour ou de nuit). */
    utcOffsetMinutes: utcOffsetSchema.optional(),
  })
  .refine((i) => i.moves.length === i.team.length, {
    message: 'Une attaque par Pokémon',
    path: ['moves'],
  });

export type StartBattleInput = z.infer<typeof startBattleInputSchema>;

export interface StoredBattleResult extends BattleResult {
  /** Badge obtenu lors de ce combat (première victoire). */
  badgeEarned: boolean;
}

/** Combat de dresseur en temps réel (même déroulé qu'une tentative de donjon). */
export interface BattleDto {
  id: string;
  trainerId: string;
  team: string[];
  setup: DungeonSetup;
  commands: DungeonCommand[];
  fledAtMs: number | null;
  contentVersionId: number;
  startedAt: string;
  endsAt: string;
  claimedAt: string | null;
  /** Le joueur a fermé la fenêtre du résultat (sur n'importe quel appareil). */
  resultSeenAt: string | null;
  outcome: DungeonOutcome | null;
  result: StoredBattleResult | null;
}

/** Bilan du joueur contre un dresseur. */
export interface TrainerRecordDto {
  trainerId: string;
  wins: number;
  losses: number;
  firstWinAt: string | null;
  lastWinAt: string | null;
  /** Fin du dernier combat (début du temps de recharge d'un dresseur répétable). */
  lastEndedAt: string | null;
}

export interface BattlesResponse {
  serverTime: string;
  /** Combat en cours (ou terminé, pas encore réclamé). */
  active: BattleDto | null;
  /** Dernier combat réclamé (résultat à montrer s'il n'a pas été vu). */
  last: BattleDto | null;
  records: TrainerRecordDto[];
}

export interface ClaimBattleResponse {
  battle: BattleDto;
  /** Poké Dollars après le combat. */
  currency: number;
}

export interface BattleTeamErrorBody {
  error: 'TEAM_INVALID';
  errors: BattleError[];
}
