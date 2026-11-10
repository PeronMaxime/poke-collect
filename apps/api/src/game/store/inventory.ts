import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm';
import { inventory } from '@poke/db';
import type { Db } from '@poke/db';
import type { ItemStack } from '@poke/content';
import { charmMultiplier, playerBonuses } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { InventoryEntryDto } from '@poke/shared';
import { claimedRewards } from './progress';

/**
 * Le Sac d'un joueur : objets possédés, ajout et retrait.
 *
 * `takeItems` retire en une requête conditionnelle (`quantity >= n`) : deux retraits simultanés ne
 * peuvent pas faire passer une quantité sous zéro.
 */

export async function addItems(db: Db, ownerId: string, stacks: readonly ItemStack[]) {
  const merged = new Map<string, number>();
  for (const s of stacks) {
    if (s.quantity > 0) merged.set(s.itemId, (merged.get(s.itemId) ?? 0) + s.quantity);
  }
  if (merged.size === 0) return;
  await db
    .insert(inventory)
    .values([...merged].map(([itemId, quantity]) => ({ ownerId, itemId, quantity })))
    .onConflictDoUpdate({
      target: [inventory.ownerId, inventory.itemId],
      set: { quantity: sql`${inventory.quantity} + excluded.quantity` },
    });
}

/** Retire `quantity` objets ; retourne faux (sans rien retirer) si le stock est insuffisant. */
export async function takeItems(db: Db, ownerId: string, itemId: string, quantity: number) {
  if (quantity <= 0) return true;
  const updated = await db
    .update(inventory)
    .set({ quantity: sql`${inventory.quantity} - ${quantity}` })
    .where(
      and(
        eq(inventory.ownerId, ownerId),
        eq(inventory.itemId, itemId),
        sql`${inventory.quantity} >= ${quantity}`,
      ),
    )
    .returning({ itemId: inventory.itemId });
  return updated.length > 0;
}

/** Multiplicateur du Charme Chroma : meilleur objet `shinyCharm` présent dans le sac. */
export async function shinyCharm(db: Db, ctx: GameContext, ownerId: string): Promise<number> {
  const rows = await db
    .select({ itemId: inventory.itemId })
    .from(inventory)
    .where(and(eq(inventory.ownerId, ownerId), gt(inventory.quantity, 0)));
  return charmMultiplier(
    ctx,
    rows.map((r) => r.itemId),
  );
}

/**
 * Multiplicateur shiny des œufs et des fossiles : Charme Chroma possédé × bonus permanent de
 * chance shiny (récompenses réclamées).
 */
export async function shinyBoost(db: Db, ctx: GameContext, ownerId: string): Promise<number> {
  const [charm, claimed] = await Promise.all([
    shinyCharm(db, ctx, ownerId),
    claimedRewards(db, ownerId),
  ]);
  return charm * playerBonuses(ctx, claimed).shiny;
}

export async function itemQuantity(db: Db, ownerId: string, itemId: string): Promise<number> {
  const [row] = await db
    .select({ quantity: inventory.quantity })
    .from(inventory)
    .where(and(eq(inventory.ownerId, ownerId), eq(inventory.itemId, itemId)));
  return row?.quantity ?? 0;
}

/** Quantités possédées de plusieurs objets en une requête (0 pour ceux qu'on n'a pas). */
export async function itemQuantities(
  db: Db,
  ownerId: string,
  itemIds: readonly string[],
): Promise<Map<string, number>> {
  const quantities = new Map(itemIds.map((id) => [id, 0]));
  if (itemIds.length === 0) return quantities;
  const rows = await db
    .select({ itemId: inventory.itemId, quantity: inventory.quantity })
    .from(inventory)
    .where(and(eq(inventory.ownerId, ownerId), inArray(inventory.itemId, [...itemIds])));
  for (const row of rows) quantities.set(row.itemId, row.quantity);
  return quantities;
}

/** Objets que le joueur possède (quantité non nulle), par identifiant. */
export function listInventory(db: Db, ownerId: string): Promise<InventoryEntryDto[]> {
  return db
    .select({ itemId: inventory.itemId, quantity: inventory.quantity })
    .from(inventory)
    .where(and(eq(inventory.ownerId, ownerId), gt(inventory.quantity, 0)))
    .orderBy(asc(inventory.itemId));
}
