import type { Quest, QuestPokemon } from '@poke/content';
import { DUNGEON_STATS } from '@poke/content';
import type { GameContext } from './context';
import { applyTeamXp, defeatedXp, missingTypes } from './expedition';
import type { TeamMember, TeamMemberResult } from './expedition';
import type { PokemonInstance } from './pokemon';
import { outOfRegionSpecies } from './progress';
import { NO_BONUSES } from './progression';
import type { PlayerBonuses } from './progression';
import { abilityBonuses, abilityHappiness, teamMemberPowers } from './abilities';
import type { AbilityEnv } from './abilities';
import { buildCombatSetup, enemyFighters, hasInvalidMove, simulateDungeon } from './dungeon';
import type {
  CombatArena,
  DungeonCommand,
  DungeonFighter,
  DungeonMove,
  DungeonOutcome,
  DungeonSetup,
} from './dungeon';
import type { BattleError } from './battle';
import { MAX_MEGAS_PER_TEAM, megaCount } from './mega';

/**
 * Combats légendaires : une fois la récompense d'une quête réclamée, son légendaire (s'il n'est
 * pas fuyard) s'affronte seul contre l'équipe du joueur, avec le moteur des donjons. Renforcé
 * (PV et statistiques multipliés), il se déchaîne sous la moitié de ses PV. Vaincu, il se capture
 * d'une seule Ball, à chance fixe ; sinon le combat se retente après un délai.
 */

/** Pokémon d'une quête à capturer en combat légendaire (ni fuyard, ni déjà capturé). */
export function legendaryTarget(quest: Quest, pokemonCaught: number): QuestPokemon | undefined {
  const target = quest.rewards.pokemon[pokemonCaught];
  return target && target.roaming === null ? target : undefined;
}

/**
 * Quête dont ce Pokémon est le dernier légendaire capturé (combat ou fuyard), parmi les quêtes
 * réclamées : le relâcher l'y renvoie (combat et capture à refaire, ou fuyard qui erre de
 * nouveau). Une forme Méga compte comme sa forme de base.
 */
export function releasableQuest(
  ctx: GameContext,
  claimed: readonly { questId: string; pokemonCaught: number }[],
  p: { speciesId: number; formId: number | null; megaStone?: string | null },
): { questId: string; pokemonIndex: number } | undefined {
  const formId = p.megaStone ? null : p.formId;
  for (const { questId, pokemonCaught } of claimed) {
    const reward = ctx.quest(questId)?.rewards.pokemon[pokemonCaught - 1];
    if (reward && reward.speciesId === p.speciesId && (reward.formId ?? null) === formId) {
      return { questId, pokemonIndex: pokemonCaught - 1 };
    }
  }
  return undefined;
}

/** Niveau du légendaire en combat. */
export const legendaryBattleLevel = (target: QuestPokemon) => target.battle.level ?? target.level;

/** Le légendaire en combat : IV du combat, PV et statistiques multipliés, déchaînement. */
export function legendaryBoss(
  ctx: GameContext,
  target: QuestPokemon,
  isShiny = false,
): DungeonFighter | undefined {
  const { battle } = target;
  const [base] = enemyFighters(
    ctx,
    [
      {
        speciesId: target.speciesId,
        formId: target.formId ?? null,
        level: legendaryBattleLevel(target),
        iv: battle.iv,
        nature: null,
      },
    ],
    battle.iv,
    battle.hpMultiplier,
  );
  if (!base) return undefined;
  const stats = { ...base.stats };
  for (const stat of DUNGEON_STATS) {
    stats[stat] = Math.max(1, Math.round(stats[stat] * battle.statMultiplier));
  }
  return {
    ...base,
    isShiny,
    stats,
    ...(battle.enragePercent > 0 && {
      enrage: { hpFraction: battle.enrageHpFraction, percent: battle.enragePercent },
    }),
  };
}

/** Combat contre le légendaire (pas de lieu : sa météo vient de son talent). */
export function legendaryArena(
  ctx: GameContext,
  target: QuestPokemon,
  isShiny = false,
): CombatArena {
  const boss = legendaryBoss(ctx, target, isShiny);
  return {
    activity: 'battle',
    enemies: boss ? [boss] : [],
    timeLimitMs: target.battle.timeLimitSeconds * 1000,
    weather: null,
  };
}

/** Mise en place du combat légendaire : équipe (avec ses attaques), légendaire, réglages figés. */
export function buildLegendarySetup(
  ctx: GameContext,
  target: QuestPokemon,
  team: readonly (PokemonInstance & { move: DungeonMove | null })[],
  seed: number,
  hour: number | null,
  isShiny = false,
): DungeonSetup {
  return buildCombatSetup(ctx, legendaryArena(ctx, target, isShiny), team, seed, hour);
}

/** Environnement des talents pour un combat contre le légendaire. */
export function legendaryEnv(
  ctx: GameContext,
  target: QuestPokemon,
  team: readonly PokemonInstance[],
  hour?: number | null,
): AbilityEnv {
  const opponentTypes = ctx.species(target.speciesId, target.formId)?.types ?? [];
  return { activity: 'battle', team, opponentTypes: [...opponentTypes], hour, weather: null };
}

/** Conditions d'équipe du combat légendaire (mêmes erreurs que les combats de dresseurs). */
export function checkLegendaryTeam(
  ctx: GameContext,
  quest: Quest,
  target: QuestPokemon,
  team: readonly (TeamMember & { move?: DungeonMove | null })[],
  hour?: number | null,
): BattleError[] {
  const errors: BattleError[] = [];
  const { maxTeamSize } = ctx.balance.battles;
  const { battle } = target;
  if (team.length === 0) errors.push({ code: 'TEAM_EMPTY' });
  if (team.length > maxTeamSize) errors.push({ code: 'TEAM_TOO_LARGE', max: maxTeamSize });
  if (new Set(team.map((m) => m.id)).size !== team.length) {
    errors.push({ code: 'DUPLICATE_MEMBER' });
  }
  if (megaCount(team) > MAX_MEGAS_PER_TEAM) {
    errors.push({ code: 'TOO_MANY_MEGAS', max: MAX_MEGAS_PER_TEAM });
  }
  if (quest.regionId) {
    const outside = outOfRegionSpecies(ctx, quest.regionId, team);
    if (outside.length > 0) {
      errors.push({ code: 'WRONG_REGION', regionId: quest.regionId, speciesIds: outside });
    }
  }
  const missing = missingTypes(ctx, team, battle.requiredTypes);
  if (missing.length > 0) errors.push({ code: 'MISSING_TYPES', missing });
  const power = teamMemberPowers(ctx, team, legendaryEnv(ctx, target, team, hour)).reduce(
    (sum, p) => sum + p,
    0,
  );
  if (power < battle.minPower) {
    errors.push({ code: 'POWER_TOO_LOW', power, minPower: battle.minPower });
  }
  if (hasInvalidMove(ctx, team)) errors.push({ code: 'INVALID_MOVE' });
  return errors;
}

/** Dernière tentative contre le légendaire d'une quête. */
export interface LegendaryAttempt {
  /** Fin de la tentative : combat perdu ou fui, ou Ball lancée sans capture. */
  endedAt: Date | string;
}

/** Fin du délai avant de retenter le combat ; null = possible tout de suite. */
export function legendaryRetryAt(
  ctx: GameContext,
  last: LegendaryAttempt | undefined,
  now: Date | number,
): Date | null {
  if (!last) return null;
  const until = new Date(
    new Date(last.endedAt).getTime() + ctx.balance.legendary.retryCooldownMinutes * 60_000,
  );
  return until.getTime() > new Date(now).getTime() ? until : null;
}

/** Chance de capture du légendaire vaincu : fixe (celle de son combat), 100 % avec une Master Ball. */
export function legendaryCaptureChance(
  ctx: GameContext,
  target: QuestPokemon,
  ballItemId: string,
): number {
  const ball = ctx.itemEffect(ballItemId, 'ball');
  if (!ball) return 0;
  if (ball.guaranteed) return 1;
  return Math.min(1, target.battle.captureChance / 100);
}

/** XP gagnée par chaque membre en battant le légendaire. */
export function legendaryMaxXp(
  ctx: GameContext,
  target: QuestPokemon,
  bonuses: PlayerBonuses = NO_BONUSES,
  team?: readonly PokemonInstance[],
  hour?: number | null,
): number {
  const xpBonus = team
    ? abilityBonuses(ctx, legendaryEnv(ctx, target, team, hour), bonuses).xp
    : bonuses.xp;
  const xp = defeatedXp(ctx, [
    { speciesId: target.speciesId, formId: target.formId, level: legendaryBattleLevel(target) },
  ]);
  return Math.floor(xp * ctx.balance.legendary.xpMultiplier * xpBonus);
}

export interface LegendaryBattleResult {
  outcome: DungeonOutcome;
  /** Fin du combat, en millisecondes depuis le départ. */
  endedAtMs: number;
  xpPerMember: number;
  team: TeamMemberResult[];
  /** Pokémon mis K.O. (identifiants), indisponibles jusqu'à leurs soins au Centre Pokémon. */
  knockedOut: string[];
}

export interface LegendaryBattleInput {
  target: QuestPokemon;
  setup: DungeonSetup;
  commands: readonly DungeonCommand[];
  fledAtMs: number | null;
  /** Équipe actuelle (même ordre que `setup.team`), pour l'XP et le bonheur. */
  team: readonly TeamMember[];
  bonuses?: PlayerBonuses;
}

/**
 * Résultat d'un combat légendaire terminé : XP si le légendaire est vaincu (rien sinon), bonheur
 * et K.O. La capture se décide ensuite (une Ball, après une victoire).
 */
export function resolveLegendaryBattle(
  ctx: GameContext,
  input: LegendaryBattleInput,
): LegendaryBattleResult {
  const { setup } = input;
  const { state } = simulateDungeon(setup, input.commands, input.fledAtMs, setup.timeLimitMs);
  const outcome = state.outcome ?? 'timeout';
  const win = outcome === 'win';
  const fled = outcome === 'fled';
  const env: AbilityEnv = {
    activity: 'battle',
    team: input.team,
    opponentTypes: [...new Set(setup.enemies.flatMap((e) => e.types))],
    hour: setup.hour,
  };
  const bonuses = abilityBonuses(ctx, env, input.bonuses ?? NO_BONUSES);
  const rules = ctx.balance.battles;
  const baseXp = defeatedXp(ctx, setup.enemies.slice(0, state.defeated));
  const xpPerMember = Math.floor(baseXp * ctx.balance.legendary.xpMultiplier * bonuses.xp);
  const happiness = abilityHappiness(
    ctx,
    env,
    fled ? 0 : win ? rules.happinessOnWin : rules.happinessOnLoss,
  );
  return {
    outcome,
    endedAtMs: state.endedAtMs ?? setup.timeLimitMs,
    xpPerMember,
    team: applyTeamXp(ctx, input.team, xpPerMember, happiness, bonuses),
    knockedOut: input.team.filter((_, i) => state.hp[i] === 0).map((m) => m.id),
  };
}
