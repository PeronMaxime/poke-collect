import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { seedContent } from '@poke/content';
import {
  createDb,
  ensureSeedContent,
  inventory,
  pokedex,
  pokemon,
  trainerBattles,
  users,
} from '@poke/db';
import { createRng } from '@poke/game-core';
import type {
  BattleDto,
  ClaimBattleResponse,
  ClaimRewardResponse,
  DaycareResponse,
  EvolveResponse,
  ExpeditionsResponse,
  PokemonDto,
  ProgressionResponse,
} from '@poke/shared';
import { buildApp } from './app';
import { loadEnv } from './env';

const handle = createDb({ pgliteDataDir: 'memory://' });
const env = loadEnv({ NODE_ENV: 'test' });
let clock = new Date('2026-10-07T10:00:00Z');
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

const advance = (minutes: number) => {
  clock = new Date(clock.getTime() + minutes * 60_000);
};

async function newPlayer(email: string, trainerName: string, starterId: number) {
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
  const call = async <T>(method: 'GET' | 'POST', url: string, payload?: unknown) => {
    const r = await app.inject({
      method,
      url,
      headers: { cookie },
      ...(payload !== undefined && { payload: payload as object }),
    });
    return { status: r.statusCode, body: (r.body ? r.json() : null) as T };
  };
  expect((await call('POST', '/api/profile', { trainerName })).status).toBe(201);
  const starter = await call<PokemonDto>('POST', '/api/starter', { speciesId: starterId });
  expect(starter.status).toBe(201);
  return { call, userId: user!.id, starter: starter.body };
}

const setLevel = (id: string, level: number) =>
  handle.db.update(pokemon).set({ level }).where(eq(pokemon.id, id));

const giveItem = (ownerId: string, itemId: string, quantity: number) =>
  handle.db
    .insert(inventory)
    .values({ ownerId, itemId, quantity })
    .onConflictDoUpdate({ target: [inventory.ownerId, inventory.itemId], set: { quantity } });

const itemCount = async (ownerId: string, itemId: string) => {
  const [row] = await handle.db
    .select()
    .from(inventory)
    .where(and(eq(inventory.ownerId, ownerId), eq(inventory.itemId, itemId)));
  return row?.quantity ?? 0;
};

/** Marque des espèces comme capturées au Pokédex. */
const catchSpecies = (ownerId: string, ids: number[]) =>
  handle.db
    .insert(pokedex)
    .values(ids.map((speciesId) => ({ ownerId, speciesId, seen: true, caught: true })))
    .onConflictDoNothing();

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

const evolveBody = (toSpeciesId: number) => ({ toSpeciesId, utcOffsetMinutes: 120 });

describe('évolutions', () => {
  let call: Awaited<ReturnType<typeof newPlayer>>['call'];
  let userId: string;
  let starter: PokemonDto;

  beforeAll(async () => {
    ({ call, userId, starter } = await newPlayer('evo@example.com', 'Evoli', 1));
  });

  it('refuse une évolution dont les conditions ne sont pas remplies', async () => {
    const early = await call<{ error: string }>(
      'POST',
      `/api/pokemon/${starter.id}/evolve`,
      evolveBody(2),
    );
    expect(early.status).toBe(409);
    expect(early.body.error).toBe('EVOLUTION_NOT_READY');
    const wrong = await call<{ error: string }>(
      'POST',
      `/api/pokemon/${starter.id}/evolve`,
      evolveBody(3),
    );
    expect(wrong.body.error).toBe('EVOLUTION_NOT_FOUND');
  });

  it('fait évoluer au niveau requis et enregistre l’espèce au Pokédex', async () => {
    await setLevel(starter.id, 16);
    const res = await call<EvolveResponse>(
      'POST',
      `/api/pokemon/${starter.id}/evolve`,
      evolveBody(2),
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({
      fromSpeciesId: 1,
      consumedItemId: null,
      newSpeciesIds: [2],
      pokemon: { id: starter.id, speciesId: 2, level: 16, ability: starter.ability },
    });
    const [entry] = await handle.db
      .select()
      .from(pokedex)
      .where(and(eq(pokedex.ownerId, userId), eq(pokedex.speciesId, 2)));
    expect(entry?.caught).toBe(true);
  });

  it('consomme l’objet d’évolution (pierre, Câble Link)', async () => {
    const [abra] = await handle.db
      .insert(pokemon)
      .values({
        ownerId: userId,
        speciesId: 64,
        level: 20,
        ivHp: 1,
        ivAtk: 1,
        ivDef: 1,
        ivSpa: 1,
        ivSpd: 1,
        ivSpe: 1,
        nature: 'hardy',
        ability: 'synchronize',
        gender: 'male',
        origin: 'capture',
      })
      .returning();
    const missing = await call<{ error: string }>(
      'POST',
      `/api/pokemon/${abra!.id}/evolve`,
      evolveBody(65),
    );
    expect(missing.body.error).toBe('EVOLUTION_NOT_READY');

    await giveItem(userId, 'linking-cord', 2);
    const res = await call<EvolveResponse>(
      'POST',
      `/api/pokemon/${abra!.id}/evolve`,
      evolveBody(65),
    );
    expect(res.status).toBe(200);
    expect(res.body.consumedItemId).toBe('linking-cord');
    expect(res.body.pokemon.speciesId).toBe(65);
    expect(await itemCount(userId, 'linking-cord')).toBe(1);
  });

  it('refuse un Pokémon occupé', async () => {
    const start = await call('POST', '/api/expeditions', {
      zoneId: 'route-1',
      durationMinutes: 15,
      team: [starter.id],
      ballItemId: null,
      berryItemId: null,
    });
    expect(start.status).toBe(201);
    await setLevel(starter.id, 40);
    const busy = await call<{ error: string }>(
      'POST',
      `/api/pokemon/${starter.id}/evolve`,
      evolveBody(3),
    );
    expect(busy.body.error).toBe('POKEMON_BUSY');
  });
});

describe('paliers et collections', () => {
  let call: Awaited<ReturnType<typeof newPlayer>>['call'];
  let userId: string;
  let starter: PokemonDto;
  const claim = (kind: 'milestone' | 'collection', rewardId: string) =>
    call<ClaimRewardResponse & { error?: string }>('POST', '/api/progression/claim', {
      kind,
      rewardId,
    });

  beforeAll(async () => {
    ({ call, userId, starter } = await newPlayer('dex@example.com', 'Chen', 4));
  });

  it('part des emplacements de départ', async () => {
    const res = await call<ProgressionResponse>('GET', '/api/progression');
    expect(res.body).toEqual({
      claims: [],
      slots: { expeditions: 2, battles: 1, daycare: 1 },
      bonuses: { capture: 1, xp: 1, money: 1 },
    });
  });

  it('refuse un palier non atteint ou inconnu', async () => {
    expect((await claim('milestone', 'kanto-10')).body.error).toBe('REWARD_LOCKED');
    expect((await claim('milestone', 'inconnu')).status).toBe(404);
  });

  it('accorde la récompense une seule fois et débloque les emplacements', async () => {
    await catchSpecies(userId, range(1, 16));
    const res = await claim('milestone', 'kanto-10');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.slots).toEqual({ expeditions: 3, battles: 1, daycare: 1 });
    expect(await itemCount(userId, 'great-ball')).toBe(5);
    expect((await claim('milestone', 'kanto-10')).body.error).toBe('ALREADY_CLAIMED');

    const expeditions = await call<ExpeditionsResponse>('GET', '/api/expeditions');
    expect(expeditions.body.slots).toBe(3);

    await catchSpecies(userId, range(17, 38));
    const quarter = await claim('milestone', 'kanto-25');
    expect(quarter.body.currency).toBe(3000);
    expect((await call<DaycareResponse>('GET', '/api/daycare')).body.slots).toBe(2);
  });

  it('active les bonus permanents des collections', async () => {
    expect((await claim('collection', 'famille-nidoran')).status).toBe(200);
    expect((await claim('collection', 'insectes-de-jade')).status).toBe(200);
    const res = await call<ProgressionResponse>('GET', '/api/progression');
    expect(res.body.bonuses).toEqual({ capture: 1.05, xp: 1, money: 1.1 });
    expect(res.body.claims.map((c) => `${c.kind}:${c.rewardId}`).sort()).toEqual([
      'collection:famille-nidoran',
      'collection:insectes-de-jade',
      'milestone:kanto-10',
      'milestone:kanto-25',
    ]);

    // Bonus d'argent (+10 %) appliqué aux gains de combat.
    await setLevel(starter.id, 60);
    const start = await call<BattleDto>('POST', '/api/battles', {
      trainerId: 'gamin-tom',
      team: [starter.id],
    });
    expect(start.status).toBe(201);
    let seed = 0;
    while (createRng(seed).next() >= 0.04) seed++;
    await handle.db
      .update(trainerBattles)
      .set({ seed })
      .where(eq(trainerBattles.id, start.body.id));
    advance(60);
    const result = await call<ClaimBattleResponse>('POST', `/api/battles/${start.body.id}/claim`);
    expect(result.body.battle.outcome).toBe('win');
    const tom = seedContent.trainers.find((t) => t.id === 'gamin-tom')!;
    expect(result.body.battle.result?.money).toBe(Math.floor(tom.money * 1.1));
  });
});
