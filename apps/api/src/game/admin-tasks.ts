import { asc, desc, eq, sql } from 'drizzle-orm';
import { adminTasks } from '@poke/db';
import type { Db } from '@poke/db';
import type { AdminTaskDto, AdminTaskInput, AdminTaskUpdate } from '@poke/shared';
import { GameError } from './errors';

/**
 * Tâches de suivi de l'admin (page « À faire ») : lecture, ajout, modification, suppression. Les
 * routes sont dans `routes/admin/tasks.ts`, qui les journalise.
 */

type AdminTaskRow = typeof adminTasks.$inferSelect;

function toDto(row: AdminTaskRow): AdminTaskDto {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    details: row.details,
    dueOn: row.dueOn,
    doneAt: row.doneAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Toutes les tâches : en cours d'abord (sans date, puis par date), puis faites, de la plus
 * récemment faite à la plus ancienne.
 */
export async function listAdminTasks(db: Db): Promise<AdminTaskDto[]> {
  const rows = await db
    .select()
    .from(adminTasks)
    .orderBy(
      sql`${adminTasks.doneAt} is not null`,
      desc(adminTasks.doneAt),
      sql`${adminTasks.dueOn} asc nulls first`,
      asc(adminTasks.createdAt),
    );
  return rows.map(toDto);
}

/** Ajoute une tâche, créée par `adminId`. */
export async function createAdminTask(
  db: Db,
  input: Required<AdminTaskInput>,
  adminId: string,
  now: Date,
): Promise<AdminTaskDto> {
  const [row] = await db
    .insert(adminTasks)
    .values({ ...input, createdBy: adminId, createdAt: now, updatedAt: now })
    .returning();
  return toDto(row!);
}

/**
 * Modifie une tâche ; `done` la coche (en gardant la date d'une tâche déjà faite) ou la rouvre.
 * 404 `NOT_FOUND` si elle n'existe plus.
 */
export async function updateAdminTask(
  db: Db,
  id: string,
  { done, ...fields }: AdminTaskUpdate,
  now: Date,
): Promise<{ before: AdminTaskDto; after: AdminTaskDto }> {
  const [current] = await db.select().from(adminTasks).where(eq(adminTasks.id, id));
  if (!current) throw new GameError(404, 'NOT_FOUND');
  const doneAt = done === undefined ? current.doneAt : done ? (current.doneAt ?? now) : null;
  const [row] = await db
    .update(adminTasks)
    .set({ ...fields, doneAt, updatedAt: now })
    .where(eq(adminTasks.id, id))
    .returning();
  if (!row) throw new GameError(404, 'NOT_FOUND');
  return { before: toDto(current), after: toDto(row) };
}

/** Supprime une tâche et la renvoie telle qu'elle était ; 404 `NOT_FOUND` si elle n'existe plus. */
export async function deleteAdminTask(db: Db, id: string): Promise<AdminTaskDto> {
  const [row] = await db.delete(adminTasks).where(eq(adminTasks.id, id)).returning();
  if (!row) throw new GameError(404, 'NOT_FOUND');
  return toDto(row);
}
