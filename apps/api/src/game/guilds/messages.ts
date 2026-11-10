import { and, desc, eq } from 'drizzle-orm';
import { guildMessages, playerProfiles } from '@poke/db';
import type { Db } from '@poke/db';
import type { GuildMessagesResponse } from '@poke/shared';
import { GameError } from '../errors';
import { requireMembership } from './common';

/**
 * Discussion de la guilde.
 */

/** Messages renvoyés à la discussion (les plus récents). */
const MESSAGES_LIMIT = 100;

/**
 * Les derniers messages de la guilde du joueur, du plus ancien au plus récent ; refus
 * `NOT_IN_GUILD`.
 */
export async function guildMessagesOf(db: Db, userId: string): Promise<GuildMessagesResponse> {
  const member = await requireMembership(db, userId);
  const rows = await db
    .select({
      id: guildMessages.id,
      userId: guildMessages.userId,
      body: guildMessages.body,
      createdAt: guildMessages.createdAt,
      trainerName: playerProfiles.trainerName,
    })
    .from(guildMessages)
    .leftJoin(playerProfiles, eq(playerProfiles.userId, guildMessages.userId))
    .where(eq(guildMessages.guildId, member.guildId))
    .orderBy(desc(guildMessages.createdAt), desc(guildMessages.id))
    .limit(MESSAGES_LIMIT);
  return {
    messages: rows.reverse().map((m) => ({
      id: m.id,
      trainerName: m.userId ? (m.trainerName ?? '?') : null,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      mine: m.userId === userId,
    })),
  };
}

/** Écrit un message dans la discussion de sa guilde ; refus `NOT_IN_GUILD`. */
export async function postGuildMessage(db: Db, userId: string, body: string, now: Date) {
  const member = await requireMembership(db, userId);
  await db.insert(guildMessages).values({ guildId: member.guildId, userId, body, createdAt: now });
}

/** Suppression d'un message : son auteur, ou le chef et les officiers. */
export async function deleteGuildMessage(db: Db, userId: string, messageId: string) {
  const member = await requireMembership(db, userId);
  const moderator = member.role !== 'member';
  const deleted = await db
    .delete(guildMessages)
    .where(
      and(
        eq(guildMessages.id, messageId),
        eq(guildMessages.guildId, member.guildId),
        moderator ? undefined : eq(guildMessages.userId, userId),
      ),
    )
    .returning({ id: guildMessages.id });
  if (deleted.length === 0) throw new GameError(404, 'MESSAGE_NOT_FOUND');
}
