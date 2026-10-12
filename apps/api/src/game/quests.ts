import { and, eq, isNull, sql } from 'drizzle-orm';
import { playerProfiles, questProgress } from '@poke/db';
import type { Db } from '@poke/db';
import { NEW_QUEST, advanceQuest, playerSlots, questStatus, questStepsDone } from '@poke/game-core';
import type { GameContext, PlayerSlots, QuestEvent } from '@poke/game-core';
import type { QuestReward } from '@poke/content';
import type { QuestProgressDto } from '@poke/shared';
import type { ContentCache } from '../content-cache';
import { GameError } from './errors';
import { requireStartedProfile } from './expeditions';
import { addItems, baseProgress, claimedRewards, questRecords, questRows } from './store';
import type { QuestProgressRow } from './store';

/**
 * Quêtes : l'avancement se calcule paresseusement (étapes « état ») et s'enregistre à chaque
 * synchronisation, avec le compteur des étapes « action » mis à jour par les expéditions.
 */

/**
 * Enregistre l'avancement des quêtes débloquées : crée la ligne d'une quête qui apparaît, valide
 * les étapes remplies et applique l'événement (expédition récupérée) à l'étape en cours.
 * À appeler dans la transaction qui a modifié l'état du joueur.
 */
export async function syncQuests(
  db: Db,
  ctx: GameContext,
  userId: string,
  now: Date,
  event?: QuestEvent,
): Promise<QuestProgressRow[]> {
  const [base, rows] = await Promise.all([baseProgress(db, userId), questRows(db, userId)]);
  const records = questRecords(rows);
  const progress = { ...base, questSteps: questStepsDone(ctx, base, records) };
  const byId = new Map(rows.map((r) => [r.questId, r]));

  for (const quest of ctx.quests) {
    const row = byId.get(quest.id);
    if (row?.completedAt) continue;
    if (!row && !progress.questSteps.has(quest.id)) continue; // verrouillée
    const record = records.get(quest.id) ?? NEW_QUEST;
    const next = advanceQuest(ctx, quest, record, progress, event);
    if (row && next.step === record.step && next.count === record.count) continue;

    const values = {
      step: next.step,
      progress: { count: next.count },
      stepStartedAt: !row || next.step !== record.step ? now : row.stepStartedAt,
      completedAt: next.step >= quest.steps.length ? now : null,
    };
    const [saved] = await db
      .insert(questProgress)
      .values({
        ownerId: userId,
        questId: quest.id,
        contentVersionId: ctx.content.versionId,
        ...values,
      })
      .onConflictDoUpdate({ target: [questProgress.ownerId, questProgress.questId], set: values })
      .returning();
    byId.set(quest.id, saved!);
  }
  return [...byId.values()];
}

export function toQuestProgressDto(
  ctx: GameContext,
  row: QuestProgressRow,
): QuestProgressDto | null {
  const quest = ctx.quest(row.questId);
  if (!quest) return null; // quête supprimée du contenu
  const step = Math.min(row.step, quest.steps.length);
  return {
    questId: row.questId,
    status: questStatus(quest, step, row.claimedAt !== null) as QuestProgressDto['status'],
    step,
    count: row.progress.count ?? 0,
    stepStartedAt: row.stepStartedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    claimedAt: row.claimedAt?.toISOString() ?? null,
    pokemonCaught: row.pokemonCaught,
  };
}

/** Quêtes visibles par le joueur, avancement à jour. */
export async function questsState(
  db: Db,
  content: ContentCache,
  userId: string,
  now: Date,
): Promise<QuestProgressDto[]> {
  const ctx = await content.get();
  await requireStartedProfile(db, userId);
  const rows = await db.transaction((tx) => syncQuests(tx, ctx, userId, now));
  const order = new Map(ctx.quests.map((q, i) => [q.id, i]));
  return rows
    .map((r) => toQuestProgressDto(ctx, r))
    .filter((q) => q !== null)
    .sort((a, b) => order.get(a.questId)! - order.get(b.questId)!);
}

/**
 * Réclame la récompense d'une quête terminée (une seule fois) : argent, objets, emplacements et
 * bonus permanents. Les Pokémon se capturent ensuite en expédition légendaire.
 */
export async function claimQuest(
  db: Db,
  content: ContentCache,
  userId: string,
  questId: string,
  now: Date,
): Promise<{ rewards: QuestReward; currency: number; slots: PlayerSlots }> {
  const ctx = await content.get();
  await requireStartedProfile(db, userId);
  const quest = ctx.quest(questId);
  if (!quest) throw new GameError(404, 'QUEST_NOT_FOUND');

  return db.transaction(async (tx) => {
    const rows = await syncQuests(tx, ctx, userId, now);
    const row = rows.find((r) => r.questId === quest.id);
    if (!row || row.step < quest.steps.length) throw new GameError(409, 'QUEST_NOT_COMPLETED');
    // Verrou : seule la première réclamation passe.
    const [locked] = await tx
      .update(questProgress)
      .set({ claimedAt: now })
      .where(
        and(
          eq(questProgress.ownerId, userId),
          eq(questProgress.questId, quest.id),
          isNull(questProgress.claimedAt),
        ),
      )
      .returning();
    if (!locked) throw new GameError(409, 'ALREADY_CLAIMED');

    const { rewards } = quest;
    await addItems(tx, userId, rewards.items);
    const [profile] = await tx
      .update(playerProfiles)
      .set({ currency: sql`${playerProfiles.currency} + ${rewards.currency}` })
      .where(eq(playerProfiles.userId, userId))
      .returning({ currency: playerProfiles.currency });

    const slots = playerSlots(ctx, await claimedRewards(tx, userId));
    return { rewards, currency: profile?.currency ?? 0, slots };
  });
}
