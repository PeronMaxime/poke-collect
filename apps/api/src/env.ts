import { fileURLToPath } from 'node:url';

export interface Env {
  databaseUrl: string | undefined;
  pgliteDataDir: string;
  authSecret: string;
  authUrl: string;
  trustedOrigins: string[];
  host: string;
  port: number;
  google?: { clientId: string; clientSecret: string };
  discord?: { clientId: string; clientSecret: string };
}

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const DEV_SECRET = 'dev-secret-not-for-production-0123456789abcdef';

/** Charge `.env` à la racine du monorepo s'il existe, puis lit la configuration. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (source === process.env) {
    try {
      process.loadEnvFile(`${ROOT}.env`);
    } catch {
      // pas de .env : valeurs par défaut de développement
    }
  }

  const isProd = source.NODE_ENV === 'production';
  const authSecret = source.BETTER_AUTH_SECRET || (isProd ? '' : DEV_SECRET);
  if (!authSecret) throw new Error('BETTER_AUTH_SECRET est obligatoire en production');

  const pair = (id?: string, secret?: string) =>
    id && secret ? { clientId: id, clientSecret: secret } : undefined;

  return {
    databaseUrl: source.DATABASE_URL || undefined,
    pgliteDataDir: source.PGLITE_DATA_DIR || `${ROOT}.data/pglite`,
    authSecret,
    authUrl: source.BETTER_AUTH_URL || 'http://localhost:3000',
    trustedOrigins: (source.TRUSTED_ORIGINS || 'http://localhost:5173,http://localhost:5174')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    host: source.API_HOST || (isProd ? '0.0.0.0' : '127.0.0.1'),
    port: Number(source.API_PORT || 3000),
    google: pair(source.GOOGLE_CLIENT_ID, source.GOOGLE_CLIENT_SECRET),
    discord: pair(source.DISCORD_CLIENT_ID, source.DISCORD_CLIENT_SECRET),
  };
}
