import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { seedContent } from '@poke/content';
import {
  candies,
  createDb,
  ensureSeedContent,
  inventory,
  pokemon,
  speciesCaptures,
  users,
} from '@poke/db';
import type { DbHandle } from '@poke/db';
import type { PokemonInstance } from '@poke/game-core';
import type { PokemonDto } from '@poke/shared';
import { buildApp } from './app';
import { loadEnv } from './env';
import { flushSpeciesCounts } from './game/capture-stats';
import { addItems, insertPokemon } from './game/store';
import { pgErrorCode, playerTransaction, transaction } from './game/tx';

/**
 * Actions simultanées sur un vrai Postgres (PGlite n'a qu'une connexion et sérialise tout : les
 * courses n'y apparaissent jamais). Lancés seulement si `TEST_DATABASE_URL` est donnée (la CI) :
 * une base neuve y est créée, puis supprimée à la fin.
 */
const baseUrl = process.env.TEST_DATABASE_URL;
const dbName = `dex_test_${process.pid}_${Date.now()}`;

let admin: DbHandle;
let handle: DbHandle;
let app: Awaited<ReturnType<typeof buildApp>>['app'];
let content: Awaited<ReturnType<typeof buildApp>>['content'];
let clock = new Date('2026-10-07T10:00:00Z');
const env = loadEnv({ NODE_ENV: 'test' });

function databaseUrl(name: string): string {
  const url = new URL(baseUrl!);
  url.pathname = `/${name}`;
  return url.toString();
}

const advance = (minutes: number) => {
  clock = new Date(clock.getTime() + minutes * 60_000);
};

async function signUp(email: string): Promise<{ cookie: string; userId: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
    payload: { email, password: 'motdepasse-solide', name: email.split('@')[0] },
  });
  expect(res.statusCode, res.body).toBe(200);
  const cookies = res.headers['set-cookie'];
  const list = Array.isArray(cookies) ? cookies : [cookies ?? ''];
  const [user] = await handle.db.select().from(users).where(eq(users.email, email));
  return { cookie: list.map((c) => c.split(';')[0]).join('; '), userId: user!.id };
}

function client(cookie: string) {
  return async <T>(method: 'GET' | 'POST', url: string, payload?: unknown) => {
    const res = await app.inject({
      method,
      url,
      headers: { cookie },
      ...(payload !== undefined && { payload: payload as object }),
    });
    return { status: res.statusCode, body: (res.body ? res.json() : null) as T };
  };
}

/** Dresseur avec son starter (Bulbizarre). */
async function player(name: string) {
  const { cookie, userId } = await signUp(`${name}@example.com`);
  const call = client(cookie);
  expect((await call('POST', '/api/profile', { trainerName: name })).status).toBe(201);
  const starter = (await call<PokemonDto>('POST', '/api/starter', { speciesId: 1 })).body;
  return { call, userId, starter };
}

function instance(speciesId: number): PokemonInstance {
  return {
    speciesId,
    level: 5,
    xp: 0,
    ivs: {
      hp: 10,
      attack: 10,
      defense: 10,
      'special-attack': 10,
      'special-defense': 10,
      speed: 10,
    },
    nature: 'hardy',
    ability: 'overgrow',
    isShiny: false,
    gender: 'male',
    happiness: 70,
  };
}

async function give(userId: string, speciesIds: readonly number[]) {
  return insertPokemon(handle.db, userId, speciesIds.map(instance), {
    origin: 'capture',
    originRegion: 'kanto',
    at: clock,
  });
}

const statuses = (results: readonly { status: number }[]) =>
  results.map((r) => r.status).sort((a, b) => a - b);

describe.skipIf(!baseUrl)('actions simultanées (Postgres)', () => {
  beforeAll(async () => {
    admin = createDb({ databaseUrl: baseUrl });
    await admin.db.execute(sql.raw(`create database ${dbName}`));
    handle = createDb({ databaseUrl: databaseUrl(dbName) });
    await handle.migrate();
    await ensureSeedContent(handle.db, seedContent);
    ({ app, content } = await buildApp({ db: handle.db, env, now: () => clock }));
  });
  afterAll(async () => {
    await app?.close();
    await handle?.close();
    await admin?.db.execute(sql.raw(`drop database if exists ${dbName} with (force)`));
    await admin?.close();
  });

  it('double transfert des mêmes Pokémon : Bonbons crédités une seule fois', async () => {
    const { call, userId } = await player('double');
    for (let round = 0; round < 5; round++) {
      const rows = await give(userId, [16, 16, 19]);
      const ids = rows.map((r) => r.id);
      const before = await candyTotal(userId);
      const results = await Promise.all(
        [0, 1, 2].map(() => call('POST', '/api/pokemon/transfer', { ids })),
      );
      expect(statuses(results)).toEqual([200, 404, 404]);
      const gained = results.find((r) => r.status === 200)!.body as {
        gained: { quantity: number }[];
      };
      const expected = gained.gained.reduce((sum, g) => sum + g.quantity, 0);
      expect(expected).toBeGreaterThan(0);
      expect((await candyTotal(userId)) - before).toBe(expected);
    }
  });

  it('transfert pendant un départ en expédition : jamais les deux', async () => {
    const { call, userId } = await player('course');
    for (let round = 0; round < 6; round++) {
      const [row] = await give(userId, [16]);
      const [start, transfer] = await Promise.all([
        call<{ id: string }>('POST', '/api/expeditions', {
          zoneId: 'route-1',
          team: [row!.id],
          balls: { new: null, shiny: null, caught: null },
          berryItemId: null,
        }),
        call('POST', '/api/pokemon/transfer', { ids: [row!.id] }),
      ]);
      const ok = [start.status, transfer.status].filter((s) => s < 300);
      expect(ok, JSON.stringify([start.body, transfer.body])).toHaveLength(1);
      const [kept] = await handle.db.select().from(pokemon).where(eq(pokemon.id, row!.id));
      if (start.status < 300) {
        expect(transfer.body).toMatchObject({ error: 'POKEMON_BUSY' });
        expect(kept).toBeDefined();
        // L'expédition est annulée pour libérer l'emplacement.
        expect((await call('POST', `/api/expeditions/${start.body.id}/cancel`)).status).toBe(204);
      } else {
        expect(start.body).toMatchObject({ error: 'POKEMON_NOT_FOUND' });
        expect(kept).toBeUndefined();
      }
    }
  });

  it('deux réclamations simultanées : une seule passe', async () => {
    const { call, starter } = await player('reclame');
    const started = await call<{ id: string }>('POST', '/api/expeditions', {
      zoneId: 'route-1',
      team: [starter.id],
      balls: { new: null, shiny: null, caught: null },
      berryItemId: null,
    });
    expect(started.status, JSON.stringify(started.body)).toBe(201);
    advance(10);
    const results = await Promise.all(
      [0, 1, 2].map(() => call('POST', `/api/expeditions/${started.body.id}/claim`)),
    );
    expect(statuses(results)).toEqual([200, 409, 409]);
    expect(results.filter((r) => r.status === 409).map((r) => r.body)).toEqual([
      { error: 'ALREADY_CLAIMED' },
      { error: 'ALREADY_CLAIMED' },
    ]);
  });

  it('captures croisées de deux joueurs : ni interblocage ni compteur faux', async () => {
    const a = await player('croise-a');
    const b = await player('croise-b');
    await flushSpeciesCounts(handle.db);
    const species = Array.from({ length: 30 }, (_, i) => 10 + i);
    const before = await capturedTotal(species);
    // Ordres opposés : sans compteurs différés, deux transactions s'interbloqueraient.
    await Promise.all(
      Array.from({ length: 8 }, (_, i) => {
        const p = i % 2 ? a : b;
        const list = i % 2 ? species : [...species].reverse();
        return playerTransaction(handle.db, p.userId, (tx) =>
          insertPokemon(tx, p.userId, list.map(instance), {
            origin: 'capture',
            originRegion: 'kanto',
            at: clock,
          }),
        );
      }),
    );
    await flushSpeciesCounts(handle.db);
    expect((await capturedTotal(species)) - before).toBe(8 * species.length);
  });

  it('interblocage : la transaction est rejouée', async () => {
    const { userId } = await player('rejoue');
    await addItems(handle.db, userId, [
      { itemId: 'poke-ball', quantity: 1 },
      { itemId: 'razz-berry', quantity: 1 },
    ]);
    // Deux transactions prennent les deux mêmes lignes dans l'ordre inverse : Postgres en
    // annule une (40P01), qui est rejouée et passe une fois l'autre terminée.
    let arrived = 0;
    let release!: () => void;
    const bothLocked = new Promise<void>((resolve) => (release = resolve));
    let attempts = 0;
    const bump = (first: string, second: string) =>
      transaction(handle.db, async (tx) => {
        attempts++;
        await tx
          .update(inventory)
          .set({ quantity: sql`${inventory.quantity} + 1` })
          .where(and(eq(inventory.ownerId, userId), eq(inventory.itemId, first)));
        if (++arrived === 2) release();
        await Promise.race([bothLocked, new Promise((r) => setTimeout(r, 2000))]);
        await tx
          .update(inventory)
          .set({ quantity: sql`${inventory.quantity} + 1` })
          .where(and(eq(inventory.ownerId, userId), eq(inventory.itemId, second)));
      });
    await Promise.all([bump('poke-ball', 'razz-berry'), bump('razz-berry', 'poke-ball')]);
    expect(attempts).toBe(3);
    const rows = await handle.db
      .select({ itemId: inventory.itemId, quantity: inventory.quantity })
      .from(inventory)
      .where(eq(inventory.ownerId, userId));
    const quantity = (id: string) => rows.find((r) => r.itemId === id)?.quantity;
    // Starter : 20 Poké Balls (+1 données ci-dessus).
    expect(quantity('poke-ball')).toBe(23);
    expect(quantity('razz-berry')).toBe(3);
  });

  it('contenu rechargé dans plus de transactions que de connexions : pas de blocage', async () => {
    // Juste après une publication, chaque action recharge le contenu depuis sa transaction : par
    // le pool, 12 transactions (pour 10 connexions) attendraient une connexion libre pour de bon.
    content.invalidate();
    const versions = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        playerTransaction(
          handle.db,
          `contenu-${i}`,
          async () => (await content.get()).content.versionId,
        ),
      ),
    );
    expect(new Set(versions).size).toBe(1);
  });

  it('verrou trop long : abandon au lieu d’attendre indéfiniment', async () => {
    const short = createDb({ databaseUrl: databaseUrl(dbName), timeouts: { lockMs: 200 } });
    try {
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      let locked!: () => void;
      const isLocked = new Promise<void>((resolve) => (locked = resolve));
      const holder = handle.db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(42)`);
        locked();
        await held;
      });
      await isLocked;
      const err = await short.db
        .execute(sql`select pg_advisory_lock(42)`)
        .then(() => null)
        .catch((e: unknown) => e);
      release();
      await holder;
      expect(pgErrorCode(err)).toBe('55P03');
    } finally {
      await short.close();
    }
  });
});

async function candyTotal(userId: string): Promise<number> {
  const [row] = await handle.db
    .select({ total: sql<number>`coalesce(sum(${candies.quantity}), 0)::int` })
    .from(candies)
    .where(eq(candies.ownerId, userId));
  return row?.total ?? 0;
}

async function capturedTotal(speciesIds: readonly number[]): Promise<number> {
  const [row] = await handle.db
    .select({ total: sql<number>`coalesce(sum(${speciesCaptures.captured}), 0)::int` })
    .from(speciesCaptures)
    .where(sql`${speciesCaptures.speciesId} in ${speciesIds}`);
  return row?.total ?? 0;
}
