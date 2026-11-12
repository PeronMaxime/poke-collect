import {
  bigint,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { contentVersions } from './content';
import { ownerId } from './game-columns';

/**
 * Boutique : achats, reventes, articles vus.
 */

/** Achats en boutique : historique et limites d'achat (totales ou par période). */
export const shopPurchases = pgTable(
  'shop_purchases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: ownerId(),
    shopEntryId: text('shop_entry_id').notNull(),
    itemId: text('item_id').notNull(),
    lots: integer('lots').notNull(),
    quantity: integer('quantity').notNull(),
    totalPrice: bigint('total_price', { mode: 'number' }).notNull(),
    contentVersionId: integer('content_version_id')
      .notNull()
      .references(() => contentVersions.id),
    purchasedAt: timestamp('purchased_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('shop_purchases_owner_entry').on(t.ownerId, t.shopEntryId, t.purchasedAt)],
);

/** Ventes d'objets à la boutique : historique (le prix vient du contenu publié). */
export const shopSales = pgTable(
  'shop_sales',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: ownerId(),
    itemId: text('item_id').notNull(),
    quantity: integer('quantity').notNull(),
    totalPrice: bigint('total_price', { mode: 'number' }).notNull(),
    contentVersionId: integer('content_version_id')
      .notNull()
      .references(() => contentVersions.id),
    soldAt: timestamp('sold_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('shop_sales_owner').on(t.ownerId, t.soldAt)],
);

/** Badge « Nouveau ! » : article débloqué (date), puis vu par le joueur. */
export const shopSeen = pgTable(
  'shop_seen',
  {
    ownerId: ownerId(),
    shopEntryId: text('shop_entry_id').notNull(),
    unlockedAt: timestamp('unlocked_at', { withTimezone: true }).notNull().defaultNow(),
    seenAt: timestamp('seen_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.ownerId, t.shopEntryId] })],
);
