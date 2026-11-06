import { and, eq, isNull, sql } from 'drizzle-orm';
import { playerProfiles, questProgress } from '@poke/db';
import type { Db } from '@poke/db';
import {
  NEW_QUEST,
  advanceQuest,
  questItemsGained,
  questStatus,
  questStepsDone,
} from '@poke/game-core';
import type { GameContext, PlayerSlots, QuestEvent } from '@poke/game-core';
import type { ItemStack, QuestReward } from '@poke/content';
import type { QuestProgressDto } from '@poke/shared';
import type { ContentCache } from '../content-cache';
import { GameError } from './errors';
import { playerTransaction } from './tx';
import { requireStartedProfile } from './expeditions';
import { addItems, baseProgress, playerSlotsNow, questRecords, questRows } from './store';
import type { QuestProgressRow } from './store';

/**
 * Quêtes : l'avancement se calcule paresseusement (étapes « état ») et s'enregistre à chaque
 * synchronisation, avec le compteur des étapes « action » mis à jour par les expéditions.
 */

interface QuestWrite {
  questId: string;
  values: {
    step: number;
    progress: { count: number };
    stepStartedAt: Date;
    completedAt: Date | null;
  };
  /** Objets de quête trouvés par l'événement (étape « objet de quête » en cours). */
  items: ItemStack | null;
}

/** Avancement à enregistrer, sans rien écrire : vide quand les lignes sont déjà à jour. */
function planQuestSync(
  ctx: GameContext,
  base: Awaited<ReturnType<typeof baseProgress>>,
  rows: readonly QuestProgressRow[],
  now: Date,
  event?: QuestEvent,
): QuestWrite[] {
  const records = questRecords(rows);
  const progress = { ...base, questSteps: questStepsDone(ctx, base, records) };
  const byId = new Map(rows.map((r) => [r.questId, r]));
  const writes: QuestWrite[] = [];

  for (const quest of ctx.quests) {
    const row = byId.get(quest.id);
    if (row?.completedAt) continue;
    if (!row && !progress.questSteps.has(quest.id)) continue; // verrouillée
    const record = records.get(quest.id) ?? NEW_QUEST;
    const next = advanceQuest(ctx, quest, record, progress, event);
    if (row && next.step === record.step && next.count === record.count) continue;
    writes.push({
      questId: quest.id,
      values: {
        step: next.step,
        progress: { count: next.count },
        stepStartedAt: !row || next.step !== record.step ? now : row.stepStartedAt,
        completedAt: next.step >= quest.steps.length ? now : null,
      },
      items: event ? questItemsGained(quest, record, next) : null,
    });
  }
  return writes;
}

/**
 * Enregistre l'avancement des quêtes débloquées : crée la ligne d'une quête qui apparaît, valide
 * les étapes remplies et applique l'événement (expédition récupérée) à l'étape en cours ; les
 * objets de quête trouvés vont dans le sac (et dans `gained`, s'il est donné).
 * À appeler dans la transaction qui a modifié l'état du joueur.
 */
export async function syncQuests(
  db: Db,
  ctx: GameContext,
  userId: string,
  now: Date,
  event?: QuestEvent,
  gained?: ItemStack[],
): Promise<QuestProgressRow[]> {
  const [base, rows] = await Promise.all([baseProgress(db, userId), questRows(db, userId)]);
  const byId = new Map(rows.map((r) => [r.questId, r]));
  for (const { questId, values, items } of planQuestSync(ctx, base, rows, now, event)) {
    if (items) {
      await addItems(db, userId, [items]);
      gained?.push(items);
    }
    const [saved] = await db
      .insert(questProgress)
      .values({
        ownerId: userId,
        questId,
        contentVersionId: ctx.content.versionId,
        ...values,
      })
      .onConflictDoUpdate({ target: [questProgress.ownerId, questProgress.questId], set: values })
      .returning();
    byId.set(questId, saved!);
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
    restartOnRelease: row.restartOnRelease,
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
  // Lecture seule tant que rien ne change : la transaction (et ses verrous) n'est ouverte que
  // pour enregistrer une étape franchie, en relisant l'état à l'intérieur.
  const [base, current] = await Promise.all([baseProgress(db, userId), questRows(db, userId)]);
  const rows = planQuestSync(ctx, base, current, now).length
    ? await playerTransaction(db, userId, (tx) => syncQuests(tx, ctx, userId, now))
    : current;
  const order = new Map(ctx.quests.map((q, i) => [q.id, i]));
  return rows
    .map((r) => toQuestProgressDto(ctx, r))
    .filter((q) => q !== null)
    .sort((a, b) => order.get(a.questId)! - order.get(b.questId)!);
}

/**
 * Réclame la récompense d'une quête terminée (une seule fois) : argent, objets, emplacements et
 * bonus permanents. Les Pokémon se capturent ensuite : en combat légendaire depuis les quêtes,
 * ou en expédition pour un fuyard.
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

  return playerTransaction(db, userId, async (tx) => {
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

    const slots = await playerSlotsNow(tx, ctx, userId);
    return { rewards, currency: profile?.currency ?? 0, slots };
  });
}
