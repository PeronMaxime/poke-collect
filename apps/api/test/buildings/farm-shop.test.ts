import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { seedContent } from '@poke/content/seed';
import { playerProfiles } from '@poke/db';
import type {
  FarmResponse,
  InventoryEntryDto,
  ProgressionResponse,
  PurchaseResponse,
  ShopResponse,
} from '@poke/shared';
import { testApi } from '../support/api';

// Ferme ouverte avec 1 parcelle, article des parcelles en vente d'emblée.
const api = testApi({
  start: '2026-10-29T10:00:00Z',
  content: {
    ...seedContent,
    balance: { ...seedContent.balance, tabUnlocks: {}, farm: { initialPlots: 1 } },
    shopEntries: seedContent.shopEntries.map((e) =>
      e.id === 'parcelle-ferme' ? { ...e, unlock: { type: 'always' as const } } : e,
    ),
  },
});
const { handle } = api;

const newPlayer = (email: string, trainerName: string) => api.newPlayer(email, trainerName, 7);

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
