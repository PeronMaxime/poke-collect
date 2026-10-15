import type {
  Dungeon,
  DungeonAttack,
  DungeonDifficultySettings,
  DungeonSettings,
  ItemStack,
  TrainerPokemon,
} from '@poke/content';
import { STAT_NAMES, typeEffectiveness, types as typeData } from '@poke/data';
import type { Stats } from '@poke/data';
import type { GameContext, GameSpecies } from './context';
import { addStacks, applyTeamXp, defeatXp, rollLoot } from './expedition';
import type { TeamMember, TeamMemberResult } from './expedition';
import { computeStats } from './pokemon';
import type { PokemonInstance } from './pokemon';
import type { PlayerProgress } from './progress';
import { isRegionalSpecies, isUnlocked } from './progress';
import { NO_BONUSES } from './progression';
import type { PlayerBonuses } from './progression';
import { createRng } from './rng';
import { MAX_MEGAS_PER_TEAM, megaCount } from './mega';

/**
 * Donjons : combats en temps réel contre une suite d'adversaires, jusqu'au boss (une
 * Méga-Évolution). Un seul Pokémon de chaque camp combat à la fois ; chacun attaque à son rythme
 * (selon sa Vitesse) avec l'attaque unique d'un de ses types.
 *
 * Le combat est entièrement déterminé par sa mise en place (`DungeonSetup`, figée au départ),
 * son seed et les changements de Pokémon du joueur (`DungeonCommand`, horodatés depuis le
 * départ) : le serveur et le navigateur calculent le même état à n'importe quel instant.
 */

// --- Attaques -------------------------------------------------------------------------------

export const MOVE_CATEGORIES = ['physical', 'special'] as const;
export type MoveCategory = (typeof MOVE_CATEGORIES)[number];

/** Attaque choisie par le joueur pour un Pokémon : un de ses types, physique ou spéciale. */
export interface DungeonMove {
  type: string;
  category: MoveCategory;
}

/** Puissance d'une attaque sans réglage pour son type. */
export const DEFAULT_DUNGEON_ATTACK_POWER = 60;

const typeNamesFr = new Map(typeData.map((t) => [t.name, t.nameFr]));

/** Attaque d'un type (celle de l'équilibrage, sinon une attaque par défaut). */
export function dungeonAttack(
  settings: Pick<DungeonSettings, 'attacks'>,
  type: string,
): DungeonAttack {
  return (
    settings.attacks[type] ?? {
      name: `Attaque ${typeNamesFr.get(type) ?? type}`,
      power: DEFAULT_DUNGEON_ATTACK_POWER,
    }
  );
}

/** Catégorie par défaut : celle de la meilleure statistique offensive (Attaque à égalité). */
export function bestCategory(stats: Pick<Stats, 'attack' | 'special-attack'>): MoveCategory {
  return stats['special-attack'] > stats.attack ? 'special' : 'physical';
}

/** Attaque par défaut : premier type de l'espèce, meilleure catégorie. */
export function defaultDungeonMove(
  species: Pick<GameSpecies, 'types' | 'baseStats'>,
  pokemon: Pick<PokemonInstance, 'level' | 'ivs' | 'nature'>,
): DungeonMove {
  return {
    type: species.types[0] ?? 'normal',
    category: bestCategory(computeStats(species, pokemon)),
  };
}

/** L'attaque enregistrée si elle reste valable (type de l'espèce, après une évolution), sinon celle par défaut. */
export function effectiveDungeonMove(
  species: Pick<GameSpecies, 'types' | 'baseStats'>,
  pokemon: Pick<PokemonInstance, 'level' | 'ivs' | 'nature'>,
  saved: DungeonMove | null | undefined,
): DungeonMove {
  const fallback = defaultDungeonMove(species, pokemon);
  if (!saved) return fallback;
  return {
    type: species.types.includes(saved.type) ? saved.type : fallback.type,
    category: MOVE_CATEGORIES.includes(saved.category) ? saved.category : fallback.category,
  };
}

// --- Combattants ------------------------------------------------------------------------------

/** Un combattant, figé au départ du donjon. */
export interface DungeonFighter {
  speciesId: number;
  formId: number | null;
  level: number;
  isShiny: boolean;
  types: string[];
  stats: Stats;
  maxHp: number;
  /** Type de l'attaque ; null = adversaire, qui choisit son meilleur type contre le Pokémon en face. */
  attackType: string | null;
  category: MoveCategory;
}

/** Réglages de combat figés au départ (une modification de l'équilibrage n'affecte pas un combat en cours). */
export type DungeonCombatSettings = Pick<
  DungeonSettings,
  | 'baseAttackIntervalMs'
  | 'referenceSpeed'
  | 'minAttackIntervalMs'
  | 'maxAttackIntervalMs'
  | 'damageMultiplier'
  | 'stabMultiplier'
  | 'minDamageRoll'
  | 'attacks'
>;

export interface DungeonSetup {
  /** Équipe du joueur, dans l'ordre choisi (le premier entre en combat). */
  team: DungeonFighter[];
  /** Adversaires dans l'ordre, le boss en dernier. */
  enemies: DungeonFighter[];
  settings: DungeonCombatSettings;
  timeLimitMs: number;
  seed: number;
}

/** Changement de Pokémon actif demandé par le joueur, `atMs` après le départ. */
export interface DungeonCommand {
  atMs: number;
  /** Index du Pokémon dans l'équipe. */
  member: number;
}

function fighter(
  species: GameSpecies,
  pokemon: Pick<PokemonInstance, 'speciesId' | 'formId' | 'level' | 'ivs' | 'nature'> & {
    isShiny?: boolean;
  },
  move: { type: string | null; category: MoveCategory },
  hpMultiplier = 1,
): DungeonFighter {
  const stats = computeStats(species, pokemon);
  return {
    speciesId: pokemon.speciesId,
    formId: pokemon.formId ?? null,
    level: pokemon.level,
    isShiny: pokemon.isShiny ?? false,
    types: [...species.types],
    stats,
    maxHp: Math.max(1, Math.round(stats.hp * hpMultiplier)),
    attackType: move.type,
    category: move.category,
  };
}

// --- Adversaires -------------------------------------------------------------------------------

/** Niveau de difficulté d'un donjon (information pour le joueur, sans effet sur le combat). */
export function dungeonDifficulty(ctx: GameContext, dungeon: Dungeon): DungeonDifficultySettings {
  return ctx.balance.dungeons.difficulties[dungeon.difficulty];
}

/** Pokémon d'un donjon (adversaire ou équipe type) : IV uniformes, nature neutre par défaut. */
export function dungeonOpponentInstance(member: TrainerPokemon, defaultIv: number) {
  const iv = member.iv ?? defaultIv;
  return {
    speciesId: member.speciesId,
    formId: member.formId ?? null,
    level: member.level,
    ivs: Object.fromEntries(STAT_NAMES.map((s) => [s, iv])) as Stats,
    nature: member.nature ?? 'hardy',
  };
}

/** Adversaires du donjon, boss compris (en dernier, PV multipliés). */
export function dungeonEnemies(ctx: GameContext, dungeon: Dungeon): DungeonFighter[] {
  const members = [...dungeon.opponents, dungeon.boss];
  const defaultIv = ctx.balance.dungeons.defaultOpponentIv;
  return members.flatMap((member, i) => {
    const species = ctx.species(member.speciesId, member.formId);
    if (!species) return [];
    const instance = dungeonOpponentInstance(member, defaultIv);
    const boss = i === members.length - 1;
    return [
      fighter(
        species,
        instance,
        { type: null, category: bestCategory(computeStats(species, instance)) },
        boss ? dungeon.bossHpMultiplier : 1,
      ),
    ];
  });
}

/** Mise en place d'une tentative : équipe (avec ses attaques), adversaires et réglages figés. */
export function buildDungeonSetup(
  ctx: GameContext,
  dungeon: Dungeon,
  team: readonly (PokemonInstance & { move: DungeonMove | null })[],
  seed: number,
): DungeonSetup {
  const { attacks, ...rest } = ctx.balance.dungeons;
  return {
    team: team.map((m) => {
      const species = ctx.species(m.speciesId, m.formId)!;
      return fighter(species, m, effectiveDungeonMove(species, m, m.move));
    }),
    enemies: dungeonEnemies(ctx, dungeon),
    settings: {
      baseAttackIntervalMs: rest.baseAttackIntervalMs,
      referenceSpeed: rest.referenceSpeed,
      minAttackIntervalMs: rest.minAttackIntervalMs,
      maxAttackIntervalMs: rest.maxAttackIntervalMs,
      damageMultiplier: rest.damageMultiplier,
      stabMultiplier: rest.stabMultiplier,
      minDamageRoll: rest.minDamageRoll,
      attacks,
    },
    timeLimitMs: dungeon.timeLimitSeconds * 1000,
    seed,
  };
}

// --- Règles de combat --------------------------------------------------------------------------

/**
 * Délai entre deux attaques d'un Pokémon, linéaire selon sa Vitesse : `maxAttackIntervalMs` à
 * Vitesse 0, `baseAttackIntervalMs` à la Vitesse de référence, et le même gain par point au-delà,
 * jusqu'au plancher `minAttackIntervalMs`.
 */
export function attackIntervalMs(
  settings: Pick<
    DungeonSettings,
    'baseAttackIntervalMs' | 'referenceSpeed' | 'minAttackIntervalMs' | 'maxAttackIntervalMs'
  >,
  speed: number,
): number {
  const gainPerSpeed =
    (settings.maxAttackIntervalMs - settings.baseAttackIntervalMs) / settings.referenceSpeed;
  const raw = settings.maxAttackIntervalMs - gainPerSpeed * Math.max(0, speed);
  return Math.round(
    Math.min(settings.maxAttackIntervalMs, Math.max(settings.minAttackIntervalMs, raw)),
  );
}

/** Type d'attaque d'un combattant contre un défenseur (adversaire : le plus efficace, le premier à égalité). */
export function attackTypeAgainst(attacker: DungeonFighter, defender: DungeonFighter): string {
  if (attacker.attackType) return attacker.attackType;
  let best = attacker.types[0] ?? 'normal';
  for (const t of attacker.types) {
    if (typeEffectiveness(t, defender.types) > typeEffectiveness(best, defender.types)) best = t;
  }
  return best;
}

/**
 * Dégâts d'une attaque : ((2 × niveau / 5 + 2) × puissance × Att / Déf / 50 + 2) × STAB
 * × efficacité × aléa × multiplicateur ; au moins 1 sauf immunité.
 */
export function attackDamage(
  settings: DungeonCombatSettings,
  attacker: DungeonFighter,
  defender: DungeonFighter,
  attackType: string,
  roll: number,
): { damage: number; effectiveness: number } {
  const special = attacker.category === 'special';
  const attack = attacker.stats[special ? 'special-attack' : 'attack'];
  const defense = Math.max(1, defender.stats[special ? 'special-defense' : 'defense']);
  const { power } = dungeonAttack(settings, attackType);
  const base = (((2 * attacker.level) / 5 + 2) * power * (attack / defense)) / 50 + 2;
  const stab = attacker.types.includes(attackType) ? settings.stabMultiplier : 1;
  const effectiveness = typeEffectiveness(attackType, defender.types);
  if (effectiveness === 0) return { damage: 0, effectiveness };
  const random = settings.minDamageRoll + (1 - settings.minDamageRoll) * roll;
  const damage = Math.floor(base * stab * effectiveness * random * settings.damageMultiplier);
  return { damage: Math.max(1, damage), effectiveness };
}

// --- Simulation ----------------------------------------------------------------------------------

export type DungeonOutcome = 'win' | 'loss' | 'timeout' | 'fled';

export type DungeonEvent =
  | {
      kind: 'attack';
      atMs: number;
      side: 'player' | 'enemy';
      /** Index de l'attaquant (dans l'équipe ou parmi les adversaires). */
      attacker: number;
      /** Index du défenseur. */
      defender: number;
      attackType: string;
      damage: number;
      effectiveness: number;
      ko: boolean;
    }
  /** Changement de Pokémon actif : demandé par le joueur, ou automatique après un K.O. */
  | { kind: 'switch'; atMs: number; member: number; auto: boolean }
  /** Entrée en combat de l'adversaire suivant. */
  | { kind: 'enemy'; atMs: number; index: number };

export interface DungeonState {
  elapsedMs: number;
  /** null tant que le combat continue. */
  outcome: DungeonOutcome | null;
  endedAtMs: number | null;
  /** Pokémon actif du joueur (index dans l'équipe). */
  active: number;
  hp: number[];
  enemyIndex: number;
  enemyHp: number;
  /** Adversaires vaincus (les premiers de la liste). */
  defeated: number;
  nextPlayerAttackAt: number;
  nextEnemyAttackAt: number;
}

export interface DungeonSimulation {
  state: DungeonState;
  events: DungeonEvent[];
}

/**
 * État du combat `untilMs` après le départ (au plus tard à la fin du temps imparti). Les
 * commandes invalides (Pokémon K.O. ou déjà actif) sont ignorées. À égalité de temps : commande,
 * puis attaque du joueur, puis attaque de l'adversaire.
 */
export function simulateDungeon(
  setup: DungeonSetup,
  commands: readonly DungeonCommand[],
  fledAtMs: number | null,
  untilMs: number,
): DungeonSimulation {
  const { team, enemies, settings } = setup;
  const rng = createRng(setup.seed);
  const interval = (f: DungeonFighter) => attackIntervalMs(settings, f.stats.speed);
  const queue = [...commands].sort((a, b) => a.atMs - b.atMs);
  const stopAt = Math.min(fledAtMs ?? Infinity, setup.timeLimitMs);
  const events: DungeonEvent[] = [];

  const hp = team.map((f) => f.maxHp);
  let active = 0;
  let enemyIndex = 0;
  let enemyHp = enemies[0]?.maxHp ?? 0;
  let defeated = 0;
  let nextPlayer = team[0] ? interval(team[0]) : Infinity;
  let nextEnemy = enemies[0] ? interval(enemies[0]) : Infinity;
  let outcome: DungeonOutcome | null = null;
  let endedAtMs: number | null = null;
  let t = 0;
  let ci = 0;

  if (team.length === 0) {
    outcome = 'loss';
    endedAtMs = 0;
  } else if (enemies.length === 0) {
    outcome = 'win';
    endedAtMs = 0;
  }

  while (outcome === null) {
    const nextCommand = ci < queue.length ? queue[ci]!.atMs : Infinity;
    const next = Math.min(nextCommand, nextPlayer, nextEnemy);
    if (next > stopAt || next > untilMs) {
      if (stopAt <= untilMs) {
        outcome = fledAtMs !== null && fledAtMs <= setup.timeLimitMs ? 'fled' : 'timeout';
        endedAtMs = stopAt;
        t = stopAt;
      } else {
        t = untilMs;
      }
      break;
    }
    t = next;

    if (nextCommand === t) {
      const { member } = queue[ci++]!;
      if (member !== active && member >= 0 && member < team.length && hp[member]! > 0) {
        active = member;
        nextPlayer = t + interval(team[member]!);
        events.push({ kind: 'switch', atMs: t, member, auto: false });
      }
      continue;
    }

    if (nextPlayer <= nextEnemy) {
      const attacker = team[active]!;
      const defender = enemies[enemyIndex]!;
      const attackType = attackTypeAgainst(attacker, defender);
      const { damage, effectiveness } = attackDamage(
        settings,
        attacker,
        defender,
        attackType,
        rng.next(),
      );
      enemyHp = Math.max(0, enemyHp - damage);
      const ko = enemyHp === 0;
      events.push({
        kind: 'attack',
        atMs: t,
        side: 'player',
        attacker: active,
        defender: enemyIndex,
        attackType,
        damage,
        effectiveness,
        ko,
      });
      nextPlayer = t + interval(attacker);
      if (ko) {
        defeated++;
        if (enemyIndex === enemies.length - 1) {
          outcome = 'win';
          endedAtMs = t;
          break;
        }
        enemyIndex++;
        enemyHp = enemies[enemyIndex]!.maxHp;
        nextEnemy = t + interval(enemies[enemyIndex]!);
        events.push({ kind: 'enemy', atMs: t, index: enemyIndex });
      }
    } else {
      const attacker = enemies[enemyIndex]!;
      const defender = team[active]!;
      const attackType = attackTypeAgainst(attacker, defender);
      const { damage, effectiveness } = attackDamage(
        settings,
        attacker,
        defender,
        attackType,
        rng.next(),
      );
      hp[active] = Math.max(0, hp[active]! - damage);
      const ko = hp[active] === 0;
      events.push({
        kind: 'attack',
        atMs: t,
        side: 'enemy',
        attacker: enemyIndex,
        defender: active,
        attackType,
        damage,
        effectiveness,
        ko,
      });
      nextEnemy = t + interval(attacker);
      if (ko) {
        // Le suivant encore debout (dans l'ordre de l'équipe) prend le relais.
        const next = Array.from(
          { length: team.length - 1 },
          (_, i) => (active + 1 + i) % team.length,
        ).find((i) => hp[i]! > 0);
        if (next === undefined) {
          outcome = 'loss';
          endedAtMs = t;
          break;
        }
        active = next;
        nextPlayer = t + interval(team[next]!);
        events.push({ kind: 'switch', atMs: t, member: next, auto: true });
      }
    }
  }

  return {
    state: {
      elapsedMs: endedAtMs ?? t,
      outcome,
      endedAtMs,
      active,
      hp,
      enemyIndex,
      enemyHp,
      defeated,
      nextPlayerAttackAt: nextPlayer,
      nextEnemyAttackAt: nextEnemy,
    },
    events,
  };
}

// --- Accès et équipe -------------------------------------------------------------------------

export function dungeonCooldownMinutes(ctx: GameContext, dungeon: Dungeon): number {
  return dungeon.cooldownMinutes ?? ctx.balance.dungeons.cooldownMinutes;
}

export function dungeonKoMinutes(ctx: GameContext, dungeon: Dungeon): number {
  return dungeon.koMinutes ?? ctx.balance.dungeons.koMinutes;
}

export interface DungeonRecord {
  lastEndedAt: Date | string | null;
}

export type DungeonStatus =
  /** Aucune espèce de la lignée capturée (ou région verrouillée) : le donjon n'apparaît pas. */
  | { state: 'hidden' }
  /** Visible, mais il manque des espèces de la lignée ou la condition supplémentaire. */
  | { state: 'locked'; missingSpeciesIds: number[]; conditionMet: boolean }
  | { state: 'cooldown'; until: Date }
  | { state: 'available' };

export function dungeonStatus(
  ctx: GameContext,
  dungeon: Dungeon,
  progress: PlayerProgress,
  record: DungeonRecord | undefined,
  now: Date | number,
): DungeonStatus {
  const region = ctx.region(dungeon.regionId);
  if (!region || !isUnlocked(ctx, region.unlock, progress)) return { state: 'hidden' };
  const missingSpeciesIds = dungeon.familySpeciesIds.filter(
    (id) => !progress.caughtSpeciesIds.has(id),
  );
  if (missingSpeciesIds.length === dungeon.familySpeciesIds.length) return { state: 'hidden' };
  const conditionMet = isUnlocked(ctx, dungeon.unlock, progress);
  if (missingSpeciesIds.length > 0 || !conditionMet) {
    return { state: 'locked', missingSpeciesIds, conditionMet };
  }
  if (record?.lastEndedAt) {
    const until = new Date(
      new Date(record.lastEndedAt).getTime() + dungeonCooldownMinutes(ctx, dungeon) * 60_000,
    );
    if (until.getTime() > new Date(now).getTime()) return { state: 'cooldown', until };
  }
  return { state: 'available' };
}

export type DungeonTeamError =
  | { code: 'TEAM_EMPTY' }
  | { code: 'TEAM_TOO_LARGE'; max: number }
  | { code: 'DUPLICATE_MEMBER' }
  | { code: 'TOO_MANY_MEGAS'; max: number }
  | { code: 'WRONG_REGION'; speciesIds: number[] }
  | { code: 'INVALID_MOVE' };

export function checkDungeonTeam(
  ctx: GameContext,
  dungeon: Dungeon,
  team: readonly (Pick<TeamMember, 'id' | 'speciesId' | 'formId'> & {
    move?: DungeonMove | null;
  })[],
): DungeonTeamError[] {
  const errors: DungeonTeamError[] = [];
  const max = ctx.balance.dungeons.maxTeamSize;
  if (team.length === 0) errors.push({ code: 'TEAM_EMPTY' });
  if (team.length > max) errors.push({ code: 'TEAM_TOO_LARGE', max });
  if (new Set(team.map((m) => m.id)).size !== team.length) {
    errors.push({ code: 'DUPLICATE_MEMBER' });
  }
  if (megaCount(team) > MAX_MEGAS_PER_TEAM) {
    errors.push({ code: 'TOO_MANY_MEGAS', max: MAX_MEGAS_PER_TEAM });
  }
  const outside = team
    .filter((m) => !isRegionalSpecies(ctx, dungeon.regionId, m.speciesId))
    .map((m) => m.speciesId);
  if (outside.length > 0) errors.push({ code: 'WRONG_REGION', speciesIds: outside });
  const badMove = team.some((m) => {
    if (!m.move) return false;
    const species = ctx.species(m.speciesId, m.formId);
    return (
      !species || !species.types.includes(m.move.type) || !MOVE_CATEGORIES.includes(m.move.category)
    );
  });
  if (badMove) errors.push({ code: 'INVALID_MOVE' });
  return errors;
}

// --- Résultat ---------------------------------------------------------------------------------------

export interface DungeonResult {
  outcome: DungeonOutcome;
  /** Fin du combat, en millisecondes depuis le départ. */
  endedAtMs: number;
  defeated: number;
  xpPerMember: number;
  team: TeamMemberResult[];
  /** Pokémon mis K.O. (identifiants), indisponibles pendant `koMinutes`. */
  knockedOut: string[];
  koMinutes: number;
  money: number;
  loot: ItemStack[];
  /** Méga-Gemme obtenue (null = aucune). */
  gemItemId: string | null;
  /** Tirage de la gemme, comparé à sa probabilité (null hors victoire). */
  gemRoll: number | null;
}

export interface DungeonRunInput {
  dungeon: Dungeon;
  setup: DungeonSetup;
  commands: readonly DungeonCommand[];
  fledAtMs: number | null;
  /** Équipe actuelle (même ordre que `setup.team`), pour l'XP et le bonheur. */
  team: readonly TeamMember[];
  bonuses?: PlayerBonuses;
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
  const bonuses = input.bonuses ?? NO_BONUSES;

  const baseXp = setup.enemies.slice(0, state.defeated).reduce((sum, enemy) => {
    const species = ctx.species(enemy.speciesId, enemy.formId);
    return sum + (species ? defeatXp(species, enemy.level) : 0);
  }, 0);
  const xpPerMember = fled ? 0 : Math.floor(baseXp * rules.xpMultiplier * bonuses.xp);
  const happiness = fled ? 0 : win ? rules.happinessOnWin : rules.happinessOnLoss;

  let gemItemId: string | null = null;
  let gemRoll: number | null = null;
  const loot = new Map<string, number>();
  if (win) {
    const rng = createRng(setup.seed ^ 0x5bd1e995);
    gemRoll = rng.next();
    if (dungeon.gemItemId && gemRoll < dungeon.gemChance) gemItemId = dungeon.gemItemId;
    const table = dungeon.lootTableId ? ctx.lootTable(dungeon.lootTableId) : undefined;
    if (table) for (let i = 0; i < dungeon.lootRolls; i++) addStacks(loot, rollLoot(rng, table));
  }

  return {
    outcome,
    endedAtMs: state.endedAtMs ?? setup.timeLimitMs,
    defeated: state.defeated,
    xpPerMember,
    team: applyTeamXp(ctx, input.team, xpPerMember, happiness),
    knockedOut: input.team.filter((_, i) => state.hp[i] === 0).map((m) => m.id),
    koMinutes: dungeonKoMinutes(ctx, dungeon),
    money: win ? Math.floor(dungeon.money * bonuses.money) : 0,
    loot: [...loot].map(([itemId, quantity]) => ({ itemId, quantity })),
    gemItemId,
    gemRoll,
  };
}
