import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { dungeonProgress, dungeonRuns, playerProfiles, pokemon } from '@poke/db';
import type { Db } from '@poke/db';
import {
  buildDungeonSetup,
  checkDungeonTeam,
  dungeonStatus,
  healCommand,
  playerBonuses,
  resolveDungeonRun,
  simulateDungeon,
} from '@poke/game-core';
import type { DungeonCommand, DungeonSetup, GameContext } from '@poke/game-core';
import type {
  DungeonRecordDto,
  DungeonRunDto,
  CombatItemInput,
  StartDungeonInput,
  StoredDungeonResult,
  SwitchDungeonInput,
} from '@poke/shared';
import type { ContentCache } from '../content-cache';
import { GameError } from './errors';
import { recordGuildActivity } from './guilds';
import { newSeed, requireStartedProfile, startHour } from './expeditions';
import {
  addItems,
  assertAvailable,
  claimedRewards,
  playerProgress,
  recordPokedex,
  takeItems,
  toInstance,
} from './store';

/**
 * Donjons : combats en temps réel. Le serveur fige la mise en place au départ, enregistre les
 * changements de Pokémon du joueur et recalcule le combat (même simulation que le navigateur)
 * pour en connaître l'issue ; le résultat s'applique à la réclamation.
 */

export type DungeonRunRow = typeof dungeonRuns.$inferSelect;
type DungeonProgressRow = typeof dungeonProgress.$inferSelect;

/**
 * Retard toléré sur l'heure d'un changement de Pokémon envoyé par le navigateur (latence) : le
 * changement prend effet à l'instant où le joueur a cliqué, s'il date de moins que ça.
 */
export const SWITCH_TOLERANCE_MS = 1500;

/** Instant d'une action du joueur, recalé comme un changement de Pokémon. */
export function commandAtMs(
  requested: number,
  elapsed: number,
  commands: readonly DungeonCommand[],
): number {
  const last = commands.at(-1)?.atMs ?? 0;
  return Math.min(elapsed, Math.max(requested, last, elapsed - SWITCH_TOLERANCE_MS));
}

/**
 * Adversaires rencontrés pendant un combat terminé : ceux vaincus et celui qui se battait à la
 * fin (le premier est rencontré dès le départ).
 */
export function metEnemies(setup: DungeonSetup, defeated: number) {
  return setup.enemies.slice(0, Math.min(defeated + 1, setup.enemies.length));
}

/**
 * Commande « objet de soin » (Baie Sitrus) d'un combat en cours, après vérification de l'objet
 * et du Pokémon actif. `finished` : erreur d'un combat terminé (donjon ou dresseur).
 */
export function combatHealCommand(
  ctx: GameContext,
  combat: { setup: DungeonSetup; commands: DungeonCommand[]; fledAtMs: number | null },
  input: CombatItemInput,
  elapsed: number,
  finished: string,
): DungeonCommand {
  const effect = ctx.itemEffect(input.itemId, 'battleHeal');
  if (!effect) throw new GameError(400, 'NOT_A_BATTLE_ITEM');
  const atMs = commandAtMs(input.atMs, elapsed, combat.commands);
  const result = healCommand(
    combat.setup,
    combat.commands,
    combat.fledAtMs,
    atMs,
    input.itemId,
    effect.fraction,
    effect.cooldownSeconds * 1000,
  );
  if ('error' in result) {
    const code = result.error === 'FINISHED' ? finished : result.error;
    throw new GameError(409, code === 'COOLDOWN' ? 'ITEM_COOLDOWN' : code);
  }
  return result.command;
}

export function toDungeonRunDto(row: DungeonRunRow): DungeonRunDto {
  return {
    id: row.id,
    dungeonId: row.dungeonId,
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
    result: (row.result as StoredDungeonResult | null) ?? null,
  };
}

export function toDungeonRecordDto(row: DungeonProgressRow): DungeonRecordDto {
  return {
    dungeonId: row.dungeonId,
    wins: row.wins,
    losses: row.losses,
    gems: row.gems,
    firstWinAt: row.firstWinAt?.toISOString() ?? null,
    lastEndedAt: row.lastEndedAt?.toISOString() ?? null,
  };
}

export async function dungeonRecords(db: Db, userId: string): Promise<DungeonProgressRow[]> {
  return db.select().from(dungeonProgress).where(eq(dungeonProgress.ownerId, userId));
}

/** Tentative en cours (ou terminée, pas encore réclamée) du joueur. */
export async function activeDungeonRun(db: Db, userId: string): Promise<DungeonRunRow | undefined> {
  const [row] = await db
    .select()
    .from(dungeonRuns)
    .where(and(eq(dungeonRuns.ownerId, userId), isNull(dungeonRuns.claimedAt)));
  return row;
}

/** Dernière tentative réclamée (résultat à montrer au joueur s'il ne l'a pas encore vu). */
export async function lastDungeonRun(db: Db, userId: string): Promise<DungeonRunRow | undefined> {
  const [row] = await db
    .select()
    .from(dungeonRuns)
    .where(and(eq(dungeonRuns.ownerId, userId), isNotNull(dungeonRuns.claimedAt)))
    .orderBy(desc(dungeonRuns.claimedAt))
    .limit(1);
  return row;
}

/** Le joueur a vu le résultat d'une tentative réclamée : il ne s'affiche plus sur aucun appareil. */
export async function markDungeonResultSeen(db: Db, userId: string, runId: string, now: Date) {
  await db
    .update(dungeonRuns)
    .set({ resultSeenAt: now })
    .where(
      and(
        eq(dungeonRuns.id, runId),
        eq(dungeonRuns.ownerId, userId),
        isNotNull(dungeonRuns.claimedAt),
        isNull(dungeonRuns.resultSeenAt),
      ),
    );
}

/** Millisecondes écoulées depuis le départ, au plus le temps imparti. */
function elapsedMs(run: DungeonRunRow, now: Date): number {
  return Math.max(0, Math.min(now.getTime() - run.startedAt.getTime(), run.setup.timeLimitMs));
}

/** État du combat à l'instant `now`. */
export function runState(run: DungeonRunRow, now: Date) {
  return simulateDungeon(run.setup, run.commands, run.fledAtMs, elapsedMs(run, now)).state;
}

/**
 * Lance un donjon : vérifie qu'il est ouvert (lignée capturée, condition, temps de recharge),
 * qu'aucun autre n'est en cours, et l'équipe (disponible, du Pokédex de la région). Enregistre
 * l'attaque choisie pour chaque Pokémon, puis fige la mise en place du combat.
 */
export async function startDungeon(
  db: Db,
  content: ContentCache,
  userId: string,
  input: StartDungeonInput,
  now: Date,
): Promise<DungeonRunRow> {
  const ctx = await content.get();
  await requireStartedProfile(db, userId);
  const dungeon = ctx.dungeon(input.dungeonId);
  if (!dungeon) throw new GameError(404, 'DUNGEON_NOT_FOUND');

  return db.transaction(async (tx) => {
    const [progress, [record]] = await Promise.all([
      playerProgress(tx, ctx, userId),
      tx
        .select()
        .from(dungeonProgress)
        .where(and(eq(dungeonProgress.ownerId, userId), eq(dungeonProgress.dungeonId, dungeon.id))),
    ]);
    const status = dungeonStatus(ctx, dungeon, progress, record, now);
    if (status.state === 'hidden' || status.state === 'locked') {
      throw new GameError(403, 'DUNGEON_LOCKED');
    }
    if (status.state === 'cooldown') {
      throw new GameError(409, 'DUNGEON_COOLDOWN', { until: status.until.toISOString() });
    }
    if (await activeDungeonRun(tx, userId)) throw new GameError(409, 'DUNGEON_BUSY');

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
    const errors = checkDungeonTeam(ctx, dungeon, team);
    if (errors.length > 0) throw new GameError(400, 'TEAM_INVALID', { errors });

    for (const m of team) {
      await tx.update(pokemon).set({ dungeonMove: m.move }).where(eq(pokemon.id, m.id));
    }
    const setup = buildDungeonSetup(
      ctx,
      dungeon,
      team,
      newSeed(),
      startHour(now, input.utcOffsetMinutes),
    );
    const [row] = await tx
      .insert(dungeonRuns)
      .values({
        ownerId: userId,
        dungeonId: dungeon.id,
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

async function findRun(db: Db, userId: string, runId: string): Promise<DungeonRunRow> {
  const [run] = await db
    .select()
    .from(dungeonRuns)
    .where(and(eq(dungeonRuns.id, runId), eq(dungeonRuns.ownerId, userId)));
  if (!run) throw new GameError(404, 'DUNGEON_RUN_NOT_FOUND');
  if (run.claimedAt) throw new GameError(409, 'ALREADY_CLAIMED');
  return run;
}

/**
 * Envoie un Pokémon au combat. L'instant demandé (horloge du joueur) est recalé : ni dans le
 * futur, ni plus de `SWITCH_TOLERANCE_MS` dans le passé, ni avant le changement précédent.
 */
export async function switchDungeonMember(
  db: Db,
  userId: string,
  runId: string,
  input: SwitchDungeonInput,
  now: Date,
): Promise<DungeonRunRow> {
  const run = await findRun(db, userId, runId);
  const elapsed = elapsedMs(run, now);
  const atMs = commandAtMs(input.atMs, elapsed, run.commands);
  const state = simulateDungeon(run.setup, run.commands, run.fledAtMs, atMs).state;
  if (state.outcome !== null) throw new GameError(409, 'DUNGEON_FINISHED');
  if (input.member >= run.team.length || state.hp[input.member] === 0) {
    throw new GameError(409, 'MEMBER_KO');
  }
  if (input.member === state.active) throw new GameError(409, 'MEMBER_ACTIVE');
  if (state.recallReadyAt[input.member]! > atMs) throw new GameError(409, 'MEMBER_RECALLED');

  const command: DungeonCommand = { atMs, member: input.member };
  const [updated] = await db
    .update(dungeonRuns)
    .set({ commands: sql`${dungeonRuns.commands} || ${JSON.stringify([command])}::jsonb` })
    .where(and(eq(dungeonRuns.id, run.id), isNull(dungeonRuns.claimedAt)))
    .returning();
  if (!updated) throw new GameError(409, 'ALREADY_CLAIMED');
  return updated;
}

/** Donne un objet de soin (consommé) au Pokémon actif du donjon. */
export async function useDungeonItem(
  db: Db,
  content: ContentCache,
  userId: string,
  runId: string,
  input: CombatItemInput,
  now: Date,
): Promise<DungeonRunRow> {
  const ctx = await content.get();
  const run = await findRun(db, userId, runId);
  const command = combatHealCommand(ctx, run, input, elapsedMs(run, now), 'DUNGEON_FINISHED');
  return db.transaction(async (tx) => {
    if (!(await takeItems(tx, userId, input.itemId, 1))) {
      throw new GameError(409, 'ITEM_MISSING', { itemId: input.itemId });
    }
    const [updated] = await tx
      .update(dungeonRuns)
      .set({ commands: sql`${dungeonRuns.commands} || ${JSON.stringify([command])}::jsonb` })
      .where(and(eq(dungeonRuns.id, run.id), isNull(dungeonRuns.claimedAt)))
      .returning();
    if (!updated) throw new GameError(409, 'ALREADY_CLAIMED');
    return updated;
  });
}

/** Fuite : le combat s'arrête sans récompense (les Pokémon déjà K.O. le restent). */
export async function fleeDungeon(
  db: Db,
  userId: string,
  runId: string,
  now: Date,
): Promise<DungeonRunRow> {
  const run = await findRun(db, userId, runId);
  if (runState(run, now).outcome !== null) return run;
  const [updated] = await db
    .update(dungeonRuns)
    .set({ fledAtMs: elapsedMs(run, now) })
    .where(
      and(eq(dungeonRuns.id, run.id), isNull(dungeonRuns.claimedAt), isNull(dungeonRuns.fledAtMs)),
    )
    .returning();
  return updated ?? run;
}

/**
 * Réclame une tentative terminée : XP des adversaires vaincus, K.O., et en cas de victoire argent,
 * butin et peut-être la Méga-Gemme. Met à jour le bilan du donjon (temps de recharge).
 */
export async function claimDungeonRun(
  db: Db,
  content: ContentCache,
  userId: string,
  runId: string,
  now: Date,
): Promise<{ run: DungeonRunRow; currency: number }> {
  const found = await findRun(db, userId, runId);
  if (runState(found, now).outcome === null) {
    throw new GameError(409, 'NOT_FINISHED', { endsAt: found.endsAt });
  }
  const ctx = await content.version(found.contentVersionId);
  const dungeon = ctx.dungeon(found.dungeonId);
  if (!dungeon) throw new GameError(500, 'DUNGEON_MISSING_IN_VERSION');
  // Les quêtes de guilde suivent le contenu publié, pas la version de départ du donjon.
  const published = await content.get();

  return db.transaction(async (tx) => {
    // Verrou : seule la première réclamation passe.
    const [locked] = await tx
      .update(dungeonRuns)
      .set({ claimedAt: now })
      .where(and(eq(dungeonRuns.id, found.id), isNull(dungeonRuns.claimedAt)))
      .returning();
    if (!locked) throw new GameError(409, 'ALREADY_CLAIMED');

    // L'équipe était occupée : aucun Pokémon n'a pu être transféré entre-temps.
    const teamRows = await tx
      .select()
      .from(pokemon)
      .where(and(eq(pokemon.ownerId, userId), inArray(pokemon.id, found.team)));
    const byId = new Map(teamRows.map((r) => [r.id, toInstance(r)]));
    const team = found.team.flatMap((id) => byId.get(id) ?? []);
    const result = resolveDungeonRun(ctx, {
      dungeon,
      setup: found.setup,
      commands: found.commands,
      fledAtMs: found.fledAtMs,
      team,
      bonuses: playerBonuses(ctx, await claimedRewards(tx, userId)),
      hour: found.setup.hour,
    });
    const win = result.outcome === 'win';
    const endedAt = new Date(found.startedAt.getTime() + result.endedAtMs);
    // Les Pokémon mis K.O. le restent jusqu'à leurs soins au Centre Pokémon.
    const knockedOut = new Set(result.knockedOut);
    for (const m of result.team) {
      await tx
        .update(pokemon)
        .set({
          xp: m.xpAfter,
          level: m.levelAfter,
          happiness: m.happinessAfter,
          ...(knockedOut.has(m.id) && { knockedOut: true }),
        })
        .where(eq(pokemon.id, m.id));
    }
    await recordPokedex(tx, userId, {
      met: metEnemies(found.setup, result.defeated),
      caught: [],
      at: now,
    });
    await addItems(tx, userId, [
      ...result.loot,
      ...(result.gemItemId ? [{ itemId: result.gemItemId, quantity: 1 }] : []),
    ]);
    await recordGuildActivity(
      tx,
      published,
      userId,
      { dungeonsWon: win ? 1 : 0, money: result.money },
      now,
    );
    const [profile] = await tx
      .update(playerProfiles)
      .set({ currency: sql`${playerProfiles.currency} + ${result.money}` })
      .where(eq(playerProfiles.userId, userId))
      .returning({ currency: playerProfiles.currency });

    await tx
      .insert(dungeonProgress)
      .values({
        ownerId: userId,
        dungeonId: dungeon.id,
        wins: win ? 1 : 0,
        losses: win ? 0 : 1,
        gems: result.gemItemId ? 1 : 0,
        firstWinAt: win ? endedAt : null,
        lastEndedAt: endedAt,
      })
      .onConflictDoUpdate({
        target: [dungeonProgress.ownerId, dungeonProgress.dungeonId],
        set: {
          wins: sql`${dungeonProgress.wins} + excluded.wins`,
          losses: sql`${dungeonProgress.losses} + excluded.losses`,
          gems: sql`${dungeonProgress.gems} + excluded.gems`,
          firstWinAt: sql`coalesce(${dungeonProgress.firstWinAt}, excluded.first_win_at)`,
          lastEndedAt: sql`excluded.last_ended_at`,
        },
      });

    const stored: StoredDungeonResult = {
      ...result,
    };
    const [claimed] = await tx
      .update(dungeonRuns)
      .set({ outcome: result.outcome, result: stored })
      .where(eq(dungeonRuns.id, found.id))
      .returning();
    return { run: claimed!, currency: profile?.currency ?? 0 };
  });
}

/**
 * Réclame la tentative du joueur si elle est terminée (le joueur a quitté la page pendant le
 * combat) : ses Pokémon redeviennent disponibles. Sans effet sinon.
 */
export async function settleFinishedDungeonRun(
  db: Db,
  content: ContentCache,
  userId: string,
  now: Date,
): Promise<void> {
  const run = await activeDungeonRun(db, userId);
  if (!run || runState(run, now).outcome === null) return;
  await claimDungeonRun(db, content, userId, run.id, now).catch((err: unknown) => {
    // Réclamée entre-temps par une autre requête : rien à faire.
    if (!(err instanceof GameError && err.code === 'ALREADY_CLAIMED')) throw err;
  });
}
