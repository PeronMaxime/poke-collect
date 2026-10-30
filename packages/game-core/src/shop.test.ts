import { describe, expect, it } from 'vitest';
import { isUnlocked } from './progress';
import type { PlayerProgress } from './progress';
import {
  checkPurchase,
  escalatedPrice,
  maxPurchasableLots,
  nextLotPrice,
  purchaseLimitStatus,
  purchaseGift,
  purchaseQuote,
  roundPrice,
  shopEntryStatus,
} from './shop';
import { testContext } from './test-helpers';

const ctx = testContext();
const NOW = new Date('2026-10-07T12:00:00Z');
const HOUR = 3_600_000;

const progress = ({
  defeated = [],
  caught = 1,
  eggs = 0,
}: { defeated?: string[]; caught?: number; eggs?: number } = {}): PlayerProgress => ({
  caughtSpeciesIds: new Set(Array.from({ length: caught }, (_, i) => i + 1)),
  defeatedTrainerIds: new Set(defeated),
  eggsHatched: eggs,
});

const entry = (id: string) => ctx.shopEntry(id)!;

describe('conditions d’apparition', () => {
  it('évalue les nouvelles briques (espèces capturées, œufs éclos)', () => {
    expect(isUnlocked(ctx, { type: 'speciesCaught', count: 10 }, progress({ caught: 9 }))).toBe(
      false,
    );
    expect(isUnlocked(ctx, { type: 'speciesCaught', count: 10 }, progress({ caught: 10 }))).toBe(
      true,
    );
    expect(isUnlocked(ctx, { type: 'eggsHatched', count: 10 }, progress({ eggs: 10 }))).toBe(true);
  });

  it('trie les articles par catégorie puis par ordre', () => {
    expect(ctx.shopEntries.slice(0, 5).map((e) => e.id)).toEqual([
      'poke-ball',
      'poke-ball-x10',
      'great-ball',
      'ultra-ball',
      'razz-berry',
    ]);
  });

  it('verrouille ou cache un article selon sa visibilité', () => {
    expect(shopEntryStatus(ctx, entry('poke-ball'), progress(), [], NOW).state).toBe('available');
    // Super Ball : verrouillée (visible) tant que Pierre n'est pas battu.
    expect(shopEntryStatus(ctx, entry('great-ball'), progress(), [], NOW).state).toBe('locked');
    expect(
      shopEntryStatus(ctx, entry('great-ball'), progress({ defeated: ['pierre'] }), [], NOW).state,
    ).toBe('available');
    // Nœud Destin : caché tant que 10 œufs n'ont pas éclos.
    expect(shopEntryStatus(ctx, entry('destiny-knot'), progress(), [], NOW).state).toBe('hidden');
    expect(shopEntryStatus(ctx, entry('destiny-knot'), progress({ eggs: 10 }), [], NOW).state).toBe(
      'available',
    );
  });

  it('respecte les dates de disponibilité et l’activation', () => {
    const base = entry('poke-ball');
    const timed = {
      ...base,
      availableFrom: '2026-10-08T00:00:00Z',
      availableUntil: '2026-10-10T00:00:00Z',
    };
    expect(shopEntryStatus(ctx, timed, progress(), [], NOW).state).toBe('hidden');
    expect(shopEntryStatus(ctx, timed, progress(), [], new Date('2026-10-09')).state).toBe(
      'available',
    );
    expect(shopEntryStatus(ctx, timed, progress(), [], new Date('2026-10-10')).state).toBe(
      'hidden',
    );
    expect(shopEntryStatus(ctx, { ...base, enabled: false }, progress(), [], NOW).state).toBe(
      'hidden',
    );
  });
});

describe('limites d’achat', () => {
  const knot = entry('destiny-knot'); // 1 lot par semaine glissante

  it('sans limite : illimité', () => {
    expect(purchaseLimitStatus(entry('poke-ball'), [], NOW)).toEqual({
      remainingLots: null,
      nextLotsAt: null,
    });
  });

  it('compte les lots sur une fenêtre glissante', () => {
    const bought = [{ entryId: 'destiny-knot', lots: 1, at: new Date(NOW.getTime() - 24 * HOUR) }];
    const status = purchaseLimitStatus(knot, bought, NOW);
    expect(status.remainingLots).toBe(0);
    expect(status.nextLotsAt).toEqual(new Date(NOW.getTime() + 6 * 24 * HOUR));
    expect(shopEntryStatus(ctx, knot, progress({ eggs: 10 }), bought, NOW).state).toBe('soldOut');
    // Huit jours plus tard, l'achat ne compte plus.
    const later = new Date(NOW.getTime() + 7 * 24 * HOUR);
    expect(purchaseLimitStatus(knot, bought, later).remainingLots).toBe(1);
  });

  it('limite totale : les vieux achats comptent toujours', () => {
    const once = { ...entry('poke-ball'), purchaseLimit: { lots: 3, period: 'total' as const } };
    const bought = [
      { entryId: 'poke-ball', lots: 2, at: '2020-01-01T00:00:00Z' },
      { entryId: 'autre', lots: 5, at: NOW },
    ];
    expect(purchaseLimitStatus(once, bought, NOW)).toEqual({ remainingLots: 1, nextLotsAt: null });
  });
});

describe('achat', () => {
  it('calcule le prix et la quantité d’un achat en lots', () => {
    expect(purchaseQuote(entry('poke-ball-x10'), 3)).toEqual({
      totalPrice: 5400,
      stack: { itemId: 'poke-ball', quantity: 30 },
      gift: { itemId: 'premier-ball', quantity: 3 },
    });
  });

  it('offre une Honor Ball par tranche de 10 Poké Balls achetées d’un coup', () => {
    expect(purchaseGift(entry('poke-ball'), 9)).toBeNull();
    expect(purchaseGift(entry('poke-ball'), 10)).toEqual({ itemId: 'premier-ball', quantity: 1 });
    expect(purchaseGift(entry('poke-ball'), 25)).toEqual({ itemId: 'premier-ball', quantity: 2 });
    expect(purchaseGift(entry('great-ball'), 50)).toBeNull();
  });

  it('vérifie apparition, limite et solde', () => {
    const base = { progress: progress(), purchases: [], currency: 1000, now: NOW };
    expect(checkPurchase(ctx, { ...base, entry: entry('poke-ball'), lots: 5 })).toEqual({
      ok: true,
      totalPrice: 1000,
      stack: { itemId: 'poke-ball', quantity: 5 },
      gift: null,
    });
    expect(checkPurchase(ctx, { ...base, entry: entry('poke-ball'), lots: 6 })).toMatchObject({
      ok: false,
      error: 'NOT_ENOUGH_MONEY',
      totalPrice: 1200,
    });
    expect(checkPurchase(ctx, { ...base, entry: entry('great-ball'), lots: 1 })).toMatchObject({
      error: 'ENTRY_LOCKED',
    });
    // Caché parce que verrouillé : refusé comme verrouillé.
    expect(checkPurchase(ctx, { ...base, entry: entry('destiny-knot'), lots: 1 })).toMatchObject({
      error: 'ENTRY_LOCKED',
    });
    const disabled = { ...entry('poke-ball'), enabled: false };
    expect(checkPurchase(ctx, { ...base, entry: disabled, lots: 1 })).toMatchObject({
      error: 'NOT_ON_SALE',
    });
    const knot = {
      ...base,
      entry: entry('destiny-knot'),
      progress: progress({ eggs: 10 }),
      currency: 100_000,
    };
    expect(checkPurchase(ctx, { ...knot, lots: 2 })).toMatchObject({
      error: 'LIMIT_REACHED',
      remainingLots: 1,
    });
    expect(checkPurchase(ctx, { ...knot, lots: 1 }).ok).toBe(true);
  });

  it('borne le nombre de lots achetables', () => {
    const balls = entry('poke-ball');
    expect(maxPurchasableLots(balls, { remainingLots: null }, 1000)).toBe(5);
    expect(maxPurchasableLots(balls, { remainingLots: 2 }, 1000)).toBe(2);
    expect(maxPurchasableLots(balls, { remainingLots: null }, 10_000_000)).toBe(99);
    expect(maxPurchasableLots({ ...balls, price: 0 }, { remainingLots: null }, 0)).toBe(99);
  });
});

describe('parcelles de ferme', () => {
  // Article ouvert d'emblée (dans le contenu, il suit l'onglet Ferme).
  const ctx = testContext((c) => {
    c.shopEntries.find((e) => e.id === 'parcelle-ferme')!.unlock = { type: 'always' };
  });
  const plot = ctx.shopEntry('parcelle-ferme')!;
  const bought = (lots: number) => [{ entryId: plot.id, lots, at: NOW }];

  it('arrondit les prix à 3 chiffres significatifs', () => {
    expect(roundPrice(950.4)).toBe(950);
    expect(roundPrice(12_345)).toBe(12_300);
    expect(roundPrice(2_178_406)).toBe(2_180_000);
  });

  it('multiplie le prix à chaque achat, un lot à la fois', () => {
    expect(escalatedPrice(10_000, 1.4, 0)).toBe(10_000);
    expect(escalatedPrice(10_000, 1.4, 1)).toBe(14_000);
    expect(escalatedPrice(10_000, 1.4, 3)).toBe(27_400);
    expect(nextLotPrice(ctx, plot, bought(2))).toBe(19_600);
    // Les autres articles gardent leur prix.
    expect(nextLotPrice(ctx, entry('poke-ball'), bought(2))).toBe(200);

    const status = shopEntryStatus(ctx, plot, progress(), bought(1), NOW);
    expect(status).toMatchObject({ price: 14_000, maxLotsPerPurchase: 1 });
    expect(maxPurchasableLots(plot, status, 1_000_000)).toBe(1);
    expect(maxPurchasableLots(plot, status, 13_999)).toBe(0);
    const input = { entry: plot, progress: progress(), purchases: bought(1), now: NOW };
    expect(checkPurchase(ctx, { ...input, lots: 2, currency: 1_000_000 })).toMatchObject({
      error: 'LIMIT_REACHED',
      remainingLots: 1,
    });
    expect(checkPurchase(ctx, { ...input, lots: 1, currency: 13_999 })).toMatchObject({
      error: 'NOT_ENOUGH_MONEY',
      totalPrice: 14_000,
    });
    expect(checkPurchase(ctx, { ...input, lots: 1, currency: 14_000 })).toMatchObject({
      ok: true,
      totalPrice: 14_000,
      stack: { itemId: 'parcelle-ferme', quantity: 1 },
    });
  });

  it('s’arrête à 17 achats (ferme de 18 parcelles)', () => {
    expect(shopEntryStatus(ctx, plot, progress(), bought(16), NOW)).toMatchObject({
      state: 'available',
      remainingLots: 1,
      price: 2_180_000,
    });
    expect(shopEntryStatus(ctx, plot, progress(), bought(17), NOW).state).toBe('soldOut');
  });
});
