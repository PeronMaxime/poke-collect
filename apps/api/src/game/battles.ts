import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { playerProfiles, pokemon, trainerProgress, trainerRuns } from '@poke/db';
import type { Db } from '@poke/db';
import {
  buildBattleSetup,
  checkBattleTeam,
  playerBonuses,
  resolveBattle,
  simulateDungeon,
  trainerStatus,
} from '@poke/game-core';
import type { DungeonCommand } from '@poke/game-core';
import type {
  BattleDto,
  StartBattleInput,
  StoredBattleResult,
  SwitchDungeonInput,
  TrainerRecordDto,
} from '@poke/shared';
import type { ContentCache } from '../content-cache';
import { GameError } from './errors';
import { SWITCH_TOLERANCE_MS } from './dungeons';
import { newSeed, requireStartedProfile, startHour } from './expeditions';
import { addItems, assertAvailable, claimedRewards, playerProgress, toInstance } from './store';

/**
 * Combats de dresseurs : combats en temps réel, comme les donjons. Le serveur fige la mise en
 * place au départ, enregistre les changements de Pokémon du joueur et recalcule le combat (même
 * simulation que le navigateur) pour en connaître l'issue ; le résultat s'applique à la
 * réclamation.
 */

export type BattleRow = typeof trainerRuns.$inferSelect;
type TrainerProgressRow = typeof trainerProgress.$inferSelect;

export function toBattleDto(row: BattleRow): BattleDto {
  return {
    id: row.id,
    trainerId: row.trainerId,
    team: row.team,
    setup: row.setup,
    commands: row.commands,
    fledAtMs: row.fledAtMs,
    contentVersionId: row.contentVersionId,
    startedAt: row.startedAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    claimedAt: row.claimedAt?.toISOString() ?? null,
    resultSeenAt: row.resultSeenAt?.toISOString() ?? null,
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
    lastEndedAt: row.lastEndedAt?.toISOString() ?? null,
  };
}

export async function trainerRecords(db: Db, userId: string): Promise<TrainerProgressRow[]> {
  return db.select().from(trainerProgress).where(eq(trainerProgress.ownerId, userId));
}

/** Combat en cours (ou terminé, pas encore réclamé) du joueur. */
export async function activeBattle(db: Db, userId: string): Promise<BattleRow | undefined> {
  const [row] = await db
    .select()
    .from(trainerRuns)
    .where(and(eq(trainerRuns.ownerId, userId), isNull(trainerRuns.claimedAt)));
  return row;
}

/** Dernier combat réclamé (résultat à montrer au joueur s'il ne l'a pas encore vu). */
export async function lastBattle(db: Db, userId: string): Promise<BattleRow | undefined> {
  const [row] = await db
    .select()
    .from(trainerRuns)
    .where(and(eq(trainerRuns.ownerId, userId), isNotNull(trainerRuns.claimedAt)))
    .orderBy(desc(trainerRuns.claimedAt))
    .limit(1);
  return row;
}

/** Le joueur a vu le résultat d'un combat réclamé : il ne s'affiche plus sur aucun appareil. */
export async function markBattleResultSeen(db: Db, userId: string, battleId: string, now: Date) {
  await db
    .update(trainerRuns)
    .set({ resultSeenAt: now })
    .where(
      and(
        eq(trainerRuns.id, battleId),
        eq(trainerRuns.ownerId, userId),
        isNotNull(trainerRuns.claimedAt),
        isNull(trainerRuns.resultSeenAt),
      ),
    );
}

/** Millisecondes écoulées depuis le départ, au plus le temps imparti. */
function elapsedMs(battle: BattleRow, now: Date): number {
  return Math.max(
    0,
    Math.min(now.getTime() - battle.startedAt.getTime(), battle.setup.timeLimitMs),
  );
}

/** État du combat à l'instant `now`. */
export function battleState(battle: BattleRow, now: Date) {
  return simulateDungeon(battle.setup, battle.commands, battle.fledAtMs, elapsedMs(battle, now))
    .state;
}

/**
 * Lance un combat : vérifie que le dresseur est débloqué et disponible (pas déjà battu s'il est
 * unique, pas en recharge), qu'aucun autre combat de dresseur n'est en cours, que l'équipe
 * respecte ses conditions et que chaque Pokémon est disponible. Enregistre l'attaque choisie pour
 * chaque Pokémon, puis fige la mise en place du combat.
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
      playerProgress(tx, ctx, userId),
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
    if (await activeBattle(tx, userId)) throw new GameError(409, 'BATTLE_BUSY');

    const rows = await tx
      .select()
      .from(pokemon)
      .where(and(eq(pokemon.ownerId, userId), inArray(pokemon.id, input.team)));
    if (rows.length !== new Set(input.team).size) throw new GameError(404, 'POKEMON_NOT_FOUND');
    await assertAvailable(tx, userId, rows, now);

    const byId = new Map(rows.map((r) => [r.id, r]));
    const team = input.team.map((id, i) => ({
      ...toInstance(byId.get(id)!),
      move: input.moves[i]!,
    }));
    const hour = startHour(now, input.utcOffsetMinutes);
    const errors = checkBattleTeam(ctx, trainer, team, hour, now);
    if (errors.length > 0) throw new GameError(400, 'TEAM_INVALID', { errors });

    for (const m of team) {
      await tx.update(pokemon).set({ dungeonMove: m.move }).where(eq(pokemon.id, m.id));
    }
    const setup = buildBattleSetup(ctx, trainer, team, newSeed(), hour, now);
    const [row] = await tx
      .insert(trainerRuns)
      .values({
        ownerId: userId,
        trainerId: trainer.id,
        team: input.team,
        setup,
        contentVersionId: ctx.content.versionId,
        startedAt: now,
        endsAt: new Date(now.getTime() + setup.timeLimitMs),
      })
      .returning();
    return row!;
  });
}

async function findBattle(db: Db, userId: string, battleId: string): Promise<BattleRow> {
  const [battle] = await db
    .select()
    .from(trainerRuns)
    .where(and(eq(trainerRuns.id, battleId), eq(trainerRuns.ownerId, userId)));
  if (!battle) throw new GameError(404, 'BATTLE_NOT_FOUND');
  if (battle.claimedAt) throw new GameError(409, 'ALREADY_CLAIMED');
  return battle;
}

/**
 * Envoie un Pokémon au combat. L'instant demandé (horloge du joueur) est recalé : ni dans le
 * futur, ni plus de `SWITCH_TOLERANCE_MS` dans le passé, ni avant le changement précédent.
 */
export async function switchBattleMember(
  db: Db,
  userId: string,
  battleId: string,
  input: SwitchDungeonInput,
  now: Date,
): Promise<BattleRow> {
  const battle = await findBattle(db, userId, battleId);
  const elapsed = elapsedMs(battle, now);
  const last = battle.commands.at(-1)?.atMs ?? 0;
  const atMs = Math.min(elapsed, Math.max(input.atMs, last, elapsed - SWITCH_TOLERANCE_MS));
  const state = simulateDungeon(battle.setup, battle.commands, battle.fledAtMs, atMs).state;
  if (state.outcome !== null) throw new GameError(409, 'BATTLE_FINISHED');
  if (input.member >= battle.team.length || state.hp[input.member] === 0) {
    throw new GameError(409, 'MEMBER_KO');
  }
  if (input.member === state.active) throw new GameError(409, 'MEMBER_ACTIVE');
  if (state.recallReadyAt[input.member]! > atMs) throw new GameError(409, 'MEMBER_RECALLED');

  const command: DungeonCommand = { atMs, member: input.member };
  const [updated] = await db
    .update(trainerRuns)
    .set({ commands: sql`${trainerRuns.commands} || ${JSON.stringify([command])}::jsonb` })
    .where(and(eq(trainerRuns.id, battle.id), isNull(trainerRuns.claimedAt)))
    .returning();
  if (!updated) throw new GameError(409, 'ALREADY_CLAIMED');
  return updated;
}

/** Fuite : le combat s'arrête sans récompense (les Pokémon déjà K.O. le restent). */
export async function fleeBattle(
  db: Db,
  userId: string,
  battleId: string,
  now: Date,
): Promise<BattleRow> {
  const battle = await findBattle(db, userId, battleId);
  if (battleState(battle, now).outcome !== null) return battle;
  const [updated] = await db
    .update(trainerRuns)
    .set({ fledAtMs: elapsedMs(battle, now) })
    .where(
      and(
        eq(trainerRuns.id, battle.id),
        isNull(trainerRuns.claimedAt),
        isNull(trainerRuns.fledAtMs),
      ),
    )
    .returning();
  return updated ?? battle;
}

/**
 * Réclame un combat terminé : XP des Pokémon adverses vaincus, K.O., et en cas de victoire
 * argent, butin et badge (première victoire). Met à jour le bilan contre le dresseur (temps de
 * recharge).
 */
export async function claimBattle(
  db: Db,
  content: ContentCache,
  userId: string,
  battleId: string,
  now: Date,
): Promise<{ battle: BattleRow; currency: number }> {
  const found = await findBattle(db, userId, battleId);
  if (battleState(found, now).outcome === null) {
    throw new GameError(409, 'NOT_FINISHED', { endsAt: found.endsAt });
  }
  const ctx = await content.version(found.contentVersionId);
  const trainer = ctx.trainer(found.trainerId);
  if (!trainer) throw new GameError(500, 'TRAINER_MISSING_IN_VERSION');

  return db.transaction(async (tx) => {
    // Verrou : seule la première réclamation passe.
    const [locked] = await tx
      .update(trainerRuns)
      .set({ claimedAt: now })
      .where(and(eq(trainerRuns.id, found.id), isNull(trainerRuns.claimedAt)))
      .returning();
    if (!locked) throw new GameError(409, 'ALREADY_CLAIMED');

    // L'équipe était occupée : aucun Pokémon n'a pu être transféré entre-temps.
    const teamRows = await tx
      .select()
      .from(pokemon)
      .where(and(eq(pokemon.ownerId, userId), inArray(pokemon.id, found.team)));
    const byId = new Map(teamRows.map((r) => [r.id, toInstance(r)]));
    const team = found.team.flatMap((id) => byId.get(id) ?? []);
    const result = resolveBattle(ctx, {
      trainer,
      setup: found.setup,
      commands: found.commands,
      fledAtMs: found.fledAtMs,
      team,
      bonuses: playerBonuses(ctx, await claimedRewards(tx, userId)),
    });
    const win = result.outcome === 'win';
    const fled = result.outcome === 'fled';
    const endedAt = new Date(found.startedAt.getTime() + result.endedAtMs);

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
        // Une fuite n'est pas une défaite (mais déclenche la recharge d'un dresseur répétable).
        losses: win || fled ? 0 : 1,
        firstWinAt: win ? endedAt : null,
        lastWinAt: win ? endedAt : null,
        lastEndedAt: endedAt,
      })
      .onConflictDoUpdate({
        target: [trainerProgress.ownerId, trainerProgress.trainerId],
        set: {
          wins: sql`${trainerProgress.wins} + excluded.wins`,
          losses: sql`${trainerProgress.losses} + excluded.losses`,
          firstWinAt: sql`coalesce(${trainerProgress.firstWinAt}, excluded.first_win_at)`,
          lastWinAt: sql`coalesce(excluded.last_win_at, ${trainerProgress.lastWinAt})`,
          lastEndedAt: sql`excluded.last_ended_at`,
        },
      });

    const knockedOut = new Set(result.knockedOut);
    // Durée de K.O. propre à chaque Pokémon (talents) ; affichée : la plus longue.
    let koUntil: Date | null = null;
    for (const m of result.team) {
      const minutes = m.koMinutes ?? result.koMinutes;
      const until = new Date(endedAt.getTime() + minutes * 60_000);
      const ko = knockedOut.has(m.id) && minutes > 0 && until > now;
      if (ko && (!koUntil || until > koUntil)) koUntil = until;
      await tx
        .update(pokemon)
        .set({
          xp: m.xpAfter,
          level: m.levelAfter,
          happiness: m.happinessAfter,
          ...(ko && { koUntil: until }),
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
      koUntil: koUntil ? koUntil.toISOString() : null,
    };
    const [claimed] = await tx
      .update(trainerRuns)
      .set({ outcome: result.outcome, result: stored })
      .where(eq(trainerRuns.id, found.id))
      .returning();
    return { battle: claimed!, currency: profile?.currency ?? 0 };
  });
}

/**
 * Réclame le combat du joueur s'il est terminé (le joueur a quitté la page pendant le combat) :
 * ses Pokémon redeviennent disponibles. Sans effet sinon.
 */
export async function settleFinishedBattle(
  db: Db,
  content: ContentCache,
  userId: string,
  now: Date,
): Promise<void> {
  const battle = await activeBattle(db, userId);
  if (!battle || battleState(battle, now).outcome === null) return;
  await claimBattle(db, content, userId, battle.id, now).catch((err: unknown) => {
    // Réclamé entre-temps par une autre requête : rien à faire.
    if (!(err instanceof GameError && err.code === 'ALREADY_CLAIMED')) throw err;
  });
}
