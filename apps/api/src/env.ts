import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import webpush from 'web-push';

/** Clés VAPID des notifications Web Push. */
export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  /** Contact de l'expéditeur (`mailto:` ou URL), transmis aux services push. */
  subject: string;
}

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
  /** Absentes : notifications push désactivées. */
  vapid?: VapidKeys;
  /** Intervalle de la tournée des notifications push (0 = désactivée). */
  pushIntervalSeconds: number;
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
    vapid: vapidKeys(source, isProd),
    pushIntervalSeconds: Number(source.PUSH_INTERVAL_SECONDS || 60),
  };
}

/**
 * Clés VAPID : variables d'environnement, sinon (hors production) une paire générée une fois et
 * gardée dans `.data/vapid.json`, pour que les abonnements restent valides d'un redémarrage à
 * l'autre. En production, sans variables, les notifications push sont désactivées.
 */
function vapidKeys(source: NodeJS.ProcessEnv, isProd: boolean): VapidKeys | undefined {
  const subject = source.VAPID_SUBJECT || 'mailto:admin@poke-collect.local';
  if (source.VAPID_PUBLIC_KEY && source.VAPID_PRIVATE_KEY) {
    return {
      publicKey: source.VAPID_PUBLIC_KEY,
      privateKey: source.VAPID_PRIVATE_KEY,
      subject,
    };
  }
  if (isProd || source.VAPID_DISABLED) return undefined;
  if (source.NODE_ENV === 'test') return { ...webpush.generateVAPIDKeys(), subject };
  const file = `${ROOT}.data/vapid.json`;
  try {
    const keys = JSON.parse(readFileSync(file, 'utf8')) as Omit<VapidKeys, 'subject'>;
    return { ...keys, subject };
  } catch {
    const keys = webpush.generateVAPIDKeys();
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(keys, null, 2));
    return { ...keys, subject };
  }
}
