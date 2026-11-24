import { describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { candies, inventory, playerProfiles, pokemon } from '@poke/db';
import type { ApiMetricsResponse, PurchaseResponse } from '@poke/shared';
import { pgErrorCode } from '../../src/game/tx';
import { testApi } from '../support/api';

/**
 * Garde-fous `CHECK` de la base (plan de sécurité, 4.1) : un solde ou une quantité sous zéro est
 * refusé par Postgres, et l'API en fait un refus propre (409 `INVALID_STATE`) signalé dans la
 * Santé de l'API.
 */

const api = testApi();
const { handle } = api;

/** Code Postgres de l'erreur levée par `write`, ou undefined si l'écriture passe. */
async function pgCodeOf(write: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await write();
    return undefined;
  } catch (err) {
    return pgErrorCode(err);
  }
}

describe('garde-fous de la base', () => {
  it('refuse argent, objets, Bonbons, niveau et XP sous zéro', async () => {
    const { userId, starter } = await api.newPlayer('garde-fous@example.com', 'GardeFous');
    await handle.db
      .insert(inventory)
      .values({ ownerId: userId, itemId: 'objet-test', quantity: 1 });
    await handle.db.insert(candies).values({ ownerId: userId, lineageId: 999_999, quantity: 1 });

    const writes = [
      () =>
        handle.db
          .update(playerProfiles)
          .set({ currency: -1 })
          .where(eq(playerProfiles.userId, userId)),
      () =>
        handle.db
          .update(playerProfiles)
          .set({ farmPlots: -1 })
          .where(eq(playerProfiles.userId, userId)),
      () => handle.db.update(inventory).set({ quantity: -1 }).where(eq(inventory.ownerId, userId)),
      () => handle.db.update(candies).set({ quantity: -1 }).where(eq(candies.ownerId, userId)),
      () => handle.db.update(pokemon).set({ level: 0 }).where(eq(pokemon.id, starter.id)),
      () => handle.db.update(pokemon).set({ xp: -1 }).where(eq(pokemon.id, starter.id)),
    ];
    for (const write of writes) expect(await pgCodeOf(write)).toBe('23514');

    // Zéro reste permis (stock épuisé, argent dépensé).
    expect(
      await pgCodeOf(() =>
        handle.db.update(inventory).set({ quantity: 0 }).where(eq(inventory.ownerId, userId)),
      ),
    ).toBeUndefined();
  });

  it('une écriture refusée par la base devient un refus 409 INVALID_STATE, signalé', async () => {
    const buyer = await api.newPlayer('acheteur-garde@example.com', 'AcheteurGarde');
    await handle.db
      .update(playerProfiles)
      .set({ currency: 10_000 })
      .where(eq(playerProfiles.userId, buyer.userId));
    // Défaut simulé : le Sac passe sous zéro à chaque ajout (dernier test du fichier).
    await handle.db.execute(sql`
      create function test_stock_negatif() returns trigger language plpgsql as $$
      begin new.quantity := -1; return new; end $$`);
    await handle.db.execute(sql`
      create trigger test_stock_negatif before insert or update on inventory
      for each row execute function test_stock_negatif()`);

    const res = await buyer.call<PurchaseResponse>('POST', '/api/shop/purchase', {
      entryId: 'poke-ball',
      lots: 1,
    });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'INVALID_STATE' });
    // Toute la transaction est annulée : l'argent n'est pas débité.
    const [profile] = await handle.db
      .select({ currency: playerProfiles.currency })
      .from(playerProfiles)
      .where(eq(playerProfiles.userId, buyer.userId));
    expect(profile!.currency).toBe(10_000);

    const signed = await api.signUp('admin-garde@example.com');
    const admin = await api.promoteAdmin(signed.userId, signed.cookie);
    const metrics = await admin.call<ApiMetricsResponse>('GET', '/api/admin/metrics');
    expect(metrics.body.recentErrors[0]).toMatchObject({
      route: 'POST /api/shop/purchase',
      status: 409,
      code: '23514',
    });
  });
});
