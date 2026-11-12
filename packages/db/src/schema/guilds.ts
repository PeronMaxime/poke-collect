import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import type {
  ChestRarity,
  GuildObjective,
  GuildQuestDifficulty,
  GuildQuestPeriod,
} from '@poke/content';
import type { GuildJoinMode, GuildRole } from '@poke/game-core';

/**
 * Guildes : membres, candidatures, messages, quêtes et contributions.
 */

/** Guildes de joueurs : nom unique (sans tenir compte de la casse), adhésion libre ou sur demande. */
export const guilds = pgTable(
  'guilds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    joinMode: text('join_mode').$type<GuildJoinMode>().notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('guilds_name_lower').on(sql`lower(${t.name})`)],
);

const guildId = () =>
  uuid('guild_id')
    .notNull()
    .references(() => guilds.id, { onDelete: 'cascade' });

/** Membres : un joueur appartient à une seule guilde à la fois. */
export const guildMembers = pgTable(
  'guild_members',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    guildId: guildId(),
    role: text('role').$type<GuildRole>().notNull().default('member'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('guild_members_guild').on(t.guildId)],
);

/** Candidatures aux guildes « sur demande » (supprimées à l'adhésion à une guilde). */
export const guildJoinRequests = pgTable(
  'guild_join_requests',
  {
    guildId: guildId(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.guildId, t.userId] }),
    index('guild_join_requests_user').on(t.userId),
  ],
);

/** Discussion de la guilde ; auteur null = message du jeu (quête terminée, arrivée…). */
export const guildMessages = pgTable(
  'guild_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guildId: guildId(),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('guild_messages_guild').on(t.guildId, t.createdAt)],
);

/**
 * Quêtes du jour et de la semaine d'une guilde, tirées au premier besoin et figées (nom, objectif,
 * cible). Non terminée à la fin de sa période (minuit, ou lundi minuit) : perdue.
 */
export const guildWeeklyQuests = pgTable(
  'guild_weekly_quests',
  {
    guildId: guildId(),
    period: text('period').$type<GuildQuestPeriod>().notNull().default('weekly'),
    /** Jour de la quête, ou lundi de la semaine (AAAA-MM-JJ, heure de Paris). */
    week: text('week').notNull(),
    slot: smallint('slot').notNull(),
    questId: text('quest_id').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    difficulty: text('difficulty').$type<GuildQuestDifficulty>().notNull().default('easy'),
    /** Coffre gagné. */
    rarity: text('rarity').$type<ChestRarity>().notNull(),
    objective: jsonb('objective').$type<GuildObjective>().notNull(),
    target: integer('target').notNull(),
    /** Avancée totale : elle peut dépasser l'objectif jusqu'à la fin de la période. */
    progress: integer('progress').notNull().default(0),
    /** Objectif atteint. */
    completedAt: timestamp('completed_at', { withTimezone: true }),
    /** Coffres distribués aux participants (à la fin de la période). */
    rewardedAt: timestamp('rewarded_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.period, t.week, t.slot] })],
);

/** Contribution de chaque membre aux quêtes du jour et de la semaine (un coffre aux contributeurs). */
export const guildQuestContributions = pgTable(
  'guild_quest_contributions',
  {
    guildId: guildId(),
    period: text('period').$type<GuildQuestPeriod>().notNull().default('weekly'),
    week: text('week').notNull(),
    slot: smallint('slot').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.period, t.week, t.slot, t.userId] })],
);
