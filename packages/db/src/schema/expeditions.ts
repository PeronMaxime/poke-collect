import { sql } from 'drizzle-orm';
import {
  bigint,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { AutoTransferFilter, BallPlan, CaptureFilter, CaptureSnapshot } from '@poke/game-core';
import { contentVersions } from './content';
import { ownerId } from './game-columns';

/**
 * Expéditions lancées, en cours ou réclamées.
 */

export const expeditions = pgTable(
  'expeditions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: ownerId(),
    /** Zone explorée ; null pour une expédition légendaire. */
    zoneId: text('zone_id'),
    /** Expédition légendaire de cette quête ; null = expédition normale. */
    questId: text('quest_id'),
    slotIndex: smallint('slot_index').notNull(),
    team: jsonb('team').$type<string[]>().notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    /** Balls réservées au départ (une par tentative de capture) et baies de capture. */
    ballItemId: text('ball_item_id'),
    balls: integer('balls').notNull().default(0),
    berryItemId: text('berry_item_id'),
    berries: integer('berries').notNull().default(0),
    /** Baies de rencontres (Baie Nanana) réservées au départ. */
    encounterBerryItemId: text('encounter_berry_item_id'),
    encounterBerries: integer('encounter_berries').notNull().default(0),
    /**
     * Allongement de l'intervalle entre deux rencontres à chaque heure passée, figé au départ
     * (minutes) ; 0 = anciennes expéditions, rythme constant.
     */
    encounterIntervalGrowthMinutes: doublePrecision('encounter_interval_growth_minutes')
      .notNull()
      .default(0),
    /** Anciennes expéditions : Pokémon à tenter de capturer ; null = tous. */
    captureFilter: jsonb('capture_filter').$type<CaptureFilter>(),
    /**
     * Ball lancée selon la catégorie du Pokémon (nouveau, chromatique, déjà capturé), retirée du
     * sac à chaque rencontre ; null = ancienne expédition (Balls réservées dans `balls`).
     */
    ballPlan: jsonb('ball_plan').$type<BallPlan>(),
    /** Transfert automatique des captures au retour, figé au départ ; null = aucun. */
    autoTransfer: jsonb('auto_transfer').$type<AutoTransferFilter>(),
    /** Pokédex (Pokémon de la zone) et pitié figés au départ : les lancers se rejouent à l'identique. */
    captureSnapshot: jsonb('capture_snapshot').$type<CaptureSnapshot>(),
    /** Journal des lancers déjà décidés, un caractère par rencontre (voir `THROW_CODES`). */
    throws: text('throws').notNull().default(''),
    /** Moment de la prochaine rencontre à décider ; null = plus aucun lancer à faire. */
    nextThrowAt: timestamp('next_throw_at', { withTimezone: true }),
    /** Balls retirées du sac jusqu'ici, par objet. */
    ballsUsed: jsonb('balls_used').$type<Record<string, number>>().notNull().default({}),
    contentVersionId: integer('content_version_id')
      .notNull()
      .references(() => contentVersions.id),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    /** À partir de cette date, le joueur peut arrêter l'expédition et récupérer le résultat. */
    minEndsAt: timestamp('min_ends_at', { withTimezone: true }).notNull(),
    /** Fin de l'expédition : au-delà, le temps ne compte plus. */
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    seed: bigint('seed', { mode: 'number' }).notNull(),
    /** Maillon de la chaîne de zone au départ (bonus shiny). */
    shinyChain: smallint('shiny_chain').notNull().default(0),
    /** Heure locale du joueur au départ (talents de jour ou de nuit) ; null = inconnue. */
    localHour: smallint('local_hour'),
    /**
     * Fuyards présents dans la zone au départ (quête et rang du Pokémon dans sa récompense) : ils
     * n'apparaissent plus ailleurs tant que l'expédition n'est pas réclamée.
     */
    roamers: jsonb('roamers')
      .$type<{ questId: string; pokemonIndex: number }[]>()
      .notNull()
      .default([]),
    /**
     * Quêtes des fuyards déjà croisés, au fil des rencontres (voir `settleExpeditionBalls`) :
     * le joueur l'apprend avant la réclamation, sans savoir si la capture a réussi.
     */
    roamersMet: jsonb('roamers_met').$type<string[]>().notNull().default([]),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    /** Notification push « expédition terminée » envoyée. */
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    result: jsonb('result'),
  },
  (t) => [
    index('expeditions_owner_claimed').on(t.ownerId, t.claimedAt),
    index('expeditions_to_notify')
      .on(t.endsAt)
      .where(sql`${t.claimedAt} is null and ${t.notifiedAt} is null`),
    index('expeditions_owner_zone').on(t.ownerId, t.zoneId, t.startedAt),
    // Un emplacement ne porte qu'une expédition non réclamée à la fois.
    uniqueIndex('expeditions_owner_slot_active')
      .on(t.ownerId, t.slotIndex)
      .where(sql`${t.claimedAt} is null`),
  ],
);
