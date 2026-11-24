import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import webpush from 'web-push';

/**
 * Configuration de l'API : variables d'environnement lues et validées une fois, au démarrage. La
 * liste commentée est dans `.env.example`.
 */

/** Clés VAPID des notifications Web Push. */
export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  /** Contact de l'expéditeur (`mailto:` ou URL), transmis aux services push. */
  subject: string;
}

/** La configuration de l'API, lue une fois au démarrage (voir `loadEnv`). */
export interface Env {
  databaseUrl: string | undefined;
  pgliteDataDir: string;
  /** Instantané du contenu publié, versionné dans Git ; contenu initial d'une base neuve. */
  contentSnapshotPath: string;
  /** Réécrire l'instantané au démarrage et à chaque publication (développement). */
  contentSnapshotWrite: boolean;
  authSecret: string;
  authUrl: string;
  trustedOrigins: string[];
  host: string;
  port: number;
  /** Derrière un proxy (Caddy) : IP et protocole du client lus dans `X-Forwarded-*`. */
  trustProxy: boolean;
  /** Requêtes `/api` autorisées par minute et par joueur, par IP sans session (0 = pas de limite). */
  rateLimitPerMinute: number;
  /** Requêtes `/api` autorisées par minute et par IP, toutes sessions confondues (0 = pas de limite). */
  rateLimitPerIpPerMinute: number;
  /**
   * Lectures lourdes (collection, recherches, classements, fiches des autres) autorisées par minute,
   * par joueur et par route (0 = pas de budget propre : la limite par joueur s'applique).
   */
  rateLimitHeavyPerMinute: number;
  /** Écritures (POST, PUT, PATCH, DELETE) autorisées par minute et par joueur (0 = pas de limite). */
  rateLimitWritesPerMinute: number;
  google?: { clientId: string; clientSecret: string };
  discord?: { clientId: string; clientSecret: string };
  /** Absentes : notifications push désactivées. */
  vapid?: VapidKeys;
  /**
   * Envoi des e-mails (réinitialisation du mot de passe). Absent : en développement, les e-mails
   * sont affichés dans la console ; en production, la réinitialisation est désactivée.
   */
  smtp?: { url: string; from: string };
  /**
   * Inscription par e-mail : le compte ne s'ouvre qu'après le clic sur le lien envoyé. Par défaut,
   * en production quand les e-mails partent (SMTP) ; `EMAIL_VERIFICATION=0|1` pour forcer.
   */
  emailVerification: boolean;
  /**
   * Captcha Cloudflare Turnstile sur l'inscription, la connexion et le mot de passe oublié.
   * Absent (clés non fournies) : pas de captcha.
   */
  captcha?: {
    siteKey: string;
    secretKey: string;
    /** Tests : adresse d'un faux service de vérification à la place de Cloudflare. */
    verifyUrl?: string;
  };
  /**
   * Limites de Better Auth sur la connexion, l'inscription, le mot de passe oublié et le second
   * facteur (par IP, en mémoire). Par défaut en production ; `AUTH_RATE_LIMIT=0|1` pour forcer.
   */
  authRateLimit: boolean;
  /** Intervalle de la tournée des notifications push (0 = désactivée). */
  pushIntervalSeconds: number;
  /**
   * Lancer les tâches de fond qui ne doivent tourner que dans un seul processus (notifications
   * push, coffres de guilde). À couper (`BACKGROUND_JOBS=0`) dans les processus supplémentaires.
   */
  backgroundJobs: boolean;
}

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const DEV_SECRET = 'dev-secret-not-for-production-0123456789abcdef';
/** Longueur minimale du secret des sessions en production (`openssl rand -hex 32` en donne 64). */
const MIN_SECRET_LENGTH = 32;

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
  if (isProd && (authSecret.length < MIN_SECRET_LENGTH || authSecret === DEV_SECRET)) {
    throw new Error(
      `BETTER_AUTH_SECRET doit compter au moins ${MIN_SECRET_LENGTH} caractères tirés au hasard (openssl rand -hex 32), pas le secret de développement`,
    );
  }

  const pair = (id?: string, secret?: string) =>
    id && secret ? { clientId: id, clientSecret: secret } : undefined;
  /** `1` ou `0` explicite, sinon la valeur par défaut. */
  const flag = (value: string | undefined, fallback: boolean) =>
    value === '1' ? true : value === '0' ? false : fallback;

  return {
    databaseUrl: source.DATABASE_URL || undefined,
    pgliteDataDir: source.PGLITE_DATA_DIR || `${ROOT}.data/pglite`,
    contentSnapshotPath: source.CONTENT_SNAPSHOT_PATH || `${ROOT}content/game-content.json`,
    contentSnapshotWrite: source.CONTENT_SNAPSHOT_WRITE
      ? source.CONTENT_SNAPSHOT_WRITE === '1'
      : !isProd && source.NODE_ENV !== 'test',
    authSecret,
    authUrl: source.BETTER_AUTH_URL || 'http://localhost:3000',
    trustedOrigins: (source.TRUSTED_ORIGINS || 'http://localhost:5173,http://localhost:5174')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    host: source.API_HOST || (isProd ? '0.0.0.0' : '127.0.0.1'),
    port: Number(source.API_PORT || 3000),
    trustProxy: source.TRUST_PROXY ? source.TRUST_PROXY === '1' : isProd,
    rateLimitPerMinute: Number(source.RATE_LIMIT_PER_MINUTE || (isProd ? 600 : 0)),
    rateLimitPerIpPerMinute: Number(source.RATE_LIMIT_PER_IP_PER_MINUTE || (isProd ? 1500 : 0)),
    rateLimitHeavyPerMinute: Number(source.RATE_LIMIT_HEAVY_PER_MINUTE || (isProd ? 120 : 0)),
    rateLimitWritesPerMinute: Number(source.RATE_LIMIT_WRITES_PER_MINUTE || (isProd ? 300 : 0)),
    google: pair(source.GOOGLE_CLIENT_ID, source.GOOGLE_CLIENT_SECRET),
    discord: pair(source.DISCORD_CLIENT_ID, source.DISCORD_CLIENT_SECRET),
    vapid: vapidKeys(source, isProd),
    ...(source.SMTP_URL && {
      smtp: { url: source.SMTP_URL, from: source.MAIL_FROM || 'Dexpedition <noreply@localhost>' },
    }),
    emailVerification: flag(source.EMAIL_VERIFICATION, isProd && Boolean(source.SMTP_URL)),
    ...(source.TURNSTILE_SITE_KEY &&
      source.TURNSTILE_SECRET_KEY && {
        captcha: { siteKey: source.TURNSTILE_SITE_KEY, secretKey: source.TURNSTILE_SECRET_KEY },
      }),
    authRateLimit: flag(source.AUTH_RATE_LIMIT, isProd),
    pushIntervalSeconds: Number(source.PUSH_INTERVAL_SECONDS || 60),
    backgroundJobs: source.BACKGROUND_JOBS !== '0',
  };
}

/**
 * Clés VAPID : variables d'environnement, sinon (hors production) une paire générée une fois et
 * gardée dans `.data/vapid.json`, pour que les abonnements restent valides d'un redémarrage à
 * l'autre. En production, sans variables, les notifications push sont désactivées.
 */
function vapidKeys(source: NodeJS.ProcessEnv, isProd: boolean): VapidKeys | undefined {
  const subject = source.VAPID_SUBJECT || 'mailto:admin@dexpedition.local';
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
