import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { playerProfiles, pokemon, trainerBattles, trainerProgress } from '@poke/db';
import type { Db } from '@poke/db';
import {
  battleDurationMinutes,
  checkBattleTeam,
  playerBonuses,
  playerSlots,
  resolveBattle,
  trainerStatus,
} from '@poke/game-core';
import type { ClaimedRewards, GameContext } from '@poke/game-core';
import type {
  BattleDto,
  StartBattleInput,
  StoredBattleResult,
  TrainerRecordDto,
} from '@poke/shared';
import type { ContentCache } from '../content-cache';
import { GameError } from './errors';
import { newSeed, requireStartedProfile } from './expeditions';
import { addItems, assertAvailable, claimedRewards, playerProgress, toInstance } from './store';

/** Combats de dresseurs : même schéma que les expéditions (lancer, attendre, réclamer). */

export type BattleRow = typeof trainerBattles.$inferSelect;
type TrainerProgressRow = typeof trainerProgress.$inferSelect;

/** Nombre d'emplacements de combat du joueur (départ + paliers et collections réclamés). */
export function battleSlots(ctx: GameContext, claimed: ClaimedRewards): number {
  return playerSlots(ctx, claimed).battles;
}

export function toBattleDto(row: BattleRow): BattleDto {
  return {
    id: row.id,
    trainerId: row.trainerId,
    slotIndex: row.slotIndex,
    team: row.team,
    contentVersionId: row.contentVersionId,
    startedAt: row.startedAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    claimedAt: row.claimedAt?.toISOString() ?? null,
    outcome: row.outcome,
    result: (row.result as StoredBattleResult | null) ?? null,
  };
}

export function toRecordDto(row: TrainerProgressRow): TrainerRecordDto {
  return {
    trainerId: row.trainerId,
    wins: row.wins,
    losses: row.losses,
    firstWinAt: row.firstWinAt?.toISOString() ?? null,
    lastWinAt: row.lastWinAt?.toISOString() ?? null,
  };
}

export async function trainerRecords(db: Db, userId: string): Promise<TrainerProgressRow[]> {
  return db.select().from(trainerProgress).where(eq(trainerProgress.ownerId, userId));
}

/**
 * Lance un combat : vérifie que le dresseur est débloqué et disponible (pas déjà battu s'il est
 * unique, pas en recharge), que l'équipe respecte ses conditions et que chaque Pokémon est
 * disponible. Enregistre la version de contenu active et un seed tiré côté serveur.
 */
export async function startBattle(
  db: Db,
  content: ContentCache,
  userId: string,
  input: StartBattleInput,
  now: Date,
): Promise<BattleRow> {
  const ctx = await content.get();
  await requireStartedProfile(db, userId);
  const trainer = ctx.trainer(input.trainerId);
  if (!trainer) throw new GameError(404, 'TRAINER_NOT_FOUND');

  return db.transaction(async (tx) => {
    const [progress, [record]] = await Promise.all([
      playerProgress(tx, userId),
      tx
        .select()
        .from(trainerProgress)
        .where(and(eq(trainerProgress.ownerId, userId), eq(trainerProgress.trainerId, trainer.id))),
    ]);
    const status = trainerStatus(ctx, trainer, progress, record, now);
    if (status.state === 'locked') throw new GameError(403, 'TRAINER_LOCKED');
    if (status.state === 'defeated') throw new GameError(409, 'TRAINER_DEFEATED');
    if (status.state === 'cooldown') {
      throw new GameError(409, 'TRAINER_COOLDOWN', { until: status.until.toISOString() });
    }

    const active = await tx
      .select({ slotIndex: trainerBattles.slotIndex, trainerId: trainerBattles.trainerId })
      .from(trainerBattles)
      .where(and(eq(trainerBattles.ownerId, userId), isNull(trainerBattles.claimedAt)));
    if (active.some((b) => b.trainerId === trainer.id)) {
      throw new GameError(409, 'TRAINER_BUSY');
    }
    const used = new Set(active.map((b) => b.slotIndex));
    const slots = battleSlots(ctx, await claimedRewards(tx, userId));
    const slotIndex = Array.from({ length: slots }, (_, i) => i).find((i) => !used.has(i));
    if (slotIndex === undefined) throw new GameError(409, 'NO_FREE_SLOT');

    const rows = await tx
      .select()
      .from(pokemon)
      .where(and(eq(pokemon.ownerId, userId), inArray(pokemon.id, input.team)));
    if (rows.length !== new Set(input.team).size) throw new GameError(404, 'POKEMON_NOT_FOUND');
    await assertAvailable(tx, userId, rows, now);

    const byId = new Map(rows.map((r) => [r.id, r]));
    const team = input.team.map((id) => toInstance(byId.get(id)!));
    const errors = checkBattleTeam(ctx, trainer, team);
    if (errors.length > 0) throw new GameError(400, 'TEAM_INVALID', { errors });

    const [row] = await tx
      .insert(trainerBattles)
      .values({
        ownerId: userId,
        trainerId: trainer.id,
        slotIndex,
        team: input.team,
        contentVersionId: ctx.content.versionId,
        startedAt: now,
        endsAt: new Date(now.getTime() + battleDurationMinutes(ctx, trainer) * 60_000),
        seed: newSeed(),
      })
      .returning();
    return row!;
  });
}

/**
 * Réclame un combat terminé : résout le combat (seed + contenu de la version de départ), puis
 * applique en une transaction l'argent, le butin, l'XP et le bonheur, ou le K.O. de l'équipe.
 */
export async function claimBattle(
  db: Db,
  content: ContentCache,
  userId: string,
  battleId: string,
  now: Date,
): Promise<{ battle: BattleRow; currency: number }> {
  const [found] = await db
    .select()
    .from(trainerBattles)
    .where(and(eq(trainerBattles.id, battleId), eq(trainerBattles.ownerId, userId)));
  if (!found) throw new GameError(404, 'BATTLE_NOT_FOUND');
  if (found.claimedAt) throw new GameError(409, 'ALREADY_CLAIMED');
  if (now < found.endsAt) throw new GameError(409, 'NOT_FINISHED', { endsAt: found.endsAt });

  const ctx = await content.version(found.contentVersionId);
  const trainer = ctx.trainer(found.trainerId);
  if (!trainer) throw new GameError(500, 'TRAINER_MISSING_IN_VERSION');

  return db.transaction(async (tx) => {
    // Verrou : seule la première réclamation passe.
    const [locked] = await tx
      .update(trainerBattles)
      .set({ claimedAt: now })
      .where(and(eq(trainerBattles.id, found.id), isNull(trainerBattles.claimedAt)))
      .returning();
    if (!locked) throw new GameError(409, 'ALREADY_CLAIMED');

    // Un Pokémon transféré entre-temps ne peut pas l'être (il était occupé) : l'équipe est complète.
    const teamRows = await tx
      .select()
      .from(pokemon)
      .where(and(eq(pokemon.ownerId, userId), inArray(pokemon.id, found.team)));
    const byId = new Map(teamRows.map((r) => [r.id, r]));
    const team = found.team.flatMap((id) => {
      const row = byId.get(id);
      return row ? [toInstance(row)] : [];
    });
    const result = resolveBattle(ctx, {
      trainer,
      team,
      seed: found.seed,
      bonuses: playerBonuses(ctx, await claimedRewards(tx, userId)),
    });
    const win = result.outcome === 'win';

    const [before] = await tx
      .select({ wins: trainerProgress.wins })
      .from(trainerProgress)
      .where(and(eq(trainerProgress.ownerId, userId), eq(trainerProgress.trainerId, trainer.id)));
    const badgeEarned = win && !!trainer.badge && (before?.wins ?? 0) === 0;
    await tx
      .insert(trainerProgress)
      .values({
        ownerId: userId,
        trainerId: trainer.id,
        wins: win ? 1 : 0,
        losses: win ? 0 : 1,
        firstWinAt: win ? now : null,
        lastWinAt: win ? now : null,
      })
      .onConflictDoUpdate({
        target: [trainerProgress.ownerId, trainerProgress.trainerId],
        set: {
          wins: sql`${trainerProgress.wins} + excluded.wins`,
          losses: sql`${trainerProgress.losses} + excluded.losses`,
          firstWinAt: sql`coalesce(${trainerProgress.firstWinAt}, excluded.first_win_at)`,
          lastWinAt: sql`coalesce(excluded.last_win_at, ${trainerProgress.lastWinAt})`,
        },
      });

    const koUntil = win ? null : new Date(now.getTime() + result.koMinutes * 60_000);
    for (const m of result.team) {
      await tx
        .update(pokemon)
        .set({
          xp: m.xpAfter,
          level: m.levelAfter,
          happiness: m.happinessAfter,
          ...(koUntil && result.koMinutes > 0 && { koUntil }),
        })
        .where(eq(pokemon.id, m.id));
    }
    await addItems(tx, userId, result.loot);
    const [profile] = await tx
      .update(playerProfiles)
      .set({ currency: sql`${playerProfiles.currency} + ${result.money}` })
      .where(eq(playerProfiles.userId, userId))
      .returning({ currency: playerProfiles.currency });

    const stored: StoredBattleResult = {
      ...result,
      badgeEarned,
      koUntil: koUntil && result.koMinutes > 0 ? koUntil.toISOString() : null,
    };
    const [claimed] = await tx
      .update(trainerBattles)
      .set({ outcome: result.outcome, result: stored })
      .where(eq(trainerBattles.id, found.id))
      .returning();
    return { battle: claimed!, currency: profile?.currency ?? 0 };
  });
}
