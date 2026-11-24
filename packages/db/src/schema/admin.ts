import {
  date,
  index,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
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

/** Sorte de tâche de suivi : une chose à faire, ou à surveiller (vérifier de temps en temps). */
export const adminTaskKind = pgEnum('admin_task_kind', ['todo', 'watch']);

/**
 * Tâches de suivi de l'exploitant (page « À faire » de l'admin) : ce qu'il reste à faire ou à
 * surveiller, au même endroit. Partagées entre administrateurs.
 */
export const adminTasks = pgTable(
  'admin_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: adminTaskKind('kind').notNull().default('todo'),
    title: text('title').notNull(),
    details: text('details').notNull().default(''),
    /** Jour à partir duquel s'en occuper (AAAA-MM-JJ) ; null = dès que possible. */
    dueOn: date('due_on', { mode: 'string' }),
    /** Faite ou close ; null = en cours. */
    doneAt: timestamp('done_at', { withTimezone: true }),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('admin_tasks_open').on(t.doneAt, t.dueOn)],
);
