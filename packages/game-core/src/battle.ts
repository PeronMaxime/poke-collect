import type { ItemStack, Trainer, TrainerPokemon } from '@poke/content';
import { typeEffectiveness } from '@poke/data';
import type { GameContext } from './context';
import { addStacks, applyTeamXp, defeatedXp, missingTypes, rollLoot } from './expedition';
import type { TeamMember, TeamMemberResult } from './expedition';
import { pokemonPower } from './pokemon';
import type { PokemonInstance } from './pokemon';
import type { PlayerProgress } from './progress';
import { isUnlocked, outOfRegionSpecies } from './progress';
import { NO_BONUSES } from './progression';
import type { PlayerBonuses } from './progression';
import { abilityBonuses, abilityHappiness, scaledByAbility, teamMemberPowers } from './abilities';
import type { AbilityEnv } from './abilities';
import {
  buildCombatSetup,
  combatWeather,
  dungeonOpponentInstance,
  enemyFighters,
  hasInvalidMove,
  simulateDungeon,
} from './dungeon';
import type {
  CombatArena,
  DungeonCommand,
  DungeonFighter,
  DungeonMove,
  DungeonOutcome,
  DungeonSetup,
} from './dungeon';
import { createRng } from './rng';
import { zoneWeather } from './weather';
import { MAX_MEGAS_PER_TEAM, megaCount } from './mega';

/**
 * Combats de dresseurs : le même combat en temps réel que les donjons (`simulateDungeon`), contre
 * l'équipe du dresseur dans l'ordre. La mise en place est figée au départ ; le serveur et le
 * navigateur rejouent le combat à partir d'elle et des changements de Pokémon du joueur.
 */

export { typeEffectiveness };

// --- Dresseurs ------------------------------------------------------------------------------

/** Pokémon d'un dresseur : IV uniformes, nature neutre par défaut (aucun aléatoire). */
export function trainerPokemonInstance(ctx: GameContext, member: TrainerPokemon) {
  return dungeonOpponentInstance(member, ctx.balance.battles.defaultTrainerIv);
}

export function trainerMemberPower(ctx: GameContext, member: TrainerPokemon): number {
  const species = ctx.species(member.speciesId, member.formId);
  return species ? pokemonPower(species, trainerPokemonInstance(ctx, member)) : 0;
}

/** PE d'un dresseur : somme des PE de son équipe (indication pour le joueur). */
export function trainerPower(ctx: GameContext, trainer: Pick<Trainer, 'team'>): number {
  return trainer.team.reduce((sum, m) => sum + trainerMemberPower(ctx, m), 0);
}

/** Pokémon du dresseur, dans l'ordre où ils entrent en combat. */
export function trainerEnemies(ctx: GameContext, trainer: Pick<Trainer, 'team'>): DungeonFighter[] {
  return enemyFighters(ctx, trainer.team, ctx.balance.battles.defaultTrainerIv);
}

/** Météo de la zone du dresseur (s'il en a une) à l'instant `at` ; absente = temps clair. */
function trainerPlaceWeather(
  ctx: GameContext,
  trainer: Pick<Trainer, 'zoneId'>,
  at: Date | number | null | undefined,
) {
  const zone = trainer.zoneId ? ctx.zone(trainer.zoneId) : undefined;
  return zone && at != null ? zoneWeather(zone, at) : null;
}

/** Combat contre un dresseur, lancé à `startedAt` (météo de sa zone à cet instant). */
export function trainerArena(
  ctx: GameContext,
  trainer: Trainer,
  startedAt?: Date | number | null,
): CombatArena {
  return {
    activity: 'battle',
    enemies: trainerEnemies(ctx, trainer),
    timeLimitMs: trainer.timeLimitSeconds * 1000,
    weather: trainerPlaceWeather(ctx, trainer, startedAt),
  };
}

/**
 * Météo d'un combat de dresseur : imposée par un talent (équipe, puis adversaires), sinon celle
 * de la zone du dresseur au lancement.
 */
export function battleWeather(
  ctx: GameContext,
  trainer: Trainer,
  team: readonly PokemonInstance[],
  hour: number | null = null,
  startedAt?: Date | number | null,
) {
  return combatWeather(ctx, trainerArena(ctx, trainer, startedAt), team, hour);
}

/** Mise en place d'un combat contre un dresseur : équipe (avec ses attaques), adversaires, réglages. */
export function buildBattleSetup(
  ctx: GameContext,
  trainer: Trainer,
  team: readonly (PokemonInstance & { move: DungeonMove | null })[],
  seed: number,
  hour: number | null,
  startedAt: Date | number,
): DungeonSetup {
  return buildCombatSetup(ctx, trainerArena(ctx, trainer, startedAt), team, seed, hour);
}

/** Environnement des talents pour un combat contre `trainer`. */
export function battleEnv(
  ctx: GameContext,
  trainer: Pick<Trainer, 'team'> & Partial<Pick<Trainer, 'zoneId'>>,
  team: readonly PokemonInstance[],
  hour?: number | null,
  startedAt?: Date | number | null,
): AbilityEnv {
  const opponentTypes = [
    ...new Set(trainer.team.flatMap((m) => ctx.species(m.speciesId, m.formId)?.types ?? [])),
  ];
  const weather = trainerPlaceWeather(ctx, { zoneId: trainer.zoneId ?? null }, startedAt);
  return { activity: 'battle', team, opponentTypes, hour, weather };
}

export const battleCooldownMinutes = (ctx: GameContext, trainer: Trainer) =>
  trainer.cooldownMinutes ?? ctx.balance.battles.cooldownMinutes;

// --- Conditions d'équipe ------------------------------------------------------------------------

export type BattleError =
  | { code: 'TEAM_EMPTY' }
  | { code: 'TEAM_TOO_LARGE'; max: number }
  | { code: 'TEAM_SIZE'; required: number }
  | { code: 'DUPLICATE_MEMBER' }
  /** Plus d'un Pokémon Méga-Évolué. */
  | { code: 'TOO_MANY_MEGAS'; max: number }
  /** Espèces hors du Pokédex de la région du dresseur. */
  | { code: 'WRONG_REGION'; regionId: string; speciesIds: number[] }
  | { code: 'LEVEL_TOO_HIGH'; maxLevel: number }
  | { code: 'FORBIDDEN_TYPES'; types: string[] }
  | { code: 'MISSING_TYPES'; missing: { type: string; count: number }[] }
  | { code: 'POWER_TOO_LOW'; power: number; minPower: number }
  /** Une attaque choisie n'est pas d'un type du Pokémon. */
  | { code: 'INVALID_MOVE' };

export function checkBattleTeam(
  ctx: GameContext,
  trainer: Trainer,
  team: readonly (TeamMember & { move?: DungeonMove | null })[],
  hour?: number | null,
  startedAt?: Date | number | null,
): BattleError[] {
  const errors: BattleError[] = [];
  const { rules } = trainer;
  const { maxTeamSize } = ctx.balance.battles;
  if (team.length === 0) errors.push({ code: 'TEAM_EMPTY' });
  if (team.length > maxTeamSize) errors.push({ code: 'TEAM_TOO_LARGE', max: maxTeamSize });
  if (rules.teamSize !== null && team.length > 0 && team.length !== rules.teamSize) {
    errors.push({ code: 'TEAM_SIZE', required: rules.teamSize });
  }
  if (new Set(team.map((m) => m.id)).size !== team.length) {
    errors.push({ code: 'DUPLICATE_MEMBER' });
  }
  if (megaCount(team) > MAX_MEGAS_PER_TEAM) {
    errors.push({ code: 'TOO_MANY_MEGAS', max: MAX_MEGAS_PER_TEAM });
  }
  const outside = outOfRegionSpecies(ctx, trainer.regionId, team);
  if (outside.length > 0) {
    errors.push({ code: 'WRONG_REGION', regionId: trainer.regionId, speciesIds: outside });
  }
  if (rules.maxLevel !== null && team.some((m) => m.level > rules.maxLevel!)) {
    errors.push({ code: 'LEVEL_TOO_HIGH', maxLevel: rules.maxLevel });
  }
  const forbidden = new Set(rules.forbiddenTypes);
  const used = [
    ...new Set(team.flatMap((m) => ctx.species(m.speciesId, m.formId)?.types ?? [])),
  ].filter((t) => forbidden.has(t));
  if (used.length > 0) errors.push({ code: 'FORBIDDEN_TYPES', types: used });
  const missing = missingTypes(ctx, team, rules.requiredTypes);
  if (missing.length > 0) errors.push({ code: 'MISSING_TYPES', missing });
  const power = teamMemberPowers(ctx, team, battleEnv(ctx, trainer, team, hour, startedAt)).reduce(
    (sum, p) => sum + p,
    0,
  );
  if (power < rules.minPower)
    errors.push({ code: 'POWER_TOO_LOW', power, minPower: rules.minPower });
  if (hasInvalidMove(ctx, team)) errors.push({ code: 'INVALID_MOVE' });
  return errors;
}

export interface TrainerRecord {
  wins: number;
  /** Fin du dernier combat (début du temps de recharge d'un dresseur répétable). */
  lastEndedAt: Date | string | null;
}

export type TrainerStatus =
  | { state: 'locked' }
  /** Dresseur unique déjà battu. */
  | { state: 'defeated' }
  | { state: 'cooldown'; until: Date }
  | { state: 'available' };

/**
 * Un dresseur unique se retente aussitôt après une défaite et ne se combat plus une fois battu ;
 * un dresseur répétable se repose après chaque combat.
 */
export function trainerStatus(
  ctx: GameContext,
  trainer: Trainer,
  progress: PlayerProgress,
  record: TrainerRecord | undefined,
  now: Date | number,
): TrainerStatus {
  const region = ctx.region(trainer.regionId);
  if (!region || !isUnlocked(ctx, region.unlock, progress)) return { state: 'locked' };
  if (!isUnlocked(ctx, trainer.unlock, progress)) return { state: 'locked' };
  if (!trainer.repeatable) {
    return record && record.wins > 0 ? { state: 'defeated' } : { state: 'available' };
  }
  if (record?.lastEndedAt) {
    const until = new Date(
      new Date(record.lastEndedAt).getTime() + battleCooldownMinutes(ctx, trainer) * 60_000,
    );
    if (until.getTime() > new Date(now).getTime()) return { state: 'cooldown', until };
  }
  return { state: 'available' };
}

// --- Résultat ------------------------------------------------------------------------------------

export interface BattleResult {
  outcome: DungeonOutcome;
  /** Fin du combat, en millisecondes depuis le départ. */
  endedAtMs: number;
  /** Pokémon du dresseur vaincus. */
  defeated: number;
  xpPerMember: number;
  team: TeamMemberResult[];
  /** Pokémon mis K.O. (identifiants), indisponibles jusqu'à leurs soins au Centre Pokémon. */
  knockedOut: string[];
  money: number;
  loot: ItemStack[];
}

export interface BattleInput {
  trainer: Trainer;
  setup: DungeonSetup;
  commands: readonly DungeonCommand[];
  fledAtMs: number | null;
  /** Équipe actuelle (même ordre que `setup.team`), pour l'XP et le bonheur. */
  team: readonly TeamMember[];
  /** Bonus permanents du joueur (paliers, collections) ; aucun par défaut. */
  bonuses?: PlayerBonuses;
}

/** Environnement des talents d'un combat figé (types de toute l'équipe adverse). */
function setupEnv(setup: DungeonSetup, team: readonly PokemonInstance[]): AbilityEnv {
  const opponentTypes = [...new Set(setup.enemies.flatMap((e) => e.types))];
  return { activity: 'battle', team, opponentTypes, hour: setup.hour };
}

/**
 * XP gagnée par chaque membre si toute l'équipe du dresseur est vaincue (talents de `team`
 * compris s'il est fourni).
 */
export function battleMaxXp(
  ctx: GameContext,
  trainer: Trainer,
  bonuses: PlayerBonuses = NO_BONUSES,
  team?: readonly PokemonInstance[],
  hour?: number | null,
): number {
  const xpBonus = team
    ? abilityBonuses(ctx, battleEnv(ctx, trainer, team, hour), bonuses).xp
    : bonuses.xp;
  return Math.floor(defeatedXp(ctx, trainer.team) * ctx.balance.battles.xpMultiplier * xpBonus);
}

/**
 * Résultat d'un combat terminé : XP des Pokémon adverses vaincus (rien en cas de fuite), K.O., et
 * en cas de victoire argent et butin (tirages déterminés par le seed de la mise en place).
 */
export function resolveBattle(ctx: GameContext, input: BattleInput): BattleResult {
  const { trainer, setup } = input;
  const rules = ctx.balance.battles;
  const { state } = simulateDungeon(setup, input.commands, input.fledAtMs, setup.timeLimitMs);
  const outcome = state.outcome ?? 'timeout';
  const win = outcome === 'win';
  const fled = outcome === 'fled';
  const env = setupEnv(setup, input.team);
  const bonuses = abilityBonuses(ctx, env, input.bonuses ?? NO_BONUSES);

  const baseXp = defeatedXp(ctx, setup.enemies.slice(0, state.defeated));
  const xpPerMember = fled ? 0 : Math.floor(baseXp * rules.xpMultiplier * bonuses.xp);
  const happiness = abilityHappiness(
    ctx,
    env,
    fled ? 0 : win ? rules.happinessOnWin : rules.happinessOnLoss,
  );

  const loot = new Map<string, number>();
  const table = trainer.lootTableId ? ctx.lootTable(trainer.lootTableId) : undefined;
  if (win && table) {
    const rng = createRng(setup.seed ^ 0x5bd1e995);
    const rolls = scaledByAbility(ctx, env, 'lootRolls', trainer.lootRolls);
    for (let i = 0; i < rolls; i++) addStacks(loot, rollLoot(rng, table));
  }

  return {
    outcome,
    endedAtMs: state.endedAtMs ?? setup.timeLimitMs,
    defeated: state.defeated,
    xpPerMember,
    team: applyTeamXp(ctx, input.team, xpPerMember, happiness),
    knockedOut: input.team.filter((_, i) => state.hp[i] === 0).map((m) => m.id),
    money: win ? Math.floor(trainer.money * bonuses.money) : 0,
    loot: [...loot].map(([itemId, quantity]) => ({ itemId, quantity })),
  };
}
