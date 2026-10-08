import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { seedContent } from '@poke/content';
import {
  createDb,
  eggs,
  ensureSeedContent,
  playerProfiles,
  shopPurchases,
  trainerProgress,
  users,
} from '@poke/db';
import type { InventoryEntryDto, PokemonDto, PurchaseResponse, ShopResponse } from '@poke/shared';
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

const setCurrency = (userId: string, currency: number) =>
  handle.db.update(playerProfiles).set({ currency }).where(eq(playerProfiles.userId, userId));

describe('boutique', () => {
  let call: ReturnType<typeof client>;
  let userId: string;

  beforeAll(async () => {
    const signed = await signUp('shop@example.com');
    userId = signed.userId;
    call = client(signed.cookie);
    expect((await call('POST', '/api/profile', { trainerName: 'Acheteur' })).status).toBe(201);
    expect((await call<PokemonDto>('POST', '/api/starter', { speciesId: 4 })).status).toBe(201);
  });

  const shop = async () => (await call<ShopResponse>('GET', '/api/shop')).body;
  const entry = (s: ShopResponse, id: string) => s.entries.find((e) => e.entryId === id);
  const buy = (entryId: string, lots: number) =>
    call<PurchaseResponse>('POST', '/api/shop/purchase', { entryId, lots });

  it('liste les articles visibles : verrouillés affichés, cachés absents, nouveautés', async () => {
    const s = await shop();
    expect(s.currency).toBe(0);
    expect(s.entries.map((e) => `${e.entryId}:${e.state}${e.isNew ? '*' : ''}`)).toEqual([
      'poke-ball:available*',
      'poke-ball-x10:available*',
      'great-ball:locked',
      'ultra-ball:locked',
      'razz-berry:available*',
      'razz-berry-x5:available*',
      'everstone:locked',
      'moon-stone:locked',
      'water-stone:locked',
      'thunder-stone:locked',
      'fire-stone:locked',
      'leaf-stone:locked',
      'linking-cord:locked',
      'bottle-cap:locked',
      'gold-bottle-cap:locked',
      'adamant-mint:locked',
      'modest-mint:locked',
      'jolly-mint:locked',
      'timid-mint:locked',
      'bold-mint:locked',
      'calm-mint:locked',
      'ability-capsule:locked',
      'ability-patch:locked',
    ]);

    const seen = await call('POST', '/api/shop/seen', {
      entryIds: ['poke-ball', 'poke-ball-x10', 'razz-berry'],
    });
    expect(seen.status).toBe(204);
    const after = await shop();
    expect(after.entries.filter((e) => e.isNew).map((e) => e.entryId)).toEqual(['razz-berry-x5']);
  });

  it('achète : débit, crédit de l’inventaire, historique', async () => {
    const poor = await buy('poke-ball', 1);
    expect(poor).toMatchObject({
      status: 409,
      body: { error: 'NOT_ENOUGH_MONEY', totalPrice: 200, currency: 0 },
    });

    await setCurrency(userId, 5000);
    const res = await buy('poke-ball-x10', 2);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    // 20 Poké Balls de départ + 2 lots de 10.
    expect(res.body).toEqual({
      entryId: 'poke-ball-x10',
      itemId: 'poke-ball',
      lots: 2,
      quantity: 20,
      totalPrice: 3600,
      currency: 1400,
      inventoryQuantity: 40,
    });
    const inventory = await call<InventoryEntryDto[]>('GET', '/api/inventory');
    expect(inventory.body).toContainEqual({ itemId: 'poke-ball', quantity: 40 });
    const rows = await handle.db
      .select()
      .from(shopPurchases)
      .where(eq(shopPurchases.ownerId, userId));
    expect(rows).toEqual([
      expect.objectContaining({ shopEntryId: 'poke-ball-x10', lots: 2, totalPrice: 3600 }),
    ]);
  });

  it('refuse un article verrouillé, inconnu, ou un nombre de lots invalide', async () => {
    expect(await buy('great-ball', 1)).toMatchObject({
      status: 403,
      body: { error: 'ENTRY_LOCKED' },
    });
    expect(await buy('master-ball', 1)).toMatchObject({
      status: 404,
      body: { error: 'SHOP_ENTRY_NOT_FOUND' },
    });
    expect((await buy('poke-ball', 0)).status).toBe(400);
    expect((await buy('poke-ball', 1000)).status).toBe(400);
  });

  it('débloque les articles avec les badges (badge « Nouveau ! »)', async () => {
    await handle.db.insert(trainerProgress).values({
      ownerId: userId,
      trainerId: 'pierre',
      wins: 1,
      firstWinAt: clock,
      lastWinAt: clock,
    });
    const s = await shop();
    expect(entry(s, 'great-ball')).toMatchObject({ state: 'available', isNew: true });
    expect(entry(s, 'everstone')).toMatchObject({ state: 'available', isNew: true });
    expect(entry(s, 'ultra-ball')).toMatchObject({ state: 'locked', isNew: false });

    const res = await buy('great-ball', 2);
    expect(res.body).toMatchObject({ currency: 200, inventoryQuantity: 2 });
    // Acheter un article le marque comme vu.
    expect(entry(await shop(), 'great-ball')!.isNew).toBe(false);
  });

  it('article caché et limite d’achat par semaine glissante', async () => {
    expect(entry(await shop(), 'destiny-knot')).toBeUndefined();
    await setCurrency(userId, 30_000);
    expect(await buy('destiny-knot', 1)).toMatchObject({ body: { error: 'ENTRY_LOCKED' } });

    // 10 œufs éclos débloquent le Nœud Destin.
    await handle.db.insert(eggs).values(
      Array.from({ length: 10 }, () => ({
        ownerId: userId,
        speciesId: 4,
        parents: [] as never,
        contentVersionId: 1,
        hatchAt: clock,
        seed: 1,
        hatched: true,
      })),
    );
    expect(entry(await shop(), 'destiny-knot')).toMatchObject({
      state: 'available',
      remainingLots: 1,
      isNew: true,
    });
    expect(await buy('destiny-knot', 2)).toMatchObject({
      status: 409,
      body: { error: 'LIMIT_REACHED', remainingLots: 1 },
    });
    expect((await buy('destiny-knot', 1)).status).toBe(200);

    const limited = await buy('destiny-knot', 1);
    expect(limited.body).toMatchObject({
      error: 'LIMIT_REACHED',
      remainingLots: 0,
      nextLotsAt: new Date(clock.getTime() + 7 * 24 * 3_600_000).toISOString(),
    });
    expect(entry(await shop(), 'destiny-knot')).toMatchObject({
      state: 'soldOut',
      remainingLots: 0,
    });

    advance(7 * 24 * 60 + 1);
    expect(entry(await shop(), 'destiny-knot')).toMatchObject({
      state: 'available',
      remainingLots: 1,
    });
  });
});
