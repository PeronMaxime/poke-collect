import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { seedContent } from '@poke/content';
import {
  assistants,
  createDb,
  daycareSlots,
  ensureSeedContent,
  fossilRevivals,
  users,
} from '@poke/db';
import type {
  AssistantDto,
  DaycareResponse,
  FossilRevivalDto,
  InventoryEntryDto,
  MuseumResponse,
  PokemonDto,
} from '@poke/shared';
import { buildApp } from './app';
import { loadEnv } from './env';
import { addItems, insertPokemon } from './game/store';

const handle = createDb({ pgliteDataDir: 'memory://' });
const env = loadEnv({ NODE_ENV: 'test' });
const clock = new Date('2026-10-07T10:00:00Z');
let app: Awaited<ReturnType<typeof buildApp>>['app'];

beforeAll(async () => {
  await handle.migrate();
  await ensureSeedContent(handle.db, {
    ...seedContent,
    balance: { ...seedContent.balance, tabUnlocks: {} },
  });
  ({ app } = await buildApp({ db: handle.db, env, now: () => clock }));
});
afterAll(async () => {
  await app.close();
  await handle.close();
});

async function newPlayer(email: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
    payload: { email, password: 'motdepasse-solide', name: email.split('@')[0] },
  });
  expect(res.statusCode, res.body).toBe(200);
  const cookies = res.headers['set-cookie'];
  const list = Array.isArray(cookies) ? cookies : [cookies ?? ''];
  const cookie = list.map((c) => c.split(';')[0]).join('; ');
  const [user] = await handle.db.select().from(users).where(eq(users.email, email));
  const call = async <T>(method: 'GET' | 'POST', url: string, payload?: object) => {
    const r = await app.inject({
      method,
      url,
      headers: { cookie },
      ...(payload !== undefined && { payload }),
    });
    return { status: r.statusCode, body: (r.body ? r.json() : null) as T };
  };
  expect((await call('POST', '/api/profile', { trainerName: email.split('@')[0] })).status).toBe(
    201,
  );
  expect((await call('POST', '/api/starter', { speciesId: 1 })).status).toBe(201);
  return { call, userId: user!.id };
}

async function give(userId: string, speciesId: number) {
  const [row] = await insertPokemon(
    handle.db,
    userId,
    [
      {
        speciesId,
        level: 20,
        xp: 8000,
        ivs: {
          hp: 31,
          attack: 31,
          defense: 31,
          'special-attack': 31,
          'special-defense': 31,
          speed: 31,
        },
        nature: 'hardy',
        ability: 'limber',
        isShiny: false,
        gender: 'genderless',
        happiness: 70,
      },
    ],
    { origin: 'admin', originRegion: null, at: clock },
  );
  return row!;
}

describe('places fermées (réglage baissé)', () => {
  it('rend le couple, les objets, les fossiles et les assistants', async () => {
    const { call, userId } = await newPlayer('fermee@test.fr');
    const [a, b, keeper, helperA, helperB] = await Promise.all(
      [10, 11, 12, 13, 14].map((speciesId) => give(userId, speciesId)),
    );
    await addItems(handle.db, userId, [{ itemId: 'helix-fossil', quantity: 2 }]);

    // Une place ouverte, qui ne doit pas bouger, et une au-delà de celles ouvertes.
    const open = await call<FossilRevivalDto>('POST', '/api/museum', { itemId: 'helix-fossil' });
    const closed = await call<FossilRevivalDto>('POST', '/api/museum', { itemId: 'helix-fossil' });
    expect(closed.status).toBe(201);
    await handle.db
      .update(fossilRevivals)
      .set({ slotIndex: 50 })
      .where(eq(fossilRevivals.id, closed.body.id));
    await handle.db.insert(daycareSlots).values({
      ownerId: userId,
      slotIndex: 50,
      parentAId: a!.id,
      parentBId: b!.id,
      heldItemAId: 'helix-fossil',
      startedAt: clock,
    });
    await handle.db.insert(assistants).values([
      { ownerId: userId, post: 'museum', slotIndex: 0, pokemonId: keeper!.id },
      { ownerId: userId, post: 'museum', slotIndex: 51, pokemonId: helperA!.id },
      { ownerId: userId, post: 'daycare', slotIndex: 51, pokemonId: helperB!.id },
    ]);

    const daycare = await call<DaycareResponse>('GET', '/api/daycare');
    expect(daycare.body.pensions).toEqual([]);
    const museum = await call<MuseumResponse>('GET', '/api/museum');
    expect(museum.body.revivals.map((r) => r.id)).toEqual([open.body.id]);

    const inventory = await call<InventoryEntryDto[]>('GET', '/api/inventory');
    // Un fossile rendu par le Musée, un objet tenu rendu par la pension.
    expect(inventory.body.find((s) => s.itemId === 'helix-fossil')?.quantity).toBe(2);

    const helpers = await call<AssistantDto[]>('GET', '/api/assistants');
    expect(helpers.body).toEqual([{ post: 'museum', slot: 0, pokemonId: keeper!.id }]);

    const pokemon = await call<PokemonDto[]>('GET', '/api/pokemon');
    const busy = (id: string) => pokemon.body.find((p) => p.id === id)?.busy;
    expect([a, b, helperA, helperB].map((p) => busy(p!.id))).toEqual([false, false, false, false]);
    expect(busy(keeper!.id)).toBe(true);
  });

  it('rend tout dès la liste du PC, et une seule fois', async () => {
    const { call, userId } = await newPlayer('parallele@test.fr');
    await addItems(handle.db, userId, [{ itemId: 'helix-fossil', quantity: 1 }]);
    const closed = await call<FossilRevivalDto>('POST', '/api/museum', { itemId: 'helix-fossil' });
    await handle.db
      .update(fossilRevivals)
      .set({ slotIndex: 50 })
      .where(eq(fossilRevivals.id, closed.body.id));

    await Promise.all([
      call('GET', '/api/pokemon'),
      call('GET', '/api/museum'),
      call('GET', '/api/daycare'),
    ]);
    const inventory = await call<InventoryEntryDto[]>('GET', '/api/inventory');
    expect(inventory.body.find((s) => s.itemId === 'helix-fossil')?.quantity).toBe(1);
  });
});
