import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { accounts, sessions, users, verifications } from '@poke/db';
import type { Db } from '@poke/db';
import type { Env } from './env';

export function createAuth(db: Db, env: Env) {
  return betterAuth({
    appName: 'Poké Collect',
    baseURL: env.authUrl,
    basePath: '/api/auth',
    secret: env.authSecret,
    trustedOrigins: env.trustedOrigins,
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { user: users, session: sessions, account: accounts, verification: verifications },
    }),
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    socialProviders: {
      ...(env.google && { google: env.google }),
      ...(env.discord && { discord: env.discord }),
    },
    user: {
      additionalFields: {
        // Le rôle ne peut jamais être fourni par le client (input: false).
        role: { type: 'string', required: false, defaultValue: 'player', input: false },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
