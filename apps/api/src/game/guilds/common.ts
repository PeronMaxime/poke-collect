import { eq, sql } from 'drizzle-orm';
import { guildMembers, guildMessages, guilds, playerProfiles } from '@poke/db';
import type { Db } from '@poke/db';
import type { GameContext, GuildRole } from '@poke/game-core';
import { GameError } from '../errors';

/**
 * Ce que les modules des guildes partagent : appartenance d'un joueur, verrous, messages du
 * système. Interne au dossier.
 *
 * Verrous : dans la transaction du joueur qui agit, une action qui change la composition d'une
 * guilde verrouille la ligne du profil concerné (`lockProfile`), puis celle de la guilde
 * (`lockGuild`) : deux arrivées simultanées ne dépassent pas le nombre maximal de membres.
 */

/**
 * Guildes : création, adhésion (libre ou sur demande), rôles, discussion, quêtes du jour et de la
 * semaine (tirées au premier besoin, avancées par les actions des membres) et coffres.
 */

export type GuildMemberRow = typeof guildMembers.$inferSelect;

export const ROLE_RANK: Record<GuildRole, number> = { leader: 0, officer: 1, member: 2 };

export async function membership(db: Db, userId: string): Promise<GuildMemberRow | undefined> {
  const [row] = await db.select().from(guildMembers).where(eq(guildMembers.userId, userId));
  return row;
}

export async function requireMembership(db: Db, userId: string, roles?: GuildRole[]) {
  const member = await membership(db, userId);
  if (!member) throw new GameError(404, 'NOT_IN_GUILD');
  if (roles && !roles.includes(member.role)) throw new GameError(403, 'GUILD_FORBIDDEN');
  return member;
}

/** Fin du délai après un départ volontaire ; null = le joueur peut rejoindre une guilde. */
export function cooldownUntil(ctx: GameContext, leftAt: Date | null, now: Date): Date | null {
  if (!leftAt) return null;
  const until = new Date(leftAt.getTime() + ctx.balance.guilds.rejoinCooldownHours * 3_600_000);
  return until > now ? until : null;
}

export function assertNoCooldown(ctx: GameContext, leftAt: Date | null, now: Date) {
  const until = cooldownUntil(ctx, leftAt, now);
  if (until) throw new GameError(409, 'GUILD_COOLDOWN', { until: until.toISOString() });
}

export async function memberCount(db: Db, guildId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(guildMembers)
    .where(eq(guildMembers.guildId, guildId));
  return row?.n ?? 0;
}

/** Message du jeu dans la discussion (arrivée, départ, quête terminée…). */
export async function systemMessage(db: Db, guildId: string, body: string, now: Date) {
  await db.insert(guildMessages).values({ guildId, userId: null, body, createdAt: now });
}

export async function trainerName(db: Db, userId: string): Promise<string> {
  const [row] = await db
    .select({ name: playerProfiles.trainerName })
    .from(playerProfiles)
    .where(eq(playerProfiles.userId, userId));
  return row?.name ?? '?';
}

/** Joueur désigné par son nom de dresseur (actions sur les membres et les candidatures). */
export async function userByName(db: Db, name: string): Promise<string> {
  const [row] = await db
    .select({ userId: playerProfiles.userId })
    .from(playerProfiles)
    .where(sql`lower(${playerProfiles.trainerName}) = lower(${name})`);
  if (!row) throw new GameError(404, 'TRAINER_NOT_FOUND');
  return row.userId;
}

/** Profil verrouillé pour la transaction (adhésions et créations simultanées). */
export async function lockProfile(db: Db, userId: string) {
  const [profile] = await db
    .select({ currency: playerProfiles.currency, guildLeftAt: playerProfiles.guildLeftAt })
    .from(playerProfiles)
    .where(eq(playerProfiles.userId, userId))
    .for('update');
  if (!profile) throw new GameError(409, 'NO_PROFILE');
  return profile;
}

/** Guilde verrouillée : les arrivées simultanées ne dépassent pas le nombre maximal de membres. */
export async function lockGuild(db: Db, guildId: string) {
  const [guild] = await db.select().from(guilds).where(eq(guilds.id, guildId)).for('update');
  if (!guild) throw new GameError(404, 'GUILD_NOT_FOUND');
  return guild;
}
