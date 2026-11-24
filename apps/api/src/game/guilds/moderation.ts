import { and, asc, desc, eq, ilike, ne, sql } from 'drizzle-orm';
import { guildMembers, guildMessages, guilds, playerProfiles } from '@poke/db';
import type { Db } from '@poke/db';
import type {
  ModerateGuildInput,
  ModerationGuildDetailResponse,
  ModerationGuildDto,
} from '@poke/shared';
import { GameError } from '../errors';
import { transaction } from '../tx';
import { ROLE_RANK, leaderNameSql, lockGuild, memberCountSql } from './common';

/**
 * Modération des guildes (administration) : liste, fiche avec membres et discussion, correction du
 * nom ou de la description, suppression d'un message.
 */

/** Guildes renvoyées par la liste de la modération. */
const LIST_LIMIT = 50;

/** Messages renvoyés par la fiche d'une guilde (les plus récents). */
const MESSAGES_LIMIT = 200;

// SQL explicite : dans un `select`, Drizzle retire le nom de la table des colonnes citées.
const lastMessageAtSql = sql<string | null>`(
  select max(m.created_at) from guild_messages m where m.guild_id = "guilds"."id"
)`.mapWith((v: string | Date | null) => (v === null ? null : new Date(v).toISOString()));

const guildColumns = {
  id: guilds.id,
  name: guilds.name,
  description: guilds.description,
  joinMode: guilds.joinMode,
  createdAt: guilds.createdAt,
  memberCount: memberCountSql,
  leaderName: leaderNameSql,
  lastMessageAt: lastMessageAtSql,
};

const guildQuery = (db: Db) => db.select(guildColumns).from(guilds);

type GuildRow = Awaited<ReturnType<typeof guildQuery>>[number];

function guildDto(row: GuildRow): ModerationGuildDto {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

/**
 * Guildes dont le nom contient `query` (toutes si vide), les plus récemment actives d'abord, au
 * plus `LIST_LIMIT`.
 */
export async function moderationGuilds(db: Db, query: string): Promise<ModerationGuildDto[]> {
  const pattern = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await guildQuery(db)
    .where(query ? ilike(guilds.name, pattern) : undefined)
    .orderBy(sql`${lastMessageAtSql} desc nulls last`, asc(guilds.name))
    .limit(LIST_LIMIT);
  return rows.map(guildDto);
}

/** Fiche d'une guilde : membres (par rôle) et derniers messages ; refus `GUILD_NOT_FOUND`. */
export async function moderationGuild(
  db: Db,
  guildId: string,
): Promise<ModerationGuildDetailResponse> {
  const [row] = await guildQuery(db).where(eq(guilds.id, guildId));
  if (!row) throw new GameError(404, 'GUILD_NOT_FOUND');
  const [members, messages] = await Promise.all([
    db
      .select({
        userId: guildMembers.userId,
        trainerName: playerProfiles.trainerName,
        role: guildMembers.role,
      })
      .from(guildMembers)
      .innerJoin(playerProfiles, eq(playerProfiles.userId, guildMembers.userId))
      .where(eq(guildMembers.guildId, guildId))
      .orderBy(asc(playerProfiles.trainerName)),
    db
      .select({
        id: guildMessages.id,
        userId: guildMessages.userId,
        trainerName: playerProfiles.trainerName,
        body: guildMessages.body,
        createdAt: guildMessages.createdAt,
      })
      .from(guildMessages)
      .leftJoin(playerProfiles, eq(playerProfiles.userId, guildMessages.userId))
      .where(eq(guildMessages.guildId, guildId))
      .orderBy(desc(guildMessages.createdAt), desc(guildMessages.id))
      .limit(MESSAGES_LIMIT),
  ]);
  return {
    guild: guildDto(row),
    members: members.sort((a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role]),
    messages: messages.map((m) => ({
      ...m,
      trainerName: m.userId ? (m.trainerName ?? '?') : null,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

/**
 * Corrige le nom ou la description d'une guilde, sous le verrou de la guilde. Refus
 * `GUILD_NOT_FOUND`, `GUILD_NAME_TAKEN`. Renvoie les valeurs d'avant et d'après (journal).
 */
export async function moderateGuild(db: Db, guildId: string, input: ModerateGuildInput) {
  return transaction(db, async (tx) => {
    const guild = await lockGuild(tx, guildId);
    if (input.name !== undefined) {
      const [taken] = await tx
        .select({ id: guilds.id })
        .from(guilds)
        .where(and(sql`lower(${guilds.name}) = lower(${input.name})`, ne(guilds.id, guildId)));
      if (taken) throw new GameError(409, 'GUILD_NAME_TAKEN');
    }
    const after = {
      name: input.name ?? guild.name,
      description: input.description ?? guild.description,
    };
    await tx.update(guilds).set(after).where(eq(guilds.id, guildId));
    return { before: { name: guild.name, description: guild.description }, after };
  });
}

/**
 * Supprime un message de la discussion d'une guilde ; refus `MESSAGE_NOT_FOUND`. Renvoie le
 * message supprimé (journal).
 */
export async function deleteModeratedMessage(db: Db, guildId: string, messageId: string) {
  const [deleted] = await db
    .delete(guildMessages)
    .where(and(eq(guildMessages.id, messageId), eq(guildMessages.guildId, guildId)))
    .returning({
      userId: guildMessages.userId,
      body: guildMessages.body,
      createdAt: guildMessages.createdAt,
    });
  if (!deleted) throw new GameError(404, 'MESSAGE_NOT_FOUND');
  return { ...deleted, createdAt: deleted.createdAt.toISOString() };
}
