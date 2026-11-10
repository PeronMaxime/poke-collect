import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { DungeonCommand, DungeonSetup } from '@poke/game-core';
import { contentVersions } from './content';
import { ownerId } from './game-columns';

/**
 * Combats en temps réel : dresseurs, donjons, légendaires, et leur avancement.
 */

export const battleOutcome = pgEnum('battle_outcome', ['win', 'loss']);

/**
 * Archives des combats de dresseurs à minuterie (avant le combat en temps réel du 21 octobre
 * 2026) : plus aucun combat n'y est écrit, voir `trainerRuns`.
 */
export const trainerBattles = pgTable(
  'trainer_battles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: ownerId(),
    trainerId: text('trainer_id').notNull(),
    slotIndex: smallint('slot_index').notNull(),
    team: jsonb('team').$type<string[]>().notNull(),
    contentVersionId: integer('content_version_id')
      .notNull()
      .references(() => contentVersions.id),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    seed: bigint('seed', { mode: 'number' }).notNull(),
    /** Heure locale du joueur au départ (talents de jour ou de nuit) ; null = inconnue. */
    localHour: smallint('local_hour'),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    /** Notification push « combat terminé » envoyée. */
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    outcome: battleOutcome('outcome'),
    result: jsonb('result'),
  },
  (t) => [
    index('trainer_battles_owner_claimed').on(t.ownerId, t.claimedAt),
    index('trainer_battles_to_notify')
      .on(t.endsAt)
      .where(sql`${t.claimedAt} is null and ${t.notifiedAt} is null`),
    uniqueIndex('trainer_battles_owner_slot_active')
      .on(t.ownerId, t.slotIndex)
      .where(sql`${t.claimedAt} is null`),
    // Un seul combat en cours contre un même dresseur.
    uniqueIndex('trainer_battles_owner_trainer_active')
      .on(t.ownerId, t.trainerId)
      .where(sql`${t.claimedAt} is null`),
  ],
);

/**
 * Tentatives de donjon : combat en temps réel, simulé de façon déterministe à partir de
 * `setup` (équipe et adversaires figés au départ), du seed et des changements de Pokémon du
 * joueur (`commands`). Le résultat s'applique à la réclamation, une fois le combat terminé.
 */
export const dungeonRuns = pgTable(
  'dungeon_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: ownerId(),
    dungeonId: text('dungeon_id').notNull(),
    team: jsonb('team').$type<string[]>().notNull(),
    setup: jsonb('setup').$type<DungeonSetup>().notNull(),
    commands: jsonb('commands').$type<DungeonCommand[]>().notNull().default([]),
    contentVersionId: integer('content_version_id')
      .notNull()
      .references(() => contentVersions.id),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    /** Fin au plus tard (temps imparti). */
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    /** Fuite : millisecondes écoulées depuis le départ. */
    fledAtMs: integer('fled_at_ms'),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    /** Le joueur a fermé la fenêtre du résultat (sur n'importe quel appareil). */
    resultSeenAt: timestamp('result_seen_at', { withTimezone: true }),
    outcome: text('outcome', { enum: ['win', 'loss', 'timeout', 'fled'] }),
    result: jsonb('result'),
  },
  (t) => [
    index('dungeon_runs_owner_claimed').on(t.ownerId, t.claimedAt),
    // Un seul donjon en cours à la fois.
    uniqueIndex('dungeon_runs_owner_active')
      .on(t.ownerId)
      .where(sql`${t.claimedAt} is null`),
  ],
);

/**
 * Combats de dresseurs en temps réel, comme les donjons : simulés de façon déterministe à partir
 * de `setup` (équipe et adversaires figés au départ) et des changements de Pokémon du joueur
 * (`commands`). Le résultat s'applique à la réclamation, une fois le combat terminé.
 */
export const trainerRuns = pgTable(
  'trainer_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: ownerId(),
    trainerId: text('trainer_id').notNull(),
    team: jsonb('team').$type<string[]>().notNull(),
    setup: jsonb('setup').$type<DungeonSetup>().notNull(),
    commands: jsonb('commands').$type<DungeonCommand[]>().notNull().default([]),
    contentVersionId: integer('content_version_id')
      .notNull()
      .references(() => contentVersions.id),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    /** Fin au plus tard (temps imparti). */
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    /** Fuite : millisecondes écoulées depuis le départ. */
    fledAtMs: integer('fled_at_ms'),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    /** Le joueur a fermé la fenêtre du résultat (sur n'importe quel appareil). */
    resultSeenAt: timestamp('result_seen_at', { withTimezone: true }),
    outcome: text('outcome', { enum: ['win', 'loss', 'timeout', 'fled'] }),
    result: jsonb('result'),
  },
  (t) => [
    index('trainer_runs_owner_claimed').on(t.ownerId, t.claimedAt),
    // Un seul combat de dresseur en cours à la fois.
    uniqueIndex('trainer_runs_owner_active')
      .on(t.ownerId)
      .where(sql`${t.claimedAt} is null`),
  ],
);

/**
 * Combats légendaires : le légendaire d'une quête réclamée (non fuyard), affronté en temps réel
 * comme un dresseur. Vaincu, il se capture d'une seule Ball (`capturedAt`) ; une tentative sans
 * capture (défaite, fuite, Ball ratée) se termine à `endedAt` et lance le délai avant la suivante.
 */
export const legendaryBattles = pgTable(
  'legendary_battles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: ownerId(),
    questId: text('quest_id').notNull(),
    /** Pokémon de la récompense affronté (index dans `rewards.pokemon`). */
    pokemonIndex: smallint('pokemon_index').notNull(),
    team: jsonb('team').$type<string[]>().notNull(),
    setup: jsonb('setup').$type<DungeonSetup>().notNull(),
    commands: jsonb('commands').$type<DungeonCommand[]>().notNull().default([]),
    contentVersionId: integer('content_version_id')
      .notNull()
      .references(() => contentVersions.id),
    /** Tirages du Pokémon capturé et de la Ball. */
    seed: bigint('seed', { mode: 'number' }).notNull(),
    /** Légendaire chromatique (décidé au départ, visible pendant le combat). */
    isShiny: boolean('is_shiny').notNull().default(false),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    /** Fin au plus tard (temps imparti). */
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    /** Fuite : millisecondes écoulées depuis le départ. */
    fledAtMs: integer('fled_at_ms'),
    /** Combat réglé (XP, K.O.) ; une victoire attend ensuite la Ball. */
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    resultSeenAt: timestamp('result_seen_at', { withTimezone: true }),
    outcome: text('outcome', { enum: ['win', 'loss', 'timeout', 'fled'] }),
    result: jsonb('result'),
    /** Ball lancée sur le légendaire vaincu, et son issue. */
    ballItemId: text('ball_item_id'),
    capturedAt: timestamp('captured_at', { withTimezone: true }),
    captured: boolean('captured'),
    pokemonId: uuid('pokemon_id'),
    /** Fin d'une tentative sans capture : début du délai avant la suivante. */
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (t) => [
    index('legendary_battles_owner_quest').on(t.ownerId, t.questId, t.startedAt),
    // Un seul combat légendaire en cours à la fois.
    uniqueIndex('legendary_battles_owner_active')
      .on(t.ownerId)
      .where(sql`${t.claimedAt} is null`),
  ],
);

/** Bilan du joueur dans chaque donjon (temps de recharge, gemmes obtenues). */
export const dungeonProgress = pgTable(
  'dungeon_progress',
  {
    ownerId: ownerId(),
    dungeonId: text('dungeon_id').notNull(),
    wins: integer('wins').notNull().default(0),
    losses: integer('losses').notNull().default(0),
    gems: integer('gems').notNull().default(0),
    firstWinAt: timestamp('first_win_at', { withTimezone: true }),
    /** Fin de la dernière tentative (début du temps de recharge). */
    lastEndedAt: timestamp('last_ended_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.ownerId, t.dungeonId] })],
);

/** Bilan du joueur contre chaque dresseur (déblocages, badges, temps de recharge). */
export const trainerProgress = pgTable(
  'trainer_progress',
  {
    ownerId: ownerId(),
    trainerId: text('trainer_id').notNull(),
    wins: integer('wins').notNull().default(0),
    losses: integer('losses').notNull().default(0),
    firstWinAt: timestamp('first_win_at', { withTimezone: true }),
    lastWinAt: timestamp('last_win_at', { withTimezone: true }),
    /** Fin du dernier combat (début du temps de recharge d'un dresseur répétable). */
    lastEndedAt: timestamp('last_ended_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.ownerId, t.trainerId] })],
);
