import { sql } from 'drizzle-orm';
import {
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
  uuid,
} from 'drizzle-orm/pg-core';
import type { DungeonMove } from '@poke/game-core';
import { ownerId } from './game-columns';

/**
 * Pokémon possédés, étiquettes, équipes, Pokédex, sac, pitié et Bonbons.
 */

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
    /**
     * Formes de l'espèce rencontrées (expédition, combat), capturées ou non : voir la forme
     * normale ne dévoile pas les formes alternatives.
     */
    seenFormIds: integer('seen_form_ids').array().notNull().default([]),
    /** Formes rencontrées en version shiny. */
    seenShinyFormIds: integer('seen_shiny_form_ids').array().notNull().default([]),
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
