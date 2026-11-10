import type { CombatSettings, DungeonStat, Status, Weather } from '@poke/content';
import { typeEffectiveness } from '@poke/data';
import { dungeonAttack } from './moves';
import type { MoveCategory } from './moves';
import { allUp, statModifierPercent } from './traits';
import type {
  DamageModifier,
  DungeonCombatSettings,
  DungeonFighter,
  DungeonTraits,
  HolderUp,
} from './types';

/**
 * Règles d'un échange de coups : cadence d'attaque, efficacité des types, dégâts.
 */

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
 * Délai entre deux attaques d'un Pokémon, linéaire selon sa Vitesse : `maxAttackIntervalMs` à
 * Vitesse 0, `baseAttackIntervalMs` à la Vitesse de référence, et le même gain par point au-delà,
 * jusqu'au plancher `minAttackIntervalMs`.
 */
export function attackIntervalMs(
  settings: Pick<
    CombatSettings,
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
