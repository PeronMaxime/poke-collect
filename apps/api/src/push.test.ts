import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { seedContent } from '@poke/content';
import {
  createDb,
  dungeonProgress,
  ensureSeedContent,
  inventory,
  pokemon,
  pushSubscriptions,
  users,
} from '@poke/db';
import type {
  AdminPlayerDetailResponse,
  AdminPlayerDto,
  AdminSpeciesStatsDto,
  AdminTestPokemonDeleteResponse,
  AdminTestPokemonResponse,
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
    await handle.db
      .insert(inventory)
      .values({ ownerId: admin.userId, itemId: 'charizardite-x', quantity: 2 });

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
    expect(t.dungeons.length).toBeGreaterThan(0);
    expect(t.steps.find((s) => s.id === 'first-dungeon')).toMatchObject({ players: 0 });
    expect(t.megaStones.find((g) => g.itemId === 'charizardite-x')).toMatchObject({
      owners: 1,
      inBags: 2,
      held: 0,
    });
  });
});

describe('joueurs (admin)', () => {
  it('liste les inscrits avec leur présence et ouvre une fiche dresseur', async () => {
    const admin = await newPlayer('chen-joueurs@example.com', 'Orme');
    expect((await admin.call('GET', '/api/admin/players')).status).toBe(403);
    await handle.db.update(users).set({ role: 'admin' }).where(eq(users.id, admin.userId));
    const player = await newPlayer('sacha-joueurs@example.com', 'Sacha');
    advance(5);
    expect((await player.call('POST', '/api/presence')).status).toBe(204);
    // Un donjon réussi, une gemme dans le sac (×2) et une autre tenue par un Pokémon.
    await handle.db
      .insert(dungeonProgress)
      .values({ ownerId: player.userId, dungeonId: seedContent.dungeons[0]!.id, wins: 1 });
    await handle.db
      .insert(inventory)
      .values({ ownerId: player.userId, itemId: 'charizardite-x', quantity: 2 });
    await handle.db
      .update(pokemon)
      .set({ megaStone: 'venusaurite' })
      .where(eq(pokemon.ownerId, player.userId));

    const list = await admin.call<AdminPlayerDto[]>('GET', '/api/admin/players');
    expect(list.status).toBe(200);
    const sacha = list.body.find((p) => p.id === player.userId)!;
    expect(sacha).toMatchObject({
      trainerName: 'Sacha',
      email: 'sacha-joueurs@example.com',
      role: 'player',
      starterSpeciesId: 1,
    });
    expect(new Date(sacha.lastSeenAt!).getTime()).toBeGreaterThanOrEqual(clock.getTime());
    expect(list.body.find((p) => p.id === admin.userId)?.role).toBe('admin');

    const detail = await admin.call<AdminPlayerDetailResponse>(
      'GET',
      `/api/admin/players/${player.userId}`,
    );
    expect(detail.status).toBe(200);
    expect(detail.body.profile?.trainerName).toBe('Sacha');
    expect(detail.body.speciesCaught).toBe(1);
    expect(detail.body.card).toMatchObject({
      pokemonOwned: 1,
      dungeonsCleared: 1,
      megaStonesOwned: 2,
    });
    expect(detail.body.badges[0]?.regionId).toBe(seedContent.regions[0]!.id);
    expect(detail.body.badges[0]?.badges.every((b) => !b.earned)).toBe(true);

    expect((await admin.call('GET', '/api/admin/players/inconnu')).status).toBe(404);
  });

  it('donne un lot de Pokémon de test aux comptes admin seulement', async () => {
    const admin = await newPlayer('chen-lot@example.com', 'Sorbier');
    await handle.db.update(users).set({ role: 'admin' }).where(eq(users.id, admin.userId));
    const player = await newPlayer('sacha-lot@example.com', 'Pierre');
    const regionId = seedContent.regions[0]!.id;
    const body = { regionId, level: 60, perfectIvs: true, legendaries: false };

    const refused = await admin.call(
      'POST',
      `/api/admin/players/${player.userId}/test-pokemon`,
      body,
    );
    expect(refused.status).toBe(403);

    const res = await admin.call<AdminTestPokemonResponse>(
      'POST',
      `/api/admin/players/${admin.userId}/test-pokemon`,
      body,
    );
    expect(res.status).toBe(200);
    expect(res.body.added).toBe(res.body.speciesIds.length);
    const families = seedContent.dungeons
      .filter((d) => d.regionId === regionId)
      .flatMap((d) => d.familySpeciesIds);
    expect(families.every((id) => res.body.speciesIds.includes(id))).toBe(true);

    const rows = await handle.db.select().from(pokemon).where(eq(pokemon.ownerId, admin.userId));
    const lot = rows.filter((r) => r.origin === 'admin');
    expect(lot).toHaveLength(res.body.added);
    expect(lot.every((r) => r.level === 60 && r.ivAtk === 31 && r.ivSpe === 31)).toBe(true);

    const detail = await admin.call<AdminPlayerDetailResponse>(
      'GET',
      `/api/admin/players/${admin.userId}`,
    );
    expect(detail.body.speciesCaught).toBe(new Set([1, ...res.body.speciesIds]).size);

    expect(
      (await admin.call('DELETE', `/api/admin/players/${player.userId}/test-pokemon`)).status,
    ).toBe(403);
    const removed = await admin.call<AdminTestPokemonDeleteResponse>(
      'DELETE',
      `/api/admin/players/${admin.userId}/test-pokemon`,
    );
    expect(removed.body).toEqual({ deleted: res.body.added, busy: 0 });
    const left = await handle.db.select().from(pokemon).where(eq(pokemon.ownerId, admin.userId));
    expect(left.map((r) => r.origin)).toEqual(['starter']);
  });

  it('compte les captures depuis le début, transférés et évolués compris', async () => {
    const admin = await newPlayer('chen-especes@example.com', 'Platane');
    await handle.db.update(users).set({ role: 'admin' }).where(eq(users.id, admin.userId));
    const stats = async () =>
      new Map(
        (await admin.call<AdminSpeciesStatsDto[]>('GET', '/api/admin/species-stats')).body.map(
          (s) => [s.speciesId, s],
        ),
      );
    const before = await stats();
    const player = await newPlayer('sacha-especes@example.com', 'Regis');
    const counts = async (id: number) => {
      const s = (await stats()).get(id);
      const b = before.get(id);
      return {
        captured: (s?.captured ?? 0) - (b?.captured ?? 0),
        owned: (s?.owned ?? 0) - (b?.owned ?? 0),
        transferred: (s?.transferred ?? 0) - (b?.transferred ?? 0),
      };
    };
    expect(await counts(1)).toEqual({ captured: 1, owned: 1, transferred: 0 });

    // Le starter évolue : toujours capturé en Bulbizarre, possédé en Herbizarre.
    await handle.db.update(pokemon).set({ speciesId: 2 }).where(eq(pokemon.ownerId, player.userId));
    expect(await counts(1)).toEqual({ captured: 1, owned: 0, transferred: 0 });
    expect(await counts(2)).toEqual({ captured: 0, owned: 1, transferred: 0 });

    // Puis il est transféré (un autre Pokémon reste au joueur) : la capture reste comptée, le
    // transfert l'est dans son espèce actuelle.
    const [starterRow] = await handle.db
      .select()
      .from(pokemon)
      .where(eq(pokemon.ownerId, player.userId));
    const { id: _id, ...copy } = starterRow!;
    await handle.db.insert(pokemon).values({ ...copy, speciesId: 4 });
    const transfer = await player.call('POST', '/api/pokemon/transfer', { ids: [starterRow!.id] });
    expect(transfer.status).toBe(200);
    expect(await counts(1)).toEqual({ captured: 1, owned: 0, transferred: 0 });
    expect(await counts(2)).toEqual({ captured: 0, owned: 0, transferred: 1 });
  });
});
