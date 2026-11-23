import type { ItemStack, Weather } from '@poke/content';
import type { GameContext } from '../context';
import type { PokemonInstance } from '../pokemon';
import { outOfRegionSpecies } from '../progress';
import {
  abilityMultiplier,
  activeAbilityEffects,
  effectiveAbility,
  memberPower,
  teamMemberPowers,
} from '../abilities';
import type { AbilityEnv } from '../abilities';
import { MAX_MEGAS_PER_TEAM, megaCount } from '../mega';
import { encounterClock, encountersAfter } from './cadence';
import type { EncounterClock } from './clock';

/**
 * Ce qu'une équipe vaut dans une zone : PE, affinités de types, conditions d'entrée, durée et
 * cadence qui en découlent.
 */

export interface TeamMember extends PokemonInstance {
  id: string;
}

/** Raison pour laquelle une équipe ne peut pas partir dans une zone. */
export type ExpeditionError =
  | { code: 'TEAM_EMPTY' }
  | { code: 'TEAM_TOO_LARGE'; max: number }
  | { code: 'DUPLICATE_MEMBER' }
  /** Plus d'un Pokémon Méga-Évolué. */
  | { code: 'TOO_MANY_MEGAS'; max: number }
  /** Espèces des Pokémon qui ne servent pas dans la région de la zone (`isRegionalPokemon`). */
  | { code: 'WRONG_REGION'; regionId: string; speciesIds: number[] }
  | { code: 'POWER_TOO_LOW'; power: number; minPower: number }
  | { code: 'MISSING_TYPES'; missing: { type: string; count: number }[] };

/**
 * Bilan d'une équipe pour une zone : sa PE, ses membres en affinité, ce qui l'empêche de partir.
 */
export interface TeamCheck {
  power: number;
  affinityCount: number;
  errors: ExpeditionError[];
}

/** Types de chaque membre de l'équipe. */
function memberTypes(
  ctx: GameContext,
  team: readonly Pick<PokemonInstance, 'speciesId' | 'formId'>[],
) {
  return team.map((m) => ctx.species(m.speciesId, m.formId)?.types ?? []);
}

/** PE de l'équipe ; avec l'environnement de l'activité, talents conditionnels compris. */
export function teamPower(
  ctx: GameContext,
  team: readonly PokemonInstance[],
  env?: AbilityEnv,
): number {
  const powers = env ? teamMemberPowers(ctx, team, env) : team.map((m) => memberPower(ctx, m));
  return powers.reduce((sum, p) => sum + p, 0);
}

/**
 * Nombre de membres de l'équipe en affinité avec la zone (un de leurs types est un type
 * d'affinité), talents compris.
 */
export function countAffinity(
  ctx: GameContext,
  zone: Pick<ExpeditionSite, 'affinityTypes'> & { weather?: Weather | null },
  team: readonly PokemonInstance[],
  hour?: number | null,
): number {
  const affinity = new Set(zone.affinityTypes);
  if (affinity.size === 0) return 0;
  // Calque : le porteur compte comme ayant le type d'affinité de la zone.
  const copiers = new Set(
    activeAbilityEffects(ctx, expeditionEnv(zone, team, hour))
      .filter((e) => e.effect.type === 'copyZoneAffinity')
      .map((e) => e.holder),
  );
  return memberTypes(ctx, team).filter(
    (types, i) => copiers.has(i) || types.some((t) => affinity.has(t)),
  ).length;
}

/** Le talent du Pokémon peut copier l'affinité de la zone (Calque), conditions mises à part. */
export function copiesZoneAffinity(
  ctx: GameContext,
  pokemon: Pick<PokemonInstance, 'speciesId' | 'formId' | 'ability'>,
): boolean {
  return !!ctx
    .ability(effectiveAbility(ctx, pokemon))
    ?.effects.some((e) => e.type === 'copyZoneAffinity');
}

/** Types requis (« 2 Pokémon Eau ») qui manquent encore à l'équipe. */
export function missingTypes(
  ctx: GameContext,
  team: readonly Pick<PokemonInstance, 'speciesId' | 'formId'>[],
  required: readonly { type: string; count: number }[],
): { type: string; count: number }[] {
  const types = memberTypes(ctx, team);
  return required
    .map((r) => ({ type: r.type, count: r.count - types.filter((t) => t.includes(r.type)).length }))
    .filter((r) => r.count > 0);
}

/**
 * Règles d'accès d'un lieu d'expédition : une zone, ou le repaire d'un légendaire de quête
 * (région de la quête, null = toutes les régions).
 */
export interface ExpeditionSite {
  regionId: string | null;
  minPower: number;
  requiredTypes: readonly { type: string; count: number }[];
  affinityTypes: readonly string[];
  /** Météo du lieu au départ (voir `zoneWeather`) ; absente = temps clair. */
  weather?: Weather | null;
}

/** Environnement des talents pour une expédition (zone ou repaire de légendaire). */
export function expeditionEnv(
  site: Pick<ExpeditionSite, 'affinityTypes'> & { weather?: Weather | null },
  team: readonly PokemonInstance[],
  hour?: number | null,
  activity: 'expedition' | 'quest' = 'expedition',
): AbilityEnv {
  return { activity, team, zoneTypes: site.affinityTypes, hour, weather: site.weather ?? null };
}

/** Ce qu'une durée d'expédition donne : nombre de rencontres et de tirages de butin. */
export interface ExpeditionPlan {
  encounters: number;
  lootRolls: number;
}

/**
 * Allongement par heure passée des intervalles entre deux rencontres et entre deux tirages de
 * butin (minutes), figé au départ d'une expédition ; absent = réglage actuel du contenu, 0 =
 * rythme constant (expéditions parties avant l'allongement).
 */
interface ExpeditionGrowth {
  encounters?: number;
  loot?: number;
}

/**
 * Rencontres et tirages de butin après `minutes` d'expédition, talents de l'équipe compris (sans
 * environnement : valeurs de base), et baies de rencontres emportées.
 */
export function expeditionPlan(
  ctx: GameContext,
  minutes: number,
  env?: AbilityEnv,
  encounterBerries?: ItemStack | null,
  growth?: ExpeditionGrowth,
): ExpeditionPlan {
  return planAfter(expeditionPace(ctx, env, encounterBerries, growth), minutes);
}

/**
 * Rythme d'une expédition (rencontres et butin par minute, baies de rencontres comprises) : de
 * quoi compter exactement ses rencontres à tout moment. Le serveur le calcule avec le contenu et
 * l'équipe du départ ; le client s'en sert pour l'affichage.
 */
export interface ExpeditionPace extends EncounterClock {
  /** Tirages de butin par minute pendant la première heure, talents compris. */
  lootPerMinute: number;
  /**
   * Intervalle de base entre deux tirages et son allongement par heure passée, en minutes ;
   * absents = rythme constant (rythmes calculés avant l'allongement du butin).
   */
  lootIntervalMinutes?: number;
  lootIntervalGrowthMinutes?: number;
}

/**
 * Rythme d'une expédition pour une équipe : rencontres par minute (voir `encounterClock`) et butin
 * par minute (`expeditions.lootIntervalMinutes`, talents compris), chacun ralentissant d'heure en
 * heure selon `growth`.
 */
export function expeditionPace(
  ctx: GameContext,
  env?: AbilityEnv,
  encounterBerries?: ItemStack | null,
  growth?: ExpeditionGrowth,
): ExpeditionPace {
  const { lootIntervalMinutes, lootIntervalGrowthMinutes } = ctx.balance.expeditions;
  return {
    ...encounterClock(ctx, env, encounterBerries, growth?.encounters),
    lootPerMinute: (env ? abilityMultiplier(ctx, env, 'lootRolls') : 1) / lootIntervalMinutes,
    lootIntervalMinutes,
    lootIntervalGrowthMinutes: growth?.loot ?? lootIntervalGrowthMinutes ?? 0,
  };
}

/**
 * Rencontres et tirages de butin après `minutes`, au rythme donné. Le butin suit le même calcul
 * que les rencontres (tranches horaires), sans baies : elles n'accélèrent que les rencontres.
 */
export function planAfter(pace: ExpeditionPace, minutes: number): ExpeditionPlan {
  return {
    encounters: encountersAfter(pace, minutes),
    lootRolls: encountersAfter(
      {
        perMinute: pace.lootPerMinute,
        boost: 1,
        boostMinutes: 0,
        intervalMinutes: pace.lootIntervalMinutes,
        intervalGrowthMinutes: pace.lootIntervalGrowthMinutes,
      },
      minutes,
    ),
  };
}

/**
 * Contrôle une équipe pour une zone : taille, doublons, Méga, région, PE minimale, types exigés.
 */
export function checkTeam(
  ctx: GameContext,
  zone: ExpeditionSite,
  team: readonly TeamMember[],
  hour?: number | null,
): TeamCheck {
  const errors: ExpeditionError[] = [];
  const { maxTeamSize } = ctx.balance.expeditions;
  if (team.length === 0) errors.push({ code: 'TEAM_EMPTY' });
  if (team.length > maxTeamSize) errors.push({ code: 'TEAM_TOO_LARGE', max: maxTeamSize });
  if (new Set(team.map((m) => m.id)).size !== team.length)
    errors.push({ code: 'DUPLICATE_MEMBER' });
  if (megaCount(team) > MAX_MEGAS_PER_TEAM)
    errors.push({ code: 'TOO_MANY_MEGAS', max: MAX_MEGAS_PER_TEAM });
  const outside = zone.regionId ? outOfRegionSpecies(ctx, zone.regionId, team) : [];
  if (zone.regionId && outside.length > 0)
    errors.push({ code: 'WRONG_REGION', regionId: zone.regionId, speciesIds: outside });

  const power = teamPower(ctx, team, expeditionEnv(zone, team, hour));
  if (power < zone.minPower) errors.push({ code: 'POWER_TOO_LOW', power, minPower: zone.minPower });

  const missing = missingTypes(ctx, team, zone.requiredTypes);
  if (missing.length > 0) errors.push({ code: 'MISSING_TYPES', missing });

  return { power, affinityCount: countAffinity(ctx, zone, team, hour), errors };
}
