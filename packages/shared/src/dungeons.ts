import { z } from 'zod';
import { slugSchema } from '@poke/content';
import type {
  DungeonCommand,
  DungeonOutcome,
  DungeonResult,
  DungeonSetup,
  DungeonTeamError,
} from '@poke/game-core';
import { dungeonMoveSchema } from './battles';
import { utcOffsetSchema } from './internal';

/**
 * Donjons.
 */

/** Équipe dans l'ordre (le premier entre en combat), avec l'attaque de chacun. */
export const startDungeonInputSchema = z
  .object({
    dungeonId: slugSchema,
    team: z.array(z.uuid()).min(1).max(6),
    moves: z.array(dungeonMoveSchema).min(1).max(6),
    utcOffsetMinutes: utcOffsetSchema.optional(),
  })
  .refine((i) => i.moves.length === i.team.length, {
    message: 'Une attaque par Pokémon',
    path: ['moves'],
  });

export type StartDungeonInput = z.infer<typeof startDungeonInputSchema>;

/** Envoi d'un Pokémon au combat, `atMs` après le départ (horloge du joueur, recalée par le serveur). */
export const switchDungeonInputSchema = z.object({
  member: z.int().min(0).max(5),
  atMs: z.int().min(0),
});

export type SwitchDungeonInput = z.infer<typeof switchDungeonInputSchema>;

/** Objet de soin (Baie Sitrus) donné au Pokémon actif, `atMs` après le départ. */
export const combatItemInputSchema = z.object({ itemId: slugSchema, atMs: z.int().min(0) });

export type CombatItemInput = z.infer<typeof combatItemInputSchema>;

export type StoredDungeonResult = DungeonResult;

export interface DungeonRunDto {
  id: string;
  dungeonId: string;
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
  result: StoredDungeonResult | null;
}

/** Bilan du joueur dans un donjon. */
export interface DungeonRecordDto {
  dungeonId: string;
  wins: number;
  losses: number;
  gems: number;
  firstWinAt: string | null;
  lastEndedAt: string | null;
}

export interface DungeonsResponse {
  serverTime: string;
  /** Tentative en cours (ou terminée, pas encore réclamée). */
  active: DungeonRunDto | null;
  /** Dernière tentative réclamée (résultat à montrer s'il n'a pas été vu). */
  last: DungeonRunDto | null;
  records: DungeonRecordDto[];
}

export interface ClaimDungeonResponse {
  run: DungeonRunDto;
  /** Poké Dollars après la tentative. */
  currency: number;
}

export interface DungeonTeamErrorBody {
  error: 'TEAM_INVALID';
  errors: DungeonTeamError[];
}
