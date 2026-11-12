import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth';

/**
 * Profil de jeu d'un compte (dresseur).
 */

export const playerProfiles = pgTable(
  'player_profiles',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    trainerName: text('trainer_name').notNull(),
    regionUnlocked: text('region_unlocked').notNull(),
    /**
     * Régions ouvertes pour de bon, même si leur condition se durcit ensuite (passage de 50 à 75 %
     * du Pokédex précédent) ; les autres suivent leur condition de déblocage.
     */
    openedRegions: jsonb('opened_regions').$type<string[]>().notNull().default([]),
    /** Null tant que le joueur n'a pas choisi son starter. */
    starterSpeciesId: integer('starter_species_id'),
    /** Starter choisi dans chaque région suivante (`{ johto: 155 }`), un seul par région. */
    regionStarters: jsonb('region_starters').$type<Record<string, number>>().notNull().default({}),
    /**
     * Pokémon favori, affiché sur la Fiche Dresseur, dans les classements et la recherche : une
     * espèce (ou une de ses formes) capturée, en chromatique si capturée ainsi. Null : le starter.
     */
    favoriteSpeciesId: integer('favorite_species_id'),
    favoriteFormId: integer('favorite_form_id'),
    favoriteShiny: boolean('favorite_shiny').notNull().default(false),
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
    /** Parcelles de la ferme achetées à la boutique (en plus du départ et des paliers). */
    farmPlots: integer('farm_plots').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('player_profiles_trainer_name_lower').on(sql`lower(${t.trainerName})`)],
);
