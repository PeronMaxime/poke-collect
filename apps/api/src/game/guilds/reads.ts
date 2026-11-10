import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, sql } from 'drizzle-orm';
import {
  guildJoinRequests,
  guildMembers,
  guildQuestContributions,
  guildWeeklyQuests,
  guilds,
  playerProfiles,
  users,
} from '@poke/db';
import type { Db } from '@poke/db';
import { guildDay, guildWeek } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import { ONLINE_WINDOW_MS } from '@poke/shared';
import type {
  GuildDto,
  GuildLeaderboardEntryDto,
  GuildLeaderboardResponse,
  GuildProfileResponse,
  GuildSearchResponse,
  GuildStateResponse,
  GuildSummaryDto,
} from '@poke/shared';
import type { ContentCache } from '../../content-cache';
import { GameError } from '../errors';
import { requireStartedProfile } from '../expeditions';
import { displayedFavorite, favoriteColumns } from '../favorite';
import { ROLE_RANK, cooldownUntil, membership } from './common';
import type { GuildMemberRow } from './common';
import { currentQuests, settleGuildQuests } from './quests';

/**
 * Ce que l'onglet Guilde affiche : recherche, état de sa guilde, fiche d'une autre, classement.
 */

const SEARCH_LIMIT = 20;

/** Guildes affichées en tête du classement. */
const LEADERBOARD_SIZE = 50;

// SQL explicite : dans un `select`, Drizzle retire le nom de la table des colonnes citées.
const memberCountSql = sql<number>`(select count(*)::int from guild_members gm where gm.guild_id = "guilds"."id")`;

const leaderNameSql = sql<string | null>`(
  select p.trainer_name from guild_members gm join player_profiles p on p.user_id = gm.user_id
  where gm.guild_id = "guilds"."id" and gm.role = 'leader' limit 1
)`;

async function guildSummaries(
  db: Db,
  ctx: GameContext,
  userId: string,
  where: ReturnType<typeof and>,
  limit: number,
): Promise<GuildSummaryDto[]> {
  const [rows, requests] = await Promise.all([
    db
      .select({
        id: guilds.id,
        name: guilds.name,
        description: guilds.description,
        joinMode: guilds.joinMode,
        memberCount: memberCountSql,
        leaderName: leaderNameSql,
      })
      .from(guilds)
      .where(where)
      .orderBy(desc(memberCountSql), asc(guilds.name))
      .limit(limit),
    db
      .select({ guildId: guildJoinRequests.guildId })
      .from(guildJoinRequests)
      .where(eq(guildJoinRequests.userId, userId)),
  ]);
  const requested = new Set(requests.map((r) => r.guildId));
  return rows.map((r) => ({
    ...r,
    maxMembers: ctx.balance.guilds.maxMembers,
    requested: requested.has(r.id),
  }));
}

/** Recherche par nom (vide : les guildes les plus peuplées). */
export async function searchGuilds(
  db: Db,
  content: ContentCache,
  userId: string,
  query: string,
): Promise<GuildSearchResponse> {
  const ctx = await content.get();
  const q = query.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
  return {
    guilds: await guildSummaries(
      db,
      ctx,
      userId,
      q ? and(ilike(guilds.name, `%${q}%`)) : undefined,
      SEARCH_LIMIT,
    ),
  };
}

export async function guildState(
  db: Db,
  content: ContentCache,
  userId: string,
  now: Date,
): Promise<GuildStateResponse> {
  const ctx = await content.get();
  const profile = await requireStartedProfile(db, userId);
  const base = {
    serverTime: now.toISOString(),
    currency: profile.currency,
    cooldownUntil: cooldownUntil(ctx, profile.guildLeftAt, now)?.toISOString() ?? null,
  };
  const member = await membership(db, userId);
  if (!member) {
    const requested = await db
      .select({ guildId: guildJoinRequests.guildId })
      .from(guildJoinRequests)
      .where(eq(guildJoinRequests.userId, userId));
    const myRequests = requested.length
      ? await guildSummaries(
          db,
          ctx,
          userId,
          and(
            inArray(
              guilds.id,
              requested.map((r) => r.guildId),
            ),
          ),
          SEARCH_LIMIT,
        )
      : [];
    return { ...base, guild: null, myRequests };
  }
  await settleGuildQuests(db, ctx, now, member.guildId);
  return { ...base, guild: await guildDto(db, ctx, member, now), myRequests: [] };
}

/** Fiche publique d'une guilde : présentation, membres et quêtes terminées. */
export async function guildProfile(
  db: Db,
  content: ContentCache,
  userId: string,
  guildId: string,
): Promise<GuildProfileResponse> {
  const ctx = await content.get();
  const [[summary], [guild], members, [done], member] = await Promise.all([
    guildSummaries(db, ctx, userId, and(eq(guilds.id, guildId)), 1),
    db.select({ createdAt: guilds.createdAt }).from(guilds).where(eq(guilds.id, guildId)),
    db
      .select({
        trainerName: playerProfiles.trainerName,
        role: guildMembers.role,
        ...favoriteColumns,
        joinedAt: guildMembers.joinedAt,
      })
      .from(guildMembers)
      .innerJoin(playerProfiles, eq(playerProfiles.userId, guildMembers.userId))
      .where(eq(guildMembers.guildId, guildId)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(guildWeeklyQuests)
      .where(and(eq(guildWeeklyQuests.guildId, guildId), isNotNull(guildWeeklyQuests.completedAt))),
    membership(db, userId),
  ]);
  if (!summary || !guild) throw new GameError(404, 'GUILD_NOT_FOUND');
  members.sort(
    (a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role] || a.joinedAt.getTime() - b.joinedAt.getTime(),
  );
  return {
    ...summary,
    createdAt: guild.createdAt.toISOString(),
    questsCompleted: done?.n ?? 0,
    members: members.map((m) => ({
      trainerName: m.trainerName,
      role: m.role,
      favorite: displayedFavorite(m),
    })),
    isMine: member?.guildId === guildId,
  };
}

/** Classement des guildes par quêtes de guilde terminées depuis leur création. */
export async function guildLeaderboard(db: Db, userId: string): Promise<GuildLeaderboardResponse> {
  const done = sql<number>`(select count(*)::int from guild_weekly_quests w
    where w.guild_id = "guilds"."id" and w.completed_at is not null)`;
  const [rows, member] = await Promise.all([
    db
      .select({
        id: guilds.id,
        name: guilds.name,
        memberCount: memberCountSql,
        questsCompleted: done,
        rank: sql<number>`rank() over (order by ${done} desc)`.mapWith(Number),
      })
      .from(guilds)
      .orderBy(desc(done), asc(sql`lower(${guilds.name})`)),
    membership(db, userId),
  ]);
  const toEntry = (row: (typeof rows)[number]): GuildLeaderboardEntryDto => ({
    ...row,
    isMine: row.id === member?.guildId,
  });
  const mine = rows.find((r) => r.id === member?.guildId);
  return {
    entries: rows.slice(0, LEADERBOARD_SIZE).map(toEntry),
    me: mine ? toEntry(mine) : null,
    total: rows.length,
  };
}

async function guildDto(
  db: Db,
  ctx: GameContext,
  member: GuildMemberRow,
  now: Date,
): Promise<GuildDto> {
  const { guildId } = member;
  const week = guildWeek(now);
  const day = guildDay(now);
  const [[guild], members, quests, contributions, requests] = await Promise.all([
    db.select().from(guilds).where(eq(guilds.id, guildId)),
    db
      .select({
        userId: guildMembers.userId,
        role: guildMembers.role,
        joinedAt: guildMembers.joinedAt,
        trainerName: playerProfiles.trainerName,
        lastSeenAt: users.lastSeenAt,
      })
      .from(guildMembers)
      .innerJoin(playerProfiles, eq(playerProfiles.userId, guildMembers.userId))
      .innerJoin(users, eq(users.id, guildMembers.userId))
      .where(eq(guildMembers.guildId, guildId)),
    currentQuests(db, ctx, guildId, now),
    // Quêtes de la semaine et quêtes du jour depuis lundi (périodes identifiées par leur date).
    db
      .select()
      .from(guildQuestContributions)
      .where(
        and(
          eq(guildQuestContributions.guildId, guildId),
          gte(guildQuestContributions.week, week.id),
        ),
      ),
    member.role === 'member'
      ? Promise.resolve([])
      : db
          .select({
            trainerName: playerProfiles.trainerName,
            createdAt: guildJoinRequests.createdAt,
          })
          .from(guildJoinRequests)
          .innerJoin(playerProfiles, eq(playerProfiles.userId, guildJoinRequests.userId))
          .where(eq(guildJoinRequests.guildId, guildId))
          .orderBy(guildJoinRequests.createdAt),
  ]);
  if (!guild) throw new GameError(404, 'NOT_IN_GUILD');
  members.sort(
    (a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role] || a.joinedAt.getTime() - b.joinedAt.getTime(),
  );
  return {
    id: guild.id,
    name: guild.name,
    description: guild.description,
    joinMode: guild.joinMode,
    createdAt: guild.createdAt.toISOString(),
    maxMembers: ctx.balance.guilds.maxMembers,
    myRole: member.role,
    members: members.map((m) => ({
      trainerName: m.trainerName,
      role: m.role,
      joinedAt: m.joinedAt.toISOString(),
      isMe: m.userId === member.userId,
      online:
        m.userId === member.userId ||
        (!!m.lastSeenAt && now.getTime() - m.lastSeenAt.getTime() < ONLINE_WINDOW_MS),
    })),
    requests: requests.map((r) => ({
      trainerName: r.trainerName,
      createdAt: r.createdAt.toISOString(),
    })),
    day: { id: day.id, endsAt: day.endsAt.toISOString() },
    week: { id: week.id, endsAt: week.endsAt.toISOString() },
    quests: quests.map((q) => {
      const own = contributions.filter(
        (c) => c.period === q.period && c.week === q.week && c.slot === q.slot,
      );
      return {
        period: q.period,
        slot: q.slot,
        name: q.name,
        description: q.description,
        difficulty: q.difficulty,
        rarity: q.rarity,
        objective: q.objective,
        target: q.target,
        progress: q.progress,
        completedAt: q.completedAt?.toISOString() ?? null,
        myContribution: own.find((c) => c.userId === member.userId)?.amount ?? 0,
        contributors: own.length,
      };
    }),
  };
}
