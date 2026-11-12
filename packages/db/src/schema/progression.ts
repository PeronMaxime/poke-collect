import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { contentVersions } from './content';
import { ownerId } from './game-columns';

/**
 * Récompenses réclamées et avancement des quêtes.
 */

export const rewardKind = pgEnum('reward_kind', ['collection', 'completion']);

/**
 * Récompenses de progression réclamées (collections, complétions d'expédition
 * par expédition ou région : `complétion:cible`) : une seule fois chacune.
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
     * Légendaire capturé avant la réécriture des quêtes (0123) : le relâcher fait recommencer
     * toute la quête (ligne supprimée) au lieu du seul combat.
     */
    restartOnRelease: boolean('restart_on_release').notNull().default(false),
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
