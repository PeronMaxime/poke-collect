import { sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type {
  BalanceSettings,
  BattleRules,
  Encounter,
  EvolutionMethod,
  ItemEffect,
  LootEntry,
  ProgressReward,
  PurchaseLimit,
  QuestReward,
  QuestStep,
  Trainer,
  TrainerPokemon,
  UnlockCondition,
  Zone,
} from '@poke/content';
import { users } from './auth';

/**
 * Contenu configurable, versionné. Chaque entité est rattachée à une `content_version`.
 * Un seul brouillon et une seule version publiée à la fois (index partiels uniques).
 */

export const contentVersionStatus = pgEnum('content_version_status', [
  'draft',
  'published',
  'archived',
]);

export const contentVersions = pgTable(
  'content_versions',
  {
    id: serial('id').primaryKey(),
    status: contentVersionStatus('status').notNull(),
    label: text('label').notNull(),
    basedOnId: integer('based_on_id'),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('content_versions_one_published')
      .on(t.status)
      .where(sql`${t.status} = 'published'`),
    uniqueIndex('content_versions_one_draft')
      .on(t.status)
      .where(sql`${t.status} = 'draft'`),
  ],
);

export const balanceSettings = pgTable('balance_settings', {
  contentVersionId: integer('content_version_id')
    .primaryKey()
    .references(() => contentVersions.id, { onDelete: 'cascade' }),
  data: jsonb('data').$type<BalanceSettings>().notNull(),
});

export const regions = pgTable(
  'regions',
  {
    contentVersionId: integer('content_version_id')
      .notNull()
      .references(() => contentVersions.id, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    order: integer('order').notNull(),
    name: text('name').notNull(),
    image: text('image'),
    speciesIds: jsonb('species_ids').$type<number[]>().notNull(),
    starterSpeciesIds: jsonb('starter_species_ids').$type<number[]>().notNull().default([]),
    enabled: boolean('enabled').notNull().default(true),
    unlock: jsonb('unlock').$type<UnlockCondition>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.contentVersionId, t.id] })],
);

/*
 * Les colonnes des tables suivantes portent exactement les noms des champs des schémas Zod
 * (`@poke/content`) : une ligne = l'entité + `contentVersionId`.
 */

const versionId = () =>
  integer('content_version_id')
    .notNull()
    .references(() => contentVersions.id, { onDelete: 'cascade' });

export const speciesOverrides = pgTable(
  'species_overrides',
  {
    contentVersionId: versionId(),
    speciesId: integer('species_id').notNull(),
    enabled: boolean('enabled').notNull(),
    nameFr: text('name_fr'),
    habitat: text('habitat'),
    rarity: text('rarity'),
    breedable: boolean('breedable'),
  },
  (t) => [primaryKey({ columns: [t.contentVersionId, t.speciesId] })],
);

export const items = pgTable(
  'items',
  {
    contentVersionId: versionId(),
    id: text('id').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    icon: text('icon'),
    category: text('category').notNull(),
    rarity: text('rarity').notNull(),
    effects: jsonb('effects').$type<ItemEffect[]>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.contentVersionId, t.id] })],
);

export const lootTables = pgTable(
  'loot_tables',
  {
    contentVersionId: versionId(),
    id: text('id').notNull(),
    name: text('name').notNull(),
    entries: jsonb('entries').$type<LootEntry[]>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.contentVersionId, t.id] })],
);

export const zones = pgTable(
  'zones',
  {
    contentVersionId: versionId(),
    id: text('id').notNull(),
    regionId: text('region_id').notNull(),
    order: integer('order').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    image: text('image'),
    habitat: text('habitat'),
    minPower: integer('min_power').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    requiredTypes: jsonb('required_types').$type<Zone['requiredTypes']>().notNull(),
    affinityTypes: jsonb('affinity_types').$type<string[]>().notNull(),
    durationsMinutes: jsonb('durations_minutes').$type<number[]>().notNull(),
    encounters: jsonb('encounters').$type<Encounter[]>().notNull(),
    lootTableId: text('loot_table_id'),
    unlock: jsonb('unlock').$type<UnlockCondition>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.contentVersionId, t.id] })],
);

export const trainers = pgTable(
  'trainers',
  {
    contentVersionId: versionId(),
    id: text('id').notNull(),
    regionId: text('region_id').notNull(),
    zoneId: text('zone_id'),
    order: integer('order').notNull(),
    name: text('name').notNull(),
    trainerClass: text('trainer_class').notNull(),
    sprite: text('sprite'),
    team: jsonb('team').$type<TrainerPokemon[]>().notNull(),
    durationMinutes: integer('duration_minutes'),
    rules: jsonb('rules').$type<BattleRules>().notNull(),
    money: integer('money').notNull(),
    lootTableId: text('loot_table_id'),
    lootRolls: integer('loot_rolls').notNull(),
    badge: jsonb('badge').$type<Trainer['badge']>(),
    repeatable: boolean('repeatable').notNull(),
    cooldownMinutes: integer('cooldown_minutes'),
    koMinutes: integer('ko_minutes'),
    enabled: boolean('enabled').notNull().default(true),
    unlock: jsonb('unlock').$type<UnlockCondition>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.contentVersionId, t.id] })],
);

export const shopCategories = pgTable(
  'shop_categories',
  {
    contentVersionId: versionId(),
    id: text('id').notNull(),
    name: text('name').notNull(),
    icon: text('icon'),
    order: integer('order').notNull(),
  },
  (t) => [primaryKey({ columns: [t.contentVersionId, t.id] })],
);

export const shopEntries = pgTable(
  'shop_entries',
  {
    contentVersionId: versionId(),
    id: text('id').notNull(),
    itemId: text('item_id').notNull(),
    categoryId: text('category_id').notNull(),
    order: integer('order').notNull(),
    price: integer('price').notNull(),
    lotSize: integer('lot_size').notNull(),
    unlock: jsonb('unlock').$type<UnlockCondition>().notNull(),
    lockedVisibility: text('locked_visibility', { enum: ['hidden', 'locked'] }).notNull(),
    purchaseLimit: jsonb('purchase_limit').$type<PurchaseLimit>(),
    /** Dates ISO (texte, comme dans le schéma Zod). */
    availableFrom: text('available_from'),
    availableUntil: text('available_until'),
    enabled: boolean('enabled').notNull(),
  },
  (t) => [primaryKey({ columns: [t.contentVersionId, t.id] })],
);

export const evolutionOverrides = pgTable(
  'evolution_overrides',
  {
    contentVersionId: versionId(),
    id: text('id').notNull(),
    fromSpeciesId: integer('from_species_id').notNull(),
    toSpeciesId: integer('to_species_id').notNull(),
    enabled: boolean('enabled').notNull(),
    methods: jsonb('methods').$type<EvolutionMethod[]>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.contentVersionId, t.id] })],
);

export const dexMilestones = pgTable(
  'dex_milestones',
  {
    contentVersionId: versionId(),
    id: text('id').notNull(),
    order: integer('order').notNull(),
    name: text('name').notNull(),
    regionId: text('region_id'),
    shiny: boolean('shiny').notNull().default(false),
    percent: doublePrecision('percent').notNull(),
    rewards: jsonb('rewards').$type<ProgressReward>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.contentVersionId, t.id] })],
);

export const collections = pgTable(
  'collections',
  {
    contentVersionId: versionId(),
    id: text('id').notNull(),
    order: integer('order').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    speciesIds: jsonb('species_ids').$type<number[]>().notNull(),
    rewards: jsonb('rewards').$type<ProgressReward>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.contentVersionId, t.id] })],
);

export const quests = pgTable(
  'quests',
  {
    contentVersionId: versionId(),
    id: text('id').notNull(),
    order: integer('order').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    image: text('image'),
    regionId: text('region_id'),
    enabled: boolean('enabled').notNull().default(true),
    unlock: jsonb('unlock').$type<UnlockCondition>().notNull(),
    steps: jsonb('steps').$type<QuestStep[]>().notNull(),
    rewards: jsonb('rewards').$type<QuestReward>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.contentVersionId, t.id] })],
);

/**
 * Tables versionnées : copiées en bloc lors de la création d'un brouillon.
 * Toute nouvelle table de contenu (zones, objets, quêtes…) doit être ajoutée ici.
 */
export const versionedContentTables = [
  balanceSettings,
  regions,
  speciesOverrides,
  items,
  lootTables,
  zones,
  trainers,
  shopCategories,
  shopEntries,
  evolutionOverrides,
  dexMilestones,
  collections,
  quests,
] as const;
