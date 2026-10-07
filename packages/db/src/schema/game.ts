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
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import type { DaycareParent } from '@poke/game-core';
import { contentVersions } from './content';

/** État des joueurs (première ébauche, PLAN.md section 4.4). */

const ownerId = () =>
  text('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });

export const playerProfiles = pgTable(
  'player_profiles',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    trainerName: text('trainer_name').notNull(),
    regionUnlocked: text('region_unlocked').notNull(),
    /** Null tant que le joueur n'a pas choisi son starter. */
    starterSpeciesId: integer('starter_species_id'),
    currency: bigint('currency', { mode: 'number' }).notNull().default(0),
    settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('player_profiles_trainer_name_lower').on(sql`lower(${t.trainerName})`)],
);

export const pokemonOrigin = pgEnum('pokemon_origin', ['starter', 'capture', 'egg', 'quest']);

export const pokemon = pgTable(
  'pokemon',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: ownerId(),
    speciesId: integer('species_id').notNull(),
    formId: integer('form_id'),
    level: smallint('level').notNull().default(1),
    xp: integer('xp').notNull().default(0),
    ivHp: smallint('iv_hp').notNull(),
    ivAtk: smallint('iv_atk').notNull(),
    ivDef: smallint('iv_def').notNull(),
    ivSpa: smallint('iv_spa').notNull(),
    ivSpd: smallint('iv_spd').notNull(),
    ivSpe: smallint('iv_spe').notNull(),
    nature: text('nature').notNull(),
    natureOverride: text('nature_override'),
    ability: text('ability').notNull(),
    isShiny: boolean('is_shiny').notNull().default(false),
    gender: text('gender', { enum: ['male', 'female', 'genderless'] }).notNull(),
    happiness: smallint('happiness').notNull().default(0),
    origin: pokemonOrigin('origin').notNull(),
    originRegion: text('origin_region'),
    caughtAt: timestamp('caught_at', { withTimezone: true }).notNull().defaultNow(),
    locked: boolean('locked').notNull().default(false),
    /** K.O. après une défaite : indisponible jusqu'à cette date (évaluation paresseuse). */
    koUntil: timestamp('ko_until', { withTimezone: true }),
  },
  (t) => [index('pokemon_owner_species').on(t.ownerId, t.speciesId)],
);

/**
 * Œufs en couveuse. Les parents sont figés au moment de la ponte (`parents`) : l'éclosion se
 * calcule avec le seed et la version de contenu de la ponte, même si un parent a été transféré.
 */
export const eggs = pgTable(
  'eggs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: ownerId(),
    speciesId: integer('species_id').notNull(),
    parentAId: uuid('parent_a_id').references(() => pokemon.id, { onDelete: 'set null' }),
    parentBId: uuid('parent_b_id').references(() => pokemon.id, { onDelete: 'set null' }),
    parents: jsonb('parents').$type<[DaycareParent, DaycareParent]>().notNull(),
    motherIndex: smallint('mother_index').notNull().default(0),
    contentVersionId: integer('content_version_id')
      .notNull()
      .references(() => contentVersions.id),
    laidAt: timestamp('laid_at', { withTimezone: true }).notNull().defaultNow(),
    hatchAt: timestamp('hatch_at', { withTimezone: true }).notNull(),
    seed: bigint('seed', { mode: 'number' }).notNull(),
    hatched: boolean('hatched').notNull().default(false),
    hatchedPokemonId: uuid('hatched_pokemon_id').references(() => pokemon.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [index('eggs_owner_hatched').on(t.ownerId, t.hatched)],
);

/** Pension : un couple par emplacement, tant qu'il y est déposé (ligne supprimée au retrait). */
export const daycareSlots = pgTable(
  'daycare_slots',
  {
    id: serial('id').primaryKey(),
    ownerId: ownerId(),
    slotIndex: smallint('slot_index').notNull(),
    parentAId: uuid('parent_a_id').references(() => pokemon.id, { onDelete: 'set null' }),
    parentBId: uuid('parent_b_id').references(() => pokemon.id, { onDelete: 'set null' }),
    /** Objets tenus (réservés dans l'inventaire, rendus au retrait). */
    heldItemAId: text('held_item_a_id'),
    heldItemBId: text('held_item_b_id'),
    /** Début du cycle de ponte en cours (dépôt, ou dernier ramassage). */
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('daycare_slots_owner_slot').on(t.ownerId, t.slotIndex)],
);

export const expeditions = pgTable(
  'expeditions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: ownerId(),
    zoneId: text('zone_id').notNull(),
    slotIndex: smallint('slot_index').notNull(),
    team: jsonb('team').$type<string[]>().notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    /** Balls et baies réservées au départ (une par tentative de capture). */
    ballItemId: text('ball_item_id'),
    balls: integer('balls').notNull().default(0),
    berryItemId: text('berry_item_id'),
    berries: integer('berries').notNull().default(0),
    contentVersionId: integer('content_version_id')
      .notNull()
      .references(() => contentVersions.id),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    seed: bigint('seed', { mode: 'number' }).notNull(),
    /** Maillon de la chaîne de zone au départ (bonus shiny). */
    shinyChain: smallint('shiny_chain').notNull().default(0),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    result: jsonb('result'),
  },
  (t) => [
    index('expeditions_owner_claimed').on(t.ownerId, t.claimedAt),
    index('expeditions_owner_zone').on(t.ownerId, t.zoneId, t.startedAt),
    // Un emplacement ne porte qu'une expédition non réclamée à la fois.
    uniqueIndex('expeditions_owner_slot_active')
      .on(t.ownerId, t.slotIndex)
      .where(sql`${t.claimedAt} is null`),
  ],
);

export const battleOutcome = pgEnum('battle_outcome', ['win', 'loss']);

/** Combats de dresseurs : même schéma que les expéditions (lancer, attendre, réclamer). */
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
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    outcome: battleOutcome('outcome'),
    result: jsonb('result'),
  },
  (t) => [
    index('trainer_battles_owner_claimed').on(t.ownerId, t.claimedAt),
    uniqueIndex('trainer_battles_owner_slot_active')
      .on(t.ownerId, t.slotIndex)
      .where(sql`${t.claimedAt} is null`),
    // Un seul combat en cours contre un même dresseur.
    uniqueIndex('trainer_battles_owner_trainer_active')
      .on(t.ownerId, t.trainerId)
      .where(sql`${t.claimedAt} is null`),
  ],
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
  },
  (t) => [primaryKey({ columns: [t.ownerId, t.trainerId] })],
);

/** Achats en boutique : historique et limites d'achat (totales ou par période). */
export const shopPurchases = pgTable(
  'shop_purchases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: ownerId(),
    shopEntryId: text('shop_entry_id').notNull(),
    itemId: text('item_id').notNull(),
    lots: integer('lots').notNull(),
    quantity: integer('quantity').notNull(),
    totalPrice: bigint('total_price', { mode: 'number' }).notNull(),
    contentVersionId: integer('content_version_id')
      .notNull()
      .references(() => contentVersions.id),
    purchasedAt: timestamp('purchased_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('shop_purchases_owner_entry').on(t.ownerId, t.shopEntryId, t.purchasedAt)],
);

/** Badge « Nouveau ! » : article débloqué (date), puis vu par le joueur. */
export const shopSeen = pgTable(
  'shop_seen',
  {
    ownerId: ownerId(),
    shopEntryId: text('shop_entry_id').notNull(),
    unlockedAt: timestamp('unlocked_at', { withTimezone: true }).notNull().defaultNow(),
    seenAt: timestamp('seen_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.ownerId, t.shopEntryId] })],
);

export const rewardKind = pgEnum('reward_kind', ['milestone', 'collection']);

/**
 * Récompenses de progression réclamées (paliers du Pokédex, collections) : une seule fois chacune.
 * Les emplacements et bonus permanents en découlent.
 */
export const rewardClaims = pgTable(
  'reward_claims',
  {
    ownerId: ownerId(),
    kind: rewardKind('kind').notNull(),
    rewardId: text('reward_id').notNull(),
    contentVersionId: integer('content_version_id')
      .notNull()
      .references(() => contentVersions.id),
    claimedAt: timestamp('claimed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.ownerId, t.kind, t.rewardId] })],
);

export const inventory = pgTable(
  'inventory',
  {
    ownerId: ownerId(),
    itemId: text('item_id').notNull(),
    quantity: integer('quantity').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.ownerId, t.itemId] })],
);

export const pokedex = pgTable(
  'pokedex',
  {
    ownerId: ownerId(),
    speciesId: integer('species_id').notNull(),
    seen: boolean('seen').notNull().default(false),
    caught: boolean('caught').notNull().default(false),
    caughtShiny: boolean('caught_shiny').notNull().default(false),
    firstCaughtAt: timestamp('first_caught_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.ownerId, t.speciesId] })],
);

export const questProgress = pgTable(
  'quest_progress',
  {
    ownerId: ownerId(),
    questId: text('quest_id').notNull(),
    contentVersionId: integer('content_version_id')
      .notNull()
      .references(() => contentVersions.id),
    step: smallint('step').notNull().default(0),
    progress: jsonb('progress').notNull().default({}),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.ownerId, t.questId] })],
);

export const pityCounters = pgTable(
  'pity_counters',
  {
    ownerId: ownerId(),
    speciesId: integer('species_id').notNull(),
    misses: integer('misses').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.ownerId, t.speciesId] })],
);

/** Bonbons de lignée (une lignée = une chaîne d'évolution PokéAPI). */
export const candies = pgTable(
  'candies',
  {
    ownerId: ownerId(),
    lineageId: integer('lineage_id').notNull(),
    quantity: integer('quantity').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.ownerId, t.lineageId] })],
);
