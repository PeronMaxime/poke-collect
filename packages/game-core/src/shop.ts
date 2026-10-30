import type { ItemEffect, ItemStack, PurchasePeriod, ShopEntry } from '@poke/content';
import type { GameContext } from './context';
import { isUnlocked } from './progress';
import type { PlayerProgress } from './progress';

/**
 * Boutique : apparition des articles (condition, dates), limites d'achat et prix.
 * Tout se calcule à partir du contenu publié et des achats passés, sans tâche planifiée.
 */

/** Nombre de lots maximal par achat (garde-fou de l'interface et de l'API). */
export const MAX_LOTS_PER_PURCHASE = 99;

const PERIOD_MS: Record<Exclude<PurchasePeriod, 'total'>, number> = {
  day: 24 * 3_600_000,
  week: 7 * 24 * 3_600_000,
};

/** Achat passé d'un joueur (pour les limites d'achat). */
export interface ShopPurchaseRecord {
  entryId: string;
  lots: number;
  at: Date | string;
}

export interface PurchaseLimitStatus {
  /** Lots encore achetables ; null = illimité. */
  remainingLots: number | null;
  /** Limite par période : date à laquelle les plus anciens lots comptés se libèrent. */
  nextLotsAt: Date | null;
}

const time = (d: Date | string | number) => new Date(d).getTime();

/** Limite d'achat : total, ou fenêtre glissante (24 h / 7 jours) à partir des dates d'achat. */
export function purchaseLimitStatus(
  entry: ShopEntry,
  purchases: readonly ShopPurchaseRecord[],
  now: Date | number,
): PurchaseLimitStatus {
  const limit = entry.purchaseLimit;
  if (!limit) return { remainingLots: null, nextLotsAt: null };
  const window = limit.period === 'total' ? null : PERIOD_MS[limit.period];
  const counted = purchases.filter(
    (p) => p.entryId === entry.id && (window === null || time(p.at) > time(now) - window),
  );
  const used = counted.reduce((sum, p) => sum + p.lots, 0);
  const oldest = Math.min(...counted.map((p) => time(p.at)));
  return {
    remainingLots: Math.max(0, limit.lots - used),
    nextLotsAt: window !== null && counted.length > 0 ? new Date(oldest + window) : null,
  };
}

/** L'article est-il proposé à cette date (activé, dans ses dates, objet et catégorie connus) ? */
export function isOnSale(ctx: GameContext, entry: ShopEntry, now: Date | number): boolean {
  const t = time(now);
  return (
    entry.enabled &&
    !!ctx.item(entry.itemId) &&
    ctx.shopCategories.some((c) => c.id === entry.categoryId) &&
    (!entry.availableFrom || time(entry.availableFrom) <= t) &&
    (!entry.availableUntil || t < time(entry.availableUntil))
  );
}

export type ShopEntryState =
  /** Achetable. */
  | 'available'
  /** Visible mais grisé : condition d'apparition non remplie. */
  | 'locked'
  /** Débloqué, mais limite d'achat atteinte. */
  | 'soldOut'
  /** Invisible pour le joueur. */
  | 'hidden';

export interface ShopEntryStatus extends PurchaseLimitStatus {
  state: ShopEntryState;
  /** Prix du prochain lot (il augmente à chaque achat d'une parcelle de ferme). */
  price: number;
  /** Lots achetables d'un coup : un seul quand le prix augmente à chaque achat. */
  maxLotsPerPurchase: number;
}

/** Effet « parcelle de ferme » d'un objet : débloquée à l'achat, sans passer par le sac. */
export function farmPlotEffect(
  ctx: GameContext,
  itemId: string,
): Extract<ItemEffect, { type: 'farmPlot' }> | null {
  return (
    ctx
      .item(itemId)
      ?.effects.find(
        (e): e is Extract<ItemEffect, { type: 'farmPlot' }> => e.type === 'farmPlot',
      ) ?? null
  );
}

/** Prix arrondi à 3 chiffres significatifs (12 345 → 12 300). */
export function roundPrice(price: number): number {
  if (price < 1000) return Math.round(price);
  const step = 10 ** (Math.floor(Math.log10(price)) - 2);
  return Math.round(price / step) * step;
}

/** Prix après `bought` achats : premier prix × `growth` par achat, arrondi. */
export function escalatedPrice(basePrice: number, growth: number, bought: number): number {
  return roundPrice(basePrice * growth ** bought);
}

/** Prix du prochain lot : celui du contenu, multiplié à chaque achat pour une parcelle de ferme. */
export function nextLotPrice(
  ctx: GameContext,
  entry: ShopEntry,
  purchases: readonly ShopPurchaseRecord[],
): number {
  const plot = farmPlotEffect(ctx, entry.itemId);
  if (!plot) return entry.price;
  const bought = purchases
    .filter((p) => p.entryId === entry.id)
    .reduce((sum, p) => sum + p.lots, 0);
  return escalatedPrice(entry.price, plot.priceGrowth, bought);
}

export function shopEntryStatus(
  ctx: GameContext,
  entry: ShopEntry,
  progress: PlayerProgress,
  purchases: readonly ShopPurchaseRecord[],
  now: Date | number,
): ShopEntryStatus {
  const limit = {
    ...purchaseLimitStatus(entry, purchases, now),
    price: nextLotPrice(ctx, entry, purchases),
    maxLotsPerPurchase: farmPlotEffect(ctx, entry.itemId) ? 1 : MAX_LOTS_PER_PURCHASE,
  };
  if (!isOnSale(ctx, entry, now)) return { state: 'hidden', ...limit };
  if (!isUnlocked(ctx, entry.unlock, progress)) {
    return { state: entry.lockedVisibility === 'hidden' ? 'hidden' : 'locked', ...limit };
  }
  return { state: limit.remainingLots === 0 ? 'soldOut' : 'available', ...limit };
}

/** Objets offerts pour `quantity` objets achetés d'un coup (ex. 1 Honor Ball par 10 Poké Balls). */
export function purchaseGift(entry: Pick<ShopEntry, 'gift'>, quantity: number): ItemStack | null {
  const { gift } = entry;
  const count = gift ? Math.floor(quantity / gift.every) * gift.quantity : 0;
  return gift && count > 0 ? { itemId: gift.itemId, quantity: count } : null;
}

/**
 * Prix, objets reçus et cadeau pour `lots` lots (le prix vient toujours du contenu publié ;
 * `price` = prix du prochain lot, voir `nextLotPrice`).
 */
export function purchaseQuote(
  entry: ShopEntry,
  lots: number,
  price = entry.price,
): { totalPrice: number; stack: ItemStack; gift: ItemStack | null } {
  const quantity = entry.lotSize * lots;
  return {
    totalPrice: price * lots,
    stack: { itemId: entry.itemId, quantity },
    gift: purchaseGift(entry, quantity),
  };
}

/** Nombre de lots achetables d'un coup avec ce solde (0 si aucun). */
export function maxPurchasableLots(
  entry: ShopEntry,
  status: Pick<ShopEntryStatus, 'remainingLots'> &
    Partial<Pick<ShopEntryStatus, 'price' | 'maxLotsPerPurchase'>>,
  currency: number,
): number {
  const price = status.price ?? entry.price;
  const affordable = price > 0 ? Math.floor(currency / price) : Infinity;
  return Math.max(
    0,
    Math.min(
      status.maxLotsPerPurchase ?? MAX_LOTS_PER_PURCHASE,
      affordable,
      status.remainingLots ?? Infinity,
    ),
  );
}

export type PurchaseCheck =
  | { ok: true; totalPrice: number; stack: ItemStack; gift: ItemStack | null }
  | { ok: false; error: 'NOT_ON_SALE' | 'ENTRY_LOCKED' }
  | { ok: false; error: 'LIMIT_REACHED'; remainingLots: number; nextLotsAt: Date | null }
  | { ok: false; error: 'NOT_ENOUGH_MONEY'; totalPrice: number };

/** Vérifications d'un achat : apparition, limite d'achat, solde. */
export function checkPurchase(
  ctx: GameContext,
  input: {
    entry: ShopEntry;
    lots: number;
    progress: PlayerProgress;
    purchases: readonly ShopPurchaseRecord[];
    currency: number;
    now: Date | number;
  },
): PurchaseCheck {
  const { entry, lots } = input;
  const status = shopEntryStatus(ctx, entry, input.progress, input.purchases, input.now);
  if (status.state === 'hidden') {
    // Un article caché parce que verrouillé reste « verrouillé » pour le serveur.
    return isOnSale(ctx, entry, input.now)
      ? { ok: false, error: 'ENTRY_LOCKED' }
      : { ok: false, error: 'NOT_ON_SALE' };
  }
  if (status.state === 'locked') return { ok: false, error: 'ENTRY_LOCKED' };
  if (status.remainingLots !== null && lots > status.remainingLots) {
    return {
      ok: false,
      error: 'LIMIT_REACHED',
      remainingLots: status.remainingLots,
      nextLotsAt: status.nextLotsAt,
    };
  }
  // Prix croissant : un lot à la fois, chacun à son prix.
  if (lots > status.maxLotsPerPurchase) {
    return {
      ok: false,
      error: 'LIMIT_REACHED',
      remainingLots: Math.min(status.maxLotsPerPurchase, status.remainingLots ?? Infinity),
      nextLotsAt: null,
    };
  }
  const quote = purchaseQuote(entry, lots, status.price);
  if (quote.totalPrice > input.currency) {
    return { ok: false, error: 'NOT_ENOUGH_MONEY', totalPrice: quote.totalPrice };
  }
  return { ok: true, ...quote };
}
