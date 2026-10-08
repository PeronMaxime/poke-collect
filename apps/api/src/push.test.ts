import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { seedContent } from '@poke/content';
import { createDb, ensureSeedContent, pushSubscriptions, users } from '@poke/db';
import type {
  ExpeditionDto,
  PokemonDto,
  PushConfigResponse,
  PushPayload,
  TelemetryResponse,
} from '@poke/shared';
import { buildApp } from './app';
import type { ContentCache } from './content-cache';
import { loadEnv } from './env';
import { runPushRound } from './game/push';
import type { PushSender, PushTarget } from './game/push';

const handle = createDb({ pgliteDataDir: 'memory://' });
const env = loadEnv({ NODE_ENV: 'test' });
let clock = new Date('2026-10-08T10:00:00Z');
let app: Awaited<ReturnType<typeof buildApp>>['app'];
let content: ContentCache;

/** Faux service push : garde les envois ; les endpoints « gone » sont expirés. */
const sent: { target: PushTarget; payload: PushPayload }[] = [];
const sender: PushSender = async (target, payload) => {
  if (target.endpoint.includes('gone')) return 'gone';
  sent.push({ target, payload });
  return 'ok';
};

beforeAll(async () => {
  await handle.migrate();
  await ensureSeedContent(handle.db, seedContent);
  ({ app, content } = await buildApp({
    db: handle.db,
    env,
    now: () => clock,
    pushSender: sender,
  }));
});
afterAll(async () => {
  await app.close();
  await handle.close();
});

const advance = (minutes: number) => {
  clock = new Date(clock.getTime() + minutes * 60_000);
};
const round = () => runPushRound(handle.db, content, sender, clock);

async function newPlayer(email: string, trainerName: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
    payload: { email, password: 'motdepasse-solide', name: trainerName },
  });
  expect(res.statusCode, res.body).toBe(200);
  const cookies = res.headers['set-cookie'];
  const list = Array.isArray(cookies) ? cookies : [cookies ?? ''];
  const cookie = list.map((c) => c.split(';')[0]).join('; ');
  const [user] = await handle.db.select().from(users).where(eq(users.email, email));
  const call = async <T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    payload?: unknown,
  ) => {
    const r = await app.inject({
      method,
      url,
      headers: { cookie },
      ...(payload !== undefined && { payload: payload as object }),
    });
    return { status: r.statusCode, body: (r.body ? r.json() : null) as T };
  };
  expect((await call('POST', '/api/profile', { trainerName })).status).toBe(201);
  const starter = await call<PokemonDto>('POST', '/api/starter', { speciesId: 1 });
  expect(starter.status).toBe(201);
  return { call, userId: user!.id, starter: starter.body };
}

const subscription = (endpoint: string) => ({
  endpoint,
  keys: { p256dh: 'BPubKeyDeTest', auth: 'secretDeTest' },
});

describe('notifications push', () => {
  let player: Awaited<ReturnType<typeof newPlayer>>;

  beforeAll(async () => {
    player = await newPlayer('push@example.com', 'Notifie');
  });

  async function expedition() {
    const started = await player.call<ExpeditionDto>('POST', '/api/expeditions', {
      zoneId: 'route-1',
      durationMinutes: 15,
      team: [player.starter.id],
      ballItemId: null,
      berryItemId: null,
    });
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    return started.body;
  }

  it('expose la clé publique et les réglages par défaut', async () => {
    const config = await player.call<PushConfigResponse>('GET', '/api/push');
    expect(config.body).toEqual({
      publicKey: env.vapid!.publicKey,
      settings: { expeditions: true, battles: true, eggs: true, fossils: true },
      subscriptions: 0,
    });
  });

  it('ne notifie que les joueurs abonnés, une seule fois par expédition', async () => {
    const first = await expedition();
    advance(20);
    expect(await round()).toBe(0); // pas encore abonné : rien n'est marqué

    const sub = await player.call(
      'POST',
      '/api/push/subscriptions',
      subscription('https://push.example/a'),
    );
    expect(sub.status).toBe(204);
    expect(await round()).toBe(1);
    expect(sent.at(-1)!.payload).toEqual({
      title: 'Expédition terminée : Route 1',
      body: 'Touchez pour récupérer.',
      url: '/#expeditions',
      tag: 'activity',
    });
    expect(await round()).toBe(0);
    expect((await player.call('POST', `/api/expeditions/${first.id}/claim`)).status).toBe(200);
  });

  it('respecte les réglages du joueur', async () => {
    const settings = { expeditions: false, battles: true, eggs: true, fossils: true };
    expect((await player.call('PUT', '/api/push/settings', settings)).body).toEqual(settings);
    const exp = await expedition();
    advance(20);
    expect(await round()).toBe(0);
    await player.call('POST', `/api/expeditions/${exp.id}/claim`);
    await player.call('PUT', '/api/push/settings', { ...settings, expeditions: true });
  });

  it('supprime les abonnements expirés et envoie une notification de test', async () => {
    await player.call('POST', '/api/push/subscriptions', subscription('https://push.example/gone'));
    expect((await player.call<PushConfigResponse>('GET', '/api/push')).body.subscriptions).toBe(2);
    const test = await player.call<{ sent: number }>('POST', '/api/push/test');
    expect(test.body.sent).toBe(1);
    const rows = await handle.db
      .select({ endpoint: pushSubscriptions.endpoint })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.ownerId, player.userId));
    expect(rows.map((r) => r.endpoint)).toEqual(['https://push.example/a']);

    expect(
      (
        await player.call('DELETE', '/api/push/subscriptions', {
          endpoint: 'https://push.example/a',
        })
      ).status,
    ).toBe(204);
    expect((await player.call<PushConfigResponse>('GET', '/api/push')).body.subscriptions).toBe(0);
  });
});

describe('télémétrie (admin)', () => {
  it('mesure les temps de complétion et les goulets', async () => {
    const admin = await newPlayer('chen-telemetrie@example.com', 'Chen');
    expect((await admin.call('GET', '/api/admin/telemetry')).status).toBe(403);
    await handle.db.update(users).set({ role: 'admin' }).where(eq(users.id, admin.userId));

    const res = await admin.call<TelemetryResponse>('GET', '/api/admin/telemetry?days=7');
    expect(res.status).toBe(200);
    const t = res.body;
    expect(t.players).toMatchObject({ total: 2, withStarter: 2, active1d: 1 });
    const first = t.steps.find((s) => s.id === 'first-expedition')!;
    expect(first).toMatchObject({ players: 1, reachedPercent: 50 });
    expect(first.medianHours).toBeGreaterThan(0);
    expect(t.steps.filter((s) => s.kind === 'region').map((s) => s.id)).toEqual(
      seedContent.regions.filter((r) => r.enabled).map((r) => r.id),
    );
    expect(t.zones.find((z) => z.zoneId === 'route-1')).toMatchObject({
      expeditions: 2,
      players: 1,
      avgDurationMinutes: 15,
    });
    expect(t.dexDistribution.reduce((s, b) => s + b.players, 0)).toBe(2);
    expect(t.quests.find((q) => q.questId === 'artikodin')?.steps.length).toBeGreaterThan(0);
  });
});
