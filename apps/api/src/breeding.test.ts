import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { seedContent } from '@poke/content';
import { createDb, ensureSeedContent, users } from '@poke/db';
import { getNature } from '@poke/game-core';
import type { PokemonInstance } from '@poke/game-core';
import type {
  CandyDto,
  CollectEggsResponse,
  DaycareDto,
  DaycareResponse,
  HatchEggsResponse,
  InventoryEntryDto,
  PokedexEntryDto,
  PokemonDto,
  TransferPokemonResponse,
} from '@poke/shared';
import { buildApp } from './app';
import { loadEnv } from './env';
import { addItems, insertPokemon } from './game/store';

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
  return async <T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    payload?: unknown,
  ) => {
    const res = await app.inject({
      method,
      url,
      headers: { cookie },
      ...(payload !== undefined && { payload: payload as object }),
    });
    return { status: res.statusCode, body: (res.body ? res.json() : null) as T };
  };
}

/** Joueur prêt à jouer (profil + starter Bulbizarre). */
async function newPlayer(email: string, trainerName: string) {
  const { cookie, userId } = await signUp(email);
  const call = client(cookie);
  expect((await call('POST', '/api/profile', { trainerName })).status).toBe(201);
  const starter = await call<PokemonDto>('POST', '/api/starter', { speciesId: 1 });
  expect(starter.status).toBe(201);
  return { call, userId, starter: starter.body };
}

const IVS = {
  hp: 31,
  attack: 31,
  defense: 31,
  'special-attack': 31,
  'special-defense': 31,
  speed: 31,
};

async function give(userId: string, speciesId: number, extra: Partial<PokemonInstance> = {}) {
  const [row] = await insertPokemon(
    handle.db,
    userId,
    [
      {
        speciesId,
        level: 20,
        xp: 8000,
        ivs: IVS,
        nature: 'hardy',
        ability: 'limber',
        isShiny: false,
        gender: 'genderless',
        happiness: 70,
        ...extra,
      },
    ],
    { origin: 'capture', originRegion: 'kanto', at: clock },
  );
  return row!;
}

describe('pension et œufs', () => {
  let call: Awaited<ReturnType<typeof newPlayer>>['call'];
  let userId: string;
  let ditto: string;
  let ivysaur: string;
  let magikarp: string;

  beforeAll(async () => {
    ({ call, userId } = await newPlayer('leaf@example.com', 'Leaf'));
    ditto = (await give(userId, 132)).id;
    ivysaur = (await give(userId, 2, { gender: 'male', nature: 'modest', ability: 'overgrow' })).id;
    magikarp = (await give(userId, 129, { gender: 'female', ability: 'swift-swim' })).id;
    await addItems(handle.db, userId, [
      { itemId: 'everstone', quantity: 1 },
      { itemId: 'destiny-knot', quantity: 1 },
    ]);
  });

  it('affiche une pension vide', async () => {
    const res = await call<DaycareResponse>('GET', '/api/daycare');
    expect(res.body).toMatchObject({ slots: 1, maxEggs: 6, pensions: [], eggs: [] });
  });

  it('refuse un couple incompatible ou un objet qui n’est pas d’élevage', async () => {
    const bad = await call('POST', '/api/daycare', {
      parentAId: ivysaur,
      parentBId: magikarp,
      heldItemAId: null,
      heldItemBId: null,
    });
    expect(bad).toMatchObject({
      status: 400,
      body: { error: 'INCOMPATIBLE_PARENTS', errors: [{ code: 'NO_COMMON_EGG_GROUP' }] },
    });
    const notBreeding = await call('POST', '/api/daycare', {
      parentAId: ditto,
      parentBId: ivysaur,
      heldItemAId: 'poke-ball',
      heldItemBId: null,
    });
    expect(notBreeding.body).toMatchObject({ error: 'NOT_A_BREEDING_ITEM' });
  });

  it('dépose un couple, réserve les objets tenus et occupe les parents', async () => {
    const res = await call<DaycareDto>('POST', '/api/daycare', {
      parentAId: ditto,
      parentBId: ivysaur,
      heldItemAId: 'destiny-knot',
      heldItemBId: 'everstone',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    // L'œuf contient la forme de base du parent non Métamorph.
    expect(res.body).toMatchObject({ slotIndex: 0, eggSpeciesId: 1 });

    const inv = await call<InventoryEntryDto[]>('GET', '/api/inventory');
    expect(inv.body.find((i) => i.itemId === 'everstone')).toBeUndefined();
    const pc = await call<PokemonDto[]>('GET', '/api/pokemon');
    expect(pc.body.find((p) => p.id === ditto)).toMatchObject({ busy: true, activity: 'daycare' });

    const expedition = await call('POST', '/api/expeditions', {
      zoneId: 'route-1',
      durationMinutes: 15,
      team: [ditto],
      ballItemId: null,
      berryItemId: null,
    });
    expect(expedition.body).toMatchObject({ error: 'POKEMON_BUSY' });
    const second = await call('POST', '/api/daycare', {
      parentAId: magikarp,
      parentBId: ditto,
      heldItemAId: null,
      heldItemBId: null,
    });
    expect(second.body).toMatchObject({ error: 'NO_FREE_SLOT' });
  });

  it('pond un œuf toutes les 20 minutes', async () => {
    advance(19);
    const early = await call('POST', '/api/daycare/0/collect');
    expect(early).toMatchObject({ status: 409, body: { error: 'NO_EGG_READY' } });

    advance(26); // 45 min : 2 œufs, 5 min entamées sur le suivant
    const res = await call<CollectEggsResponse>('POST', '/api/daycare/0/collect');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.eggs).toHaveLength(2);
    expect(res.body.lost).toBe(0);
    // Bulbizarre : 20 cycles × 2 min.
    expect(Date.parse(res.body.eggs[0]!.hatchAt) - clock.getTime()).toBe(40 * 60_000);

    const daycare = await call<DaycareResponse>('GET', '/api/daycare');
    expect(daycare.body.eggs).toHaveLength(2);
    const startedAt = Date.parse(daycare.body.pensions[0]!.startedAt);
    expect(clock.getTime() - startedAt).toBe(5 * 60_000);
  });

  it('fait éclore les œufs à terme, avec l’héritage des parents', async () => {
    const early = await call('POST', '/api/eggs/hatch');
    expect(early.body).toMatchObject({ error: 'NO_EGG_READY' });

    advance(40);
    const res = await call<HatchEggsResponse>('POST', '/api/eggs/hatch');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.hatched).toHaveLength(2);
    expect(res.body.newSpeciesIds).toEqual([]); // Bulbizarre : le starter
    for (const baby of res.body.hatched) {
      expect(baby).toMatchObject({ speciesId: 1, level: 1, origin: 'egg', nature: 'modest' });
      expect(getNature(baby.nature)).toBeDefined();
      // Nœud Destin : au moins 5 IV hérités, tous à 31 chez les deux parents.
      expect(Object.values(baby.ivs).filter((iv) => iv === 31).length).toBeGreaterThanOrEqual(5);
    }
    expect((await call('POST', '/api/eggs/hatch')).status).toBe(409);
    const dex = await call<PokedexEntryDto[]>('GET', '/api/pokedex');
    expect(dex.body.find((d) => d.speciesId === 1)?.caught).toBe(true);
  });

  it('limite la couveuse et garde les œufs en attente dans la pension', async () => {
    // 5 + 40 + 600 min depuis le début du cycle : 32 œufs ; 6 attendent, 26 sont perdus.
    advance(10 * 60);
    const res = await call<CollectEggsResponse>('POST', '/api/daycare/0/collect');
    expect(res.body.eggs).toHaveLength(6);
    expect(res.body.lost).toBe(26);
    advance(20);
    const full = await call('POST', '/api/daycare/0/collect');
    expect(full.body).toMatchObject({ error: 'INCUBATOR_FULL' });
  });

  it('retire le couple et rend les objets tenus', async () => {
    const res = await call<CollectEggsResponse>('DELETE', '/api/daycare/0');
    expect(res.status).toBe(200);
    const inv = await call<InventoryEntryDto[]>('GET', '/api/inventory');
    expect(inv.body).toEqual(
      expect.arrayContaining([
        { itemId: 'everstone', quantity: 1 },
        { itemId: 'destiny-knot', quantity: 1 },
      ]),
    );
    const daycare = await call<DaycareResponse>('GET', '/api/daycare');
    expect(daycare.body.pensions).toEqual([]);
    const pc = await call<PokemonDto[]>('GET', '/api/pokemon');
    expect(pc.body.find((p) => p.id === ditto)).toMatchObject({ busy: false, activity: null });
  });
});

describe('transfert et Bonbons de lignée', () => {
  it('transfère des doublons contre des Bonbons, puis les donne en XP', async () => {
    const { call, userId, starter } = await newPlayer('blue@example.com', 'Blue');
    const a = await give(userId, 2, { gender: 'male' });
    const b = await give(userId, 3, { gender: 'female', isShiny: true });

    const locked = await call('PATCH', `/api/pokemon/${a.id}`, { locked: true });
    expect(locked.status).toBe(200);
    const refused = await call('POST', '/api/pokemon/transfer', { ids: [a.id, b.id] });
    expect(refused).toMatchObject({ status: 409, body: { error: 'POKEMON_LOCKED' } });
    await call('PATCH', `/api/pokemon/${a.id}`, { locked: false });

    const res = await call<TransferPokemonResponse>('POST', '/api/pokemon/transfer', {
      ids: [a.id, b.id],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    // 1 Bonbon chacun + 10 pour le shiny, tous dans la lignée de Bulbizarre.
    expect(res.body).toEqual({ transferred: 2, gained: [{ lineageId: 1, quantity: 12 }] });
    expect((await call<CandyDto[]>('GET', '/api/candies')).body).toEqual([
      { lineageId: 1, quantity: 12 },
    ]);

    const fed = await call<PokemonDto>('POST', `/api/pokemon/${starter.id}/candies`, {
      count: 2,
    });
    expect(fed.status, JSON.stringify(fed.body)).toBe(200);
    expect(fed.body.xp).toBe(starter.xp + 1000);
    expect(fed.body.level).toBeGreaterThan(starter.level);
    const tooMany = await call('POST', `/api/pokemon/${starter.id}/candies`, { count: 11 });
    expect(tooMany.body).toMatchObject({ error: 'NOT_ENOUGH_CANDIES' });

    const last = await call('POST', '/api/pokemon/transfer', { ids: [starter.id] });
    expect(last.body).toMatchObject({ error: 'LAST_POKEMON' });
  });
});
