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
import type { ChestRarity, GuildObjective } from '@poke/content';
import type {
  AbilityHolder,
  AssistantPost,
  CaptureFilter,
  DaycareParent,
  DungeonCommand,
  DungeonMove,
  DungeonSetup,
  GuildJoinMode,
  GuildRole,
} from '@poke/game-core';
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
    /** Zones d'expédition mises en favori (affichées en tête de la page Expéditions). */
    favoriteZoneIds: text('favorite_zone_ids').array().notNull().default([]),
    /**
     * Pokémon du PC mis en avant sur la Fiche Dresseur, dans l'ordre ; les identifiants de
     * Pokémon transférés depuis sont ignorés à la lecture.
     */
    featuredPokemonIds: uuid('featured_pokemon_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    /** Départ volontaire de sa dernière guilde : délai avant d'en rejoindre une autre. */
    guildLeftAt: timestamp('guild_left_at', { withTimezone: true }),
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

/**
 * Équipes enregistrées par le joueur (page « Équipe Pkmn »), réutilisables en expédition, en combat
 * et en donjon. Un Pokémon n'appartient qu'à une équipe à la fois (vérifié par l'API) ; les
 * identifiants de Pokémon transférés sont ignorés à la lecture.
 */
export const pokemonTeams = pgTable(
  'pokemon_teams',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: ownerId(),
    name: text('name').notNull(),
    /** Membres dans l'ordre (l'ordre de passage en donjon). */
    pokemonIds: uuid('pokemon_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('pokemon_teams_owner').on(t.ownerId)],
);

/**
 * Assistants : un Pokémon affecté à une place d'un bâtiment (une pension, une place de la
 * couveuse, du Musée ou du Centre Pokémon) y apporte les effets de son talent. Il reste occupé tant
 * qu'il y est affecté. Un assistant par place.
 */
export const assistants = pgTable(
  'assistants',
  {
    ownerId: ownerId(),
    post: text('post').$type<AssistantPost>().notNull(),
    /** Place du bâtiment (pension, place de la couveuse, du Musée ou du Centre). */
    slotIndex: smallint('slot_index').notNull().default(0),
    pokemonId: uuid('pokemon_id')
      .notNull()
      .references(() => pokemon.id, { onDelete: 'cascade' }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.ownerId, t.post, t.slotIndex] }),
    uniqueIndex('assistants_pokemon').on(t.pokemonId),
  ],
);

export const pokemonOrigin = pgEnum('pokemon_origin', [
  'starter',
  'capture',
  'egg',
  'quest',
  'fossil',
  /** Lot de test donné depuis l'administration. */
  'admin',
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
    /** K.O. après une défaite : indisponible jusqu'à ce qu'il soit soigné au Centre Pokémon. */
    knockedOut: boolean('knocked_out').notNull().default(false),
    /** En soins au Centre Pokémon jusqu'à cette date (évaluation paresseuse). */
    healUntil: timestamp('heal_until', { withTimezone: true }),
    /** Place du Centre Pokémon occupée pendant les soins (son assistant agit sur leur durée). */
    healSlot: smallint('heal_slot'),
    /** Étiquettes du joueur (`pokemon_tags`), retirées du tableau quand l'une est supprimée. */
    tagIds: uuid('tag_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    /** Attaque choisie pour les donjons (type et catégorie) ; null = choix par défaut. */
    dungeonMove: jsonb('dungeon_move').$type<DungeonMove>(),
    /**
     * Méga-Gemme tenue (objet retiré du sac) : le Pokémon est dans la forme Méga de l'effet
     * `megaEvolution` (`form_id`) ; null = forme normale.
     */
    megaStone: text('mega_stone'),
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
    /** Place de la couveuse (son assistant agit sur la durée d'éclosion). */
    slotIndex: smallint('slot_index').notNull().default(0),
    /** Assistant de la Pension au ramassage (son talent agit à l'éclosion) ; null = aucun. */
    helper: jsonb('helper').$type<AbilityHolder>(),
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
    /** Place du Musée (son assistant agit sur la restauration). */
    slotIndex: smallint('slot_index').notNull().default(0),
    /** Assistant du Musée au dépôt (son talent agit à la restauration) ; null = aucun. */
    helper: jsonb('helper').$type<AbilityHolder>(),
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

/**
 * Ferme à baies : une baie plantée par parcelle (ligne supprimée à la récolte). Elle ne pousse que
 * tant que le champ a un assistant de type Eau : `ready_at` est alors la maturité prévue ; sans
 * lui, la pousse est en pause (`ready_at` null) avec `remaining_ms` à faire.
 */
export const berryPlots = pgTable(
  'berry_plots',
  {
    ownerId: ownerId(),
    /** Parcelle du champ (0 à 8). */
    plotIndex: smallint('plot_index').notNull(),
    itemId: text('item_id').notNull(),
    plantedAt: timestamp('planted_at', { withTimezone: true }).notNull().defaultNow(),
    growMs: integer('grow_ms').notNull(),
    remainingMs: integer('remaining_ms').notNull(),
    readyAt: timestamp('ready_at', { withTimezone: true }),
    /** Baies récoltées à maturité (tirées à la plantation). */
    yield: smallint('yield').notNull(),
  },
  (t) => [primaryKey({ columns: [t.ownerId, t.plotIndex] })],
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
    /** Zone explorée ; null pour une expédition légendaire. */
    zoneId: text('zone_id'),
    /** Expédition légendaire de cette quête ; null = expédition normale. */
    questId: text('quest_id'),
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
    /** Version shiny rencontrée (capturée ou non) : la case du Pokédex shiny se dévoile. */
    seenShiny: boolean('seen_shiny').notNull().default(false),
    firstCaughtAt: timestamp('first_caught_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.ownerId, t.speciesId] })],
);

/**
 * Pokémon obtenus depuis le début, tous joueurs confondus (captures, starters, œufs, quêtes,
 * fossiles), dans l'espèce d'obtention : les transferts et évolutions ne les décomptent pas.
 * `transferred` compte les transferts dans l'espèce du Pokémon au moment du transfert.
 */
export const speciesCaptures = pgTable('species_captures', {
  speciesId: integer('species_id').primaryKey(),
  captured: integer('captured').notNull().default(0),
  shiny: integer('shiny').notNull().default(0),
  transferred: integer('transferred').notNull().default(0),
});

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
    /** Pokémon de la récompense déjà capturés (expéditions légendaires), dans l'ordre. */
    pokemonCaught: smallint('pokemon_caught').notNull().default(0),
    /**
     * Cachette d'un fuyard vu mais pas capturé : il a fui vers cette zone, où il reste jusqu'à la
     * fin de l'heure `hour` (voir `weatherHour`) ; ensuite il reprend son trajet habituel.
     */
    roamerHideout: jsonb('roamer_hideout').$type<{
      pokemonIndex: number;
      hour: number;
      zoneId: string;
    }>(),
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

// --- Guildes ---------------------------------------------------------------------------

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
 * Quêtes de la semaine d'une guilde, tirées au premier besoin et figées (nom, objectif, cible).
 * Non terminée au lundi suivant : perdue.
 */
export const guildWeeklyQuests = pgTable(
  'guild_weekly_quests',
  {
    guildId: guildId(),
    /** Lundi de la semaine (AAAA-MM-JJ, heure de Paris). */
    week: text('week').notNull(),
    slot: smallint('slot').notNull(),
    questId: text('quest_id').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    rarity: text('rarity').$type<ChestRarity>().notNull(),
    objective: jsonb('objective').$type<GuildObjective>().notNull(),
    target: integer('target').notNull(),
    progress: integer('progress').notNull().default(0),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.week, t.slot] })],
);

/** Contribution de chaque membre aux quêtes de la semaine (un coffre aux contributeurs). */
export const guildQuestContributions = pgTable(
  'guild_quest_contributions',
  {
    guildId: guildId(),
    week: text('week').notNull(),
    slot: smallint('slot').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.week, t.slot, t.userId] })],
);
