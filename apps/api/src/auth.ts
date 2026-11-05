import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import { accounts, sessions, users, verifications } from '@poke/db';
import type { Db } from '@poke/db';
import type { Env } from './env';
import { resetPasswordMail } from './mail';
import type { Mailer } from './mail';

/**
 * Comptes supprimés depuis le démarrage : leur cookie de session en cache (5 min) ne doit plus
 * ouvrir de session. Les redémarrages vident la liste, le cache expire de toute façon.
 */
export const deletedUserIds = new Set<string>();

/** `mailer` absent : pas de réinitialisation du mot de passe (aucun moyen d'envoyer le lien). */
export function createAuth(db: Db, env: Env, mailer: Mailer | null = null) {
  return betterAuth({
    appName: 'Dexpedition',
    baseURL: env.authUrl,
    basePath: '/api/auth',
    secret: env.authSecret,
    trustedOrigins: env.trustedOrigins,
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { user: users, session: sessions, account: accounts, verification: verifications },
    }),
    session: {
      // Session lue dans un cookie signé pendant 5 min au lieu de la base (1 à 2 requêtes SQL de
      // moins par appel). Une session révoquée ailleurs reste valable au plus 5 min ; les routes
      // d'administration relisent la base (`disableCookieCache`, voir `plugins/session.ts`).
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      ...(mailer && {
        sendResetPassword: ({ user, url }) => mailer(resetPasswordMail(user.email, url)),
        // Un mot de passe réinitialisé déconnecte tous les appareils (compte peut-être compromis).
        revokeSessionsOnPasswordReset: true,
      }),
    },
    socialProviders: {
      ...(env.google && { google: env.google }),
      ...(env.discord && { discord: env.discord }),
    },
    user: {
      // Suppression du compte par le joueur (RGPD) : mot de passe demandé, données du jeu
      // supprimées en cascade par la base.
      deleteUser: {
        enabled: true,
        beforeDelete: async (user) => {
          if ((user as { role?: string }).role === 'admin') {
            throw new APIError('FORBIDDEN', {
              message: 'Un compte administrateur ne peut pas être supprimé',
            });
          }
        },
        afterDelete: async (user) => {
          deletedUserIds.add(user.id);
        },
      },
      additionalFields: {
        // Le rôle ne peut jamais être fourni par le client (input: false).
        role: { type: 'string', required: false, defaultValue: 'player', input: false },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
