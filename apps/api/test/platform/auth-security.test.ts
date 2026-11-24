import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { sessions, users } from '@poke/db';
import { buildApp } from '../../src/app';
import type { AppOptions } from '../../src/app';
import { loadEnv } from '../../src/env';
import type { MailMessage } from '../../src/mail';
import { totpCode } from '../../src/testing/totp';
import { mergeCookies, testApi } from '../support/api';

/**
 * Plan de sécurité, phase 2 : double authentification des administrateurs, vérification de
 * l'e-mail, captcha, limites de débit de l'authentification, secret de production.
 */

const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'motdepasse-solide';

const api = testApi();
const { handle, env } = api;

type App = Awaited<ReturnType<typeof buildApp>>['app'];

/** POST JSON vers `app` (l'API de test par défaut), avec l'origine du jeu. */
function post(url: string, payload: object, cookie = '', app: App = api.app) {
  return app.inject({
    method: 'POST',
    url,
    headers: { 'content-type': 'application/json', origin: ORIGIN, ...(cookie && { cookie }) },
    payload,
  });
}

const adminMe = (cookie: string) =>
  api.app.inject({ method: 'GET', url: '/api/admin/me', headers: { cookie } });

/** Une seconde application sur la même base, avec d'autres réglages ; fermée en fin de test. */
async function withApp<T>(options: Partial<AppOptions>, run: (app: App) => Promise<T>) {
  const { app } = await buildApp({ db: handle.db, env, ...options });
  try {
    return await run(app);
  } finally {
    await app.close();
  }
}

describe('double authentification des administrateurs', () => {
  it('un administrateur sans second facteur doit l’activer avant toute action', async () => {
    const { cookie, userId } = await api.signUp('orme@example.com');
    expect((await adminMe(cookie)).statusCode).toBe(403);
    await handle.db.update(users).set({ role: 'admin' }).where(eq(users.id, userId));
    const res = await adminMe(cookie);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'ADMIN_2FA_SETUP_REQUIRED' });
  });

  it('un joueur ne peut pas l’activer', async () => {
    const { cookie } = await api.signUp('joueur-2fa@example.com');
    const res = await post('/api/auth/two-factor/enable', { password: PASSWORD }, cookie);
    expect(res.statusCode).toBe(403);
    const [row] = await handle.db
      .select()
      .from(users)
      .where(eq(users.email, 'joueur-2fa@example.com'));
    expect(row!.twoFactorEnabled).toBe(false);
  });

  it('activé, puis exigé à chaque connexion par mot de passe (code ou code de secours)', async () => {
    const { cookie, userId } = await api.signUp('chen-2fa@example.com');
    const admin = await api.promoteAdmin(userId, cookie);
    expect((await adminMe(admin.cookie)).statusCode).toBe(200);
    // La session d'avant l'activation est remplacée.
    expect((await adminMe(cookie)).statusCode).toBe(401);
    expect(admin.backupCodes).toHaveLength(10);

    // Connexion : le mot de passe seul n'ouvre aucune session, il faut le code.
    const signIn = await post('/api/auth/sign-in/email', {
      email: 'chen-2fa@example.com',
      password: PASSWORD,
    });
    expect(signIn.statusCode, signIn.body).toBe(200);
    expect(signIn.json()).toMatchObject({ twoFactorRedirect: true });
    const pending = mergeCookies('', signIn.headers['set-cookie']);
    expect((await adminMe(pending)).statusCode).toBe(401);
    expect(
      (await post('/api/auth/two-factor/verify-totp', { code: '000000' }, pending)).statusCode,
    ).toBe(401);
    const verified = await post(
      '/api/auth/two-factor/verify-totp',
      { code: totpCode(admin.totpURI) },
      pending,
    );
    expect(verified.statusCode, verified.body).toBe(200);
    expect((await adminMe(mergeCookies(pending, verified.headers['set-cookie']))).statusCode).toBe(
      200,
    );

    // Code de secours, à usage unique.
    const again = await post('/api/auth/sign-in/email', {
      email: 'chen-2fa@example.com',
      password: PASSWORD,
    });
    const pending2 = mergeCookies('', again.headers['set-cookie']);
    const backup = await post(
      '/api/auth/two-factor/verify-backup-code',
      { code: admin.backupCodes[0] },
      pending2,
    );
    expect(backup.statusCode, backup.body).toBe(200);
    expect((await adminMe(mergeCookies(pending2, backup.headers['set-cookie']))).statusCode).toBe(
      200,
    );
  });

  it('une session ouverte sans second facteur (Google, Discord) n’ouvre pas l’administration', async () => {
    const { cookie, userId } = await api.signUp('sorbier-2fa@example.com');
    const admin = await api.promoteAdmin(userId, cookie);
    // Ce que produit une connexion OAuth : une session du même compte, sans la marque.
    await handle.db
      .update(sessions)
      .set({ twoFactorVerified: false })
      .where(eq(sessions.userId, userId));
    const res = await adminMe(admin.cookie);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'ADMIN_2FA_REQUIRED' });
    // Le jeu, lui, reste ouvert avec cette session.
    expect((await admin.call('GET', '/api/me')).status).toBe(200);
  });
});

describe('vérification de l’adresse e-mail', () => {
  it('le compte ne s’ouvre qu’après le clic sur le lien', async () => {
    const sent: MailMessage[] = [];
    const mailer = async (message: MailMessage) => {
      sent.push(message);
    };
    await withApp({ env: { ...env, emailVerification: true }, mailer }, async (app) => {
      expect((await app.inject({ method: 'GET', url: '/api/config' })).json()).toMatchObject({
        emailVerification: true,
      });
      const signUp = await post(
        '/api/auth/sign-up/email',
        { email: 'nouveau@example.com', password: PASSWORD, name: 'nouveau', callbackURL: ORIGIN },
        '',
        app,
      );
      expect(signUp.statusCode, signUp.body).toBe(200);
      expect(signUp.json()).toMatchObject({ token: null });
      expect(sent.map((m) => m.to)).toEqual(['nouveau@example.com']);

      const signIn = () =>
        post(
          '/api/auth/sign-in/email',
          { email: 'nouveau@example.com', password: PASSWORD },
          '',
          app,
        );
      const refused = await signIn();
      expect(refused.statusCode).toBe(403);
      expect(refused.json()).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });

      const link = new URL(sent[0]!.text.match(/https?:\/\/\S+/)![0]);
      const verify = await app.inject({ method: 'GET', url: link.pathname + link.search });
      expect(verify.statusCode).toBe(302);
      expect(verify.headers.location).toBe(ORIGIN);
      const cookie = mergeCookies('', verify.headers['set-cookie']);
      const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
      expect(me.statusCode).toBe(200);
      expect((await signIn()).statusCode).toBe(200);
    });
  });

  it('désactivée par défaut hors production : l’inscription ouvre la session', async () => {
    const res = await api.app.inject({ method: 'GET', url: '/api/config' });
    expect(res.json()).toMatchObject({ emailVerification: false, captchaSiteKey: null });
    const { cookie } = await api.signUp('direct@example.com');
    expect(cookie).toMatch(/session_token=/);
  });
});

describe('captcha (Cloudflare Turnstile)', () => {
  /** Faux service de vérification : valide le jeton « bon-jeton », refuse les autres. */
  const verifier = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));
    req.on('end', () => {
      const { response } = JSON.parse(body) as { response: string };
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ success: response === 'bon-jeton', hostname: 'localhost' }));
    });
  });
  let verifyUrl = '';
  beforeAll(async () => {
    await new Promise<void>((resolve) => verifier.listen(0, '127.0.0.1', resolve));
    verifyUrl = `http://127.0.0.1:${(verifier.address() as AddressInfo).port}/siteverify`;
  });
  afterAll(() => new Promise<void>((resolve) => verifier.close(() => resolve())));

  it('exigé sur l’inscription et la connexion, annoncé au jeu', async () => {
    const captcha = { siteKey: 'cle-publique', secretKey: 'cle-secrete', verifyUrl };
    await withApp({ env: { ...env, captcha } }, async (app) => {
      expect((await app.inject({ method: 'GET', url: '/api/config' })).json()).toMatchObject({
        captchaSiteKey: 'cle-publique',
      });
      const signUp = (token?: string) =>
        app.inject({
          method: 'POST',
          url: '/api/auth/sign-up/email',
          headers: {
            'content-type': 'application/json',
            origin: ORIGIN,
            ...(token && { 'x-captcha-response': token }),
          },
          payload: { email: 'robot@example.com', password: PASSWORD, name: 'robot' },
        });
      expect((await signUp()).statusCode).toBe(400);
      expect((await signUp('mauvais-jeton')).statusCode).toBe(403);
      expect((await signUp('bon-jeton')).statusCode).toBe(200);
      // La connexion aussi.
      const signIn = await post(
        '/api/auth/sign-in/email',
        { email: 'robot@example.com', password: PASSWORD },
        '',
        app,
      );
      expect(signIn.statusCode).toBe(400);
    });
  });
});

describe('limites de débit de l’authentification', () => {
  it('actives par défaut en production : 5 connexions par minute, 3 mots de passe oubliés par heure', async () => {
    const prod = loadEnv({ NODE_ENV: 'production', BETTER_AUTH_SECRET: 'a'.repeat(64) });
    expect(prod.authRateLimit).toBe(true);
    await withApp({ env: { ...env, authRateLimit: true }, mailer: async () => {} }, async (app) => {
      const signIn = () =>
        post(
          '/api/auth/sign-in/email',
          { email: 'inconnu@example.com', password: 'pas-le-bon' },
          '',
          app,
        );
      for (let i = 0; i < 5; i++) expect((await signIn()).statusCode).toBe(401);
      const limited = await signIn();
      expect(limited.statusCode).toBe(429);
      expect(Number(limited.headers['x-retry-after'])).toBeGreaterThan(0);

      const forgot = () =>
        post('/api/auth/request-password-reset', { email: 'inconnu@example.com' }, '', app);
      for (let i = 0; i < 3; i++) expect((await forgot()).statusCode).toBe(200);
      expect((await forgot()).statusCode).toBe(429);
    });
  });
});

describe('secret des sessions en production', () => {
  const prod = (secret?: string) => () =>
    loadEnv({
      NODE_ENV: 'production',
      ...(secret !== undefined && { BETTER_AUTH_SECRET: secret }),
    });

  it('refusé s’il manque, s’il est court ou s’il reprend celui du développement', () => {
    expect(prod()).toThrow(/obligatoire/);
    expect(prod('trop-court')).toThrow(/au moins 32/);
    expect(prod('dev-secret-not-for-production-0123456789abcdef')).toThrow(/développement/);
    expect(prod('f'.repeat(64))).not.toThrow();
  });
});
