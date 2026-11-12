import type { Dungeon, ItemStack } from '@poke/content';
import type { GameContext } from '../context';
import { addStacks, applyTeamXp, defeatedXp, rollLoot } from '../expedition';
import type { TeamMember, TeamMemberResult } from '../expedition';
import type { PokemonInstance } from '../pokemon';
import { NO_BONUSES } from '../progression';
import type { PlayerBonuses } from '../progression';
import { abilityBonuses, abilityHappiness, scaledByAbility } from '../abilities';
import type { AbilityEnv } from '../abilities';
import { createRng } from '../rng';
import { simulateDungeon } from './simulation';
import type { DungeonOutcome } from './state';
import type { DungeonCommand, DungeonSetup } from './types';

/**
 * Ce qu'une tentative terminée rapporte : XP, butin, bonheur.
 */

/** Ce qu'une tentative de donjon terminée rapporte. */
export interface DungeonResult {
  outcome: DungeonOutcome;
  /** Fin du combat, en millisecondes depuis le départ. */
  endedAtMs: number;
  defeated: number;
  xpPerMember: number;
  team: TeamMemberResult[];
  /** Pokémon mis K.O. (identifiants), indisponibles jusqu'à leurs soins au Centre Pokémon. */
  knockedOut: string[];
  money: number;
  loot: ItemStack[];
  /** Méga-Gemme obtenue (null = aucune). */
  gemItemId: string | null;
  /** Tirage de la gemme, comparé à sa probabilité (null hors victoire). */
  gemRoll: number | null;
}

/** Ce qu'il faut pour résoudre une tentative de donjon terminée. */
export interface DungeonRunInput {
  dungeon: Dungeon;
  setup: DungeonSetup;
  commands: readonly DungeonCommand[];
  fledAtMs: number | null;
  /** Équipe actuelle (même ordre que `setup.team`), pour l'XP et le bonheur. */
  team: readonly TeamMember[];
  bonuses?: PlayerBonuses;
  /** Heure locale du joueur au départ (talents de jour ou de nuit). */
  hour?: number | null;
}

/** Environnement des talents pour un donjon (types de tous les adversaires). */
export function dungeonEnv(
  setup: Pick<DungeonSetup, 'enemies'>,
  team: readonly PokemonInstance[],
  hour?: number | null,
): AbilityEnv {
  const opponentTypes = [...new Set(setup.enemies.flatMap((e) => e.types))];
  return { activity: 'dungeon', team, opponentTypes, hour };
}

/**
 * XP gagnée par chaque membre si tous les adversaires du donjon sont vaincus (talents de `team`
 * compris s'il est fourni).
 */
export function dungeonMaxXp(
  ctx: GameContext,
  dungeon: Dungeon,
  bonuses: PlayerBonuses = NO_BONUSES,
  team?: readonly PokemonInstance[],
  hour?: number | null,
): number {
  const enemies = [...dungeon.opponents, dungeon.boss];
  const baseXp = defeatedXp(ctx, enemies);
  let xpBonus = bonuses.xp;
  if (team) {
    const opponentTypes = [
      ...new Set(enemies.flatMap((e) => ctx.species(e.speciesId, e.formId)?.types ?? [])),
    ];
    xpBonus = abilityBonuses(ctx, { activity: 'dungeon', team, opponentTypes, hour }, bonuses).xp;
  }
  return Math.floor(baseXp * ctx.balance.dungeons.xpMultiplier * xpBonus);
}

/**
 * Résultat d'une tentative terminée : XP des adversaires vaincus (rien en cas de fuite), K.O.,
 * et en cas de victoire argent, butin et chance de Méga-Gemme (tirages : gemme, puis butin).
 */
export function resolveDungeonRun(ctx: GameContext, input: DungeonRunInput): DungeonResult {
  const { dungeon, setup } = input;
  const rules = ctx.balance.dungeons;
  const { state } = simulateDungeon(setup, input.commands, input.fledAtMs, setup.timeLimitMs);
  const outcome = state.outcome ?? 'timeout';
  const win = outcome === 'win';
  const fled = outcome === 'fled';
  const env = dungeonEnv(setup, input.team, input.hour);
  const bonuses = abilityBonuses(ctx, env, input.bonuses ?? NO_BONUSES);

  const baseXp = defeatedXp(ctx, setup.enemies.slice(0, state.defeated));
  const xpPerMember = fled ? 0 : Math.floor(baseXp * rules.xpMultiplier * bonuses.xp);
  const happiness = abilityHappiness(
    ctx,
    env,
    fled ? 0 : win ? rules.happinessOnWin : rules.happinessOnLoss,
  );

  let gemItemId: string | null = null;
  let gemRoll: number | null = null;
  const loot = new Map<string, number>();
  if (win) {
    const rng = createRng(setup.seed ^ 0x5bd1e995);
    gemRoll = rng.next();
    if (dungeon.gemItemId && gemRoll < dungeon.gemChance) gemItemId = dungeon.gemItemId;
    const table = dungeon.lootTableId ? ctx.lootTable(dungeon.lootTableId) : undefined;
    const rolls = scaledByAbility(ctx, env, 'lootRolls', dungeon.lootRolls);
    if (table) for (let i = 0; i < rolls; i++) addStacks(loot, rollLoot(rng, table));
  }

  return {
    outcome,
    endedAtMs: state.endedAtMs ?? setup.timeLimitMs,
    defeated: state.defeated,
    xpPerMember,
    team: applyTeamXp(ctx, input.team, xpPerMember, happiness, bonuses),
    knockedOut: input.team.filter((_, i) => state.hp[i] === 0).map((m) => m.id),
    money: win ? Math.floor(dungeon.money * bonuses.money) : 0,
    loot: [...loot].map(([itemId, quantity]) => ({ itemId, quantity })),
    gemItemId,
    gemRoll,
  };
}
