import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { seedContent } from '@poke/content';
import { forms, itemSpriteUrl, pokemonSpriteUrl, species } from '@poke/data';
import { createDb, ensureSeedContent, users } from '@poke/db';
import { buildApp } from './app';
import { loadEnv } from './env';

const handle = createDb({ pgliteDataDir: 'memory://' });
const env = loadEnv({ NODE_ENV: 'test' });
let app: Awaited<ReturnType<typeof buildApp>>['app'];

beforeAll(async () => {
  await handle.migrate();
  await ensureSeedContent(handle.db, seedContent);
  ({ app } = await buildApp({ db: handle.db, env }));
});
afterAll(async () => {
  await app.close();
  await handle.close();
});

/** Crée un compte et retourne le cookie de session. */
async function signUp(email: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
    payload: { email, password: 'motdepasse-solide', name: email.split('@')[0] },
  });
  expect(res.statusCode, res.body).toBe(200);
  const cookies = res.headers['set-cookie'];
  const list = Array.isArray(cookies) ? cookies : [cookies ?? ''];
  return list.map((c) => c.split(';')[0]).join('; ');
}

describe('sprites', () => {
  it('sert une image pour chaque objet et chaque dresseur du contenu de test', async () => {
    const urls = [
      ...seedContent.items.map((i) => i.icon ?? itemSpriteUrl(i.id)),
      ...seedContent.trainers.map((t) => t.sprite),
    ];
    for (const url of urls) {
      expect(url, 'image manquante').toMatch(/^\/api\/sprites\//);
      const res = await app.inject({ method: 'GET', url: url! });
      expect(res.statusCode, url!).toBe(200);
      expect(res.headers['content-type']).toBe('image/png');
    }
  });

  it('sert le petit sprite (normal et shiny) de chaque espèce et de chaque forme', async () => {
    const sprites = [...species.map((s) => s.id), ...forms.flatMap((f) => f.sprite ?? [])];
    for (const sprite of sprites) {
      for (const shiny of [false, true]) {
        const url = pokemonSpriteUrl(sprite, { shiny });
        const res = await app.inject({ method: 'GET', url });
        expect(res.statusCode, url).toBe(200);
      }
    }
  });

  it('refuse les chemins inconnus', async () => {
    for (const url of [
      '/api/sprites/items/inconnu.png',
      '/api/sprites/autre/brock.png',
      '/api/sprites/items/..%2F..%2Fpackage.json',
      '/api/sprites/pokemon/../../package.json',
      '/api/sprites/artwork/25.png',
    ]) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(404);
    }
  });
});

describe('authentification et profil dresseur', () => {
  let cookie: string;

  it('refuse /api/me sans session', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/me' });
    expect(res.statusCode).toBe(401);
  });

  it('inscrit un joueur (rôle player par défaut)', async () => {
    cookie = await signUp('sacha@example.com');
    const res = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      user: { email: 'sacha@example.com', role: 'player' },
      profile: null,
    });
  });

  it('ignore un rôle fourni par le client à l’inscription', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
      payload: {
        email: 'pirate@example.com',
        password: 'motdepasse-solide',
        name: 'x',
        role: 'admin',
      },
    });
    const [row] = await handle.db.select().from(users).where(eq(users.email, 'pirate@example.com'));
    expect(row?.role ?? 'player').toBe('player');
    expect(res.statusCode).not.toBe(500);
  });

  it('valide le nom de dresseur', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/profile',
      headers: { cookie },
      payload: { trainerName: 'x' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('crée le profil dans la première région du contenu publié', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/profile',
      headers: { cookie },
      payload: { trainerName: 'Sacha' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      trainerName: 'Sacha',
      regionUnlocked: 'kanto',
      currency: 0,
    });

    const again = await app.inject({
      method: 'POST',
      url: '/api/profile',
      headers: { cookie },
      payload: { trainerName: 'Sacha2' },
    });
    expect(again.statusCode).toBe(409);
  });

  it('refuse un nom de dresseur déjà pris (insensible à la casse)', async () => {
    const other = await signUp('ondine@example.com');
    const res = await app.inject({
      method: 'POST',
      url: '/api/profile',
      headers: { cookie: other },
      payload: { trainerName: 'SACHA' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'TRAINER_NAME_TAKEN' });
  });
});

describe('administration', () => {
  let playerCookie: string;
  let adminCookie: string;

  beforeAll(async () => {
    playerCookie = await signUp('pierre@example.com');
    adminCookie = await signUp('chen@example.com');
    await handle.db.update(users).set({ role: 'admin' }).where(eq(users.email, 'chen@example.com'));
  });

  it('refuse les routes admin aux joueurs et aux anonymes', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/admin/me' })).statusCode).toBe(401);
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/me',
      headers: { cookie: playerCookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it('gère le cycle brouillon → modification → publication, journalisé', async () => {
    const headers = { cookie: adminCookie };

    const draftRes = await app.inject({
      method: 'POST',
      url: '/api/admin/content/drafts',
      headers,
      payload: { label: 'Plus de rencontres' },
    });
    expect(draftRes.statusCode).toBe(201);
    const draftId = draftRes.json<{ id: number }>().id;

    const balance = structuredClone(seedContent.balance);
    balance.expeditions.encountersPerHour = 6;
    const bad = await app.inject({
      method: 'PUT',
      url: `/api/admin/content/versions/${draftId}/balance`,
      headers,
      payload: { ...balance, shiny: { baseRateDenominator: 0 } },
    });
    expect(bad.statusCode).toBe(400);

    const put = await app.inject({
      method: 'PUT',
      url: `/api/admin/content/versions/${draftId}/balance`,
      headers,
      payload: balance,
    });
    expect(put.statusCode).toBe(200);

    // Le jeu voit toujours la version publiée tant que le brouillon n'est pas publié.
    const before = await app.inject({ method: 'GET', url: '/api/content' });
    expect(before.json().balance.expeditions.encountersPerHour).toBe(20);

    const pub = await app.inject({
      method: 'POST',
      url: `/api/admin/content/versions/${draftId}/publish`,
      headers,
    });
    expect(pub.statusCode).toBe(200);

    const after = await app.inject({ method: 'GET', url: '/api/content' });
    expect(after.json()).toMatchObject({
      versionId: draftId,
      balance: { expeditions: { encountersPerHour: 6 } },
    });

    const log = await app.inject({ method: 'GET', url: '/api/admin/audit-log', headers });
    const actions = log.json<{ items: { action: string; adminEmail: string }[] }>().items;
    expect(actions.map((a) => a.action)).toEqual([
      'content.publish',
      'content.balance.update',
      'content.draft.create',
    ]);
    expect(actions[0]?.adminEmail).toBe('chen@example.com');
  });

  it('refuse de modifier une version publiée', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/admin/content/versions/1/balance',
      headers: { cookie: adminCookie },
      payload: seedContent.balance,
    });
    expect(res.statusCode).toBe(409);
  });
});
