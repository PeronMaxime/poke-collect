import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { seedContent } from '@poke/content';
import { createDb, ensureSeedContent, trainerProgress, users } from '@poke/db';
import type { FarmResponse, MuseumResponse, ProgressionResponse } from '@poke/shared';
import { buildApp } from './app';
import { loadEnv } from './env';
import { addItems } from './game/store';

const handle = createDb({ pgliteDataDir: 'memory://' });
const env = loadEnv({ NODE_ENV: 'test' });
let app: Awaited<ReturnType<typeof buildApp>>['app'];

const beatPierre = { amount: 2, unlock: { type: 'trainerDefeated' as const, trainerId: 'pierre' } };

beforeAll(async () => {
  await handle.migrate();
  // Onglets tous ouverts ; 3 parcelles au départ, puis des places en plus après Pierre.
  await ensureSeedContent(handle.db, {
    ...seedContent,
    balance: {
      ...seedContent.balance,
      tabUnlocks: {},
      farm: { initialPlots: 3 },
      facilityUnlocks: {
        expedition: [],
        daycare: [],
        incubator: [],
        museum: [beatPierre],
        farm: [beatPierre],
        center: [{ ...beatPierre, amount: 1 }],
      },
    },
  });
  ({ app } = await buildApp({ db: handle.db, env, now: () => new Date('2026-10-08T10:00:00Z') }));
});
afterAll(async () => {
  await app.close();
  await handle.close();
});

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
  expect((await call('POST', '/api/starter', { speciesId: 1 })).status).toBe(201);
  return { call, userId: user!.id };
}

describe('Bâtiments à débloquer', () => {
  it('ouvre les places d’un palier dès que sa condition est remplie', async () => {
    const { call, userId } = await newPlayer('batiments@test.fr', 'Bâtisseur');
    await addItems(handle.db, userId, [{ itemId: 'razz-berry', quantity: 1 }]);
    const { museum, center } = seedContent.balance;

    expect((await call<FarmResponse>('GET', '/api/farm')).body.plots).toBe(3);
    expect(
      (await call('POST', '/api/farm', { plotIndex: 3, itemId: 'razz-berry' })).body,
    ).toMatchObject({ error: 'NO_SUCH_SLOT' });
    expect((await call<MuseumResponse>('GET', '/api/museum')).body.slots).toBe(museum.slots);

    await handle.db
      .insert(trainerProgress)
      .values({ ownerId: userId, trainerId: 'pierre', wins: 1 });

    expect((await call<FarmResponse>('GET', '/api/farm')).body.plots).toBe(5);
    expect((await call('POST', '/api/farm', { plotIndex: 3, itemId: 'razz-berry' })).status).toBe(
      201,
    );
    expect((await call<MuseumResponse>('GET', '/api/museum')).body.slots).toBe(museum.slots + 2);
    const { facilities } = (await call<ProgressionResponse>('GET', '/api/progression')).body;
    // Un Centre en plus : 6 places.
    expect(facilities).toMatchObject({ farm: 5, center: center.slots + 6 });
  });
});
