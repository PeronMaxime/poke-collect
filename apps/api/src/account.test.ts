import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { seedContent } from '@poke/content';
import { createDb, ensureSeedContent, playerProfiles, pokemon, users } from '@poke/db';
import { buildApp } from './app';
import { loadEnv } from './env';
import type { MailMessage } from './mail';

const handle = createDb({ pgliteDataDir: 'memory://' });
const env = loadEnv({ NODE_ENV: 'test' });
const ORIGIN = 'http://localhost:5173';
const sent: MailMessage[] = [];
let app: Awaited<ReturnType<typeof buildApp>>['app'];

beforeAll(async () => {
  await handle.migrate();
  await ensureSeedContent(handle.db, seedContent);
  ({ app } = await buildApp({
    db: handle.db,
    env,
    mailer: async (message) => {
      sent.push(message);
    },
  }));
});
afterAll(async () => {
  await app.close();
  await handle.close();
});

async function post(url: string, payload: unknown, cookie?: string) {
  return app.inject({
    method: 'POST',
    url,
    headers: { 'content-type': 'application/json', origin: ORIGIN, ...(cookie && { cookie }) },
    payload: payload as object,
  });
}

/** Inscription, profil et starter : un joueur avec des données de jeu. Retourne le cookie. */
async function newPlayer(email: string, password: string): Promise<string> {
  const res = await post('/api/auth/sign-up/email', { email, password, name: 'Dresseur' });
  expect(res.statusCode, res.body).toBe(200);
  const cookies = res.headers['set-cookie'];
  const cookie = (Array.isArray(cookies) ? cookies : [cookies ?? ''])
    .map((c) => c.split(';')[0])
    .join('; ');
  const name = email.split('@')[0]!;
  expect((await post('/api/profile', { trainerName: name }, cookie)).statusCode).toBe(201);
  const starter = seedContent.regions[0]!.starterSpeciesIds[0]!;
  expect((await post('/api/starter', { speciesId: starter }, cookie)).statusCode).toBe(201);
  return cookie;
}

const signIn = (email: string, password: string) =>
  post('/api/auth/sign-in/email', { email, password });

describe('réinitialisation du mot de passe', () => {
  it('annoncée dans la configuration quand les e-mails sont disponibles', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/config' });
    expect(res.json()).toMatchObject({ passwordReset: true });
  });

  it('e-mail avec un lien, nouveau mot de passe, ancien refusé', async () => {
    await newPlayer('ondine@example.com', 'ancien-mot-de-passe');
    sent.length = 0;
    const request = await post('/api/auth/request-password-reset', {
      email: 'ondine@example.com',
      redirectTo: `${ORIGIN}/reinitialiser-mot-de-passe`,
    });
    expect(request.statusCode, request.body).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('ondine@example.com');

    // Le lien de l'e-mail redirige vers la page du jeu avec le jeton.
    const link = new URL(sent[0]!.text.match(/https?:\/\/\S+/)![0]);
    const callback = await app.inject({ method: 'GET', url: link.pathname + link.search });
    expect(callback.statusCode).toBe(302);
    const target = new URL(callback.headers.location as string);
    expect(target.origin + target.pathname).toBe(`${ORIGIN}/reinitialiser-mot-de-passe`);
    const token = target.searchParams.get('token')!;
    expect(token).toBeTruthy();

    const reset = await post('/api/auth/reset-password', {
      newPassword: 'nouveau-mot-de-passe',
      token,
    });
    expect(reset.statusCode, reset.body).toBe(200);
    expect((await signIn('ondine@example.com', 'ancien-mot-de-passe')).statusCode).toBe(401);
    expect((await signIn('ondine@example.com', 'nouveau-mot-de-passe')).statusCode).toBe(200);
    // Jeton à usage unique.
    const again = await post('/api/auth/reset-password', { newPassword: 'encore-un-autre', token });
    expect(again.statusCode).toBe(400);
  });

  it('adresse inconnue : même réponse, aucun e-mail', async () => {
    sent.length = 0;
    const res = await post('/api/auth/request-password-reset', {
      email: 'personne@example.com',
      redirectTo: `${ORIGIN}/reinitialiser-mot-de-passe`,
    });
    expect(res.statusCode).toBe(200);
    expect(sent).toHaveLength(0);
  });

  it('désactivée sans moyen d’envoyer les e-mails', async () => {
    const { app: noMail } = await buildApp({ db: handle.db, env });
    try {
      const config = await noMail.inject({ method: 'GET', url: '/api/config' });
      expect(config.json()).toMatchObject({ passwordReset: false });
      const res = await noMail.inject({
        method: 'POST',
        url: '/api/auth/request-password-reset',
        headers: { 'content-type': 'application/json', origin: ORIGIN },
        payload: { email: 'ondine@example.com' },
      });
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    } finally {
      await noMail.close();
    }
  });
});

describe('suppression du compte', () => {
  it('mauvais mot de passe : rien n’est supprimé', async () => {
    const cookie = await newPlayer('pierre@example.com', 'mot-de-passe-pierre');
    const res = await post('/api/auth/delete-user', { password: 'pas-le-bon' }, cookie);
    expect(res.statusCode).toBe(400);
    expect(
      await handle.db.select().from(users).where(eq(users.email, 'pierre@example.com')),
    ).toHaveLength(1);
  });

  it('supprime le compte et toutes les données du jeu', async () => {
    const cookie = await newPlayer('flora@example.com', 'mot-de-passe-flora');
    const [user] = await handle.db.select().from(users).where(eq(users.email, 'flora@example.com'));
    expect(
      await handle.db.select().from(pokemon).where(eq(pokemon.ownerId, user!.id)),
    ).toHaveLength(1);

    const res = await post('/api/auth/delete-user', { password: 'mot-de-passe-flora' }, cookie);
    expect(res.statusCode, res.body).toBe(200);
    expect(await handle.db.select().from(users).where(eq(users.id, user!.id))).toHaveLength(0);
    expect(
      await handle.db.select().from(playerProfiles).where(eq(playerProfiles.userId, user!.id)),
    ).toHaveLength(0);
    expect(
      await handle.db.select().from(pokemon).where(eq(pokemon.ownerId, user!.id)),
    ).toHaveLength(0);
    // Session supprimée, et l'adresse est de nouveau libre.
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(me.statusCode).toBe(401);
    expect((await signIn('flora@example.com', 'mot-de-passe-flora')).statusCode).toBe(401);
  });

  it('refusée pour un compte administrateur', async () => {
    const cookie = await newPlayer('chen@example.com', 'mot-de-passe-chen');
    await handle.db.update(users).set({ role: 'admin' }).where(eq(users.email, 'chen@example.com'));
    const res = await post('/api/auth/delete-user', { password: 'mot-de-passe-chen' }, cookie);
    expect(res.statusCode).toBe(403);
    expect(
      await handle.db.select().from(users).where(eq(users.email, 'chen@example.com')),
    ).toHaveLength(1);
  });
});
