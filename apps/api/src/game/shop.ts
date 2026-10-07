import { and, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { playerProfiles, shopPurchases, shopSeen } from '@poke/db';
import type { Db } from '@poke/db';
import { checkPurchase, shopEntryStatus } from '@poke/game-core';
import type { GameContext, ShopPurchaseRecord } from '@poke/game-core';
import type {
  PurchaseInput,
  PurchaseResponse,
  ShopEntryStatusDto,
  ShopResponse,
} from '@poke/shared';
import type { ContentCache } from '../content-cache';
import { GameError } from './errors';
import { requireStartedProfile } from './expeditions';
import { addItems, itemQuantity, playerProgress } from './store';

/**
 * Boutique : état des articles pour un joueur (évalué paresseusement à l'ouverture), achats
 * en une transaction, badge « Nouveau ! ».
 */

const WEEK_MS = 7 * 24 * 3_600_000;

/** Achats comptant pour les limites : tous pour une limite totale, 7 jours sinon. */
async function limitedPurchases(
  db: Db,
  ctx: GameContext,
  userId: string,
  now: Date,
): Promise<ShopPurchaseRecord[]> {
  const limited = ctx.shopEntries.filter((e) => e.purchaseLimit);
  const totalIds = limited.filter((e) => e.purchaseLimit!.period === 'total').map((e) => e.id);
  const periodIds = limited.filter((e) => e.purchaseLimit!.period !== 'total').map((e) => e.id);
  if (limited.length === 0) return [];
  const rows = await db
    .select({
      entryId: shopPurchases.shopEntryId,
      lots: shopPurchases.lots,
      at: shopPurchases.purchasedAt,
    })
    .from(shopPurchases)
    .where(
      and(
        eq(shopPurchases.ownerId, userId),
        or(
          totalIds.length > 0 ? inArray(shopPurchases.shopEntryId, totalIds) : undefined,
          periodIds.length > 0
            ? and(
                inArray(shopPurchases.shopEntryId, periodIds),
                gt(shopPurchases.purchasedAt, new Date(now.getTime() - WEEK_MS)),
              )
            : undefined,
        ),
      ),
    );
  return rows;
}

/**
 * Articles visibles pour le joueur. Les articles débloqués pour la première fois sont
 * enregistrés (date de déblocage) : ils restent « Nouveau ! » jusqu'à ce que le joueur les voie.
 */
export async function shopState(
  db: Db,
  content: ContentCache,
  userId: string,
  now: Date,
): Promise<ShopResponse> {
  const ctx = await content.get();
  const profile = await requireStartedProfile(db, userId);
  const [progress, purchases, seenRows] = await Promise.all([
    playerProgress(db, userId),
    limitedPurchases(db, ctx, userId, now),
    db.select().from(shopSeen).where(eq(shopSeen.ownerId, userId)),
  ]);
  const seen = new Map(seenRows.map((r) => [r.shopEntryId, r]));

  const entries: ShopEntryStatusDto[] = [];
  const newlyUnlocked: string[] = [];
  for (const entry of ctx.shopEntries) {
    const status = shopEntryStatus(ctx, entry, progress, purchases, now);
    if (status.state === 'hidden') continue;
    const unlocked = status.state !== 'locked';
    const row = seen.get(entry.id);
    if (unlocked && !row) newlyUnlocked.push(entry.id);
    entries.push({
      entryId: entry.id,
      state: status.state,
      remainingLots: status.remainingLots,
      nextLotsAt: status.nextLotsAt?.toISOString() ?? null,
      isNew: unlocked && !row?.seenAt,
    });
  }
  if (newlyUnlocked.length > 0) {
    await db
      .insert(shopSeen)
      .values(
        newlyUnlocked.map((shopEntryId) => ({ ownerId: userId, shopEntryId, unlockedAt: now })),
      )
      .onConflictDoNothing();
  }
  return { serverTime: now.toISOString(), currency: profile.currency, entries };
}

/** Le joueur a vu ces articles : fin du badge « Nouveau ! ». */
export async function markShopSeen(db: Db, userId: string, entryIds: string[], now: Date) {
  await db
    .update(shopSeen)
    .set({ seenAt: now })
    .where(
      and(
        eq(shopSeen.ownerId, userId),
        inArray(shopSeen.shopEntryId, entryIds),
        isNull(shopSeen.seenAt),
      ),
    );
}

/**
 * Achat : dans une seule transaction, vérifie la condition d'apparition, la limite d'achat et le
 * solde, débite les Poké Dollars, crédite l'inventaire et enregistre l'achat. Le prix vient
 * toujours du contenu publié.
 */
export async function purchase(
  db: Db,
  content: ContentCache,
  userId: string,
  input: PurchaseInput,
  now: Date,
): Promise<PurchaseResponse> {
  const ctx = await content.get();
  await requireStartedProfile(db, userId);
  const entry = ctx.shopEntry(input.entryId);
  if (!entry) throw new GameError(404, 'SHOP_ENTRY_NOT_FOUND');

  return db.transaction(async (tx) => {
    // Verrou sur le profil : deux achats simultanés ne contournent ni le solde ni les limites.
    const [profile] = await tx
      .select({ currency: playerProfiles.currency })
      .from(playerProfiles)
      .where(eq(playerProfiles.userId, userId))
      .for('update');
    const [progress, purchases] = await Promise.all([
      playerProgress(tx, userId),
      limitedPurchases(tx, ctx, userId, now),
    ]);
    const check = checkPurchase(ctx, {
      entry,
      lots: input.lots,
      progress,
      purchases,
      currency: profile!.currency,
      now,
    });
    if (!check.ok) {
      switch (check.error) {
        case 'NOT_ON_SALE':
          throw new GameError(409, 'NOT_ON_SALE');
        case 'ENTRY_LOCKED':
          throw new GameError(403, 'ENTRY_LOCKED');
        case 'LIMIT_REACHED':
          throw new GameError(409, 'LIMIT_REACHED', {
            remainingLots: check.remainingLots,
            nextLotsAt: check.nextLotsAt?.toISOString() ?? null,
          });
        case 'NOT_ENOUGH_MONEY':
          throw new GameError(409, 'NOT_ENOUGH_MONEY', {
            totalPrice: check.totalPrice,
            currency: profile!.currency,
          });
      }
    }

    const [debited] = await tx
      .update(playerProfiles)
      .set({ currency: sql`${playerProfiles.currency} - ${check.totalPrice}` })
      .where(
        and(
          eq(playerProfiles.userId, userId),
          sql`${playerProfiles.currency} >= ${check.totalPrice}`,
        ),
      )
      .returning({ currency: playerProfiles.currency });
    if (!debited) throw new GameError(409, 'NOT_ENOUGH_MONEY');

    await addItems(tx, userId, [check.stack]);
    await tx.insert(shopPurchases).values({
      ownerId: userId,
      shopEntryId: entry.id,
      itemId: entry.itemId,
      lots: input.lots,
      quantity: check.stack.quantity,
      totalPrice: check.totalPrice,
      contentVersionId: ctx.content.versionId,
      purchasedAt: now,
    });
    // Acheter un article, c'est l'avoir vu.
    await tx
      .insert(shopSeen)
      .values({ ownerId: userId, shopEntryId: entry.id, unlockedAt: now, seenAt: now })
      .onConflictDoUpdate({
        target: [shopSeen.ownerId, shopSeen.shopEntryId],
        set: { seenAt: sql`coalesce(${shopSeen.seenAt}, excluded.seen_at)` },
      });

    return {
      entryId: entry.id,
      itemId: entry.itemId,
      lots: input.lots,
      quantity: check.stack.quantity,
      totalPrice: check.totalPrice,
      currency: debited.currency,
      inventoryQuantity: await itemQuantity(tx, userId, entry.itemId),
    };
  });
}
