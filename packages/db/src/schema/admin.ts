import { index, jsonb, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './auth';

/** Journal de toutes les actions d'administration (qui, quoi, avant / après). */
export const adminAuditLog = pgTable(
  'admin_audit_log',
  {
    id: serial('id').primaryKey(),
    adminId: text('admin_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('admin_audit_log_at').on(t.at)],
);
