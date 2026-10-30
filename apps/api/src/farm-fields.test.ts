import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { seedContent } from '@poke/content';
import { createDb, ensureSeedContent, users } from '@poke/db';
import type { FarmResponse, PokemonDto } from '@poke/shared';
import { buildApp } from './app';
import { loadEnv } from './env';
import { addItems } from './game/store';

const handle = createDb({ pgliteDataDir: 'memory://' });
const env = loadEnv({ NODE_ENV: 'test' });
const clock = new Date('2026-10-08T10:00:00Z');
let app: Awaited<ReturnType<typeof buildApp>>['app'];

beforeAll(async () => {
  await handle.migrate();
  // Onglets tous ouverts ; 12 parcelles au départ, soit deux champs (9 + 3).
  await ensureSeedContent(handle.db, {
    ...seedContent,
    balance: { ...seedContent.balance, tabUnlocks: {}, farm: { initialPlots: 12 } },
  });
  ({ app } = await buildApp({ db: handle.db, env, now: () => clock }));
});
afterAll(async () => {
  await app.close();
  await handle.close();
});

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

describe('Champs de la ferme', () => {
  it('au-delà de 9 parcelles, un nouveau champ avec ses propres assistants', async () => {
    const { call, userId } = await newPlayer('champs@test.fr', 'Agriculteur', 7);
    await addItems(handle.db, userId, [{ itemId: 'razz-berry', quantity: 2 }]);
    const waterId = (await call<PokemonDto[]>('GET', '/api/pokemon')).body[0]!.id;
    const planted = async () => (await call<FarmResponse>('GET', '/api/farm')).body.planted;

    // Deux champs : postes 0 et 1, pas de troisième.
    expect(
      (await call('PUT', '/api/assistants/farm/2', { pokemonId: waterId })).body,
    ).toMatchObject({ error: 'NO_SUCH_SLOT' });

    for (const plotIndex of [0, 10]) {
      expect((await call('POST', '/api/farm', { plotIndex, itemId: 'razz-berry' })).status).toBe(
        201,
      );
    }
    // L'arroseur du 2e champ n'arrose que ses parcelles (9 à 17).
    expect((await call('PUT', '/api/assistants/farm/1', { pokemonId: waterId })).status).toBe(200);
    let [first, second] = await planted();
    expect(first).toMatchObject({ plotIndex: 0, readyAt: null });
    expect(Date.parse(second!.readyAt!) - clock.getTime()).toBe(3_600_000);

    expect((await call('DELETE', '/api/assistants/farm/1')).status).toBe(204);
    [first, second] = await planted();
    expect(first).toMatchObject({ plotIndex: 0, readyAt: null, remainingMs: 3_600_000 });
    expect(second).toMatchObject({ plotIndex: 10, readyAt: null, remainingMs: 3_600_000 });

    // Arrosé, le 1er champ pousse sans toucher au 2e.
    expect((await call('PUT', '/api/assistants/farm/0', { pokemonId: waterId })).status).toBe(200);
    [first, second] = await planted();
    expect(first!.readyAt).not.toBeNull();
    expect(second!.readyAt).toBeNull();
  });
});
