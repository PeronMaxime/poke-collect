import type { ItemStack, Trainer, TrainerPokemon } from '@poke/content';
import { STAT_NAMES, types as typeData } from '@poke/data';
import type { Stats } from '@poke/data';
import type { GameContext } from './context';
import { addStacks, applyTeamXp, defeatXp, missingTypes, rollLoot } from './expedition';
import type { TeamMember, TeamMemberResult } from './expedition';
import { pokemonPower } from './pokemon';
import type { PokemonInstance } from './pokemon';
import type { PlayerProgress } from './progress';
import { isUnlocked } from './progress';
import { NO_BONUSES } from './progression';
import type { PlayerBonuses } from './progression';
import { createRng } from './rng';

// --- Table des types ---------------------------------------------------------------------

const typeChart = new Map(
  typeData.map((t) => [
    t.name,
    {
      double: new Set(t.doubleDamageTo),
      half: new Set(t.halfDamageTo),
      none: new Set(t.noDamageTo),
    },
  ]),
);

/** Multiplicateur d'une attaque d'un type contre un défenseur (produit sur ses types). */
export function typeEffectiveness(attackType: string, defenderTypes: readonly string[]): number {
  const chart = typeChart.get(attackType);
  if (!chart) return 1;
  return defenderTypes.reduce(
    (m, t) => m * (chart.none.has(t) ? 0 : chart.double.has(t) ? 2 : chart.half.has(t) ? 0.5 : 1),
    1,
  );
}

/**
 * Efficacité moyenne d'une équipe contre une autre, en log2 : chaque attaquant utilise son
 * meilleur type contre chaque défenseur ; ×2 compte +1, ×0,5 compte −1, immunité −2.
 */
function offenseScore(attackers: readonly string[][], defenders: readonly string[][]): number {
  let total = 0;
  let pairs = 0;
  for (const attacker of attackers) {
    for (const defender of defenders) {
      const best = Math.max(0, ...attacker.map((t) => typeEffectiveness(t, defender)));
      total += Math.log2(Math.min(4, Math.max(0.25, best)));
      pairs++;
    }
  }
  return pairs ? total / pairs : 0;
}

/**
 * Avantage de types du joueur, entre −1 (très défavorable) et +1 (très favorable) :
 * différence d'efficacité moyenne entre l'attaque du joueur et celle du dresseur.
 */
export function typeAdvantage(
  ctx: GameContext,
  team: readonly Pick<PokemonInstance, 'speciesId' | 'formId'>[],
  opponents: readonly Pick<PokemonInstance, 'speciesId' | 'formId'>[],
): number {
  const typesOf = (list: readonly Pick<PokemonInstance, 'speciesId' | 'formId'>[]) =>
    list.map((m) => ctx.species(m.speciesId, m.formId)?.types ?? []).filter((t) => t.length > 0);
  const mine = typesOf(team);
  const theirs = typesOf(opponents);
  const score = (offenseScore(mine, theirs) - offenseScore(theirs, mine)) / 2;
  return Math.min(1, Math.max(-1, score));
}

// --- Dresseurs ------------------------------------------------------------------------------

/** Pokémon d'un dresseur : IV uniformes, nature neutre par défaut (aucun aléatoire). */
export function trainerPokemonInstance(
  ctx: GameContext,
  member: TrainerPokemon,
): Pick<PokemonInstance, 'speciesId' | 'formId' | 'level' | 'ivs' | 'nature'> {
  const iv = member.iv ?? ctx.balance.battles.defaultTrainerIv;
  const ivs = Object.fromEntries(STAT_NAMES.map((s) => [s, iv])) as Stats;
  return {
    speciesId: member.speciesId,
    formId: member.formId ?? null,
    level: member.level,
    ivs,
    nature: member.nature ?? 'hardy',
  };
}

export function trainerMemberPower(ctx: GameContext, member: TrainerPokemon): number {
  const species = ctx.species(member.speciesId, member.formId);
  return species ? pokemonPower(species, trainerPokemonInstance(ctx, member)) : 0;
}

/** PE d'un dresseur : somme des PE de son équipe. */
export function trainerPower(ctx: GameContext, trainer: Pick<Trainer, 'team'>): number {
  return trainer.team.reduce((sum, m) => sum + trainerMemberPower(ctx, m), 0);
}

export const battleDurationMinutes = (ctx: GameContext, trainer: Trainer) =>
  trainer.durationMinutes ?? ctx.balance.battles.defaultDurationMinutes;
export const battleCooldownMinutes = (ctx: GameContext, trainer: Trainer) =>
  trainer.cooldownMinutes ?? ctx.balance.battles.cooldownMinutes;
export const battleKoMinutes = (ctx: GameContext, trainer: Trainer) =>
  trainer.koMinutes ?? ctx.balance.battles.koMinutes;

// --- Probabilité de victoire -----------------------------------------------------------------

/** Courbe de victoire selon le rapport des PE (après avantage de types). */
export function winProbabilityForRatio(ctx: GameContext, ratio: number): number {
  const { winCurveSteepness, minWinChance, maxWinChance } = ctx.balance.battles;
  const raw = ratio <= 0 ? 0 : 1 / (1 + ratio ** -winCurveSteepness);
  return Math.min(maxWinChance, Math.max(minWinChance, raw));
}

export interface BattleEstimate {
  playerPower: number;
  trainerPower: number;
  /** Avantage de types entre −1 et +1. */
  advantage: number;
  /** PE du joueur corrigée par l'avantage de types. */
  effectivePower: number;
  winProbability: number;
}

export function estimateBattle(
  ctx: GameContext,
  trainer: Trainer,
  team: readonly PokemonInstance[],
): BattleEstimate {
  const playerPower = team.reduce((sum, m) => {
    const species = ctx.species(m.speciesId, m.formId);
    return sum + (species ? pokemonPower(species, m) : 0);
  }, 0);
  const power = trainerPower(ctx, trainer);
  const advantage = typeAdvantage(ctx, team, trainer.team);
  const effectivePower = playerPower * (1 + ctx.balance.battles.typeAdvantageWeight * advantage);
  const ratio = power > 0 ? effectivePower / power : Infinity;
  return {
    playerPower,
    trainerPower: power,
    advantage,
    effectivePower,
    winProbability: team.length ? winProbabilityForRatio(ctx, ratio) : 0,
  };
}

// --- Conditions d'équipe ------------------------------------------------------------------------

export type BattleError =
  | { code: 'TEAM_EMPTY' }
  | { code: 'TEAM_TOO_LARGE'; max: number }
  | { code: 'TEAM_SIZE'; required: number }
  | { code: 'DUPLICATE_MEMBER' }
  | { code: 'LEVEL_TOO_HIGH'; maxLevel: number }
  | { code: 'FORBIDDEN_TYPES'; types: string[] }
  | { code: 'MISSING_TYPES'; missing: { type: string; count: number }[] }
  | { code: 'POWER_TOO_LOW'; power: number; minPower: number };

export function checkBattleTeam(
  ctx: GameContext,
  trainer: Trainer,
  team: readonly TeamMember[],
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
  const power = team.reduce((sum, m) => {
    const species = ctx.species(m.speciesId, m.formId);
    return sum + (species ? pokemonPower(species, m) : 0);
  }, 0);
  if (power < rules.minPower)
    errors.push({ code: 'POWER_TOO_LOW', power, minPower: rules.minPower });
  return errors;
}

// --- Disponibilité ------------------------------------------------------------------------------

/** Un Pokémon K.O. reste inutilisable jusqu'à `koUntil` (évaluation paresseuse). */
export function isKnockedOut(koUntil: Date | string | null, now: Date | number): boolean {
  if (koUntil === null) return false;
  return new Date(koUntil).getTime() > new Date(now).getTime();
}

export interface TrainerRecord {
  wins: number;
  lastWinAt: Date | string | null;
}

export type TrainerStatus =
  | { state: 'locked' }
  /** Dresseur unique déjà battu. */
  | { state: 'defeated' }
  | { state: 'cooldown'; until: Date }
  | { state: 'available' };

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
  if (!record || record.wins === 0) return { state: 'available' };
  if (!trainer.repeatable) return { state: 'defeated' };
  if (record.lastWinAt) {
    const until = new Date(
      new Date(record.lastWinAt).getTime() + battleCooldownMinutes(ctx, trainer) * 60_000,
    );
    if (until.getTime() > new Date(now).getTime()) return { state: 'cooldown', until };
  }
  return { state: 'available' };
}

// --- Résolution ------------------------------------------------------------------------------------

export interface BattleInput {
  trainer: Trainer;
  team: readonly TeamMember[];
  seed: number;
  /** Bonus permanents du joueur (paliers, collections) ; aucun par défaut. */
  bonuses?: PlayerBonuses;
}

export interface BattleResult {
  outcome: 'win' | 'loss';
  estimate: BattleEstimate;
  /** Tirage dans [0, 1) comparé à la probabilité de victoire (vérifiable). */
  roll: number;
  money: number;
  loot: ItemStack[];
  team: TeamMemberResult[];
  xpPerMember: number;
  /** Durée de K.O. infligée à l'équipe (0 en cas de victoire). */
  koMinutes: number;
}

/**
 * Résout un combat de façon déterministe (seed + contenu de la version active au lancement).
 * L'ordre des tirages est figé : victoire, puis butin.
 */
export function resolveBattle(ctx: GameContext, input: BattleInput): BattleResult {
  const { trainer, team } = input;
  const rules = ctx.balance.battles;
  const rng = createRng(input.seed);
  const estimate = estimateBattle(ctx, trainer, team);
  const roll = rng.next();
  const win = roll < estimate.winProbability;

  const baseXp = trainer.team.reduce((sum, m) => {
    const species = ctx.species(m.speciesId, m.formId);
    return sum + (species ? defeatXp(species, m.level) : 0);
  }, 0);
  const bonuses = input.bonuses ?? NO_BONUSES;
  const xpPerMember = Math.floor(
    baseXp * rules.xpMultiplier * bonuses.xp * (win ? 1 : rules.lossXpFraction),
  );

  const loot = new Map<string, number>();
  const table = trainer.lootTableId ? ctx.lootTable(trainer.lootTableId) : undefined;
  if (win && table) {
    for (let i = 0; i < trainer.lootRolls; i++) addStacks(loot, rollLoot(rng, table));
  }

  return {
    outcome: win ? 'win' : 'loss',
    estimate,
    roll,
    money: win ? Math.floor(trainer.money * bonuses.money) : 0,
    loot: [...loot].map(([itemId, quantity]) => ({ itemId, quantity })),
    team: applyTeamXp(ctx, team, xpPerMember, win ? rules.happinessOnWin : rules.happinessOnLoss),
    xpPerMember,
    koMinutes: win ? 0 : battleKoMinutes(ctx, trainer),
  };
}
