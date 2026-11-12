import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { AbilityHolder, AssistantPost, DaycareParent } from '@poke/game-core';
import { contentVersions } from './content';
import { ownerId } from './game-columns';
import { pokemon } from './pokemon';

/**
 * Bâtiments : assistants, œufs et pensions, fossiles du Musée, parcelles de la ferme.
 */

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

/**
 * Œufs en couveuse ou rangés dans le sac. Les parents sont figés au moment de la ponte (`parents`) : l'éclosion se
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
    /**
     * Place de la couveuse (son assistant agit sur la durée d'éclosion) ; null = œuf rangé dans le
     * sac, pas encore couvé.
     */
    slotIndex: smallint('slot_index'),
    /** Assistant de la Pension au ramassage (son talent agit à l'éclosion) ; null = aucun. */
    helper: jsonb('helper').$type<AbilityHolder>(),
    contentVersionId: integer('content_version_id')
      .notNull()
      .references(() => contentVersions.id),
    laidAt: timestamp('laid_at', { withTimezone: true }).notNull().defaultNow(),
    /** Mise en couveuse (null tant que l'œuf est dans le sac). */
    incubatedAt: timestamp('incubated_at', { withTimezone: true }),
    /** Éclosion prévue (null tant que l'œuf est dans le sac). */
    hatchAt: timestamp('hatch_at', { withTimezone: true }),
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
    /** Dépôt du couple : l'XP gagnée en pension se compte depuis ce moment (rendue au retrait). */
    depositedAt: timestamp('deposited_at', { withTimezone: true }).notNull().defaultNow(),
    /** Dépôt de chaque parent (déposés un par un) : son XP se compte depuis ce moment. */
    parentADepositedAt: timestamp('parent_a_deposited_at', { withTimezone: true }),
    parentBDepositedAt: timestamp('parent_b_deposited_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('daycare_slots_owner_slot').on(t.ownerId, t.slotIndex)],
);
