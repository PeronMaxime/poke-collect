import type {
  AbilityCondition,
  AbilityParam,
  Dungeon,
  DungeonAttack,
  DungeonDifficultySettings,
  DungeonSettings,
  DungeonStat,
  ItemStack,
  Status,
  TrainerPokemon,
  Weather,
} from '@poke/content';
import { STAT_NAMES, typeEffectiveness, types as typeData } from '@poke/data';
import type { StatName, Stats } from '@poke/data';
import type { GameContext, GameSpecies } from './context';
import { addStacks, applyTeamXp, defeatedXp, rollLoot } from './expedition';
import type { TeamMember, TeamMemberResult } from './expedition';
import { computeStats } from './pokemon';
import type { PokemonInstance } from './pokemon';
import type { PlayerProgress } from './progress';
import { isRegionalSpecies, isUnlocked } from './progress';
import { NO_BONUSES } from './progression';
import type { PlayerBonuses } from './progression';
import {
  ABILITY_PARAMS,
  abilityBonuses,
  abilityHappiness,
  deferredAbilityEffects,
  durationWithAbility,
  effectiveAbility,
  imposedWeather,
  scaledByAbility,
  STATE_CONDITION_TYPES,
  weatherOrClear,
} from './abilities';
import type { AbilityEnv } from './abilities';
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

/** Modificateur de dégâts d'un talent, évalué à chaque attaque (conditions de l'instant). */
export interface DamageModifier {
  /** `dealt` : dégâts infligés par le Pokémon ; `taken` : dégâts qu'il reçoit. */
  dir: 'dealt' | 'taken';
  percent: number;
  /** Types de l'attaque concernée ; absent = toutes. */
  attackTypes?: string[];
  /** Catégorie de l'attaque concernée ; absent = les deux. */
  category?: MoveCategory;
  /** Types du Pokémon en face ; absent = tous. */
  opponentTypes?: string[];
  /** PV du Pokémon au plus à cette fraction de ses PV max. */
  hpBelow?: number;
  /** PV du Pokémon au maximum. */
  fullHp?: boolean;
  /** Le Pokémon a un statut (Cran). */
  statused?: boolean;
  /** L'attaque est super efficace (Filtre, Ceinture Pro). */
  superEffective?: boolean;
  /** L'attaque est peu efficace (Lentille Teintée). */
  notVeryEffective?: boolean;
  /** Bonus d'un coéquipier : index du porteur dans son camp, actif tant qu'il n'est pas K.O. */
  from?: number;
}

/**
 * Statistique (ou STAB, chance de critique) modifiée en continu : selon l'état du Pokémon
 * (Vitesse à PV max…) ou tant que le coéquipier qui donne le bonus n'est pas K.O.
 */
export interface StatModifier {
  stat: DungeonStat | 'stab' | 'critChance';
  percent: number;
  /** PV du Pokémon au plus à cette fraction de ses PV max. */
  hpBelow?: number;
  /** PV du Pokémon au maximum. */
  fullHp?: boolean;
  /** Le Pokémon a un statut. */
  statused?: boolean;
  /** Bonus d'un coéquipier : index du porteur dans son camp, actif tant qu'il n'est pas K.O. */
  from?: number;
}

/** Porteurs encore debout dans un camp (bonus d'équipe) ; absent = tous. */
export type HolderUp = (index: number) => boolean;
const allUp: HolderUp = () => true;

/** Talents d'un combattant, figés au départ (voir les briques « donjon » des talents). */
export interface DungeonTraits {
  damage: DamageModifier[];
  /** Statistiques selon l'état du Pokémon. Absent des tentatives antérieures. */
  stats?: StatModifier[];
  /** Bonus de même type (STAB), en %. */
  stabPercent: number;
  immunities: { type: string; heal: number }[];
  sturdy: boolean;
  /** Fraction des PV max soignée quand le joueur le rappelle. */
  regenerator: number;
  /** % de Vitesse gagné après chaque attaque. */
  speedBoost: number;
  /** % d'Attaque gagné après chaque K.O. infligé. */
  moxie: number;
  /** % d'Attaque et d'Attaque Spéciale retiré au Pokémon en face, à l'entrée (tentatives antérieures). */
  intimidate: number;
  /** % retiré à chaque statistique du Pokémon en face, à l'entrée ; absent = `intimidate`. */
  intimidateStats?: Partial<Record<DungeonStat, number>>;
  /** Fraction des PV max de l'attaquant perdue à chaque attaque physique reçue. */
  contactDamage: number;
  /** Fraction des PV max de l'attaquant infligée quand il le met K.O. d'une attaque physique. */
  aftermath: number;
  /** Statuts infligés (Statik, Point Poison…). Absents des tentatives antérieures. */
  inflict?: { status: Status; chance: number; trigger: 'contact' | 'attack' }[];
  statusImmunities?: Status[];
  /** Statuts dont un coéquipier protège, tant qu'il n'est pas K.O. (Voile Pastel). */
  teamStatusImmunities?: { status: Status; from: number }[];
  naturalCure?: boolean;
  weatherImmunity?: boolean;
  /** % ajouté à sa chance de coup critique (Super Chance). Absent des tentatives antérieures. */
  critPercent?: number;
  /** Ne subit jamais de coup critique (Armurbaston). */
  critImmunity?: boolean;
  /** Tant qu'il est sur le terrain, le talent du Pokémon en face ne joue plus (Gaz Inhibiteur). */
  suppressAbility?: boolean;
}

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
  /** Talent en vigueur (nom PokéAPI) ; absent = sans talent (tentatives antérieures). */
  ability?: string | null;
  /** Effets de talent en donjon ; absent = aucun. */
  traits?: DungeonTraits;
  /** Statistiques sans ses propres talents (talent neutralisé) ; absent = `stats`. */
  baseStats?: Stats;
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
> &
  /** Coups critiques : absents des tentatives antérieures (aucun critique, aucun tirage). */
  Partial<Pick<DungeonSettings, 'critChance' | 'critMultiplier'>> & {
    /** Délai avant qu'un Pokémon rappelé puisse revenir ; absent (tentatives antérieures) = aucun. */
    recallCooldownMs?: number;
  };

export interface DungeonSetup {
  /** Équipe du joueur, dans l'ordre choisi (le premier entre en combat). */
  team: DungeonFighter[];
  /** Adversaires dans l'ordre, le boss en dernier. */
  enemies: DungeonFighter[];
  settings: DungeonCombatSettings;
  timeLimitMs: number;
  seed: number;
  /** Heure locale du joueur au départ (talents de jour ou de nuit) ; absente = inconnue. */
  hour?: number | null;
  /** Météo du combat (celle du donjon, ou imposée par un talent) ; absente = temps clair. */
  weather?: Weather | null;
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

/** Conditions évaluées à chaque attaque (les autres le sont au départ). */
const INSTANT_CONDITIONS = new Set<AbilityCondition['type']>([
  'hpBelow',
  'fullHp',
  'attackType',
  'attackCategory',
  'opponentType',
  'statused',
  'superEffective',
  'notVeryEffective',
]);

const STAT_PARAMS: Partial<Record<AbilityParam, StatName>> = {
  hp: 'hp',
  attack: 'attack',
  defense: 'defense',
  specialAttack: 'special-attack',
  specialDefense: 'special-defense',
  speed: 'speed',
};

const emptyTraits = (): DungeonTraits => ({
  damage: [],
  stats: [],
  stabPercent: 0,
  immunities: [],
  sturdy: false,
  regenerator: 0,
  speedBoost: 0,
  moxie: 0,
  intimidate: 0,
  intimidateStats: {},
  contactDamage: 0,
  aftermath: 0,
  inflict: [],
  statusImmunities: [],
  naturalCure: false,
  weatherImmunity: false,
  critPercent: 0,
  critImmunity: false,
});

/** Modificateur de dégâts à partir des conditions de l'instant d'un effet. */
function damageModifier(
  dir: DamageModifier['dir'],
  percent: number,
  conditions: readonly AbilityCondition[],
): DamageModifier {
  const mod: DamageModifier = { dir, percent };
  for (const c of conditions) {
    if (c.type === 'attackType') mod.attackTypes = [...c.types];
    else if (c.type === 'attackCategory') mod.category = c.category;
    else if (c.type === 'opponentType') mod.opponentTypes = [...c.types];
    else if (c.type === 'hpBelow') mod.hpBelow = Math.min(mod.hpBelow ?? 1, c.fraction);
    else if (c.type === 'fullHp') mod.fullHp = true;
    else if (c.type === 'statused') mod.statused = true;
    else if (c.type === 'superEffective') mod.superEffective = true;
    else if (c.type === 'notVeryEffective') mod.notVeryEffective = true;
  }
  return mod;
}

/** Modificateur de statistique à partir des conditions d'état d'un effet. */
function statModifier(
  stat: StatModifier['stat'],
  percent: number,
  conditions: readonly AbilityCondition[],
): StatModifier {
  const mod: StatModifier = { stat, percent };
  for (const c of conditions) {
    if (c.type === 'hpBelow') mod.hpBelow = Math.min(mod.hpBelow ?? 1, c.fraction);
    else if (c.type === 'fullHp') mod.fullHp = true;
    else if (c.type === 'statused') mod.statused = true;
  }
  return mod;
}

/** % ajouté à une statistique, au STAB ou au critique par les modificateurs actifs à l'instant. */
function statModifierPercent(
  traits: DungeonTraits | undefined,
  stat: StatModifier['stat'],
  hpFraction: number,
  statused: boolean,
  up: HolderUp,
): number {
  let percent = 0;
  for (const m of traits?.stats ?? []) {
    if (m.stat !== stat) continue;
    if (m.from !== undefined && !up(m.from)) continue;
    if (m.hpBelow !== undefined && hpFraction > m.hpBelow) continue;
    if (m.fullHp && hpFraction < 1) continue;
    if (m.statused && !statused) continue;
    percent += m.percent;
  }
  return percent;
}

/** Multiplicateur d'une statistique selon l'état du Pokémon et les coéquipiers debout. */
export function stateStatMultiplier(
  traits: DungeonTraits | undefined,
  stat: DungeonStat,
  hpFraction: number,
  statused: boolean,
  up: HolderUp = allUp,
): number {
  return Math.max(0, 1 + statModifierPercent(traits, stat, hpFraction, statused, up) / 100);
}

/**
 * Applique les talents d'un camp à ses combattants : statistiques modifiées et traits figés.
 * `env.opponentTypes` : types de tout le camp d'en face (conditions de statistiques).
 */
function withAbilities(
  ctx: GameContext,
  env: AbilityEnv,
  fighters: readonly DungeonFighter[],
): DungeonFighter[] {
  const effects = deferredAbilityEffects(ctx, env, INSTANT_CONDITIONS);
  return fighters.map((f, index) => {
    const traits = emptyTraits();
    const statPercent = new Map<StatName, number>();
    let changed = false;
    for (const { holder, effect, deferred } of effects) {
      const mine = holder === index;
      if (effect.type === 'modifier') {
        const info = ABILITY_PARAMS[effect.param];
        if (!info.activities.includes('dungeon')) continue;
        if (!mine && info.selfScope && effect.scope === 'self') continue;
        const stat = STAT_PARAMS[effect.param];
        if (effect.param === 'damageDealt' || effect.param === 'damageTaken') {
          const dir = effect.param === 'damageDealt' ? 'dealt' : 'taken';
          const mod = damageModifier(dir, effect.value, deferred);
          traits.damage.push(mine ? mod : { ...mod, from: holder });
          changed = true;
          continue;
        }
        // Statistiques et STAB : le type du camp d'en face conditionne au départ ; l'état du
        // Pokémon (PV, statut) conditionne ses statistiques en continu.
        const state = deferred.filter((c) => STATE_CONDITION_TYPES.has(c.type));
        const staticOk = deferred.every(
          (c) =>
            STATE_CONDITION_TYPES.has(c.type) ||
            (c.type === 'opponentType' && !!env.opponentTypes?.some((t) => c.types.includes(t))),
        );
        if (!staticOk) continue;
        // Bonus d'un coéquipier (sauf PV max, figés) : évalué en continu, tant qu'il est debout.
        const sourced = stat !== 'hp' && !mine;
        if (state.length > 0 || sourced) {
          const target =
            stat && stat !== 'hp'
              ? stat
              : effect.param === 'stab'
                ? 'stab'
                : effect.param === 'critChance'
                  ? 'critChance'
                  : null;
          if (!target) continue;
          const mod = statModifier(target, effect.value, state);
          traits.stats!.push(mine ? mod : { ...mod, from: holder });
          changed = true;
          continue;
        }
        if (stat) statPercent.set(stat, (statPercent.get(stat) ?? 0) + effect.value);
        else if (effect.param === 'stab') traits.stabPercent += effect.value;
        else if (effect.param === 'critChance') traits.critPercent! += effect.value;
        changed = true;
        continue;
      }
      // Mécaniques spéciales : sans condition de l'instant, seulement pour le Pokémon qui a le
      // talent (sauf immunité aux statuts pour toute l'équipe).
      if (deferred.length > 0) continue;
      if (!mine && !(effect.type === 'statusImmunity' && effect.scope === 'team')) continue;
      switch (effect.type) {
        case 'immunity':
          traits.immunities.push({ type: effect.attackType, heal: effect.heal });
          break;
        case 'sturdy':
          traits.sturdy = true;
          break;
        case 'regenerator':
          traits.regenerator += effect.fraction;
          break;
        case 'speedBoost':
          traits.speedBoost += effect.percent;
          break;
        case 'moxie':
          traits.moxie += effect.percent;
          break;
        case 'intimidate':
          for (const stat of effect.stats) {
            traits.intimidateStats![stat] = (traits.intimidateStats![stat] ?? 0) + effect.percent;
          }
          break;
        case 'contactDamage':
          traits.contactDamage += effect.fraction;
          break;
        case 'aftermath':
          traits.aftermath += effect.fraction;
          break;
        case 'inflictStatus':
          traits.inflict!.push({
            status: effect.status,
            chance: effect.chance,
            trigger: effect.trigger,
          });
          break;
        case 'statusImmunity':
          if (mine) traits.statusImmunities!.push(...effect.statuses);
          else {
            for (const status of effect.statuses) {
              (traits.teamStatusImmunities ??= []).push({ status, from: holder });
            }
          }
          break;
        case 'naturalCure':
          traits.naturalCure = true;
          break;
        case 'weatherImmunity':
          traits.weatherImmunity = true;
          break;
        case 'critImmunity':
          traits.critImmunity = true;
          break;
        case 'suppressAbility':
          traits.suppressAbility = true;
          break;
        default:
          continue;
      }
      changed = true;
    }
    const ability = effectiveAbility(ctx, env.team[index]!) || null;
    if (!changed) return { ...f, ability };
    const stats = { ...f.stats };
    let { maxHp } = f;
    let statsChanged = false;
    for (const [stat, percent] of statPercent) {
      const mult = Math.max(0, 1 + percent / 100);
      if (stat === 'hp') maxHp = Math.max(1, Math.round(maxHp * mult));
      else {
        stats[stat] = Math.max(1, Math.round(stats[stat] * mult));
        statsChanged = true;
      }
    }
    // Statistiques d'origine gardées pour le Gaz Inhibiteur (PV max inchangés).
    return { ...f, stats, maxHp, ability, traits, ...(statsChanged && { baseStats: f.stats }) };
  });
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

/** Adversaires porteurs de talent : premier talent de leur espèce (ou forme). */
function enemyAbilityHolders(ctx: GameContext, enemies: readonly DungeonFighter[]) {
  return enemies.map((e) => ({
    speciesId: e.speciesId,
    formId: e.formId,
    ability: ctx.species(e.speciesId, e.formId)?.abilities[0]?.name ?? '',
  }));
}

/**
 * Météo d'une tentative : imposée par un talent de l'équipe, sinon des adversaires (si
 * l'équilibrage active leurs talents), sinon celle du donjon.
 */
export function dungeonWeather(
  ctx: GameContext,
  dungeon: Dungeon,
  team: readonly PokemonInstance[],
  hour: number | null = null,
): Weather | null {
  return weatherOrClear(
    imposedWeather(ctx, { activity: 'dungeon', team, hour }) ??
      (ctx.balance.dungeons.enemyAbilities
        ? imposedWeather(ctx, {
            activity: 'dungeon',
            team: enemyAbilityHolders(ctx, dungeonEnemies(ctx, dungeon)),
            hour,
          })
        : null) ??
      dungeon.weather,
  );
}

/** Mise en place d'une tentative : équipe (avec ses attaques), adversaires et réglages figés. */
export function buildDungeonSetup(
  ctx: GameContext,
  dungeon: Dungeon,
  team: readonly (PokemonInstance & { move: DungeonMove | null })[],
  seed: number,
  hour: number | null = null,
): DungeonSetup {
  const { attacks, ...rest } = ctx.balance.dungeons;
  const typesOf = (list: readonly DungeonFighter[]) => [...new Set(list.flatMap((f) => f.types))];
  const baseTeam = team.map((m) => {
    const species = ctx.species(m.speciesId, m.formId)!;
    return fighter(species, m, effectiveDungeonMove(species, m, m.move));
  });
  const baseEnemies = dungeonEnemies(ctx, dungeon);
  // Adversaires : premier talent de leur espèce (ou forme), si l'équilibrage l'active.
  const enemyHolders = enemyAbilityHolders(ctx, baseEnemies);
  const weather = dungeonWeather(ctx, dungeon, team, hour);
  const env = { activity: 'dungeon', hour, weather, weatherResolved: true } as const;
  const teamFighters = withAbilities(
    ctx,
    { ...env, team, opponentTypes: typesOf(baseEnemies) },
    baseTeam,
  );
  const enemies = rest.enemyAbilities
    ? withAbilities(
        ctx,
        { ...env, team: enemyHolders, opponentTypes: typesOf(baseTeam) },
        baseEnemies,
      )
    : baseEnemies;
  return {
    team: teamFighters,
    enemies,
    settings: {
      baseAttackIntervalMs: rest.baseAttackIntervalMs,
      referenceSpeed: rest.referenceSpeed,
      minAttackIntervalMs: rest.minAttackIntervalMs,
      maxAttackIntervalMs: rest.maxAttackIntervalMs,
      damageMultiplier: rest.damageMultiplier,
      stabMultiplier: rest.stabMultiplier,
      minDamageRoll: rest.minDamageRoll,
      critChance: rest.critChance,
      critMultiplier: rest.critMultiplier,
      recallCooldownMs: rest.recallCooldownSeconds * 1000,
      attacks,
    },
    timeLimitMs: dungeon.timeLimitSeconds * 1000,
    seed,
    hour,
    weather,
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

/** Multiplicateur d'une immunité en donjon : les dégâts sont divisés par 4 au lieu d'être annulés. */
export const DUNGEON_IMMUNITY_MULTIPLIER = 0.25;

/** Efficacité d'un type en donjon : comme la table des types, mais chaque immunité vaut ×¼. */
export function dungeonTypeEffectiveness(
  attackType: string,
  defenderTypes: readonly string[],
): number {
  return defenderTypes.reduce((m, t) => {
    const e = typeEffectiveness(attackType, [t]);
    return m * (e === 0 ? DUNGEON_IMMUNITY_MULTIPLIER : e);
  }, 1);
}

/** Type d'attaque d'un combattant contre un défenseur (adversaire : le plus efficace, le premier à égalité). */
export function attackTypeAgainst(attacker: DungeonFighter, defender: DungeonFighter): string {
  if (attacker.attackType) return attacker.attackType;
  let best = attacker.types[0] ?? 'normal';
  for (const t of attacker.types) {
    if (
      dungeonTypeEffectiveness(t, defender.types) > dungeonTypeEffectiveness(best, defender.types)
    )
      best = t;
  }
  return best;
}

/** État du moment qui modifie une attaque (talents, statuts, météo). */
export interface DamageContext {
  /** Multiplicateur de l'Attaque (ou Attaque Spéciale) de l'attaquant (Impudence, Intimidation). */
  attackMultiplier?: number;
  /** Multiplicateur de la Défense (ou Défense Spéciale) du défenseur (Intimidation). */
  defenseMultiplier?: number;
  /** PV de l'attaquant et du défenseur, en fraction de leurs PV max. */
  attackerHpFraction?: number;
  defenderHpFraction?: number;
  /** Statuts de l'attaquant et du défenseur (brûlure : attaques physiques ×0,5 ; Cran). */
  attackerStatus?: Status | null;
  defenderStatus?: Status | null;
  /** Météo du combat (Soleil : Feu ×1,5, Eau ×0,5 ; Pluie : l'inverse). */
  weather?: Weather | null;
  /** Coup critique : dégâts × `critMultiplier`, baisses d'Attaque et hausses de Défense ignorées. */
  critical?: boolean;
  /** Porteurs encore debout dans le camp de l'attaquant et du défenseur (bonus d'équipe). */
  attackerUp?: HolderUp;
  defenderUp?: HolderUp;
}

function damagePercent(
  traits: DungeonTraits | undefined,
  dir: DamageModifier['dir'],
  attackType: string,
  category: MoveCategory,
  opponentTypes: readonly string[],
  hpFraction: number,
  statused: boolean,
  effectiveness: number,
  up: HolderUp,
): number {
  let percent = 0;
  for (const m of traits?.damage ?? []) {
    if (m.dir !== dir) continue;
    if (m.from !== undefined && !up(m.from)) continue;
    if (m.attackTypes && !m.attackTypes.includes(attackType)) continue;
    if (m.category && m.category !== category) continue;
    if (m.opponentTypes && !opponentTypes.some((t) => m.opponentTypes!.includes(t))) continue;
    if (m.hpBelow !== undefined && hpFraction > m.hpBelow) continue;
    if (m.fullHp && hpFraction < 1) continue;
    if (m.statused && !statused) continue;
    if (m.superEffective && effectiveness <= 1) continue;
    if (m.notVeryEffective && effectiveness >= 1) continue;
    percent += m.percent;
  }
  return percent;
}

/** Effet de la météo sur une attaque de ce type. */
export function weatherDamageMultiplier(weather: Weather | null | undefined, attackType: string) {
  if (weather === 'sun') return attackType === 'fire' ? 1.5 : attackType === 'water' ? 0.5 : 1;
  if (weather === 'rain') return attackType === 'water' ? 1.5 : attackType === 'fire' ? 0.5 : 1;
  return 1;
}

/**
 * Dégâts d'une attaque : ((2 × niveau / 5 + 2) × puissance × Att / Déf / 50 + 2) × STAB
 * × efficacité × aléa × multiplicateur × talents × météo × brûlure × critique ; au moins 1
 * (une immunité de type divise les dégâts par 4).
 */
export function attackDamage(
  settings: DungeonCombatSettings,
  attacker: DungeonFighter,
  defender: DungeonFighter,
  attackType: string,
  roll: number,
  context: DamageContext = {},
): { damage: number; effectiveness: number } {
  const special = attacker.category === 'special';
  // Un coup critique ignore les baisses d'Attaque (Intimidation), pas les hausses (Impudence) ;
  // il garde les baisses de Défense du défenseur.
  const attackMultiplier = context.critical
    ? Math.max(1, context.attackMultiplier ?? 1)
    : (context.attackMultiplier ?? 1);
  const defenseMultiplier = context.critical
    ? Math.min(1, context.defenseMultiplier ?? 1)
    : (context.defenseMultiplier ?? 1);
  const attack = attacker.stats[special ? 'special-attack' : 'attack'] * attackMultiplier;
  const defense = Math.max(
    1,
    defender.stats[special ? 'special-defense' : 'defense'] * defenseMultiplier,
  );
  const { power } = dungeonAttack(settings, attackType);
  const base = (((2 * attacker.level) / 5 + 2) * power * (attack / defense)) / 50 + 2;
  const attackerUp = context.attackerUp ?? allUp;
  const attackerHpFraction = context.attackerHpFraction ?? 1;
  const stabPercent =
    (attacker.traits?.stabPercent ?? 0) +
    statModifierPercent(
      attacker.traits,
      'stab',
      attackerHpFraction,
      !!context.attackerStatus,
      attackerUp,
    );
  const stab = attacker.types.includes(attackType)
    ? settings.stabMultiplier * (1 + stabPercent / 100)
    : 1;
  const effectiveness = dungeonTypeEffectiveness(attackType, defender.types);
  const random = settings.minDamageRoll + (1 - settings.minDamageRoll) * roll;
  const dealt = damagePercent(
    attacker.traits,
    'dealt',
    attackType,
    attacker.category,
    defender.types,
    attackerHpFraction,
    !!context.attackerStatus,
    effectiveness,
    attackerUp,
  );
  const taken = damagePercent(
    defender.traits,
    'taken',
    attackType,
    attacker.category,
    attacker.types,
    context.defenderHpFraction ?? 1,
    !!context.defenderStatus,
    effectiveness,
    context.defenderUp ?? allUp,
  );
  const talents = Math.max(0, 1 + dealt / 100) * Math.max(0, 1 + taken / 100);
  const burn = context.attackerStatus === 'burn' && !special ? 0.5 : 1;
  const weather = weatherDamageMultiplier(context.weather, attackType);
  const critical = context.critical ? (settings.critMultiplier ?? 1) : 1;
  const damage = Math.floor(
    base *
      stab *
      effectiveness *
      random *
      settings.damageMultiplier *
      talents *
      burn *
      weather *
      critical,
  );
  return { damage: Math.max(1, damage), effectiveness };
}

// --- Simulation ----------------------------------------------------------------------------------

export type DungeonOutcome = 'win' | 'loss' | 'timeout' | 'fled';

/** Effet de talent visible pendant le combat. */
export type DungeonAbilityEffect =
  | 'immunity'
  | 'sturdy'
  | 'regenerator'
  | 'moxie'
  | 'intimidate'
  | 'contactDamage'
  | 'aftermath'
  | 'naturalCure'
  | 'suppressAbility';

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
      /** Coup critique ; absent = non. */
      critical?: boolean;
      ko: boolean;
    }
  /** Changement de Pokémon actif : demandé par le joueur, ou automatique après un K.O. */
  | { kind: 'switch'; atMs: number; member: number; auto: boolean }
  /** Entrée en combat de l'adversaire suivant. */
  | { kind: 'enemy'; atMs: number; index: number }
  /**
   * Talent qui se déclenche (`side`, `index` : son Pokémon). `amount` : PV soignés (immunité,
   * soin au rappel), PV perdus par l'attaquant (contact, explosion) ou % (Intimidation, Impudence).
   */
  | {
      kind: 'ability';
      atMs: number;
      side: 'player' | 'enemy';
      index: number;
      ability: string;
      effect: DungeonAbilityEffect;
      amount: number;
      /** Statistiques baissées du Pokémon en face (Intimidation). */
      stats?: DungeonStat[];
    }
  /**
   * Statut d'un Pokémon : `inflicted` (nouveau statut), `cured` (réveil, dégel), `skipped`
   * (endormi ou gelé, il n'attaque pas), `damage` (brûlure, poison ou météo : `amount` PV perdus ;
   * `status` null = tempête de sable ou grêle).
   */
  | {
      kind: 'status';
      atMs: number;
      side: 'player' | 'enemy';
      index: number;
      status: Status | null;
      change: 'inflicted' | 'cured' | 'skipped' | 'damage';
      amount: number;
    };

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
  /** Statuts de l'équipe (même ordre que `hp`) et de l'adversaire en face. */
  statuses: (Status | null)[];
  enemyStatus: Status | null;
  /**
   * Instant à partir duquel chaque membre rappelé peut revenir au combat (0 = jamais rappelé).
   * Un K.O. fait toujours entrer un Pokémon : le dernier encore debout revient même avant.
   */
  recallReadyAt: number[];
}

export interface DungeonSimulation {
  state: DungeonState;
  events: DungeonEvent[];
}

/** Variations du combat en cours : statistiques, Fermeté utilisée, statut. */
interface FighterMods {
  stats: Record<DungeonStat, number>;
  sturdyUsed: boolean;
  status: Status | null;
  /** Attaques encore sautées (sommeil, gel). */
  statusTurns: number;
}
const freshMods = (): FighterMods => ({
  stats: { attack: 1, defense: 1, 'special-attack': 1, 'special-defense': 1, speed: 1 },
  sturdyUsed: false,
  status: null,
  statusTurns: 0,
});
/** Vitesse au plus triplée par les talents (Turbo). */
const MAX_SPEED_BOOST = 3;
/** Attaques sautées : endormi, gelé. */
const SKIPPED_TURNS: Partial<Record<Status, number>> = { sleep: 3, freeze: 2 };
/** PV max perdus après chacune de ses attaques : brûlure, poison. */
const STATUS_DAMAGE: Partial<Record<Status, number>> = { burn: 1 / 16, poison: 1 / 8 };
/** PV max perdus après chacune de ses attaques par tempête de sable ou grêle. */
const WEATHER_DAMAGE = 1 / 16;
/** Types insensibles à un statut (Feu : brûlure ; Électrik : paralysie…). */
const STATUS_TYPE_IMMUNITY: Record<Status, readonly string[]> = {
  paralysis: ['electric'],
  burn: ['fire'],
  poison: ['poison', 'steel'],
  sleep: [],
  freeze: ['ice'],
};
/** Types insensibles aux dégâts de la météo. */
const WEATHER_TYPE_IMMUNITY: Partial<Record<Weather, readonly string[]>> = {
  sand: ['rock', 'ground', 'steel'],
  hail: ['ice'],
};

/** Baisses d'Intimidation par statistique (tentatives antérieures : Attaque et Attaque Spéciale). */
function intimidation(traits: DungeonTraits | undefined): [DungeonStat, number][] {
  if (traits?.intimidateStats) {
    return Object.entries(traits.intimidateStats) as [DungeonStat, number][];
  }
  const percent = traits?.intimidate ?? 0;
  return percent > 0
    ? [
        ['attack', percent],
        ['special-attack', percent],
      ]
    : [];
}

function canGetStatus(
  f: DungeonFighter,
  mods: FighterMods,
  status: Status,
  weather?: Weather | null,
  up: HolderUp = allUp,
) {
  if (mods.status) return false;
  if (status === 'freeze' && weather === 'sun') return false;
  if (f.types.some((t) => STATUS_TYPE_IMMUNITY[status].includes(t))) return false;
  if (f.traits?.statusImmunities?.includes(status)) return false;
  return !f.traits?.teamStatusImmunities?.some((i) => i.status === status && up(i.from));
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
  const weather = setup.weather ?? null;
  const rng = createRng(setup.seed);
  // Porteurs de bonus d'équipe encore debout : PV restants ; adversaires pas encore vaincus.
  const teamUp: HolderUp = (i) => hp[i]! > 0;
  const enemyUp: HolderUp = (i) => i >= enemyIndex;
  const interval = (f: DungeonFighter, m: FighterMods, up: HolderUp, hpFraction = 1) =>
    attackIntervalMs(
      settings,
      f.stats.speed *
        m.stats.speed *
        stateStatMultiplier(f.traits, 'speed', hpFraction, !!m.status, up) *
        (m.status === 'paralysis' ? 0.5 : 1),
    );
  const queue = [...commands].sort((a, b) => a.atMs - b.atMs);
  const stopAt = Math.min(fledAtMs ?? Infinity, setup.timeLimitMs);
  const events: DungeonEvent[] = [];

  const hp = team.map((f) => f.maxHp);
  const mods = team.map(freshMods);
  const recallReadyAt = team.map(() => 0);
  let enemyMods = freshMods();
  let active = 0;
  let enemyIndex = 0;
  let enemyHp = enemies[0]?.maxHp ?? 0;
  let defeated = 0;
  let nextPlayer = Infinity;
  let nextEnemy = Infinity;
  let outcome: DungeonOutcome | null = null;
  let endedAtMs: number | null = null;
  let t = 0;
  let ci = 0;

  type Side = 'player' | 'enemy';
  const current = (side: Side) => (side === 'player' ? team[active]! : enemies[enemyIndex]!);
  const indexOf = (side: Side) => (side === 'player' ? active : enemyIndex);
  const modsOf = (side: Side) => (side === 'player' ? mods[active]! : enemyMods);
  const hpOf = (side: Side) => (side === 'player' ? hp[active]! : enemyHp);
  const setHp = (side: Side, value: number) => {
    if (side === 'player') hp[active] = value;
    else enemyHp = value;
  };
  const other = (side: Side): Side => (side === 'player' ? 'enemy' : 'player');
  const upOf = (side: Side) => (side === 'player' ? teamUp : enemyUp);
  const suppressAnnounced = new Set<string>();
  /** Talent neutralisé : le Pokémon en face a le Gaz Inhibiteur. */
  const neutralized = (side: Side) =>
    !!(side === 'player' ? enemies[enemyIndex] : team[active])?.traits?.suppressAbility;
  /** Combattant actif tel qu'il se bat : sans ses talents ni les bonus d'équipe s'il est neutralisé. */
  const fighterOf = (side: Side): DungeonFighter => {
    const f = current(side);
    if (!neutralized(side) || (!f.traits && !f.baseStats)) return f;
    return { ...f, stats: f.baseStats ?? f.stats, traits: undefined };
  };
  const trigger = (
    side: Side,
    effect: DungeonAbilityEffect,
    amount: number,
    stats?: DungeonStat[],
  ) =>
    events.push({
      kind: 'ability',
      atMs: t,
      side,
      index: indexOf(side),
      ability: current(side).ability ?? '',
      effect,
      amount,
      ...(stats && { stats }),
    });
  const statusEvent = (
    side: Side,
    status: Status | null,
    change: 'inflicted' | 'cured' | 'skipped' | 'damage',
    amount = 0,
  ) => events.push({ kind: 'status', atMs: t, side, index: indexOf(side), status, change, amount });
  const inflict = (side: Side, status: Status) => {
    const m = modsOf(side);
    if (!canGetStatus(fighterOf(side), m, status, weather, upOf(side))) return;
    m.status = status;
    m.statusTurns = SKIPPED_TURNS[status] ?? 0;
    statusEvent(side, status, 'inflicted');
  };

  /**
   * Entrée en combat : Gaz Inhibiteur (le sien, ou celui du Pokémon en face), puis Intimidation
   * (le Pokémon qui entre baisse des statistiques de celui d'en face).
   */
  const enter = (side: Side) => {
    for (const holder of [side, other(side)]) {
      // Une annonce par face-à-face (au départ, les deux entrées se suivent).
      const key = `${holder}:${indexOf(holder)}:${indexOf(other(holder))}`;
      if (
        current(holder).traits?.suppressAbility &&
        current(other(holder)).traits &&
        !suppressAnnounced.has(key)
      ) {
        suppressAnnounced.add(key);
        trigger(holder, 'suppressAbility', 0);
      }
    }
    const target = modsOf(other(side));
    // Un événement par baisse distincte (Attaque −25 %, Vitesse −10 %…).
    const byPercent = new Map<number, DungeonStat[]>();
    for (const [stat, percent] of intimidation(fighterOf(side).traits)) {
      if (percent <= 0) continue;
      target.stats[stat] *= Math.max(0, 1 - percent / 100);
      byPercent.set(percent, [...(byPercent.get(percent) ?? []), stat]);
    }
    for (const [percent, stats] of byPercent) trigger(side, 'intimidate', percent, stats);
  };
  /** K.O. de l'adversaire : le suivant entre, ou victoire. Renvoie vrai si le combat est fini. */
  const enemyDown = (): boolean => {
    defeated++;
    if (enemyIndex === enemies.length - 1) {
      outcome = 'win';
      endedAtMs = t;
      return true;
    }
    enemyIndex++;
    enemyHp = enemies[enemyIndex]!.maxHp;
    enemyMods = freshMods();
    nextEnemy = t + interval(fighterOf('enemy'), enemyMods, enemyUp);
    events.push({ kind: 'enemy', atMs: t, index: enemyIndex });
    enter('enemy');
    return false;
  };
  /**
   * K.O. du Pokémon actif : le suivant encore debout (dans l'ordre de l'équipe) qui n'a pas été
   * rappelé récemment, sinon le premier debout, ou défaite.
   */
  const playerDown = (): boolean => {
    const standing = Array.from(
      { length: team.length - 1 },
      (_, i) => (active + 1 + i) % team.length,
    ).filter((i) => hp[i]! > 0);
    const next = standing.find((i) => recallReadyAt[i]! <= t) ?? standing[0];
    if (next === undefined) {
      outcome = 'loss';
      endedAtMs = t;
      return true;
    }
    active = next;
    nextPlayer =
      t + interval(fighterOf('player'), mods[next]!, teamUp, hp[next]! / team[next]!.maxHp);
    events.push({ kind: 'switch', atMs: t, member: next, auto: true });
    enter('player');
    return false;
  };
  const down = (side: Side) => (side === 'player' ? playerDown() : enemyDown());
  const schedule = (side: Side) => {
    const f = fighterOf(side);
    const at = t + interval(f, modsOf(side), upOf(side), hpOf(side) / f.maxHp);
    if (side === 'player') nextPlayer = at;
    else nextEnemy = at;
  };

  if (team[0]) nextPlayer = interval(fighterOf('player'), mods[0]!, teamUp);
  if (enemies[0]) nextEnemy = interval(fighterOf('enemy'), enemyMods, enemyUp);

  if (team.length === 0) {
    outcome = 'loss';
    endedAtMs = 0;
  } else if (enemies.length === 0) {
    outcome = 'win';
    endedAtMs = 0;
  } else {
    enter('player');
    enter('enemy');
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
      if (
        member !== active &&
        member >= 0 &&
        member < team.length &&
        hp[member]! > 0 &&
        recallReadyAt[member]! <= t
      ) {
        // Talents du Pokémon qui sort : Régé-Force (soin), Médic Nature (statut guéri).
        const leaving = fighterOf('player');
        const regen = Math.round((leaving.traits?.regenerator ?? 0) * leaving.maxHp);
        if (regen > 0 && hp[active]! < leaving.maxHp) {
          const healed = Math.min(leaving.maxHp, hp[active]! + regen) - hp[active]!;
          hp[active] = hp[active]! + healed;
          trigger('player', 'regenerator', healed);
        }
        if (leaving.traits?.naturalCure && mods[active]!.status) {
          mods[active]!.status = null;
          mods[active]!.statusTurns = 0;
          trigger('player', 'naturalCure', 0);
        }
        recallReadyAt[active] = t + (settings.recallCooldownMs ?? 0);
        active = member;
        nextPlayer =
          t +
          interval(fighterOf('player'), mods[member]!, teamUp, hp[member]! / team[member]!.maxHp);
        events.push({ kind: 'switch', atMs: t, member, auto: false });
        enter('player');
      }
      continue;
    }

    const side: Side = nextPlayer <= nextEnemy ? 'player' : 'enemy';
    const target = other(side);
    const attacker = fighterOf(side);
    const defender = fighterOf(target);
    const attackerMods = modsOf(side);
    const targetMods = modsOf(target);

    // Endormi ou gelé : il saute son attaque (sans tirage), puis se réveille ou dégèle.
    if (attackerMods.statusTurns > 0) {
      attackerMods.statusTurns--;
      statusEvent(side, attackerMods.status, 'skipped');
      if (attackerMods.statusTurns === 0) {
        statusEvent(side, attackerMods.status, 'cured');
        attackerMods.status = null;
      }
      schedule(side);
      continue;
    }

    const roll = rng.next();
    const attackType = attackTypeAgainst(attacker, defender);
    const before = hpOf(target);
    const immunity = defender.traits?.immunities.find((i) => i.type === attackType);
    let damage = 0;
    let effectiveness = 0;
    let critical = false;
    if (immunity) {
      const healed = Math.min(defender.maxHp, before + Math.round(immunity.heal * defender.maxHp));
      setHp(target, healed);
      trigger(target, 'immunity', healed - before);
    } else {
      // Sans chance de critique (tentatives antérieures), aucun tirage : la suite est inchangée.
      // Le tirage a lieu même contre un Pokémon insensible aux critiques (Armurbaston).
      const attackerUp = upOf(side);
      const defenderUp = upOf(target);
      const attackerHpFraction = hpOf(side) / attacker.maxHp;
      const defenderHpFraction = before / defender.maxHp;
      const critPercent =
        (attacker.traits?.critPercent ?? 0) +
        statModifierPercent(
          attacker.traits,
          'critChance',
          attackerHpFraction,
          !!attackerMods.status,
          attackerUp,
        );
      const critChance = Math.min(
        1,
        Math.max(0, (settings.critChance ?? 0) * (1 + critPercent / 100)),
      );
      critical = critChance > 0 && rng.chance(critChance) && !defender.traits?.critImmunity;
      const special = attacker.category === 'special';
      const attackStat = special ? 'special-attack' : 'attack';
      const defenseStat = special ? 'special-defense' : 'defense';
      ({ damage, effectiveness } = attackDamage(settings, attacker, defender, attackType, roll, {
        attackMultiplier:
          attackerMods.stats[attackStat] *
          stateStatMultiplier(
            attacker.traits,
            attackStat,
            attackerHpFraction,
            !!attackerMods.status,
            attackerUp,
          ),
        defenseMultiplier:
          targetMods.stats[defenseStat] *
          stateStatMultiplier(
            defender.traits,
            defenseStat,
            defenderHpFraction,
            !!targetMods.status,
            defenderUp,
          ),
        attackerHpFraction,
        defenderHpFraction,
        attackerUp,
        defenderUp,
        attackerStatus: attackerMods.status,
        defenderStatus: targetMods.status,
        weather,
        critical,
      }));
      if (
        defender.traits?.sturdy &&
        !targetMods.sturdyUsed &&
        before === defender.maxHp &&
        before > 1 &&
        damage >= before
      ) {
        damage = before - 1;
        targetMods.sturdyUsed = true;
        trigger(target, 'sturdy', 0);
      }
      setHp(target, Math.max(0, before - damage));
    }
    const ko = hpOf(target) === 0;
    events.push({
      kind: 'attack',
      atMs: t,
      side,
      attacker: indexOf(side),
      defender: indexOf(target),
      attackType,
      damage,
      effectiveness,
      ...(critical && { critical }),
      ko,
    });
    schedule(side);

    // Talents après l'attaque : Turbo, Impudence, statuts infligés, contact et explosion.
    if (attacker.traits?.speedBoost) {
      attackerMods.stats.speed = Math.min(
        MAX_SPEED_BOOST,
        attackerMods.stats.speed * (1 + attacker.traits.speedBoost / 100),
      );
    }
    if (ko && attacker.traits?.moxie) {
      attackerMods.stats.attack *= 1 + attacker.traits.moxie / 100;
      attackerMods.stats['special-attack'] *= 1 + attacker.traits.moxie / 100;
      trigger(side, 'moxie', attacker.traits.moxie);
    }
    const physical = attacker.category === 'physical';
    if (damage > 0 && !ko) {
      for (const s of attacker.traits?.inflict ?? []) {
        if (s.trigger === 'attack' && rng.chance(s.chance)) inflict(target, s.status);
      }
    }
    let recoil = 0;
    if (physical && damage > 0) {
      for (const s of defender.traits?.inflict ?? []) {
        if (s.trigger === 'contact' && rng.chance(s.chance)) inflict(side, s.status);
      }
      if (defender.traits?.contactDamage) {
        const lost = Math.max(1, Math.round(defender.traits.contactDamage * attacker.maxHp));
        recoil += lost;
        trigger(target, 'contactDamage', lost);
      }
    }
    if (physical && ko && defender.traits?.aftermath) {
      const lost = Math.max(1, Math.round(defender.traits.aftermath * attacker.maxHp));
      recoil += lost;
      trigger(target, 'aftermath', lost);
    }
    // Fin de son attaque : brûlure, poison et météo.
    const statusLoss = attackerMods.status ? (STATUS_DAMAGE[attackerMods.status] ?? 0) : 0;
    if (statusLoss > 0) {
      const lost = Math.max(1, Math.round(statusLoss * attacker.maxHp));
      recoil += lost;
      statusEvent(side, attackerMods.status, 'damage', lost);
    }
    const weatherImmune =
      !!attacker.traits?.weatherImmunity ||
      attacker.types.some(
        (ty) => (weather && WEATHER_TYPE_IMMUNITY[weather]?.includes(ty)) ?? false,
      );
    if ((weather === 'sand' || weather === 'hail') && !weatherImmune) {
      const lost = Math.max(1, Math.round(WEATHER_DAMAGE * attacker.maxHp));
      recoil += lost;
      statusEvent(side, null, 'damage', lost);
    }
    if (recoil > 0) setHp(side, Math.max(0, hpOf(side) - recoil));
    const attackerKo = recoil > 0 && hpOf(side) === 0;

    // Le défenseur tombe d'abord (un boss vaincu est une victoire), puis l'attaquant.
    if (ko && down(target)) break;
    if (attackerKo && down(side)) break;
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
      statuses: mods.map((m) => m.status),
      enemyStatus: enemyMods.status,
      recallReadyAt,
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
  const koMinutes = dungeonKoMinutes(ctx, dungeon);
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
    team: applyTeamXp(ctx, input.team, xpPerMember, happiness).map((m, i) => ({
      ...m,
      koMinutes: state.hp[i] === 0 ? durationWithAbility(ctx, env, 'koDuration', koMinutes, i) : 0,
    })),
    knockedOut: input.team.filter((_, i) => state.hp[i] === 0).map((m) => m.id),
    koMinutes,
    money: win ? Math.floor(dungeon.money * bonuses.money) : 0,
    loot: [...loot].map(([itemId, quantity]) => ({ itemId, quantity })),
    gemItemId,
    gemRoll,
  };
}
