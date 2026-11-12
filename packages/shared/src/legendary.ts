import { z } from 'zod';
import { slugSchema } from '@poke/content';
import type {
  DungeonCommand,
  DungeonOutcome,
  DungeonSetup,
  LegendaryBattleResult,
} from '@poke/game-core';
import { dungeonMoveSchema } from './battles';
import { utcOffsetSchema } from './internal';
import type { PokemonDto } from './pokemon';

/**
 * Combats légendaires, lancés depuis une quête.
 */

/** Combat contre le légendaire d'une quête réclamée : équipe dans l'ordre, attaque de chacun. */
export const startLegendaryBattleInputSchema = z
  .object({
    team: z.array(z.uuid()).min(1).max(6),
    moves: z.array(dungeonMoveSchema).min(1).max(6),
    /** Heure locale du joueur (talents de jour ou de nuit). */
    utcOffsetMinutes: utcOffsetSchema.optional(),
  })
  .refine((i) => i.moves.length === i.team.length, {
    message: 'Une attaque par Pokémon',
    path: ['moves'],
  });

export type StartLegendaryBattleInput = z.infer<typeof startLegendaryBattleInputSchema>;

/** Ball lancée sur le légendaire vaincu. */
export const legendaryCaptureInputSchema = z.object({ ballItemId: slugSchema });

export type LegendaryCaptureInput = z.infer<typeof legendaryCaptureInputSchema>;

export type StoredLegendaryResult = LegendaryBattleResult;

/** Combat légendaire en temps réel (même déroulé qu'un combat de dresseur), puis sa capture. */
export interface LegendaryBattleDto {
  id: string;
  questId: string;
  /** Pokémon de la récompense affronté (index). */
  pokemonIndex: number;
  team: string[];
  setup: DungeonSetup;
  commands: DungeonCommand[];
  fledAtMs: number | null;
  contentVersionId: number;
  isShiny: boolean;
  startedAt: string;
  endsAt: string;
  claimedAt: string | null;
  resultSeenAt: string | null;
  outcome: DungeonOutcome | null;
  result: StoredLegendaryResult | null;
  /** Chance de capture d'une Ball ordinaire (0-1). */
  captureChance: number;
  /** Ball lancée, et son issue : null tant que le légendaire vaincu attend la Ball. */
  ballItemId: string | null;
  captured: boolean | null;
  capturedAt: string | null;
  pokemonId: string | null;
  /** Fin d'une tentative sans capture (début du délai avant la suivante). */
  endedAt: string | null;
}

/** Où en est le joueur avec le légendaire d'une quête réclamée. */
export interface LegendaryQuestStateDto {
  questId: string;
  pokemonIndex: number;
  /** Combats déjà livrés contre ce légendaire. */
  attempts: number;
  /** Fin du délai avant de retenter le combat ; null = possible tout de suite. */
  retryAt: string | null;
  /** Légendaire vaincu qui attend la Ball : combat, et légendaire chromatique ou non. */
  pendingCapture: { id: string; isShiny: boolean } | null;
}

export interface LegendaryBattlesResponse {
  serverTime: string;
  /** Combat en cours (ou terminé, pas encore réglé). */
  active: LegendaryBattleDto | null;
  /** Dernier combat réglé (résultat ou Ball à lancer). */
  last: LegendaryBattleDto | null;
  quests: LegendaryQuestStateDto[];
}

export interface ClaimLegendaryBattleResponse {
  battle: LegendaryBattleDto;
}

/** Légendaire relâché : la quête qui le propose de nouveau. */
export interface ReleaseLegendaryResponse {
  questId: string;
  /** Toute la quête est à refaire (légendaire capturé avant la réécriture des quêtes). */
  restarted: boolean;
}

export interface LegendaryCaptureResponse {
  battle: LegendaryBattleDto;
  /** Le légendaire capturé ; null si la Ball a échoué. */
  pokemon: PokemonDto | null;
}
