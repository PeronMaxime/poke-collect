import { index, pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { ownerId } from './game-columns';

/**
 * Abonnements aux notifications push.
 */

/**
 * Abonnements Web Push (un par navigateur ou appareil). Supprimés quand le service push répond
 * que l'abonnement a expiré.
 */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: serial('id').primaryKey(),
    ownerId: ownerId(),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSentAt: timestamp('last_sent_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('push_subscriptions_endpoint').on(t.endpoint),
    index('push_subscriptions_owner').on(t.ownerId),
  ],
);
