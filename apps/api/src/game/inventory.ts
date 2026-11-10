/**
 * Le Sac d'un joueur : les objets qu'il possède et leur quantité.
 */
import { and, asc, eq, gt } from 'drizzle-orm';
import { inventory } from '@poke/db';
import type { Db } from '@poke/db';
import type { InventoryEntryDto } from '@poke/shared';

/** Objets que le joueur possède (quantité non nulle), par identifiant. */
export function listInventory(db: Db, ownerId: string): Promise<InventoryEntryDto[]> {
  return db
    .select({ itemId: inventory.itemId, quantity: inventory.quantity })
    .from(inventory)
    .where(and(eq(inventory.ownerId, ownerId), gt(inventory.quantity, 0)))
    .orderBy(asc(inventory.itemId));
}
