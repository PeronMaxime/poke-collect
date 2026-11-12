import { and, eq, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import { guildMembers, guildQuestContributions, guildWeeklyQuests } from '@poke/db';
import type { Db } from '@poke/db';
import { CHEST_RARITY_LABELS, GUILD_QUEST_PERIODS } from '@poke/content';
import type { ChestRarity, GuildQuestPeriod } from '@poke/content';
import {
  drawGuildQuests,
  guildObjectiveAmount,
  guildPeriod,
  guildQuestTarget,
} from '@poke/game-core';
import type { GameContext, GuildActivity } from '@poke/game-core';
import type { AdminGuildQuestsResetResponse } from '@poke/shared';
import { addItems } from '../store';
import { transaction } from '../tx';
import { memberCount, membership, systemMessage } from './common';

/**
 * Quêtes de guilde, du jour et de la semaine.
 *
 * Elles sont tirées au premier besoin de la période (graine enregistrée), avancées par les actions
 * des membres (`recordGuildActivity`, appelé par les autres domaines) et récompensées par des
 * coffres à la fin de la période (`settleGuildQuests`, tâche de fond).
 */

type WeeklyQuestRow = typeof guildWeeklyQuests.$inferSelect;

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
export async function currentQuests(
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
export async function raiseQuestTargets(db: Db, ctx: GameContext, guildId: string, now: Date) {
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
    await transaction(db, (tx) => rewardQuest(tx, ctx, quest, now));
  }
  return pending.length;
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
  return transaction(db, async (tx) => {
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
