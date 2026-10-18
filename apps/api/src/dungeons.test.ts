import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { seedContent } from '@poke/content';
import { createDb, dungeonRuns, ensureSeedContent, pokedex, users } from '@poke/db';
import { createRng, simulateDungeon } from '@poke/game-core';
import type { PokemonInstance } from '@poke/game-core';
import type {
  ClaimDungeonResponse,
  DungeonRunDto,
  DungeonsResponse,
  InventoryEntryDto,
  MeResponse,
  PokemonDto,
} from '@poke/shared';
import { buildApp } from './app';
import { loadEnv } from './env';
import { insertPokemon } from './game/store';

const handle = createDb({ pgliteDataDir: 'memory://' });
const env = loadEnv({ NODE_ENV: 'test' });
let clock = new Date('2026-10-14T10:00:00Z');
let app: Awaited<ReturnType<typeof buildApp>>['app'];

beforeAll(async () => {
  await handle.migrate();
  await ensureSeedContent(handle.db, seedContent);
  ({ app } = await buildApp({ db: handle.db, env, now: () => clock }));
});
afterAll(async () => {
  await app.close();
  await handle.close();
});

const advance = (ms: number) => {
  clock = new Date(clock.getTime() + ms);
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

async function give(userId: string, speciesId: number, level: number) {
  const ivs = {
    hp: 31,
    attack: 31,
    defense: 31,
    'special-attack': 31,
    'special-defense': 31,
    speed: 31,
  };
  const instance: PokemonInstance = {
    speciesId,
    level,
    xp: 0,
    ivs,
    nature: 'hardy',
    ability: 'overgrow',
    isShiny: false,
    gender: 'male',
    happiness: 70,
  };
  const [row] = await insertPokemon(handle.db, userId, [instance], {
    origin: 'capture',
    originRegion: 'kanto',
    at: clock,
  });
  return row!;
}

const caught = (userId: string, speciesIds: number[]) =>
  handle.db
    .insert(pokedex)
    .values(
      speciesIds.map((speciesId) => ({ ownerId: userId, speciesId, seen: true, caught: true })),
    )
    .onConflictDoUpdate({ target: [pokedex.ownerId, pokedex.speciesId], set: { caught: true } });

/** Seed de la tentative tel que la victoire laisse (ou non) tomber la Méga-Gemme. */
async function setSeed(runId: string, gem: boolean) {
  let seed = 0;
  while (createRng(seed ^ 0x5bd1e995).next() < 0.1 !== gem) seed++;
  await handle.db
    .update(dungeonRuns)
    .set({ setup: sql`jsonb_set(${dungeonRuns.setup}, '{seed}', ${String(seed)}::jsonb)` })
    .where(eq(dungeonRuns.id, runId));
}

describe('donjons', () => {
  let call: ReturnType<typeof client>;
  let userId: string;
  let starter: PokemonDto;

  beforeAll(async () => {
    const signed = await signUp('red@example.com');
    userId = signed.userId;
    call = client(signed.cookie);
    expect((await call('POST', '/api/profile', { trainerName: 'Red' })).status).toBe(201);
    starter = (await call<PokemonDto>('POST', '/api/starter', { speciesId: 1 })).body;
  });

  it('refuse un donjon dont la lignée n’est pas entièrement capturée', async () => {
    const res = await call('POST', '/api/dungeons', {
      dungeonId: 'mega-florizarre',
      team: [starter.id],
      moves: [{ type: 'grass', category: 'special' }],
    });
    expect(res).toMatchObject({ status: 403, body: { error: 'DUNGEON_LOCKED' } });
    const list = await call<DungeonsResponse>('GET', '/api/dungeons');
    expect(list.body).toMatchObject({ active: null, last: null, records: [] });
  });

  it('perd à la fin du temps imparti, met les Pokémon K.O. et lance le temps de recharge', async () => {
    await caught(userId, [1, 2, 3]);
    const start = await call<DungeonRunDto>('POST', '/api/dungeons', {
      dungeonId: 'mega-florizarre',
      team: [starter.id],
      moves: [{ type: 'poison', category: 'physical' }],
    });
    expect(start.status, JSON.stringify(start.body)).toBe(201);
    expect(start.body.setup.team[0]).toMatchObject({ attackType: 'poison', category: 'physical' });
    expect(start.body.setup.enemies).toHaveLength(6);

    // Équipe occupée, choix d'attaque enregistré, un seul donjon à la fois.
    const pokemon = await call<PokemonDto[]>('GET', '/api/pokemon');
    expect(pokemon.body[0]).toMatchObject({
      busy: true,
      activity: 'dungeon',
      dungeonMove: { type: 'poison', category: 'physical' },
    });
    const twice = await call('POST', '/api/dungeons', {
      dungeonId: 'mega-florizarre',
      team: [starter.id],
      moves: [{ type: 'grass', category: 'special' }],
    });
    expect(twice.status).toBe(409);

    const early = await call('POST', `/api/dungeons/${start.body.id}/claim`);
    expect(early.body).toMatchObject({ error: 'NOT_FINISHED' });

    advance(10 * 60_000);
    const claim = await call<ClaimDungeonResponse>('POST', `/api/dungeons/${start.body.id}/claim`);
    expect(claim.status, JSON.stringify(claim.body)).toBe(200);
    const { run } = claim.body;
    expect(run.outcome).toBe('loss');
    expect(run.result).toMatchObject({ money: 0, gemItemId: null, knockedOut: [starter.id] });
    expect(run.result!.koUntil).not.toBeNull();

    const list = await call<DungeonsResponse>('GET', '/api/dungeons');
    expect(list.body.active).toBeNull();
    expect(list.body.last?.id).toBe(run.id);
    expect(list.body.records).toMatchObject([{ dungeonId: 'mega-florizarre', wins: 0, losses: 1 }]);

    const ko = (await call<PokemonDto[]>('GET', '/api/pokemon')).body[0]!;
    expect(ko).toMatchObject({ busy: false });
    expect(ko.koUntil).not.toBeNull();

    const cooldown = await call('POST', '/api/dungeons', {
      dungeonId: 'mega-florizarre',
      team: [starter.id],
      moves: [{ type: 'grass', category: 'special' }],
    });
    expect(cooldown.body).toMatchObject({ error: 'DUNGEON_COOLDOWN' });
  });

  it('change de Pokémon, gagne et obtient la Méga-Gemme', async () => {
    advance(120 * 60_000);
    // Lignée de Tortank capturée, équipe de Florizarre niveau 100 (Plante contre Eau).
    await caught(userId, [7, 8, 9]);
    const a = await give(userId, 3, 100);
    const b = await give(userId, 3, 100);
    const start = await call<DungeonRunDto>('POST', '/api/dungeons', {
      dungeonId: 'mega-tortank',
      team: [a.id, b.id],
      moves: [
        { type: 'grass', category: 'special' },
        { type: 'grass', category: 'special' },
      ],
    });
    expect(start.status, JSON.stringify(start.body)).toBe(201);
    await setSeed(start.body.id, true);

    advance(500);
    // Instant demandé dans le futur : ramené à maintenant.
    const sw = await call<DungeonRunDto>('POST', `/api/dungeons/${start.body.id}/switch`, {
      member: 1,
      atMs: 999_999,
    });
    expect(sw.status, JSON.stringify(sw.body)).toBe(200);
    expect(sw.body.commands).toEqual([{ atMs: 500, member: 1 }]);
    const active = await call(`POST`, `/api/dungeons/${start.body.id}/switch`, {
      member: 1,
      atMs: 500,
    });
    expect(active.body).toMatchObject({ error: 'MEMBER_ACTIVE' });

    const end = simulateDungeon(sw.body.setup, sw.body.commands, null, sw.body.setup.timeLimitMs);
    expect(end.state.outcome).toBe('win');
    advance(end.state.endedAtMs!);
    const claim = await call<ClaimDungeonResponse>('POST', `/api/dungeons/${start.body.id}/claim`);
    expect(claim.status, JSON.stringify(claim.body)).toBe(200);
    const dungeon = seedContent.dungeons.find((d) => d.id === 'mega-tortank')!;
    const money = dungeon.money;
    expect(dungeon.difficulty).toBe('veryHard');
    expect(claim.body.run.result).toMatchObject({
      outcome: 'win',
      money,
      gemItemId: 'blastoisinite',
    });
    expect(claim.body.run.result!.xpPerMember).toBeGreaterThan(0);

    const me = await call<MeResponse>('GET', '/api/me');
    expect(me.body.profile!.currency).toBe(money);
    const bag = await call<InventoryEntryDto[]>('GET', '/api/inventory');
    expect(bag.body).toContainEqual(
      expect.objectContaining({ itemId: 'blastoisinite', quantity: 1 }),
    );
    const list = await call<DungeonsResponse>('GET', '/api/dungeons');
    expect(list.body.records).toContainEqual(
      expect.objectContaining({ dungeonId: 'mega-tortank', wins: 1, gems: 1 }),
    );
  });

  it('fuit sans récompense', async () => {
    advance(120 * 60_000);
    const fresh = await give(userId, 3, 100);
    const start = await call<DungeonRunDto>('POST', '/api/dungeons', {
      dungeonId: 'mega-tortank',
      team: [fresh.id],
      moves: [{ type: 'grass', category: 'special' }],
    });
    expect(start.status, JSON.stringify(start.body)).toBe(201);
    advance(3000);
    const flee = await call<ClaimDungeonResponse>('POST', `/api/dungeons/${start.body.id}/flee`);
    expect(flee.status, JSON.stringify(flee.body)).toBe(200);
    expect(flee.body.run.result).toMatchObject({
      outcome: 'fled',
      endedAtMs: 3000,
      money: 0,
      xpPerMember: 0,
      gemItemId: null,
    });
  });

  it('réclame tout seul une tentative terminée pendant l’absence du joueur', async () => {
    advance(120 * 60_000);
    const fresh = await give(userId, 3, 100);
    const start = await call<DungeonRunDto>('POST', '/api/dungeons', {
      dungeonId: 'mega-tortank',
      team: [fresh.id],
      moves: [{ type: 'grass', category: 'special' }],
    });
    expect(start.status).toBe(201);
    advance(60 * 60_000);
    const pokemon = await call<PokemonDto[]>('GET', '/api/pokemon');
    expect(pokemon.body.find((p) => p.id === fresh.id)).toMatchObject({ busy: false });
    const list = await call<DungeonsResponse>('GET', '/api/dungeons');
    expect(list.body.active).toBeNull();
    expect(list.body.last?.id).toBe(start.body.id);
    expect(list.body.last?.resultSeenAt).toBeNull();
  });

  it('retient le résultat vu pour tous les appareils', async () => {
    const before = await call<DungeonsResponse>('GET', '/api/dungeons');
    const seen = await call('POST', `/api/dungeons/${before.body.last!.id}/seen`);
    expect(seen.status).toBe(204);
    const list = await call<DungeonsResponse>('GET', '/api/dungeons');
    expect(list.body.last?.resultSeenAt).not.toBeNull();
  });
});
