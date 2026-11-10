import type { AbilityCondition, AbilityParam, DungeonStat } from '@poke/content';
import type { StatName } from '@poke/data';
import type { GameContext, GameSpecies } from '../context';
import { computeStats } from '../pokemon';
import type { PokemonInstance } from '../pokemon';
import {
  ABILITY_PARAMS,
  deferredAbilityEffects,
  effectiveAbility,
  STATE_CONDITION_TYPES,
} from '../abilities';
import type { AbilityEnv } from '../abilities';
import type { MoveCategory } from './moves';
import type {
  DamageModifier,
  DungeonFighter,
  DungeonTraits,
  HolderUp,
  StatModifier,
} from './types';

/**
 * Construction d'un combattant, et traduction de ses talents en effets de combat
 * (`DungeonTraits`). Interne au dossier.
 */

export const allUp: HolderUp = () => true;

export function fighter(
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
    ...(hpMultiplier !== 1 && { percentHp: Math.max(1, Math.round(stats.hp)) }),
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
export function statModifierPercent(
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

/** Un effet de talent actif pour le combat, avec ses conditions à évaluer en continu. */
type ActiveEffect = ReturnType<typeof deferredAbilityEffects>[number];
type ModifierEffect = Extract<ActiveEffect['effect'], { type: 'modifier' }>;

/**
 * Range un modificateur chiffré (statistique, dégâts, STAB, critique) : en bonus fixe de
 * statistique (`statPercent`), ou en modificateur évalué à chaque attaque quand il dépend de
 * l'état du Pokémon ou vient d'un coéquipier. `mine` : le combattant porte lui-même le talent.
 * Renvoie vrai si le combattant en est changé.
 */
function addModifier(
  env: AbilityEnv,
  traits: DungeonTraits,
  statPercent: Map<StatName, number>,
  { holder, deferred }: ActiveEffect,
  effect: ModifierEffect,
  mine: boolean,
): boolean {
  const info = ABILITY_PARAMS[effect.param];
  if (!info.activities.includes(env.activity)) return false;
  if (!mine && info.selfScope && effect.scope === 'self') return false;
  const stat = STAT_PARAMS[effect.param];
  if (effect.param === 'damageDealt' || effect.param === 'damageTaken') {
    const dir = effect.param === 'damageDealt' ? 'dealt' : 'taken';
    const mod = damageModifier(dir, effect.value, deferred);
    traits.damage.push(mine ? mod : { ...mod, from: holder });
    return true;
  }
  // Statistiques et STAB : le type du camp d'en face conditionne au départ ; l'état du
  // Pokémon (PV, statut) conditionne ses statistiques en continu.
  const state = deferred.filter((c) => STATE_CONDITION_TYPES.has(c.type));
  const staticOk = deferred.every(
    (c) =>
      STATE_CONDITION_TYPES.has(c.type) ||
      (c.type === 'opponentType' && !!env.opponentTypes?.some((t) => c.types.includes(t))),
  );
  if (!staticOk) return false;
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
    if (!target) return false;
    const mod = statModifier(target, effect.value, state);
    traits.stats!.push(mine ? mod : { ...mod, from: holder });
    return true;
  }
  if (stat) statPercent.set(stat, (statPercent.get(stat) ?? 0) + effect.value);
  else if (effect.param === 'stab') traits.stabPercent += effect.value;
  else if (effect.param === 'critChance') traits.critPercent! += effect.value;
  return true;
}

/**
 * Range une mécanique spéciale (immunité, Fermeté, Intimidation…) : sans condition de l'instant,
 * et seulement pour le Pokémon qui a le talent (sauf immunité aux statuts pour toute l'équipe).
 * Renvoie vrai si le combattant en est changé.
 */
function addMechanic(
  traits: DungeonTraits,
  { holder, deferred }: ActiveEffect,
  effect: Exclude<ActiveEffect['effect'], ModifierEffect>,
  mine: boolean,
): boolean {
  if (deferred.length > 0) return false;
  if (!mine && !(effect.type === 'statusImmunity' && effect.scope === 'team')) return false;
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
      return false;
  }
  return true;
}

/** Combattant avec ses talents : statistiques recalculées une fois, traits attachés. */
function withTraits(
  f: DungeonFighter,
  ability: string | null,
  traits: DungeonTraits,
  statPercent: Map<StatName, number>,
): DungeonFighter {
  const stats = { ...f.stats };
  let { maxHp, percentHp } = f;
  let statsChanged = false;
  const abilityStatPercents: Partial<Record<DungeonStat, number>> = {};
  for (const [stat, percent] of statPercent) {
    const mult = Math.max(0, 1 + percent / 100);
    if (stat === 'hp') {
      maxHp = Math.max(1, Math.round(maxHp * mult));
      if (percentHp !== undefined) percentHp = Math.max(1, Math.round(percentHp * mult));
    } else {
      stats[stat] = Math.max(1, Math.round(stats[stat] * mult));
      abilityStatPercents[stat] = (mult - 1) * 100;
      statsChanged = true;
    }
  }
  // Statistiques d'origine gardées pour le Gaz Inhibiteur (PV max inchangés), bonus exacts des
  // talents pour l'affichage.
  return {
    ...f,
    stats,
    maxHp,
    ...(percentHp !== undefined && { percentHp }),
    ability,
    traits,
    ...(statsChanged && { baseStats: f.stats, abilityStatPercents }),
  };
}

/**
 * Applique les talents d'un camp à ses combattants : statistiques modifiées et traits figés.
 * `env.opponentTypes` : types de tout le camp d'en face (conditions de statistiques).
 */
export function withAbilities(
  ctx: GameContext,
  env: AbilityEnv,
  fighters: readonly DungeonFighter[],
): DungeonFighter[] {
  const effects = deferredAbilityEffects(ctx, env, INSTANT_CONDITIONS);
  return fighters.map((f, index) => {
    const traits = emptyTraits();
    const statPercent = new Map<StatName, number>();
    let changed = false;
    for (const active of effects) {
      const mine = active.holder === index;
      const added =
        active.effect.type === 'modifier'
          ? addModifier(env, traits, statPercent, active, active.effect, mine)
          : addMechanic(traits, active, active.effect, mine);
      changed ||= added;
    }
    const ability = effectiveAbility(ctx, env.team[index]!) || null;
    return changed ? withTraits(f, ability, traits, statPercent) : { ...f, ability };
  });
}
