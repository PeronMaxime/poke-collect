import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { playerProfiles, sessions, users } from '@poke/db';
import type { Db } from '@poke/db';
import type { AccountSuspensionDto, SuspendAccountInput } from '@poke/shared';
import { GameError } from './errors';
import { playerTransaction } from './tx';

/**
 * Modération des comptes : suspension (et son contrôle à chaque requête du jeu, par un cache court
 * de l'état des comptes) et renommage d'un dresseur. Les routes sont dans
 * `routes/admin/moderation.ts`, la modération des guildes dans `guilds/moderation.ts`.
 */

/** Date de fin d'une suspension définitive. */
const SUSPENDED_FOREVER = new Date('9999-12-31T00:00:00.000Z');

/** Durée pendant laquelle l'état d'un compte lu en base est réutilisé (voir `AccountStatusCache`). */
const STATUS_TTL_MS = 30_000;

/** Au-delà, les entrées échues du cache sont retirées. */
const STATUS_CACHE_SWEEP = 10_000;

interface SuspensionColumns {
  suspendedUntil: Date | null;
  suspensionReason: string | null;
}

/** Suspension en cours d'un compte, ou null (jamais suspendu, levée ou échue à `now`). */
export function suspensionOf(row: SuspensionColumns, now: Date): AccountSuspensionDto | null {
  if (!row.suspendedUntil || row.suspendedUntil <= now) return null;
  return {
    until: row.suspendedUntil.toISOString(),
    permanent: row.suspendedUntil.getTime() >= SUSPENDED_FOREVER.getTime(),
    reason: row.suspensionReason ?? '',
  };
}

/** État d'un compte pour le contrôle des requêtes : absent (supprimé) ou ses colonnes de suspension. */
type AccountStatus = SuspensionColumns | null;

/**
 * État des comptes (existe-t-il, est-il suspendu ?), lu en base et gardé `STATUS_TTL_MS` en
 * mémoire : c'est ce qui coupe l'accès d'un compte suspendu ou supprimé, même tant que son cookie
 * de session (gardé 5 min par Better Auth) reste valable. Dans ce processus, une suspension ou une
 * suppression invalide l'entrée tout de suite ; un autre processus la voit au plus 30 s après.
 */
export class AccountStatusCache {
  private readonly entries = new Map<string, { status: AccountStatus; expiresAt: number }>();

  constructor(
    private readonly db: Db,
    private readonly now: () => Date,
  ) {}

  /** État des comptes `userIds` (le compte et son profil secondaire actif), dans le même ordre. */
  async statuses(userIds: readonly string[]): Promise<AccountStatus[]> {
    const at = this.now().getTime();
    const missing = userIds.filter((id) => !((this.entries.get(id)?.expiresAt ?? 0) > at));
    if (missing.length > 0) {
      const rows = await this.db
        .select({
          id: users.id,
          suspendedUntil: users.suspendedUntil,
          suspensionReason: users.suspensionReason,
        })
        .from(users)
        .where(inArray(users.id, missing));
      if (this.entries.size > STATUS_CACHE_SWEEP) {
        for (const [id, entry] of this.entries) if (entry.expiresAt <= at) this.entries.delete(id);
      }
      for (const id of missing) {
        const row = rows.find((r) => r.id === id);
        const status = row
          ? { suspendedUntil: row.suspendedUntil, suspensionReason: row.suspensionReason }
          : null;
        this.entries.set(id, { status, expiresAt: at + STATUS_TTL_MS });
      }
    }
    return userIds.map((id) => this.entries.get(id)?.status ?? null);
  }

  /** Oublie l'état d'un compte : la prochaine requête le relit en base. */
  invalidate(userId: string): void {
    this.entries.delete(userId);
  }
}

/** Colonnes de suspension et rôle d'un compte ; refus 404 `NOT_FOUND` s'il n'existe pas. */
async function accountRow(db: Db, userId: string) {
  const [row] = await db
    .select({
      role: users.role,
      suspendedUntil: users.suspendedUntil,
      suspensionReason: users.suspensionReason,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!row) throw new GameError(404, 'NOT_FOUND');
  return row;
}

/**
 * Suspend un compte (`hours` null : définitivement) et ferme ses sessions : il est déconnecté, et
 * le jeu lui répond ensuite `ACCOUNT_SUSPENDED` jusqu'à la fin. Une suspension en cours est
 * remplacée. Refus `NOT_FOUND`, `CANNOT_SUSPEND_ADMIN`. Renvoie la suspension d'avant et la
 * nouvelle (journal de l'administration).
 */
export async function suspendAccount(
  db: Db,
  userId: string,
  input: SuspendAccountInput,
  now: Date,
): Promise<{ before: AccountSuspensionDto | null; after: AccountSuspensionDto }> {
  const row = await accountRow(db, userId);
  if (row.role === 'admin') throw new GameError(409, 'CANNOT_SUSPEND_ADMIN');
  const until =
    input.hours === null ? SUSPENDED_FOREVER : new Date(now.getTime() + input.hours * 3_600_000);
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ suspendedUntil: until, suspensionReason: input.reason })
      .where(eq(users.id, userId));
    // Un profil secondaire n'a pas de session à lui : celles du compte restent ouvertes.
    await tx.delete(sessions).where(eq(sessions.userId, userId));
  });
  const after = suspensionOf({ suspendedUntil: until, suspensionReason: input.reason }, now)!;
  return { before: suspensionOf(row, now), after };
}

/**
 * Lève la suspension d'un compte (sans effet s'il n'en a pas). Refus `NOT_FOUND`. Renvoie la
 * suspension levée.
 */
export async function liftSuspension(
  db: Db,
  userId: string,
  now: Date,
): Promise<AccountSuspensionDto | null> {
  const row = await accountRow(db, userId);
  await db
    .update(users)
    .set({ suspendedUntil: null, suspensionReason: null })
    .where(eq(users.id, userId));
  return suspensionOf(row, now);
}

/**
 * Renomme le dresseur d'un joueur (nom injurieux, usurpation). Mêmes règles que le choix du joueur
 * (`trainerNameSchema`, validé par la route). Refus `PROFILE_NOT_FOUND`, `TRAINER_NAME_TAKEN`.
 * Renvoie l'ancien nom.
 */
export async function renameTrainer(db: Db, userId: string, trainerName: string): Promise<string> {
  return playerTransaction(db, userId, async (tx) => {
    const [profile] = await tx
      .select({ trainerName: playerProfiles.trainerName })
      .from(playerProfiles)
      .where(eq(playerProfiles.userId, userId));
    if (!profile) throw new GameError(404, 'PROFILE_NOT_FOUND');
    const [taken] = await tx
      .select({ userId: playerProfiles.userId })
      .from(playerProfiles)
      .where(
        and(
          eq(sql`lower(${playerProfiles.trainerName})`, trainerName.toLowerCase()),
          ne(playerProfiles.userId, userId),
        ),
      );
    if (taken) throw new GameError(409, 'TRAINER_NAME_TAKEN');
    await tx.update(playerProfiles).set({ trainerName }).where(eq(playerProfiles.userId, userId));
    return profile.trainerName;
  });
}
