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
import type { CaptureFilter, DaycareParent } from '@poke/game-core';
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
    /** Starter choisi dans chaque région suivante (`{ johto: 155 }`), un seul par région. */
    regionStarters: jsonb('region_starters').$type<Record<string, number>>().notNull().default({}),
    currency: bigint('currency', { mode: 'number' }).notNull().default(0),
    settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('player_profiles_trainer_name_lower').on(sql`lower(${t.trainerName})`)],
);

/** Étiquettes du joueur (couleur + texte court), collées sur ses Pokémon pour les trier. */
export const pokemonTags = pgTable(
  'pokemon_tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: ownerId(),
    label: text('label').notNull(),
    /** Couleur de fond, `#rrggbb`. */
    color: text('color').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('pokemon_tags_owner').on(t.ownerId)],
);

export const pokemonOrigin = pgEnum('pokemon_origin', [
  'starter',
  'capture',
  'egg',
  'quest',
  'fossil',
]);

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
    /** Étiquettes du joueur (`pokemon_tags`), retirées du tableau quand l'une est supprimée. */
    tagIds: uuid('tag_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
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
    /** Forme de l'œuf (régionale, héritée de la mère) ; null = forme par défaut. */
    formId: integer('form_id'),
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
    /** Notification push « prêt à éclore » envoyée. */
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    hatchedPokemonId: uuid('hatched_pokemon_id').references(() => pokemon.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [
    index('eggs_owner_hatched').on(t.ownerId, t.hatched),
    index('eggs_to_notify')
      .on(t.hatchAt)
      .where(sql`${t.hatched} = false and ${t.notifiedAt} is null`),
  ],
);

/**
 * Musée : fossiles en cours de restauration. Le fossile est consommé au dépôt ; le Pokémon se
 * calcule à la restauration, avec le seed et la version de contenu du dépôt.
 */
export const fossilRevivals = pgTable(
  'fossil_revivals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: ownerId(),
    itemId: text('item_id').notNull(),
    speciesId: integer('species_id').notNull(),
    formId: integer('form_id'),
    level: smallint('level').notNull(),
    contentVersionId: integer('content_version_id')
      .notNull()
      .references(() => contentVersions.id),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    readyAt: timestamp('ready_at', { withTimezone: true }).notNull(),
    seed: bigint('seed', { mode: 'number' }).notNull(),
    /** Pokémon récupéré (null = encore au Musée). */
    revivedAt: timestamp('revived_at', { withTimezone: true }),
    /** Notification push « fossile restauré » envoyée. */
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    pokemonId: uuid('pokemon_id').references(() => pokemon.id, { onDelete: 'set null' }),
  },
  (t) => [
    index('fossil_revivals_owner_active')
      .on(t.ownerId)
      .where(sql`${t.revivedAt} is null`),
    index('fossil_revivals_to_notify')
      .on(t.readyAt)
      .where(sql`${t.revivedAt} is null and ${t.notifiedAt} is null`),
  ],
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
    /** Pokémon à tenter de capturer ; null = tous. */
    captureFilter: jsonb('capture_filter').$type<CaptureFilter>(),
    contentVersionId: integer('content_version_id')
      .notNull()
      .references(() => contentVersions.id),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    seed: bigint('seed', { mode: 'number' }).notNull(),
    /** Maillon de la chaîne de zone au départ (bonus shiny). */
    shinyChain: smallint('shiny_chain').notNull().default(0),
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

/** Ventes d'objets à la boutique : historique (le prix vient du contenu publié). */
export const shopSales = pgTable(
  'shop_sales',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: ownerId(),
    itemId: text('item_id').notNull(),
    quantity: integer('quantity').notNull(),
    totalPrice: bigint('total_price', { mode: 'number' }).notNull(),
    contentVersionId: integer('content_version_id')
      .notNull()
      .references(() => contentVersions.id),
    soldAt: timestamp('sold_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('shop_sales_owner').on(t.ownerId, t.soldAt)],
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

/** Formes capturées (régionales, Méga, Gigamax…), pour les sections de formes du Pokédex. */
export const pokedexForms = pgTable(
  'pokedex_forms',
  {
    ownerId: ownerId(),
    formId: integer('form_id').notNull(),
    caughtShiny: boolean('caught_shiny').notNull().default(false),
    firstCaughtAt: timestamp('first_caught_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.ownerId, t.formId] })],
);

/**
 * Avancement des quêtes. Les étapes « état du joueur » se valident paresseusement ; la ligne
 * enregistre l'étape en cours, son début et le compteur des étapes « action » (captures,
 * expéditions), mis à jour à la réclamation des expéditions.
 */
export const questProgress = pgTable(
  'quest_progress',
  {
    ownerId: ownerId(),
    questId: text('quest_id').notNull(),
    /** Version de contenu active au démarrage de la quête. */
    contentVersionId: integer('content_version_id')
      .notNull()
      .references(() => contentVersions.id),
    /** Étapes validées (= index de l'étape en cours). */
    step: smallint('step').notNull().default(0),
    /** Début de l'étape en cours : seules les actions suivantes comptent. */
    stepStartedAt: timestamp('step_started_at', { withTimezone: true }).notNull().defaultNow(),
    /** Compteur de l'étape en cours : `{ count }`. */
    progress: jsonb('progress').$type<{ count?: number }>().notNull().default({}),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    /** Récompense réclamée. */
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
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

/**
 * Abonnements Web Push (un par navigateur ou appareil). Supprimés quand le service push répond
 * que l'abonnement a expiré.
 */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: serial('id').primaryKey(),
    ownerId: ownerId(),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSentAt: timestamp('last_sent_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('push_subscriptions_endpoint').on(t.endpoint),
    index('push_subscriptions_owner').on(t.ownerId),
  ],
);
