import { and, count, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { legendaryBattles, pokemon, questProgress } from '@poke/db';
import type { Db } from '@poke/db';
import {
  MAX_SHINY_CHAIN,
  buildLegendarySetup,
  checkLegendaryTeam,
  createRng,
  generateQuestPokemon,
  legendaryCaptureChance,
  legendaryRetryAt,
  legendaryTarget,
  playerBonuses,
  releasableQuest,
  resolveLegendaryBattle,
  shinyProbability,
  simulateDungeon,
} from '@poke/game-core';
import type { DungeonCommand, GameContext } from '@poke/game-core';
import type {
  CombatItemInput,
  LegendaryBattleDto,
  LegendaryCaptureInput,
  LegendaryQuestStateDto,
  StartLegendaryBattleInput,
  StoredLegendaryResult,
  SwitchDungeonInput,
} from '@poke/shared';
import type { ContentCache } from '../content-cache';
import { GameError } from './errors';
import { playerTransaction } from './tx';
import { combatHealCommand, commandAtMs, metEnemies } from './dungeons';
import { newSeed, requireStartedProfile, startHour } from './expeditions';
import {
  addItems,
  assertAvailable,
  claimedRewards,
  insertPokemon,
  pokemonActivities,
  recordPokedex,
  shinyCharm,
  takeItems,
  toInstance,
} from './store';
import type { PokemonRow } from './store';

/**
 * Combats légendaires : une fois la récompense d'une quête réclamée, son légendaire (s'il n'est
 * pas fuyard) s'affronte depuis l'onglet Quêtes, en temps réel comme un dresseur. Le combat
 * réglé (XP, K.O.), un légendaire vaincu attend une Ball : chance fixe, sans pitié. Une tentative
 * sans capture (défaite, fuite, Ball ratée) impose un délai avant la suivante.
 */

/** Un combat légendaire tel qu'il est enregistré. */
export type LegendaryBattleRow = typeof legendaryBattles.$inferSelect;

/** Graine du lancer de Ball (indépendante de celle du Pokémon capturé). */
const BALL_SEED_SALT = 0x5bd1e995;

/** Le combat légendaire tel que le jeu le reçoit. */
export function toLegendaryBattleDto(
  ctx: GameContext,
  row: LegendaryBattleRow,
): LegendaryBattleDto {
  const target = ctx.quest(row.questId)?.rewards.pokemon[row.pokemonIndex];
  return {
    id: row.id,
    questId: row.questId,
    pokemonIndex: row.pokemonIndex,
    team: row.team,
    setup: row.setup,
    commands: row.commands,
    fledAtMs: row.fledAtMs,
    contentVersionId: row.contentVersionId,
    isShiny: row.isShiny,
    startedAt: row.startedAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    claimedAt: row.claimedAt?.toISOString() ?? null,
    resultSeenAt: row.resultSeenAt?.toISOString() ?? null,
    outcome: row.outcome,
    result: (row.result as StoredLegendaryResult | null) ?? null,
    captureChance: target ? target.battle.captureChance / 100 : 0,
    ballItemId: row.ballItemId,
    captured: row.captured,
    capturedAt: row.capturedAt?.toISOString() ?? null,
    pokemonId: row.pokemonId,
    endedAt: row.endedAt?.toISOString() ?? null,
  };
}

/** Combat légendaire en cours (ou terminé, pas encore réglé) du joueur. */
export async function activeLegendaryBattle(
  db: Db,
  userId: string,
): Promise<LegendaryBattleRow | undefined> {
  const [row] = await db
    .select()
    .from(legendaryBattles)
    .where(and(eq(legendaryBattles.ownerId, userId), isNull(legendaryBattles.claimedAt)));
  return row;
}

/** Dernier combat légendaire réglé (résultat à montrer, Ball à lancer). */
export async function lastLegendaryBattle(
  db: Db,
  userId: string,
): Promise<LegendaryBattleRow | undefined> {
  const [row] = await db
    .select()
    .from(legendaryBattles)
    .where(and(eq(legendaryBattles.ownerId, userId), isNotNull(legendaryBattles.claimedAt)))
    .orderBy(desc(legendaryBattles.claimedAt))
    .limit(1);
  return row;
}

/** Légendaire vaincu en attente de la Ball (`captured` encore null). */
const awaitsBall = (row: LegendaryBattleRow) =>
  row.claimedAt !== null && row.outcome === 'win' && row.captured === null;

/**
 * Où en est le joueur avec chaque légendaire à combattre (quêtes réclamées) : tentatives, délai
 * avant la suivante, légendaire vaincu qui attend la Ball.
 */
export async function legendaryQuestStates(
  db: Db,
  ctx: GameContext,
  userId: string,
  now: Date,
): Promise<LegendaryQuestStateDto[]> {
  const claimed = await db
    .select({ questId: questProgress.questId, pokemonCaught: questProgress.pokemonCaught })
    .from(questProgress)
    .where(and(eq(questProgress.ownerId, userId), isNotNull(questProgress.claimedAt)));
  const targets = claimed.flatMap(({ questId, pokemonCaught }) => {
    const quest = ctx.quest(questId);
    return quest && legendaryTarget(quest, pokemonCaught)
      ? [{ questId, pokemonIndex: pokemonCaught }]
      : [];
  });
  if (targets.length === 0) return [];
  const rows = await db
    .select()
    .from(legendaryBattles)
    .where(
      and(
        eq(legendaryBattles.ownerId, userId),
        inArray(
          legendaryBattles.questId,
          targets.map((t) => t.questId),
        ),
      ),
    )
    .orderBy(desc(legendaryBattles.startedAt));
  return targets.map(({ questId, pokemonIndex }) => {
    const attempts = rows.filter((r) => r.questId === questId && r.pokemonIndex === pokemonIndex);
    const lastEnded = attempts.find((r) => r.endedAt);
    const pending = attempts.find(awaitsBall);
    const retryAt = legendaryRetryAt(
      ctx,
      lastEnded?.endedAt ? { endedAt: lastEnded.endedAt } : undefined,
      now,
    );
    return {
      questId,
      pokemonIndex,
      attempts: attempts.length,
      retryAt: retryAt?.toISOString() ?? null,
      pendingCapture: pending ? { id: pending.id, isShiny: pending.isShiny } : null,
    };
  });
}

/** Millisecondes écoulées depuis le départ, au plus le temps imparti. */
function elapsedMs(battle: LegendaryBattleRow, now: Date): number {
  return Math.max(
    0,
    Math.min(now.getTime() - battle.startedAt.getTime(), battle.setup.timeLimitMs),
  );
}

function legendaryBattleState(battle: LegendaryBattleRow, now: Date) {
  return simulateDungeon(battle.setup, battle.commands, battle.fledAtMs, elapsedMs(battle, now))
    .state;
}

/**
 * Lance le combat contre le légendaire d'une quête réclamée : le prochain Pokémon de la
 * récompense pas encore capturé, s'il n'est pas fuyard, sans légendaire vaincu en attente de Ball
 * ni délai en cours. Un seul combat légendaire à la fois. Le shiny se décide au départ : chaque
 * tentative précédente compte comme un maillon de chaîne.
 */
export async function startLegendaryBattle(
  db: Db,
  content: ContentCache,
  userId: string,
  questId: string,
  input: StartLegendaryBattleInput,
  now: Date,
): Promise<LegendaryBattleRow> {
  const ctx = await content.get();
  await requireStartedProfile(db, userId);
  const quest = ctx.quest(questId);
  if (!quest) throw new GameError(404, 'QUEST_NOT_FOUND');

  return playerTransaction(db, userId, async (tx) => {
    const [progress] = await tx
      .select()
      .from(questProgress)
      .where(and(eq(questProgress.ownerId, userId), eq(questProgress.questId, quest.id)));
    if (!progress?.claimedAt) throw new GameError(409, 'QUEST_NOT_CLAIMED');
    const pokemonIndex = progress.pokemonCaught;
    const reward = quest.rewards.pokemon[pokemonIndex];
    if (!reward) throw new GameError(409, 'QUEST_POKEMON_CAUGHT');
    // Un fuyard se trouve dans les expéditions ordinaires, pas en combat.
    const target = legendaryTarget(quest, pokemonIndex);
    if (!target) throw new GameError(409, 'QUEST_POKEMON_ROAMING');
    if (await activeLegendaryBattle(tx, userId)) throw new GameError(409, 'BATTLE_BUSY');

    const [state] = (await legendaryQuestStates(tx, ctx, userId, now)).filter(
      (s) => s.questId === quest.id,
    );
    if (state?.pendingCapture) throw new GameError(409, 'LEGENDARY_AWAITS_BALL');
    if (state?.retryAt) throw new GameError(409, 'LEGENDARY_COOLDOWN', { until: state.retryAt });

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
    const errors = checkLegendaryTeam(ctx, quest, target, team, hour);
    if (errors.length > 0) throw new GameError(400, 'TEAM_INVALID', { errors });

    for (const m of team) {
      await tx.update(pokemon).set({ dungeonMove: m.move }).where(eq(pokemon.id, m.id));
    }
    const [charm, claimed] = await Promise.all([
      shinyCharm(tx, ctx, userId),
      claimedRewards(tx, userId),
    ]);
    const seed = newSeed();
    const shinyChance = shinyProbability(ctx, {
      chain: Math.min(MAX_SHINY_CHAIN, state?.attempts ?? 0),
      charm,
      bonus: playerBonuses(ctx, claimed).shiny,
    });
    const isShiny = createRng(seed).chance(shinyChance);
    const setup = buildLegendarySetup(ctx, target, team, newSeed(), hour, isShiny);
    const [row] = await tx
      .insert(legendaryBattles)
      .values({
        ownerId: userId,
        questId: quest.id,
        pokemonIndex,
        team: input.team,
        setup,
        contentVersionId: ctx.content.versionId,
        seed,
        isShiny,
        startedAt: now,
        endsAt: new Date(now.getTime() + setup.timeLimitMs),
      })
      .returning();
    return row!;
  });
}

async function findBattle(db: Db, userId: string, battleId: string): Promise<LegendaryBattleRow> {
  const [battle] = await db
    .select()
    .from(legendaryBattles)
    .where(and(eq(legendaryBattles.id, battleId), eq(legendaryBattles.ownerId, userId)));
  if (!battle) throw new GameError(404, 'BATTLE_NOT_FOUND');
  if (battle.claimedAt) throw new GameError(409, 'ALREADY_CLAIMED');
  return battle;
}

async function appendCommand(db: Db, battle: LegendaryBattleRow, command: DungeonCommand) {
  const [updated] = await db
    .update(legendaryBattles)
    .set({ commands: sql`${legendaryBattles.commands} || ${JSON.stringify([command])}::jsonb` })
    .where(and(eq(legendaryBattles.id, battle.id), isNull(legendaryBattles.claimedAt)))
    .returning();
  if (!updated) throw new GameError(409, 'ALREADY_CLAIMED');
  return updated;
}

/** Envoie un Pokémon au combat (instant recalé comme pour les combats de dresseurs). */
export async function switchLegendaryMember(
  db: Db,
  userId: string,
  battleId: string,
  input: SwitchDungeonInput,
  now: Date,
): Promise<LegendaryBattleRow> {
  return playerTransaction(db, userId, async (tx) => {
    const battle = await findBattle(tx, userId, battleId);
    const atMs = commandAtMs(input.atMs, elapsedMs(battle, now), battle.commands);
    const state = simulateDungeon(battle.setup, battle.commands, battle.fledAtMs, atMs).state;
    if (state.outcome !== null) throw new GameError(409, 'BATTLE_FINISHED');
    if (input.member >= battle.team.length || state.hp[input.member] === 0) {
      throw new GameError(409, 'MEMBER_KO');
    }
    if (input.member === state.active) throw new GameError(409, 'MEMBER_ACTIVE');
    if (state.recallReadyAt[input.member]! > atMs) throw new GameError(409, 'MEMBER_RECALLED');
    return appendCommand(tx, battle, { atMs, member: input.member });
  });
}

/** Donne un objet de soin (consommé) au Pokémon actif. */
export async function useLegendaryItem(
  db: Db,
  content: ContentCache,
  userId: string,
  battleId: string,
  input: CombatItemInput,
  now: Date,
): Promise<LegendaryBattleRow> {
  const ctx = await content.get();
  return playerTransaction(db, userId, async (tx) => {
    const battle = await findBattle(tx, userId, battleId);
    const command = combatHealCommand(
      ctx,
      battle,
      input,
      elapsedMs(battle, now),
      'BATTLE_FINISHED',
    );
    if (!(await takeItems(tx, userId, input.itemId, 1))) {
      throw new GameError(409, 'ITEM_MISSING', { itemId: input.itemId });
    }
    return appendCommand(tx, battle, command);
  });
}

/** Fuite : le combat s'arrête sans XP (les Pokémon déjà K.O. le restent). */
export async function fleeLegendaryBattle(
  db: Db,
  userId: string,
  battleId: string,
  now: Date,
): Promise<LegendaryBattleRow> {
  return playerTransaction(db, userId, async (tx) => {
    const battle = await findBattle(tx, userId, battleId);
    if (legendaryBattleState(battle, now).outcome !== null) return battle;
    const [updated] = await tx
      .update(legendaryBattles)
      .set({ fledAtMs: elapsedMs(battle, now) })
      .where(
        and(
          eq(legendaryBattles.id, battle.id),
          isNull(legendaryBattles.claimedAt),
          isNull(legendaryBattles.fledAtMs),
        ),
      )
      .returning();
    return updated ?? battle;
  });
}

/**
 * Règle un combat terminé : XP (légendaire vaincu), bonheur, K.O., Pokédex. Une victoire attend
 * ensuite la Ball ; sinon la tentative se termine (début du délai avant la suivante).
 */
export async function claimLegendaryBattle(
  db: Db,
  content: ContentCache,
  userId: string,
  battleId: string,
  now: Date,
): Promise<LegendaryBattleRow> {
  const found = await findBattle(db, userId, battleId);
  if (legendaryBattleState(found, now).outcome === null) {
    throw new GameError(409, 'NOT_FINISHED', { endsAt: found.endsAt });
  }
  const ctx = await content.version(found.contentVersionId);
  const target = ctx.quest(found.questId)?.rewards.pokemon[found.pokemonIndex];
  if (!target) throw new GameError(500, 'QUEST_MISSING_IN_VERSION');

  return playerTransaction(db, userId, async (tx) => {
    const [locked] = await tx
      .update(legendaryBattles)
      .set({ claimedAt: now })
      .where(and(eq(legendaryBattles.id, found.id), isNull(legendaryBattles.claimedAt)))
      .returning();
    if (!locked) throw new GameError(409, 'ALREADY_CLAIMED');

    const teamRows = await tx
      .select()
      .from(pokemon)
      .where(and(eq(pokemon.ownerId, userId), inArray(pokemon.id, found.team)));
    const byId = new Map(teamRows.map((r) => [r.id, toInstance(r)]));
    const team = found.team.flatMap((id) => byId.get(id) ?? []);
    const result = resolveLegendaryBattle(ctx, {
      target,
      setup: found.setup,
      commands: found.commands,
      fledAtMs: found.fledAtMs,
      team,
      bonuses: playerBonuses(ctx, await claimedRewards(tx, userId)),
    });
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
      met: metEnemies(found.setup, 0),
      caught: [],
      at: now,
    });
    const win = result.outcome === 'win';
    const [claimed] = await tx
      .update(legendaryBattles)
      .set({
        outcome: result.outcome,
        result,
        ...(!win && { endedAt: new Date(found.startedAt.getTime() + result.endedAtMs) }),
      })
      .where(eq(legendaryBattles.id, found.id))
      .returning();
    return claimed!;
  });
}

/**
 * Lance une Ball sur le légendaire vaincu (une seule) : chance fixe du combat, garantie avec une
 * Master Ball. Capturé, il rejoint le PC (IV parfaits de la récompense) et la quête passe au
 * Pokémon suivant ; raté, il s'enfuit et la tentative se termine.
 */
export async function captureLegendary(
  db: Db,
  content: ContentCache,
  userId: string,
  battleId: string,
  input: LegendaryCaptureInput,
  now: Date,
): Promise<{ battle: LegendaryBattleRow; captured: PokemonRow | null }> {
  const [found] = await db
    .select()
    .from(legendaryBattles)
    .where(and(eq(legendaryBattles.id, battleId), eq(legendaryBattles.ownerId, userId)));
  if (!found) throw new GameError(404, 'BATTLE_NOT_FOUND');
  if (!awaitsBall(found)) throw new GameError(409, 'NOTHING_TO_CAPTURE');
  const ctx = await content.version(found.contentVersionId);
  const quest = ctx.quest(found.questId);
  const target = quest?.rewards.pokemon[found.pokemonIndex];
  if (!quest || !target) throw new GameError(500, 'QUEST_MISSING_IN_VERSION');
  if (!ctx.itemEffect(input.ballItemId, 'ball')) throw new GameError(400, 'NOT_A_BALL');

  return playerTransaction(db, userId, async (tx) => {
    const [locked] = await tx
      .update(legendaryBattles)
      .set({ ballItemId: input.ballItemId, capturedAt: now, captured: false })
      .where(and(eq(legendaryBattles.id, found.id), isNull(legendaryBattles.captured)))
      .returning();
    if (!locked) throw new GameError(409, 'ALREADY_CLAIMED');
    if (!(await takeItems(tx, userId, input.ballItemId, 1))) {
      throw new GameError(409, 'NOT_ENOUGH_ITEMS');
    }
    const chance = legendaryCaptureChance(ctx, target, input.ballItemId);
    const success = createRng((found.seed ^ BALL_SEED_SALT) >>> 0).chance(chance);
    if (!success) {
      const [missed] = await tx
        .update(legendaryBattles)
        .set({ endedAt: now })
        .where(eq(legendaryBattles.id, found.id))
        .returning();
      return { battle: missed!, captured: null };
    }
    // Shiny décidé au départ : le légendaire capturé est celui qu'on a combattu.
    const rng = createRng(found.seed);
    const caught = generateQuestPokemon(ctx, rng, target, found.isShiny ? 1 : 0);
    const [row] = await insertPokemon(tx, userId, [caught], {
      origin: 'quest',
      originRegion: quest.regionId,
      at: now,
    });
    await recordPokedex(tx, userId, { met: [], caught: [row!], at: now });
    await tx
      .update(questProgress)
      .set({ pokemonCaught: found.pokemonIndex + 1 })
      .where(
        and(
          eq(questProgress.ownerId, userId),
          eq(questProgress.questId, found.questId),
          eq(questProgress.pokemonCaught, found.pokemonIndex),
        ),
      );
    const [saved] = await tx
      .update(legendaryBattles)
      .set({ captured: true, pokemonId: row!.id })
      .where(eq(legendaryBattles.id, found.id))
      .returning();
    return { battle: saved!, captured: row! };
  });
}

/**
 * Relâche un légendaire capturé (le dernier de sa quête) : aucun Bonbon, mais la quête revient à
 * ce Pokémon, à recombattre et recapturer depuis l'onglet Quêtes (ou fuyard qui erre de nouveau).
 * Capturé avant la réécriture des quêtes (`restartOnRelease`), il fait recommencer toute la quête.
 * La Méga-Gemme tenue revient dans le sac.
 */
export async function releaseLegendary(
  db: Db,
  content: ContentCache,
  userId: string,
  pokemonId: string,
): Promise<{ questId: string; restarted: boolean }> {
  const ctx = await content.get();
  await requireStartedProfile(db, userId);
  return playerTransaction(db, userId, async (tx) => {
    const [row] = await tx
      .select()
      .from(pokemon)
      .where(and(eq(pokemon.ownerId, userId), eq(pokemon.id, pokemonId)));
    if (!row) throw new GameError(404, 'POKEMON_NOT_FOUND');
    if (row.locked) throw new GameError(409, 'POKEMON_LOCKED');
    if ((await pokemonActivities(tx, userId)).has(row.id)) {
      throw new GameError(409, 'POKEMON_BUSY');
    }
    const claimed = await tx
      .select({
        questId: questProgress.questId,
        pokemonCaught: questProgress.pokemonCaught,
        restartOnRelease: questProgress.restartOnRelease,
      })
      .from(questProgress)
      .where(and(eq(questProgress.ownerId, userId), isNotNull(questProgress.claimedAt)));
    const match = releasableQuest(ctx, claimed, row);
    if (!match) throw new GameError(409, 'NOT_RELEASABLE');
    // Combat du Pokémon suivant de la même quête en cours : sa capture ne retrouverait plus sa place.
    const [running] = await tx
      .select({ id: legendaryBattles.id })
      .from(legendaryBattles)
      .where(
        and(
          eq(legendaryBattles.ownerId, userId),
          eq(legendaryBattles.questId, match.questId),
          sql`(${legendaryBattles.claimedAt} is null or (${legendaryBattles.outcome} = 'win' and ${legendaryBattles.captured} is null))`,
        ),
      );
    if (running) throw new GameError(409, 'LEGENDARY_BATTLE_RUNNING');
    const [{ value: owned } = { value: 0 }] = await tx
      .select({ value: count() })
      .from(pokemon)
      .where(eq(pokemon.ownerId, userId));
    if (owned <= 1) throw new GameError(409, 'LAST_POKEMON');

    const deleted = await tx
      .delete(pokemon)
      .where(and(eq(pokemon.ownerId, userId), eq(pokemon.id, row.id)))
      .returning({ id: pokemon.id });
    if (deleted.length === 0) throw new GameError(404, 'POKEMON_NOT_FOUND');
    if (row.megaStone) await addItems(tx, userId, [{ itemId: row.megaStone, quantity: 1 }]);
    const where = and(
      eq(questProgress.ownerId, userId),
      eq(questProgress.questId, match.questId),
      eq(questProgress.pokemonCaught, match.pokemonIndex + 1),
    );
    // Légendaire capturé avant la réécriture des quêtes : toute la nouvelle quête est à refaire
    // (sa ligne revient à l'étape 0 à la prochaine synchronisation, récompense comprise).
    const restarted = claimed.some((q) => q.questId === match.questId && q.restartOnRelease);
    const reset = restarted
      ? await tx.delete(questProgress).where(where).returning({ questId: questProgress.questId })
      : await tx
          .update(questProgress)
          .set({ pokemonCaught: match.pokemonIndex, roamerHideout: null })
          .where(where)
          .returning({ questId: questProgress.questId });
    if (reset.length === 0) throw new GameError(409, 'NOT_RELEASABLE');
    return { questId: match.questId, restarted };
  });
}

/** Le joueur a vu le résultat d'un combat réglé : il ne s'affiche plus sur aucun appareil. */
export async function markLegendaryResultSeen(db: Db, userId: string, battleId: string, now: Date) {
  await db
    .update(legendaryBattles)
    .set({ resultSeenAt: now })
    .where(
      and(
        eq(legendaryBattles.id, battleId),
        eq(legendaryBattles.ownerId, userId),
        isNotNull(legendaryBattles.claimedAt),
        isNull(legendaryBattles.resultSeenAt),
      ),
    );
}

/**
 * Règle le combat légendaire du joueur s'il est terminé (page quittée pendant le combat) : ses
 * Pokémon redeviennent disponibles. Renvoie vrai si un combat est encore en cours.
 */
export async function settleFinishedLegendaryBattle(
  db: Db,
  content: ContentCache,
  userId: string,
  now: Date,
): Promise<boolean> {
  const battle = await activeLegendaryBattle(db, userId);
  if (!battle) return false;
  if (legendaryBattleState(battle, now).outcome === null) return true;
  await claimLegendaryBattle(db, content, userId, battle.id, now).catch((err: unknown) => {
    if (!(err instanceof GameError && err.code === 'ALREADY_CLAIMED')) throw err;
  });
  return false;
}
