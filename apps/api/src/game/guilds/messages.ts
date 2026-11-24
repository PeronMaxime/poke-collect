import { and, desc, eq, gt, lt } from 'drizzle-orm';
import { guildMessages, playerProfiles } from '@poke/db';
import type { Db } from '@poke/db';
import { guildMessagesPurgeBefore, guildMessageWaitSeconds } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { GuildMessagesResponse } from '@poke/shared';
import { GameError } from '../errors';
import { playerTransaction } from '../tx';
import { requireMembership } from './common';

/**
 * Discussion de la guilde : lecture, écriture (avec sa limite de débit par joueur), suppression,
 * et purge des messages trop anciens (tâche de fond).
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

/**
 * Écrit un message dans la discussion de sa guilde ; refus `NOT_IN_GUILD`, ou 429
 * `GUILD_MESSAGE_RATE_LIMITED` (avec `retryAfter`, en secondes) au-delà de la limite de débit de
 * `balance.guilds.chat`. Les messages comptés sont ceux du joueur, toutes guildes confondues.
 */
export async function postGuildMessage(
  db: Db,
  ctx: GameContext,
  userId: string,
  body: string,
  now: Date,
) {
  const chat = ctx.balance.guilds.chat;
  const lookbackMs = Math.max(chat.windowMinutes * 60_000, chat.minIntervalSeconds * 1000);
  await playerTransaction(db, userId, async (tx) => {
    const member = await requireMembership(tx, userId);
    const recent = await tx
      .select({ createdAt: guildMessages.createdAt })
      .from(guildMessages)
      .where(
        and(
          eq(guildMessages.userId, userId),
          gt(guildMessages.createdAt, new Date(now.getTime() - lookbackMs)),
        ),
      )
      .orderBy(desc(guildMessages.createdAt))
      .limit(chat.maxPerWindow);
    const wait = guildMessageWaitSeconds(
      chat,
      recent.map((m) => m.createdAt),
      now,
    );
    if (wait > 0) throw new GameError(429, 'GUILD_MESSAGE_RATE_LIMITED', { retryAfter: wait });
    await tx
      .insert(guildMessages)
      .values({ guildId: member.guildId, userId, body, createdAt: now });
  });
}

/** Suppression d'un message : son auteur, ou le chef et les officiers. */
export async function deleteGuildMessage(db: Db, userId: string, messageId: string) {
  await playerTransaction(db, userId, async (tx) => {
    const member = await requireMembership(tx, userId);
    const moderator = member.role !== 'member';
    const deleted = await tx
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
  });
}

/**
 * Supprime les messages de toutes les guildes plus anciens que `balance.guilds.chat.retentionDays`
 * (tâche de fond `guild-messages-purge`) ; renvoie le nombre de messages supprimés.
 */
export async function purgeOldGuildMessages(db: Db, ctx: GameContext, now: Date): Promise<number> {
  const before = guildMessagesPurgeBefore(ctx.balance.guilds.chat, now);
  const deleted = await db
    .delete(guildMessages)
    .where(lt(guildMessages.createdAt, before))
    .returning({ id: guildMessages.id });
  return deleted.length;
}
