import { boolean, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

/**
 * Tables gérées par Better Auth (schéma « core » et greffon `twoFactor`), plus la colonne `role`
 * et la marque de second facteur des sessions. Garder ces colonnes alignées avec la configuration
 * de `apps/api/src/auth.ts`.
 */

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  role: text('role', { enum: ['player', 'admin'] })
    .notNull()
    .default('player'),
  /** Double authentification activée (greffon `twoFactor` ; exigée des administrateurs). */
  twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
  /** Dernière requête authentifiée (présence affichée dans l'administration). */
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  /**
   * Suspension par la modération : le jeu est refusé (`ACCOUNT_SUSPENDED`) jusqu'à cette date ;
   * null : compte actif. Une suspension définitive porte la date `SUSPENDED_FOREVER` (an 9999).
   * Noms distincts de ceux du greffon `admin` de Better Auth (`banned`, `banExpires`).
   */
  suspendedUntil: timestamp('suspended_until', { withTimezone: true }),
  /** Motif de la suspension, montré au joueur ; null sans suspension. */
  suspensionReason: text('suspension_reason'),
  /**
   * Bêta : profil secondaire (nouvelle partie sans nouveau compte) rattaché au compte principal.
   * Sans identifiant de connexion ; sélectionné par cookie (voir `apps/api/src/beta-profiles.ts`).
   */
  parentUserId: text('parent_user_id').references((): AnyPgColumn => users.id, {
    onDelete: 'cascade',
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  /**
   * Session ouverte en passant le second facteur (code de l'application ou code de secours).
   * Seule une telle session ouvre l'administration : une connexion Google ou Discord ne le passe pas.
   */
  twoFactorVerified: boolean('two_factor_verified').notNull().default(false),
});

export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const verifications = pgTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Second facteur d'un compte (greffon `twoFactor` de Better Auth) : secret de l'application
 * d'authentification et codes de secours, chiffrés avec `BETTER_AUTH_SECRET`.
 */
export const twoFactors = pgTable(
  'two_factors',
  {
    id: text('id').primaryKey(),
    secret: text('secret').notNull(),
    backupCodes: text('backup_codes').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Faux tant que le premier code n'a pas été saisi (enrôlement en cours). */
    verified: boolean('verified').notNull().default(true),
    failedVerificationCount: integer('failed_verification_count').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
  },
  (t) => [index('two_factors_user_id_idx').on(t.userId)],
);
