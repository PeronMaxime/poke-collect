import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { seedContent } from '@poke/content';
import { createDb, ensureSeedContent, users } from '@poke/db';
import type {
  BerryPlotDto,
  ExpeditionDto,
  FarmResponse,
  HarvestBerriesResponse,
  InventoryEntryDto,
  PokemonDto,
  UseItemResponse,
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
  // Onglets tous ouverts : leurs conditions de déblocage sont testées à part (museum.test.ts).
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

const advance = (minutes: number) => {
  clock = new Date(clock.getTime() + minutes * 60_000);
};

async function newPlayer(email: string, trainerName: string, starter: number) {
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
  expect((await call('POST', '/api/starter', { speciesId: starter })).status).toBe(201);
  return { call, userId: user!.id };
}

describe('Ferme à baies', () => {
  let call: Awaited<ReturnType<typeof newPlayer>>['call'];
  let waterId: string;
  const quantity = async (itemId: string) =>
    (await call<InventoryEntryDto[]>('GET', '/api/inventory')).body.find((i) => i.itemId === itemId)
      ?.quantity ?? 0;
  const plots = async () => (await call<FarmResponse>('GET', '/api/farm')).body;

  beforeAll(async () => {
    let userId: string;
    ({ call, userId } = await newPlayer('ferme@test.fr', 'Fermier', 7));
    await addItems(handle.db, userId, [{ itemId: 'razz-berry', quantity: 3 }]);
    waterId = (await call<PokemonDto[]>('GET', '/api/pokemon')).body[0]!.id;
  });

  it('n’accepte qu’un assistant de type Eau', async () => {
    const other = await newPlayer('ferme-plante@test.fr', 'Jardinier', 1);
    const bulbasaur = (await other.call<PokemonDto[]>('GET', '/api/pokemon')).body[0]!;
    const res = await other.call('PUT', '/api/assistants/farm/0', { pokemonId: bulbasaur.id });
    expect(res.body).toMatchObject({ error: 'ASSISTANT_WRONG_TYPE' });
  });

  it('l’assistant de récolte exige un talent qui augmente la récolte', async () => {
    // Aucun talent de ce genre dans le contenu de test.
    const res = await call('PUT', '/api/assistants/harvest/0', { pokemonId: waterId });
    expect(res.body).toMatchObject({ error: 'ASSISTANT_NO_ABILITY' });
  });

  it('refuse un objet qui ne se plante pas, ou une parcelle déjà prise', async () => {
    const before = await quantity('razz-berry');
    expect(
      (await call('POST', '/api/farm', { plotIndex: 0, itemId: 'poke-ball' })).body,
    ).toMatchObject({ error: 'NOT_PLANTABLE' });
    expect((await call('POST', '/api/farm', { plotIndex: 0, itemId: 'razz-berry' })).status).toBe(
      201,
    );
    expect(
      (await call('POST', '/api/farm', { plotIndex: 0, itemId: 'razz-berry' })).body,
    ).toMatchObject({ error: 'PLOT_TAKEN' });
    expect(await quantity('razz-berry')).toBe(before - 1);
  });

  it('ne pousse pas sans arrosage, puis pousse 1 h avec un assistant Eau', async () => {
    let farm = await plots();
    expect(farm.plots).toBe(9);
    expect(farm.planted[0]).toMatchObject({ plotIndex: 0, readyAt: null, remainingMs: 3_600_000 });

    advance(120);
    expect((await call('POST', '/api/farm/0/harvest')).body).toMatchObject({
      error: 'NO_BERRY_READY',
    });

    expect((await call('PUT', '/api/assistants/farm/0', { pokemonId: waterId })).status).toBe(200);
    farm = await plots();
    expect(Date.parse(farm.planted[0]!.readyAt!) - clock.getTime()).toBe(3_600_000);

    // Arrosé 20 min, puis l'assistant part : la pousse s'arrête là.
    advance(20);
    expect((await call('DELETE', '/api/assistants/farm/0')).status).toBe(204);
    farm = await plots();
    expect(farm.planted[0]).toMatchObject({ readyAt: null, remainingMs: 40 * 60_000 });

    advance(60);
    expect((await call('PUT', '/api/assistants/farm/0', { pokemonId: waterId })).status).toBe(200);
    // Plantée pendant que le champ est arrosé : pousse tout de suite.
    const b = await call<BerryPlotDto>('POST', '/api/farm', { plotIndex: 4, itemId: 'razz-berry' });
    expect(Date.parse(b.body.readyAt!) - clock.getTime()).toBe(3_600_000);
  });

  it('récolte une baie mûre (1 à 3) et libère sa parcelle', async () => {
    advance(40);
    expect((await call('POST', '/api/farm/4/harvest')).body).toMatchObject({
      error: 'NO_BERRY_READY',
    });
    const before = await quantity('razz-berry');
    const res = await call<HarvestBerriesResponse>('POST', '/api/farm/0/harvest');
    expect(res.status).toBe(200);
    expect(res.body.harvested).toHaveLength(1);
    const { itemId, quantity: got } = res.body.harvested[0]!;
    expect(itemId).toBe('razz-berry');
    expect(got).toBeGreaterThanOrEqual(1);
    expect(got).toBeLessThanOrEqual(3);
    expect(await quantity('razz-berry')).toBe(before + got);
    expect((await plots()).planted.map((p) => p.plotIndex)).toEqual([4]);
    expect((await call('POST', '/api/farm/0/harvest')).body).toMatchObject({
      error: 'NO_BERRY_READY',
    });
  });

  it('arrache une baie pas encore mûre : elle revient dans le sac', async () => {
    const before = await quantity('razz-berry');
    expect((await call('DELETE', '/api/farm/4')).status).toBe(200);
    expect(await quantity('razz-berry')).toBe(before + 1);
    expect((await plots()).planted).toEqual([]);
    expect((await call('DELETE', '/api/farm/4')).body).toMatchObject({ error: 'PLOT_EMPTY' });
  });

  it('récolte d’un coup toutes les baies mûres', async () => {
    for (const plotIndex of [2, 5]) {
      expect((await call('POST', '/api/farm', { plotIndex, itemId: 'razz-berry' })).status).toBe(
        201,
      );
    }
    expect((await call('POST', '/api/farm/harvest')).body).toMatchObject({
      error: 'NO_BERRY_READY',
    });
    advance(60);
    const before = await quantity('razz-berry');
    const res = await call<HarvestBerriesResponse>('POST', '/api/farm/harvest');
    expect(res.body.harvested).toHaveLength(1);
    const { quantity: got } = res.body.harvested[0]!;
    // Deux parcelles, de 1 à 3 baies chacune.
    expect(got).toBeGreaterThanOrEqual(2);
    expect(got).toBeLessThanOrEqual(6);
    expect(await quantity('razz-berry')).toBe(before + got);
    expect((await plots()).planted).toEqual([]);
  });
});

describe('Baies Grena et Nanana', () => {
  let call: Awaited<ReturnType<typeof newPlayer>>['call'];
  let starter: PokemonDto;
  const quantity = async (itemId: string) =>
    (await call<InventoryEntryDto[]>('GET', '/api/inventory')).body.find((i) => i.itemId === itemId)
      ?.quantity ?? 0;

  beforeAll(async () => {
    let userId: string;
    ({ call, userId } = await newPlayer('baies@test.fr', 'Cueilleur', 4));
    await addItems(handle.db, userId, [
      { itemId: 'pomeg-berry', quantity: 1 },
      { itemId: 'nanab-berry', quantity: 3 },
    ]);
    starter = (await call<PokemonDto[]>('GET', '/api/pokemon')).body[0]!;
  });

  it('la Baie Grena augmente le bonheur de 1', async () => {
    const res = await call<UseItemResponse>('POST', `/api/pokemon/${starter.id}/use-item`, {
      itemId: 'pomeg-berry',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.pokemon.happiness).toBe(starter.happiness + 1);
    expect(res.body.remaining).toBe(0);
  });

  it('la Baie Nanana : une par heure, toutes exigées, et plus de rencontres', async () => {
    const launch = (durationMinutes: number) =>
      call<ExpeditionDto>('POST', '/api/expeditions', {
        zoneId: 'route-1',
        durationMinutes,
        team: [starter.id],
        ballItemId: null,
        berryItemId: 'nanab-berry',
      });
    expect((await launch(240)).body).toMatchObject({ error: 'NOT_ENOUGH_BERRIES', berries: 4 });
    expect(await quantity('nanab-berry')).toBe(3);

    const res = await launch(15);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({ berryItemId: 'nanab-berry', berries: 1 });
    expect(await quantity('nanab-berry')).toBe(2);
  });
});
