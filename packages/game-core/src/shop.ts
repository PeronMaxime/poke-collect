import type { ItemStack, PurchasePeriod, ShopEntry } from '@poke/content';
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
}

export function shopEntryStatus(
  ctx: GameContext,
  entry: ShopEntry,
  progress: PlayerProgress,
  purchases: readonly ShopPurchaseRecord[],
  now: Date | number,
): ShopEntryStatus {
  const limit = purchaseLimitStatus(entry, purchases, now);
  if (!isOnSale(ctx, entry, now)) return { state: 'hidden', ...limit };
  if (!isUnlocked(ctx, entry.unlock, progress)) {
    return { state: entry.lockedVisibility === 'hidden' ? 'hidden' : 'locked', ...limit };
  }
  return { state: limit.remainingLots === 0 ? 'soldOut' : 'available', ...limit };
}

/** Prix et objets reçus pour `lots` lots (le prix vient toujours du contenu publié). */
export function purchaseQuote(
  entry: ShopEntry,
  lots: number,
): { totalPrice: number; stack: ItemStack } {
  return {
    totalPrice: entry.price * lots,
    stack: { itemId: entry.itemId, quantity: entry.lotSize * lots },
  };
}

/** Nombre de lots achetables d'un coup avec ce solde (0 si aucun). */
export function maxPurchasableLots(
  entry: ShopEntry,
  status: Pick<ShopEntryStatus, 'remainingLots'>,
  currency: number,
): number {
  const affordable = entry.price > 0 ? Math.floor(currency / entry.price) : Infinity;
  return Math.max(0, Math.min(MAX_LOTS_PER_PURCHASE, affordable, status.remainingLots ?? Infinity));
}

export type PurchaseCheck =
  | { ok: true; totalPrice: number; stack: ItemStack }
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
  const quote = purchaseQuote(entry, lots);
  if (quote.totalPrice > input.currency) {
    return { ok: false, error: 'NOT_ENOUGH_MONEY', totalPrice: quote.totalPrice };
  }
  return { ok: true, ...quote };
}
