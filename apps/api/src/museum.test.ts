import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { seedContent } from '@poke/content';
import { createDb, ensureSeedContent, users } from '@poke/db';
import type {
  FossilRevivalDto,
  InventoryEntryDto,
  MuseumResponse,
  PokedexEntryDto,
  PokemonDto,
  ReviveFossilsResponse,
} from '@poke/shared';
import { buildApp } from './app';
import { loadEnv } from './env';
import { addItems } from './game/store';

const handle = createDb({ pgliteDataDir: 'memory://' });
const env = loadEnv({ NODE_ENV: 'test' });
let clock = new Date('2026-10-08T10:00:00Z');
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

async function newPlayer(email: string, trainerName: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
    payload: { email, password: 'motdepasse-solide', name: trainerName },
  });
  expect(res.statusCode, res.body).toBe(200);
  const cookies = res.headers['set-cookie'];
  const cookie = (Array.isArray(cookies) ? cookies : [cookies ?? ''])
    .map((c) => c.split(';')[0])
    .join('; ');
  const [user] = await handle.db.select().from(users).where(eq(users.email, email));
  const call = async <T>(method: 'GET' | 'POST' | 'DELETE', url: string, payload?: unknown) => {
    const r = await app.inject({
      method,
      url,
      headers: { cookie },
      ...(payload !== undefined && { payload: payload as object }),
    });
    return { status: r.statusCode, body: (r.body ? r.json() : null) as T };
  };
  expect((await call('POST', '/api/profile', { trainerName })).status).toBe(201);
  expect((await call('POST', '/api/starter', { speciesId: 1 })).status).toBe(201);
  return { call, userId: user!.id };
}

describe('Musée', () => {
  let call: Awaited<ReturnType<typeof newPlayer>>['call'];
  let userId: string;
  const quantity = async (itemId: string) =>
    (await call<InventoryEntryDto[]>('GET', '/api/inventory')).body.find((i) => i.itemId === itemId)
      ?.quantity ?? 0;

  beforeAll(async () => {
    ({ call, userId } = await newPlayer('musee@test.fr', 'Conservateur'));
    await addItems(handle.db, userId, [
      { itemId: 'helix-fossil', quantity: 2 },
      { itemId: 'old-amber', quantity: 1 },
    ]);
  });

  it('refuse un objet qui n’est pas un fossile, ou absent du sac', async () => {
    expect((await call('POST', '/api/museum', { itemId: 'poke-ball' })).body).toMatchObject({
      error: 'NOT_A_FOSSIL',
    });
    expect((await call('POST', '/api/museum', { itemId: 'dome-fossil' })).body).toMatchObject({
      error: 'ITEM_MISSING',
    });
  });

  it('consomme le fossile au dépôt, dans la limite des places', async () => {
    const a = await call<FossilRevivalDto>('POST', '/api/museum', { itemId: 'helix-fossil' });
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ itemId: 'helix-fossil', speciesId: 138 });
    expect(Date.parse(a.body.readyAt) - clock.getTime()).toBe(120 * 60_000);
    expect(await quantity('helix-fossil')).toBe(1);

    advance(60);
    expect((await call('POST', '/api/museum', { itemId: 'old-amber' })).status).toBe(201);
    // Deux places dans le contenu de test.
    expect((await call('POST', '/api/museum', { itemId: 'helix-fossil' })).body).toMatchObject({
      error: 'MUSEUM_FULL',
    });
    const museum = await call<MuseumResponse>('GET', '/api/museum');
    expect(museum.body.slots).toBe(2);
    expect(museum.body.revivals.map((r) => r.itemId)).toEqual(['helix-fossil', 'old-amber']);
  });

  it('ne restaure rien avant la fin, puis donne le Pokémon', async () => {
    expect((await call('POST', '/api/museum/revive')).body).toMatchObject({
      error: 'NO_FOSSIL_READY',
    });
    advance(60);
    const res = await call<ReviveFossilsResponse>('POST', '/api/museum/revive');
    expect(res.status).toBe(200);
    expect(res.body.revived).toHaveLength(1);
    expect(res.body.revived[0]).toMatchObject({ speciesId: 138, level: 10, origin: 'fossil' });
    expect(res.body.newSpeciesIds).toEqual([138]);
    // Une seule restauration par fossile.
    expect((await call('POST', '/api/museum/revive')).status).toBe(409);

    const pokemon = await call<PokemonDto[]>('GET', '/api/pokemon');
    expect(pokemon.body.some((p) => p.speciesId === 138)).toBe(true);
    const dex = await call<PokedexEntryDto[]>('GET', '/api/pokedex');
    expect(dex.body.find((d) => d.speciesId === 138)?.caught).toBe(true);
    expect((await call<MuseumResponse>('GET', '/api/museum')).body.revivals).toHaveLength(1);
  });

  it('rend le fossile repris avant la fin de la restauration', async () => {
    const [amber] = (await call<MuseumResponse>('GET', '/api/museum')).body.revivals;
    const res = await call<FossilRevivalDto>('DELETE', `/api/museum/${amber!.id}`);
    expect(res.status).toBe(200);
    expect(await quantity('old-amber')).toBe(1);
    expect((await call<MuseumResponse>('GET', '/api/museum')).body.revivals).toHaveLength(0);
    expect((await call('DELETE', `/api/museum/${amber!.id}`)).status).toBe(404);
  });

  it('les fossiles tombent dans le butin du Mont Sélénite', () => {
    const zone = seedContent.zones.find((z) => z.id === 'mont-selenite')!;
    const table = seedContent.lootTables.find((t) => t.id === zone.lootTableId)!;
    expect(table.entries.map((e) => e.itemId)).toEqual(
      expect.arrayContaining(['helix-fossil', 'dome-fossil', 'old-amber']),
    );
  });
});
