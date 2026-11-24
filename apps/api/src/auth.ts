import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { captcha, twoFactor } from 'better-auth/plugins';
import { accounts, sessions, twoFactors, users, verifications } from '@poke/db';
import type { Db } from '@poke/db';
import type { Env } from './env';
import { resetPasswordMail, verifyEmailMail } from './mail';
import type { Mailer } from './mail';

/**
 * Comptes et sessions (Better Auth) : e-mail et mot de passe, Google et Discord s'ils sont
 * configurés, session en cookie, réinitialisation du mot de passe et vérification de l'adresse
 * par e-mail, double authentification (exigée des administrateurs), captcha et limites de débit.
 */

/** Routes de Better Auth protégées par le captcha quand il est configuré. */
const CAPTCHA_ENDPOINTS = ['/sign-up/email', '/sign-in/email', '/request-password-reset'];

/**
 * Limites par IP des routes d'authentification (fenêtre en secondes), en plus de la limite
 * générale de Better Auth (100 requêtes par 10 s). Actives si `env.authRateLimit`.
 */
const AUTH_RATE_LIMITS = {
  '/sign-in/email': { window: 60, max: 5 },
  '/sign-up/email': { window: 600, max: 10 },
  '/request-password-reset': { window: 3600, max: 3 },
  '/send-verification-email': { window: 3600, max: 3 },
  '/two-factor/*': { window: 60, max: 5 },
};

/**
 * Routes du second facteur qui ouvrent une session : celle-ci est marquée `twoFactorVerified`,
 * la seule qui ouvre l'administration (voir `requireAdmin`).
 */
const SECOND_FACTOR_PATHS = new Set(['/two-factor/verify-totp', '/two-factor/verify-backup-code']);

/** Ce que l'application fait autour de la suppression d'un compte par son joueur. */
export interface AccountDeletionHooks {
  /** Avant : quitter ses guildes (passation du rôle de chef). Une erreur annule la suppression. */
  beforeDelete?: (userId: string) => Promise<void>;
  /** Après : son cookie de session encore en cache (5 min) n'ouvre plus le jeu. */
  deleted?: (userId: string) => void;
}

/**
 * `mailer` absent : pas de réinitialisation du mot de passe ni de vérification de l'adresse
 * (aucun moyen d'envoyer le lien).
 */
export function createAuth(
  db: Db,
  env: Env,
  mailer: Mailer | null = null,
  deletion: AccountDeletionHooks = {},
) {
  const verifyEmails = env.emailVerification && mailer !== null;
  return betterAuth({
    appName: 'Dexpedition',
    baseURL: env.authUrl,
    basePath: '/api/auth',
    secret: env.authSecret,
    trustedOrigins: env.trustedOrigins,
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: users,
        session: sessions,
        account: accounts,
        verification: verifications,
        twoFactor: twoFactors,
      },
    }),
    session: {
      // Session lue dans un cookie signé pendant 5 min au lieu de la base (1 à 2 requêtes SQL de
      // moins par appel). Une session révoquée ailleurs reste valable au plus 5 min ; les routes
      // d'administration relisent la base (`disableCookieCache`, voir `plugins/session.ts`).
      cookieCache: { enabled: true, maxAge: 5 * 60 },
      additionalFields: {
        twoFactorVerified: { type: 'boolean', required: false, defaultValue: false, input: false },
      },
    },
    databaseHooks: {
      session: {
        create: {
          // Marque posée par le serveur seul, d'après la route qui crée la session : une connexion
          // par mot de passe, Google ou Discord ne la porte jamais.
          before: async (session, ctx) => ({
            data: { ...session, twoFactorVerified: SECOND_FACTOR_PATHS.has(ctx?.path ?? '') },
          }),
        },
      },
    },
    hooks: {
      // La double authentification est réservée aux administrateurs : le jeu ne sait pas la
      // désactiver, un joueur qui l'activerait par erreur ne pourrait plus s'en défaire seul.
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/two-factor/enable') return;
        // Rôle relu en base : le cookie de session garde 5 min celui de sa création.
        const session = await getSessionFromCtx<{ role?: string }>(ctx, {
          disableCookieCache: true,
        });
        if (session?.user.role !== 'admin') {
          throw new APIError('FORBIDDEN', {
            message: 'La double authentification est réservée aux administrateurs',
          });
        }
      }),
    },
    rateLimit: { enabled: env.authRateLimit, customRules: AUTH_RATE_LIMITS },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      ...(mailer && {
        sendResetPassword: ({ user, url }) => mailer(resetPasswordMail(user.email, url)),
        // Un mot de passe réinitialisé déconnecte tous les appareils (compte peut-être compromis).
        revokeSessionsOnPasswordReset: true,
      }),
      // Nouveau compte : pas de session avant le clic sur le lien de l'e-mail (les comptes créés
      // avant le 23 nov. 2026 sont marqués vérifiés, migration 0153).
      requireEmailVerification: verifyEmails,
    },
    ...(mailer &&
      verifyEmails && {
        emailVerification: {
          sendOnSignUp: true,
          // Connexion d'un compte non vérifié : le lien est renvoyé (limité par AUTH_RATE_LIMITS).
          sendOnSignIn: true,
          autoSignInAfterVerification: true,
          expiresIn: 24 * 60 * 60,
          sendVerificationEmail: ({ user, url }) => mailer(verifyEmailMail(user.email, url)),
        },
      }),
    plugins: [
      twoFactor({ issuer: 'Dexpedition', backupCodeOptions: { amount: 10 } }),
      ...(env.captcha
        ? [
            captcha({
              provider: 'cloudflare-turnstile',
              secretKey: env.captcha.secretKey,
              // Les domaines autorisés se règlent chez Cloudflare, sur la clé publique.
              endpoints: CAPTCHA_ENDPOINTS,
              ...(env.captcha.verifyUrl && { siteVerifyURLOverride: env.captcha.verifyUrl }),
            }),
          ]
        : []),
    ],
    socialProviders: {
      ...(env.google && { google: env.google }),
      ...(env.discord && { discord: env.discord }),
    },
    user: {
      // Suppression du compte par le joueur (RGPD) : mot de passe demandé (vérifié avant
      // `beforeDelete`), données du jeu supprimées en cascade par la base.
      deleteUser: {
        enabled: true,
        beforeDelete: async (user) => {
          if ((user as { role?: string }).role === 'admin') {
            throw new APIError('FORBIDDEN', {
              message: 'Un compte administrateur ne peut pas être supprimé',
            });
          }
          await deletion.beforeDelete?.(user.id);
        },
        afterDelete: async (user) => {
          deletion.deleted?.(user.id);
        },
      },
      additionalFields: {
        // Le rôle ne peut jamais être fourni par le client (input: false).
        role: { type: 'string', required: false, defaultValue: 'player', input: false },
      },
    },
  });
}

/** L'instance Better Auth de l'application. */
export type Auth = ReturnType<typeof createAuth>;
