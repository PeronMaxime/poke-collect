import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { seedContent } from '@poke/content';
import { createDb, ensureSeedContent, playerProfiles, users } from '@poke/db';
import type {
  FarmResponse,
  InventoryEntryDto,
  ProgressionResponse,
  PurchaseResponse,
  ShopResponse,
} from '@poke/shared';
import { buildApp } from './app';
import { loadEnv } from './env';

const handle = createDb({ pgliteDataDir: 'memory://' });
const env = loadEnv({ NODE_ENV: 'test' });
const clock = new Date('2026-10-29T10:00:00Z');
let app: Awaited<ReturnType<typeof buildApp>>['app'];

beforeAll(async () => {
  await handle.migrate();
  // Ferme ouverte avec 1 parcelle, article des parcelles en vente d'emblée.
  await ensureSeedContent(handle.db, {
    ...seedContent,
    balance: { ...seedContent.balance, tabUnlocks: {}, farm: { initialPlots: 1 } },
    shopEntries: seedContent.shopEntries.map((e) =>
      e.id === 'parcelle-ferme' ? { ...e, unlock: { type: 'always' as const } } : e,
    ),
  });
  ({ app } = await buildApp({ db: handle.db, env, now: () => clock }));
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
  expect((await call('POST', '/api/starter', { speciesId: 7 })).status).toBe(201);
  return { call, userId: user!.id };
}

describe('Parcelles de ferme en boutique', () => {
  it('débloque une parcelle par achat, sans rien mettre dans le sac, à prix croissant', async () => {
    const { call, userId } = await newPlayer('parcelles@test.fr', 'Maraîcher');
    await handle.db
      .update(playerProfiles)
      .set({ currency: 30_000 })
      .where(eq(playerProfiles.userId, userId));
    const status = async () =>
      (await call<ShopResponse>('GET', '/api/shop')).body.entries.find(
        (e) => e.entryId === 'parcelle-ferme',
      );
    const plots = async () => (await call<FarmResponse>('GET', '/api/farm')).body.plots;

    expect(await status()).toMatchObject({ price: 10_000, maxLotsPerPurchase: 1 });
    expect(await plots()).toBe(1);
    expect(
      (await call('POST', '/api/shop/purchase', { entryId: 'parcelle-ferme', lots: 2 })).body,
    ).toMatchObject({ error: 'LIMIT_REACHED' });

    const bought = await call<PurchaseResponse>('POST', '/api/shop/purchase', {
      entryId: 'parcelle-ferme',
      lots: 1,
    });
    expect(bought.body).toMatchObject({ totalPrice: 10_000, currency: 20_000, farmPlots: 2 });
    expect(await plots()).toBe(2);
    expect((await call<ProgressionResponse>('GET', '/api/progression')).body.facilities.farm).toBe(
      2,
    );
    expect(
      (await call<InventoryEntryDto[]>('GET', '/api/inventory')).body.some(
        (i) => i.itemId === 'parcelle-ferme',
      ),
    ).toBe(false);

    expect(await status()).toMatchObject({ price: 14_000 });
    await call('POST', '/api/shop/purchase', { entryId: 'parcelle-ferme', lots: 1 });
    expect(await plots()).toBe(3);
    // 6 000 ₽ restants, la suivante en coûte 19 600.
    expect(
      (await call('POST', '/api/shop/purchase', { entryId: 'parcelle-ferme', lots: 1 })).body,
    ).toMatchObject({ error: 'NOT_ENOUGH_MONEY', totalPrice: 19_600 });
  });
});
