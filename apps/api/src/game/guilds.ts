import { randomInt } from 'node:crypto';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from 'drizzle-orm';
import {
  guildJoinRequests,
  guildMembers,
  guildMessages,
  guildQuestContributions,
  guildWeeklyQuests,
  guilds,
  playerProfiles,
  users,
} from '@poke/db';
import type { Db } from '@poke/db';
import { CHEST_RARITY_LABELS, GUILD_QUEST_PERIODS } from '@poke/content';
import type { ChestRarity, GuildQuestPeriod } from '@poke/content';
import {
  MAX_SEED,
  chestCandidates,
  drawGuildQuests,
  guildDay,
  guildObjectiveAmount,
  guildPeriod,
  guildQuestTarget,
  guildWeek,
  openGuildChests,
} from '@poke/game-core';
import type { GameContext, GuildActivity, GuildRole } from '@poke/game-core';
import { ONLINE_WINDOW_MS } from '@poke/shared';
import type {
  AdminGuildQuestsResetResponse,
  CreateGuildInput,
  GuildDto,
  GuildLeaderboardEntryDto,
  GuildLeaderboardResponse,
  GuildMessagesResponse,
  GuildProfileResponse,
  GuildSearchResponse,
  GuildStateResponse,
  GuildSummaryDto,
  OpenChestInput,
  OpenChestResponse,
  UpdateGuildInput,
} from '@poke/shared';
import type { ContentCache } from '../content-cache';
import { GameError } from './errors';
import { requireStartedProfile } from './expeditions';
import { addItems, playerProgress, takeItems } from './store';

/**
 * Guildes : création, adhésion (libre ou sur demande), rôles, discussion, quêtes du jour et de la
 * semaine (tirées au premier besoin, avancées par les actions des membres) et coffres.
 */

type GuildMemberRow = typeof guildMembers.$inferSelect;
type WeeklyQuestRow = typeof guildWeeklyQuests.$inferSelect;

const ROLE_RANK: Record<GuildRole, number> = { leader: 0, officer: 1, member: 2 };
/** Messages renvoyés à la discussion (les plus récents). */
const MESSAGES_LIMIT = 100;
const SEARCH_LIMIT = 20;
/** Guildes affichées en tête du classement. */
const LEADERBOARD_SIZE = 50;

async function membership(db: Db, userId: string): Promise<GuildMemberRow | undefined> {
  const [row] = await db.select().from(guildMembers).where(eq(guildMembers.userId, userId));
  return row;
}

async function requireMembership(db: Db, userId: string, roles?: GuildRole[]) {
  const member = await membership(db, userId);
  if (!member) throw new GameError(404, 'NOT_IN_GUILD');
  if (roles && !roles.includes(member.role)) throw new GameError(403, 'GUILD_FORBIDDEN');
  return member;
}

/** Fin du délai après un départ volontaire ; null = le joueur peut rejoindre une guilde. */
function cooldownUntil(ctx: GameContext, leftAt: Date | null, now: Date): Date | null {
  if (!leftAt) return null;
  const until = new Date(leftAt.getTime() + ctx.balance.guilds.rejoinCooldownHours * 3_600_000);
  return until > now ? until : null;
}

function assertNoCooldown(ctx: GameContext, leftAt: Date | null, now: Date) {
  const until = cooldownUntil(ctx, leftAt, now);
  if (until) throw new GameError(409, 'GUILD_COOLDOWN', { until: until.toISOString() });
}

async function memberCount(db: Db, guildId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(guildMembers)
    .where(eq(guildMembers.guildId, guildId));
  return row?.n ?? 0;
}

/** Message du jeu dans la discussion (arrivée, départ, quête terminée…). */
async function systemMessage(db: Db, guildId: string, body: string, now: Date) {
  await db.insert(guildMessages).values({ guildId, userId: null, body, createdAt: now });
}

async function trainerName(db: Db, userId: string): Promise<string> {
  const [row] = await db
    .select({ name: playerProfiles.trainerName })
    .from(playerProfiles)
    .where(eq(playerProfiles.userId, userId));
  return row?.name ?? '?';
}

/** Joueur désigné par son nom de dresseur (actions sur les membres et les candidatures). */
async function userByName(db: Db, name: string): Promise<string> {
  const [row] = await db
    .select({ userId: playerProfiles.userId })
    .from(playerProfiles)
    .where(sql`lower(${playerProfiles.trainerName}) = lower(${name})`);
  if (!row) throw new GameError(404, 'TRAINER_NOT_FOUND');
  return row.userId;
}

/** Profil verrouillé pour la transaction (adhésions et créations simultanées). */
async function lockProfile(db: Db, userId: string) {
  const [profile] = await db
    .select({ currency: playerProfiles.currency, guildLeftAt: playerProfiles.guildLeftAt })
    .from(playerProfiles)
    .where(eq(playerProfiles.userId, userId))
    .for('update');
  if (!profile) throw new GameError(409, 'NO_PROFILE');
  return profile;
}

/** Guilde verrouillée : les arrivées simultanées ne dépassent pas le nombre maximal de membres. */
async function lockGuild(db: Db, guildId: string) {
  const [guild] = await db.select().from(guilds).where(eq(guilds.id, guildId)).for('update');
  if (!guild) throw new GameError(404, 'GUILD_NOT_FOUND');
  return guild;
}

/** Ajoute le joueur à la guilde (places vérifiées) et retire ses autres candidatures. */
async function addMember(
  db: Db,
  ctx: GameContext,
  guildId: string,
  userId: string,
  role: GuildRole,
  now: Date,
) {
  if ((await memberCount(db, guildId)) >= ctx.balance.guilds.maxMembers) {
    throw new GameError(409, 'GUILD_FULL');
  }
  await db.insert(guildMembers).values({ userId, guildId, role, joinedAt: now });
  await db.delete(guildJoinRequests).where(eq(guildJoinRequests.userId, userId));
  await raiseQuestTargets(db, ctx, guildId, now);
}

// --- Quêtes du jour et de la semaine ----------------------------------------------------

/** Clé d'une quête tirée. */
function questKey(quest: Pick<WeeklyQuestRow, 'guildId' | 'period' | 'week' | 'slot'>) {
  return and(
    eq(guildWeeklyQuests.guildId, quest.guildId),
    eq(guildWeeklyQuests.period, quest.period),
    eq(guildWeeklyQuests.week, quest.week),
    eq(guildWeeklyQuests.slot, quest.slot),
  );
}

/**
 * Quêtes du jour ou de la semaine de la guilde, tirées à la première demande (objectif selon le
 * nombre de membres à ce moment). Deux tirages simultanés donnent les mêmes quêtes : le second
 * est ignoré.
 */
async function periodQuests(
  db: Db,
  ctx: GameContext,
  guildId: string,
  kind: GuildQuestPeriod,
  now: Date,
): Promise<WeeklyQuestRow[]> {
  const period = guildPeriod(kind, now);
  const where = and(
    eq(guildWeeklyQuests.guildId, guildId),
    eq(guildWeeklyQuests.period, kind),
    eq(guildWeeklyQuests.week, period.id),
  );
  const rows = await db
    .select()
    .from(guildWeeklyQuests)
    .where(where)
    .orderBy(guildWeeklyQuests.slot);
  if (rows.length > 0) return rows;
  const draws = drawGuildQuests(ctx, guildId, kind, period.id, await memberCount(db, guildId));
  if (draws.length === 0) return [];
  await db
    .insert(guildWeeklyQuests)
    .values(draws.map((d) => ({ guildId, week: period.id, ...d })))
    .onConflictDoNothing();
  return db.select().from(guildWeeklyQuests).where(where).orderBy(guildWeeklyQuests.slot);
}

/** Quêtes en cours de la guilde : celles du jour, puis celles de la semaine. */
async function currentQuests(
  db: Db,
  ctx: GameContext,
  guildId: string,
  now: Date,
): Promise<WeeklyQuestRow[]> {
  const quests: WeeklyQuestRow[] = [];
  for (const kind of GUILD_QUEST_PERIODS) {
    quests.push(...(await periodQuests(db, ctx, guildId, kind, now)));
  }
  return quests;
}

/**
 * Arrivée d'un membre : les objectifs des quêtes en cours du jour et de la semaine suivent le
 * nouveau nombre de membres (jamais à la baisse : un départ ne facilite pas les quêtes).
 */
async function raiseQuestTargets(db: Db, ctx: GameContext, guildId: string, now: Date) {
  const members = await memberCount(db, guildId);
  for (const kind of GUILD_QUEST_PERIODS) {
    const quests = await db
      .select()
      .from(guildWeeklyQuests)
      .where(
        and(
          eq(guildWeeklyQuests.guildId, guildId),
          eq(guildWeeklyQuests.period, kind),
          eq(guildWeeklyQuests.week, guildPeriod(kind, now).id),
          isNull(guildWeeklyQuests.completedAt),
        ),
      );
    for (const quest of quests) {
      const goal = ctx.guildQuests.find((q) => q.id === quest.questId)?.[kind];
      if (!goal) continue;
      const target = guildQuestTarget(goal, members);
      if (target <= quest.target) continue;
      await db
        .update(guildWeeklyQuests)
        .set({ target })
        .where(and(questKey(quest), isNull(guildWeeklyQuests.completedAt)));
    }
  }
}

/** Coffre d'une rareté : le premier objet portant l'effet. */
function chestItemId(ctx: GameContext, rarity: ChestRarity): string | undefined {
  return ctx.content.items.find((i) =>
    i.effects.some((e) => e.type === 'guildChest' && e.rarity === rarity),
  )?.id;
}

/** Objectif atteint : la quête continue d'avancer, les coffres attendent la fin de la période. */
async function reachObjective(db: Db, quest: WeeklyQuestRow, now: Date) {
  const [done] = await db
    .update(guildWeeklyQuests)
    .set({ completedAt: now })
    .where(and(questKey(quest), isNull(guildWeeklyQuests.completedAt)))
    .returning();
  if (!done) return;
  const end = quest.period === 'daily' ? 'à minuit' : 'lundi à minuit';
  await systemMessage(
    db,
    quest.guildId,
    `Objectif de la quête « ${quest.name} » atteint ! Les coffres seront distribués ${end} à tous ceux qui l'auront fait avancer.`,
    now,
  );
}

/** Fin de période d'une quête terminée : un coffre à chaque membre actuel qui l'a fait avancer. */
async function rewardQuest(db: Db, ctx: GameContext, quest: WeeklyQuestRow, now: Date) {
  const [rewarded] = await db
    .update(guildWeeklyQuests)
    .set({ rewardedAt: now })
    .where(
      and(
        questKey(quest),
        isNotNull(guildWeeklyQuests.completedAt),
        isNull(guildWeeklyQuests.rewardedAt),
      ),
    )
    .returning();
  if (!rewarded) return;
  const contributors = await db
    .select({ userId: guildQuestContributions.userId })
    .from(guildQuestContributions)
    .innerJoin(
      guildMembers,
      and(
        eq(guildMembers.userId, guildQuestContributions.userId),
        eq(guildMembers.guildId, guildQuestContributions.guildId),
      ),
    )
    .where(
      and(
        eq(guildQuestContributions.guildId, quest.guildId),
        eq(guildQuestContributions.period, quest.period),
        eq(guildQuestContributions.week, quest.week),
        eq(guildQuestContributions.slot, quest.slot),
      ),
    );
  const itemId = chestItemId(ctx, quest.rarity);
  if (itemId) {
    for (const { userId } of contributors) {
      await addItems(db, userId, [{ itemId, quantity: 1 }]);
    }
  }
  const chests = itemId
    ? ` ${contributors.length} coffre(s) ${CHEST_RARITY_LABELS[quest.rarity]} distribué(s) aux participants.`
    : '';
  const total = `${rewarded.progress.toLocaleString('fr-FR')} / ${rewarded.target.toLocaleString('fr-FR')}`;
  await systemMessage(
    db,
    quest.guildId,
    `Quête « ${quest.name} » terminée (${total}) !${chests}`,
    now,
  );
}

/**
 * Distribue les coffres des quêtes terminées dont la période est finie (toutes les guildes, ou
 * une seule). Appelée régulièrement par le serveur et à l'ouverture de la guilde.
 */
export async function settleGuildQuests(
  db: Db,
  ctx: GameContext,
  now: Date,
  guildId?: string,
): Promise<number> {
  const pending = await db
    .select()
    .from(guildWeeklyQuests)
    .where(
      and(
        guildId ? eq(guildWeeklyQuests.guildId, guildId) : undefined,
        isNotNull(guildWeeklyQuests.completedAt),
        isNull(guildWeeklyQuests.rewardedAt),
        or(
          ...GUILD_QUEST_PERIODS.map((kind) =>
            and(
              eq(guildWeeklyQuests.period, kind),
              lt(guildWeeklyQuests.week, guildPeriod(kind, now).id),
            ),
          ),
        ),
      ),
    );
  for (const quest of pending) {
    await db.transaction((tx) => rewardQuest(tx, ctx, quest, now));
  }
  return pending.length;
}

/** Lance la distribution périodique des coffres de guilde ; retourne la fonction d'arrêt. */
export function startGuildRewards({
  db,
  content,
  intervalSeconds,
  onError,
}: {
  db: Db;
  content: ContentCache;
  intervalSeconds: number;
  onError: (err: unknown) => void;
}): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    content
      .get()
      .then((ctx) => settleGuildQuests(db, ctx, new Date()))
      .catch(onError)
      .finally(() => {
        running = false;
      });
  }, intervalSeconds * 1000);
  timer.unref();
  return () => clearInterval(timer);
}

/**
 * Administration : efface les quêtes du jour et de la semaine en cours de toutes les guildes (et
 * les contributions des membres). Elles sont retirées au prochain besoin, avec le contenu publié
 * et le nombre de membres actuels ; les quêtes terminées distribuent d'abord leurs coffres.
 */
export async function resetGuildQuests(
  db: Db,
  ctx: GameContext,
  now: Date,
): Promise<AdminGuildQuestsResetResponse> {
  return db.transaction(async (tx) => {
    let quests = 0;
    for (const kind of GUILD_QUEST_PERIODS) {
      const week = guildPeriod(kind, now).id;
      // Les quêtes déjà terminées donnent leurs coffres avant d'être effacées.
      const done = await tx
        .select()
        .from(guildWeeklyQuests)
        .where(
          and(
            eq(guildWeeklyQuests.period, kind),
            eq(guildWeeklyQuests.week, week),
            isNotNull(guildWeeklyQuests.completedAt),
            isNull(guildWeeklyQuests.rewardedAt),
          ),
        );
      for (const quest of done) await rewardQuest(tx, ctx, quest, now);
      await tx
        .delete(guildQuestContributions)
        .where(
          and(eq(guildQuestContributions.period, kind), eq(guildQuestContributions.week, week)),
        );
      const deleted = await tx
        .delete(guildWeeklyQuests)
        .where(and(eq(guildWeeklyQuests.period, kind), eq(guildWeeklyQuests.week, week)))
        .returning({ guildId: guildWeeklyQuests.guildId });
      quests += deleted.length;
    }
    return { quests };
  });
}

/**
 * Fait avancer les quêtes du jour et de la semaine de la guilde du joueur (à appeler dans la
 * transaction de l'action : expédition, combat, donjon, éclosion). Sans guilde : rien.
 */
export async function recordGuildActivity(
  db: Db,
  ctx: GameContext,
  userId: string,
  activity: GuildActivity,
  now: Date,
) {
  const member = await membership(db, userId);
  if (!member) return;
  const quests = await currentQuests(db, ctx, member.guildId, now);
  for (const quest of quests) {
    // Objectif atteint ou non, la quête avance jusqu'à la fin de la période : tout le monde peut
    // encore y participer et recevoir le coffre.
    const amount = guildObjectiveAmount(ctx, quest.objective, activity);
    if (amount <= 0) continue;
    const [updated] = await db
      .update(guildWeeklyQuests)
      .set({ progress: sql`${guildWeeklyQuests.progress} + ${amount}` })
      .where(questKey(quest))
      .returning();
    if (!updated) continue;
    await db
      .insert(guildQuestContributions)
      .values({
        guildId: quest.guildId,
        period: quest.period,
        week: quest.week,
        slot: quest.slot,
        userId,
        amount,
      })
      .onConflictDoUpdate({
        target: [
          guildQuestContributions.guildId,
          guildQuestContributions.period,
          guildQuestContributions.week,
          guildQuestContributions.slot,
          guildQuestContributions.userId,
        ],
        set: { amount: sql`${guildQuestContributions.amount} + excluded.amount` },
      });
    if (!updated.completedAt && updated.progress >= updated.target) {
      await reachObjective(db, updated, now);
    }
  }
}

// --- État, recherche ------------------------------------------------------------------------

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
        starterSpeciesId: playerProfiles.starterSpeciesId,
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
    members: members.map(({ joinedAt: _joinedAt, ...m }) => m),
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

// --- Création, adhésion, départ ------------------------------------------------------------

export async function createGuild(
  db: Db,
  content: ContentCache,
  userId: string,
  input: CreateGuildInput,
  now: Date,
) {
  const ctx = await content.get();
  await requireStartedProfile(db, userId);
  const cost = ctx.balance.guilds.creationCost;
  await db.transaction(async (tx) => {
    const profile = await lockProfile(tx, userId);
    if (await membership(tx, userId)) throw new GameError(409, 'ALREADY_IN_GUILD');
    assertNoCooldown(ctx, profile.guildLeftAt, now);
    if (profile.currency < cost) throw new GameError(409, 'NOT_ENOUGH_MONEY', { cost });
    const [taken] = await tx
      .select({ id: guilds.id })
      .from(guilds)
      .where(sql`lower(${guilds.name}) = lower(${input.name})`);
    if (taken) throw new GameError(409, 'GUILD_NAME_TAKEN');
    const [guild] = await tx
      .insert(guilds)
      .values({ ...input, createdAt: now })
      .returning({ id: guilds.id });
    await addMember(tx, ctx, guild!.id, userId, 'leader', now);
    await tx
      .update(playerProfiles)
      .set({ currency: sql`${playerProfiles.currency} - ${cost}` })
      .where(eq(playerProfiles.userId, userId));
    const name = await trainerName(tx, userId);
    await systemMessage(tx, guild!.id, `${name} a fondé la guilde « ${input.name} ».`, now);
  });
  return guildState(db, content, userId, now);
}

/** Rejoint une guilde ouverte, ou y dépose une candidature. */
export async function joinGuild(
  db: Db,
  content: ContentCache,
  userId: string,
  guildId: string,
  now: Date,
): Promise<{ joined: boolean }> {
  const ctx = await content.get();
  await requireStartedProfile(db, userId);
  return db.transaction(async (tx) => {
    const profile = await lockProfile(tx, userId);
    if (await membership(tx, userId)) throw new GameError(409, 'ALREADY_IN_GUILD');
    assertNoCooldown(ctx, profile.guildLeftAt, now);
    const guild = await lockGuild(tx, guildId);
    if (guild.joinMode === 'request') {
      await tx
        .insert(guildJoinRequests)
        .values({ guildId, userId, createdAt: now })
        .onConflictDoNothing();
      return { joined: false };
    }
    await addMember(tx, ctx, guildId, userId, 'member', now);
    await systemMessage(tx, guildId, `${await trainerName(tx, userId)} a rejoint la guilde.`, now);
    return { joined: true };
  });
}

export async function cancelJoinRequest(db: Db, userId: string, guildId: string) {
  await db
    .delete(guildJoinRequests)
    .where(and(eq(guildJoinRequests.guildId, guildId), eq(guildJoinRequests.userId, userId)));
}

/** Chef ou officier : accepte (ou refuse) la candidature d'un dresseur. */
export async function answerJoinRequest(
  db: Db,
  content: ContentCache,
  userId: string,
  name: string,
  accept: boolean,
  now: Date,
) {
  const ctx = await content.get();
  const member = await requireMembership(db, userId, ['leader', 'officer']);
  const candidateId = await userByName(db, name);
  await db.transaction(async (tx) => {
    const [request] = await tx
      .delete(guildJoinRequests)
      .where(
        and(
          eq(guildJoinRequests.guildId, member.guildId),
          eq(guildJoinRequests.userId, candidateId),
        ),
      )
      .returning();
    if (!request) throw new GameError(404, 'REQUEST_NOT_FOUND');
    if (!accept) return;
    const profile = await lockProfile(tx, candidateId);
    if (await membership(tx, candidateId)) throw new GameError(409, 'ALREADY_IN_GUILD');
    assertNoCooldown(ctx, profile.guildLeftAt, now);
    await lockGuild(tx, member.guildId);
    await addMember(tx, ctx, member.guildId, candidateId, 'member', now);
    await systemMessage(
      tx,
      member.guildId,
      `${await trainerName(tx, candidateId)} a rejoint la guilde.`,
      now,
    );
  });
}

/**
 * Quitte la guilde (délai avant d'en rejoindre une autre). Le chef passe la main à l'officier le
 * plus ancien, sinon au membre le plus ancien ; le dernier membre dissout la guilde.
 */
export async function leaveGuild(db: Db, userId: string, now: Date) {
  const member = await requireMembership(db, userId);
  await db.transaction(async (tx) => {
    await lockGuild(tx, member.guildId);
    await tx.delete(guildMembers).where(eq(guildMembers.userId, userId));
    await tx
      .update(playerProfiles)
      .set({ guildLeftAt: now })
      .where(eq(playerProfiles.userId, userId));
    const remaining = await tx
      .select()
      .from(guildMembers)
      .where(eq(guildMembers.guildId, member.guildId));
    if (remaining.length === 0) {
      await tx.delete(guilds).where(eq(guilds.id, member.guildId));
      return;
    }
    const name = await trainerName(tx, userId);
    await systemMessage(tx, member.guildId, `${name} a quitté la guilde.`, now);
    if (member.role !== 'leader') return;
    const [heir] = remaining.sort(
      (a, b) =>
        ROLE_RANK[a.role] - ROLE_RANK[b.role] || a.joinedAt.getTime() - b.joinedAt.getTime(),
    );
    await tx
      .update(guildMembers)
      .set({ role: 'leader' })
      .where(eq(guildMembers.userId, heir!.userId));
    await systemMessage(
      tx,
      member.guildId,
      `${await trainerName(tx, heir!.userId)} devient chef de la guilde.`,
      now,
    );
  });
}

/** Membre de la même guilde que l'acteur, désigné par son nom de dresseur. */
async function targetMember(db: Db, actor: GuildMemberRow, name: string) {
  const targetId = await userByName(db, name);
  const target = await membership(db, targetId);
  if (!target || target.guildId !== actor.guildId) throw new GameError(404, 'MEMBER_NOT_FOUND');
  if (target.userId === actor.userId) throw new GameError(400, 'CANNOT_TARGET_SELF');
  return target;
}

/** Exclusion : le chef exclut n'importe qui, un officier seulement les simples membres. */
export async function kickMember(db: Db, userId: string, name: string, now: Date) {
  const actor = await requireMembership(db, userId, ['leader', 'officer']);
  const target = await targetMember(db, actor, name);
  if (ROLE_RANK[target.role] <= ROLE_RANK[actor.role]) throw new GameError(403, 'GUILD_FORBIDDEN');
  await db.transaction(async (tx) => {
    await tx.delete(guildMembers).where(eq(guildMembers.userId, target.userId));
    await systemMessage(
      tx,
      actor.guildId,
      `${await trainerName(tx, target.userId)} a été exclu de la guilde.`,
      now,
    );
  });
}

/** Chef : nomme un officier, le rétrograde, ou passe la main (il devient officier). */
export async function setMemberRole(
  db: Db,
  userId: string,
  name: string,
  role: GuildRole,
  now: Date,
) {
  const actor = await requireMembership(db, userId, ['leader']);
  const target = await targetMember(db, actor, name);
  await db.transaction(async (tx) => {
    await tx.update(guildMembers).set({ role }).where(eq(guildMembers.userId, target.userId));
    if (role !== 'leader') return;
    await tx.update(guildMembers).set({ role: 'officer' }).where(eq(guildMembers.userId, userId));
    await systemMessage(
      tx,
      actor.guildId,
      `${await trainerName(tx, target.userId)} devient chef de la guilde.`,
      now,
    );
  });
}

/** Chef : description et mode d'adhésion. */
export async function updateGuild(db: Db, userId: string, input: UpdateGuildInput) {
  const actor = await requireMembership(db, userId, ['leader']);
  if (input.description === undefined && input.joinMode === undefined) return;
  await db.update(guilds).set(input).where(eq(guilds.id, actor.guildId));
}

// --- Discussion ------------------------------------------------------------------------------

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

// --- Coffres -------------------------------------------------------------------------------

/** Ouvre des coffres de guilde du sac : lots tirés selon la progression du joueur. */
export async function openChests(
  db: Db,
  content: ContentCache,
  userId: string,
  input: OpenChestInput,
): Promise<OpenChestResponse> {
  const ctx = await content.get();
  await requireStartedProfile(db, userId);
  const effect = ctx.itemEffect(input.itemId, 'guildChest');
  if (!effect) throw new GameError(400, 'NOT_A_CHEST');
  const progress = await playerProgress(db, ctx, userId);
  if (chestCandidates(ctx, effect.rarity, progress).length === 0) {
    throw new GameError(409, 'CHEST_EMPTY');
  }
  const loot = openGuildChests(
    ctx,
    effect.rarity,
    progress,
    input.count,
    randomInt(0, MAX_SEED + 1),
  );
  await db.transaction(async (tx) => {
    if (!(await takeItems(tx, userId, input.itemId, input.count))) {
      throw new GameError(409, 'NOT_ENOUGH_ITEMS');
    }
    await addItems(tx, userId, loot);
  });
  return { itemId: input.itemId, opened: input.count, loot };
}
