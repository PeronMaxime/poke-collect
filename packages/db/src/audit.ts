import { desc, eq, lt } from 'drizzle-orm';
import type { Db } from './client';
import { adminAuditLog, users } from './schema';

export interface AuditEntryInput {
  adminId: string | null;
  action: string;
  entity: string;
  entityId?: string | number | null;
  before?: unknown;
  after?: unknown;
}

export async function logAdminAction(db: Db, entry: AuditEntryInput): Promise<void> {
  await db.insert(adminAuditLog).values({
    adminId: entry.adminId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId == null ? null : String(entry.entityId),
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
}

/** Entrées du journal, de la plus récente à la plus ancienne (pagination par curseur). */
export async function listAuditLog(
  db: Db,
  { limit = 50, cursor }: { limit?: number; cursor?: number } = {},
) {
  const rows = await db
    .select({
      id: adminAuditLog.id,
      adminId: adminAuditLog.adminId,
      adminEmail: users.email,
      action: adminAuditLog.action,
      entity: adminAuditLog.entity,
      entityId: adminAuditLog.entityId,
      before: adminAuditLog.before,
      after: adminAuditLog.after,
      at: adminAuditLog.at,
    })
    .from(adminAuditLog)
    .leftJoin(users, eq(users.id, adminAuditLog.adminId))
    .where(cursor ? lt(adminAuditLog.id, cursor) : undefined)
    .orderBy(desc(adminAuditLog.id))
    .limit(limit + 1);

  const items = rows.slice(0, limit);
  return {
    items,
    nextCursor: rows.length > limit ? (items[items.length - 1]?.id ?? null) : null,
  };
}
