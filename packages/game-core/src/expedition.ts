import { STAT_NAMES, getForm } from '@poke/data';
import type {
  Encounter,
  ItemStack,
  LootTable,
  QuestPokemon,
  SpecialEncounter,
  Weather,
  Zone,
} from '@poke/content';
import type { GameContext } from './context';
import {
  MAX_IV,
  MAX_LEVEL,
  generatePokemon,
  levelForXp,
  withPerfectIvs,
  xpForLevel,
} from './pokemon';
import type { PokemonInstance } from './pokemon';
import { outOfRegionSpecies } from './progress';
import { NO_BONUSES, pokemonXpGain } from './progression';
import type { PlayerBonuses } from './progression';
import {
  abilityBonuses,
  abilityHappiness,
  abilityModifier,
  abilityMultiplier,
  activeAbilityEffects,
  applyWildAbilities,
  attractedTypes,
  durationWithAbility,
  effectiveAbility,
  memberPower,
  resolveWeather,
  teamMemberPowers,
} from './abilities';
import type { AbilityEnv } from './abilities';
import { generateQuestPokemon } from './quest';
import { roamerEncounterChance } from './roaming';
import { createRng } from './rng';
import type { Rng } from './rng';
import { chainPerfectIvs, shinyProbability } from './shiny';
import type { ShinyFactors } from './shiny';
import { MAX_MEGAS_PER_TEAM, megaCount } from './mega';

// --- Temps d'une expédition ----------------------------------------------------------

// Marge d'arrondi : 60 min / 3 min doit bien donner 20 rencontres.
const EPSILON = 1e-9;

/** Temps avant de pouvoir arrêter l'expédition : au moins le temps d'une rencontre. */
export function expeditionMinMinutes(
  ctx: GameContext,
  minDurationMinutes: number,
  env?: AbilityEnv,
): number {
  const { encounterIntervalMinutes, maxDurationMinutes } = ctx.balance.expeditions;
  const minutes = env
    ? durationWithAbility(ctx, env, 'expeditionDuration', minDurationMinutes)
    : minDurationMinutes;
  return Math.min(maxDurationMinutes, Math.max(encounterIntervalMinutes, minutes));
}

/**
 * Rythme des rencontres : talents de l'équipe, baies de rencontres depuis le départ, et intervalle
 * qui s'allonge à chaque heure passée (par palier).
 */
export interface EncounterClock {
  /** Rencontres par minute pendant la première heure, talents compris (hors baies). */
  perMinute: number;
  boost: number;
  boostMinutes: number;
  /** Intervalle de base et son allongement par heure passée, en minutes ; absents = constant. */
  intervalMinutes?: number;
  intervalGrowthMinutes?: number;
}

const HOUR_MINUTES = 60;

function encounterClock(
  ctx: GameContext,
  env?: AbilityEnv,
  encounterBerries?: ItemStack | null,
  growthMinutes?: number,
): EncounterClock {
  const { encounterIntervalMinutes, encounterIntervalGrowthMinutes, berryDurationMinutes } =
    ctx.balance.expeditions;
  const effect = encounterBerries && ctx.itemEffect(encounterBerries.itemId, 'encounterBoost');
  return {
    perMinute: (env ? abilityMultiplier(ctx, env, 'encounters') : 1) / encounterIntervalMinutes,
    boost: effect ? effect.multiplier : 1,
    boostMinutes: effect ? encounterBerries.quantity * berryDurationMinutes : 0,
    intervalMinutes: encounterIntervalMinutes,
    intervalGrowthMinutes: growthMinutes ?? encounterIntervalGrowthMinutes ?? 0,
  };
}

/** Intervalle de base entre deux rencontres pendant l'heure `hour` (0 = la première). */
export function encounterIntervalAt(ctx: GameContext, hour: number): number {
  const { encounterIntervalMinutes, encounterIntervalGrowthMinutes } = ctx.balance.expeditions;
  return encounterIntervalMinutes + (encounterIntervalGrowthMinutes ?? 0) * Math.max(0, hour);
}

/** Rythme (hors baies) pendant l'heure `hour` : les talents s'appliquent à l'intervalle allongé. */
function hourRate(clock: EncounterClock, hour: number): number {
  const growth = clock.intervalGrowthMinutes ?? 0;
  const interval = clock.intervalMinutes ?? 0;
  if (growth <= 0 || interval <= 0) return clock.perMinute;
  return (clock.perMinute * interval) / (interval + growth * hour);
}

/** Tranches de rythme constant, de proche en proche : une par heure, coupée à la fin des baies. */
function* clockSegments(clock: EncounterClock) {
  let start = 0;
  for (let hour = 0; ; hour++) {
    const end = (hour + 1) * HOUR_MINUTES;
    const rate = hourRate(clock, hour);
    if (start < clock.boostMinutes && clock.boostMinutes < end) {
      yield { start, end: clock.boostMinutes, rate: rate * clock.boost };
      start = clock.boostMinutes;
    }
    yield { start, end, rate: start < clock.boostMinutes ? rate * clock.boost : rate };
    start = end;
  }
}

/**
 * Horizon des calculs de rythme : un an. Les tranches horaires sont sans fin et, l'intervalle
 * s'allongeant, le nombre de rencontres ne croît plus qu'en logarithme du temps : sans borne, une
 * n-ième rencontre lointaine (stock de Balls « pour combien de temps ? ») ou une durée infinie
 * bouclerait des millions d'heures, voire sans fin (onglet gelé, 10 nov.). Au-delà : jamais.
 */
const MAX_CLOCK_MINUTES = 366 * 24 * HOUR_MINUTES;

/** Rencontres survenues après `minutes` : le temps sous l'effet d'une baie compte davantage. */
function encountersAfter(clock: EncounterClock, minutes: number): number {
  const until = Math.min(minutes, MAX_CLOCK_MINUTES);
  if (!(until > 0)) return 0;
  let total = 0;
  for (const s of clockSegments(clock)) {
    if (s.start >= until) break;
    total += s.rate * (Math.min(s.end, until) - s.start);
  }
  return Math.floor(total + EPSILON);
}

/** Moment de la n-ième rencontre (à partir de 1) ; `Infinity` si elle n'arrive pas d'ici un an. */
function encounterTime(clock: EncounterClock, n: number): number {
  if (n <= 0) return 0;
  if (!(clock.perMinute > 0) || !(n < Infinity)) return Infinity;
  let total = 0;
  for (const s of clockSegments(clock)) {
    if (s.start >= MAX_CLOCK_MINUTES) return Infinity;
    const count = s.rate * (s.end - s.start);
    if (total + count >= n - EPSILON) return Math.max(s.start, s.start + (n - total) / s.rate);
    total += count;
  }
  return Infinity; // jamais atteint : les tranches sont sans fin
}

/**
 * Moment de la n-ième rencontre (à partir de 1), en minutes depuis le départ : talents de l'équipe,
 * baies de rencontres et allongement de l'intervalle (figé au départ, réglage actuel par défaut).
 */
export function encounterMinutes(
  ctx: GameContext,
  n: number,
  env?: AbilityEnv,
  encounterBerries?: ItemStack | null,
  growthMinutes?: number,
): number {
  return encounterTime(encounterClock(ctx, env, encounterBerries, growthMinutes), n);
}

/** Baies entamées après `minutes` : une pour chaque tranche d'effet commencée. */
export function berriesConsumed(ctx: GameContext, quantity: number, minutes: number): number {
  const slices = Math.ceil(minutes / ctx.balance.expeditions.berryDurationMinutes - EPSILON);
  return Math.min(quantity, Math.max(0, slices));
}

/** Baies utiles au plus sur une expédition : de quoi couvrir la durée maximale. */
export function maxExpeditionBerries(ctx: GameContext): number {
  const { maxDurationMinutes, berryDurationMinutes } = ctx.balance.expeditions;
  return Math.ceil(maxDurationMinutes / berryDurationMinutes - EPSILON);
}

// --- Capture et pitié ----------------------------------------------------------------

export function pityMultiplier(ctx: GameContext, misses: number): number {
  const { weightBonusPerMiss, maxMultiplier } = ctx.balance.pity;
  return Math.min(maxMultiplier, 1 + weightBonusPerMiss * misses);
}

export interface CaptureFactors {
  captureRate: number;
  ballMultiplier: number;
  /** Ball à capture assurée (Master Ball). */
  guaranteed?: boolean;
  boostMultiplier?: number;
  /** Nombre de membres de l'équipe en affinité avec la zone. */
  affinityCount?: number;
  /** Bonus permanent du joueur (collections). */
  bonusMultiplier?: number;
}

/**
 * Inspirée de la formule officielle : a = (3 PVmax − 2 PV) / (3 PVmax) × taux × Ball,
 * probabilité ≈ a / 255, puis bonus d'affinité et multiplicateur global.
 */
export function captureProbability(ctx: GameContext, f: CaptureFactors): number {
  if (f.guaranteed) return 1;
  const { globalMultiplier, assumedHpFraction, affinityBonusPerPokemon } = ctx.balance.capture;
  const hpFactor = (3 - 2 * assumedHpFraction) / 3;
  const affinity = 1 + affinityBonusPerPokemon * (f.affinityCount ?? 0);
  const a =
    f.captureRate *
    f.ballMultiplier *
    (f.boostMultiplier ?? 1) *
    hpFactor *
    affinity *
    (f.bonusMultiplier ?? 1) *
    globalMultiplier;
  return Math.min(1, Math.max(0, a / 255));
}

/**
 * Rencontres actives de la zone (espèces désactivées exclues), poids ajustés par la pitié et
 * par les types qu'attirent les talents de l'équipe (multiplicateurs par type, cumulés).
 */
export function weightedEncounters(
  ctx: GameContext,
  zone: Zone,
  pity: ReadonlyMap<number, number> = new Map(),
  attracted: ReadonlyMap<string, number> = new Map(),
): { value: Encounter; weight: number }[] {
  const typeFactor = (e: Encounter) =>
    attracted.size === 0
      ? 1
      : (ctx.species(e.speciesId, e.formId)?.types ?? []).reduce(
          (f, t) => f * (attracted.get(t) ?? 1),
          1,
        );
  return zone.encounters
    .filter((e) => ctx.species(e.speciesId)?.enabled)
    .map((e) => ({
      value: e,
      weight: e.weight * pityMultiplier(ctx, pity.get(e.speciesId) ?? 0) * typeFactor(e),
    }));
}

/**
 * Rencontres spéciales qu'ouvrent des Pokémon (l'équipe d'une expédition, ou ceux du joueur pour
 * l'affichage) : il faut le Pokémon requis exact, espèce et forme, pas une évolution.
 */
export function specialEncountersFor(
  ctx: GameContext,
  zone: Pick<Zone, 'specialEncounters'>,
  pokemon: readonly Pick<PokemonInstance, 'speciesId' | 'formId'>[],
): SpecialEncounter[] {
  return zone.specialEncounters.filter(
    (s) =>
      ctx.species(s.speciesId)?.enabled &&
      pokemon.some(
        (p) =>
          p.speciesId === s.requiredSpeciesId && (p.formId ?? null) === (s.requiredFormId ?? null),
      ),
  );
}

/** Probabilité d'apparition de chaque espèce (pour l'admin et l'affichage). */
export function encounterProbabilities(
  ctx: GameContext,
  zone: Zone,
  pity?: ReadonlyMap<number, number>,
  attracted?: ReadonlyMap<string, number>,
): { speciesId: number; formId: number | null; probability: number }[] {
  const entries = weightedEncounters(ctx, zone, pity, attracted);
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  const byForm = new Map<
    string,
    { speciesId: number; formId: number | null; probability: number }
  >();
  for (const e of entries) {
    const formId = e.value.formId ?? null;
    const key = `${e.value.speciesId}:${formId}`;
    const current = byForm.get(key) ?? { speciesId: e.value.speciesId, formId, probability: 0 };
    current.probability += e.weight / total;
    byForm.set(key, current);
  }
  return [...byForm.values()];
}

// --- Butin ---------------------------------------------------------------------------------

export function addStacks(into: Map<string, number>, stacks: readonly ItemStack[]): void {
  for (const s of stacks) into.set(s.itemId, (into.get(s.itemId) ?? 0) + s.quantity);
}

/** Un tirage : chaque entrée tombe indépendamment selon sa probabilité. */
export function rollLoot(rng: Rng, table: LootTable): ItemStack[] {
  const drops: ItemStack[] = [];
  for (const entry of table.entries) {
    if (rng.chance(entry.chance)) {
      drops.push({ itemId: entry.itemId, quantity: rng.int(entry.min, entry.max) });
    }
  }
  return drops;
}

/**
 * Butin possible d'une expédition (pour l'affichage) : probabilité d'obtenir chaque objet au
 * moins une fois sur l'ensemble des tirages, et quantité par tirage réussi.
 */
export function lootProbabilities(
  ctx: GameContext,
  zone: Zone,
  minutes: number,
  env?: AbilityEnv,
): { itemId: string; probability: number; min: number; max: number }[] {
  const table = zone.lootTableId ? ctx.lootTable(zone.lootTableId) : undefined;
  if (!table) return [];
  const rolls = expeditionPlan(ctx, minutes, env).lootRolls;
  return table.entries.map((e) => ({
    itemId: e.itemId,
    probability: 1 - (1 - e.chance) ** rolls,
    min: e.min,
    max: e.max,
  }));
}

// --- Validation de l'équipe -----------------------------------------------------------------

export interface TeamMember extends PokemonInstance {
  id: string;
}

export type ExpeditionError =
  | { code: 'TEAM_EMPTY' }
  | { code: 'TEAM_TOO_LARGE'; max: number }
  | { code: 'DUPLICATE_MEMBER' }
  /** Plus d'un Pokémon Méga-Évolué. */
  | { code: 'TOO_MANY_MEGAS'; max: number }
  /** Espèces hors du Pokédex de la région de la zone. */
  | { code: 'WRONG_REGION'; regionId: string; speciesIds: number[] }
  | { code: 'POWER_TOO_LOW'; power: number; minPower: number }
  | { code: 'MISSING_TYPES'; missing: { type: string; count: number }[] };

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

export interface ExpeditionPlan {
  encounters: number;
  lootRolls: number;
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
  growthMinutes?: number,
): ExpeditionPlan {
  return planAfter(expeditionPace(ctx, env, encounterBerries, growthMinutes), minutes);
}

/**
 * Rythme d'une expédition (rencontres et butin par minute, baies de rencontres comprises) : de
 * quoi compter exactement ses rencontres à tout moment. Le serveur le calcule avec le contenu et
 * l'équipe du départ ; le client s'en sert pour l'affichage.
 */
export interface ExpeditionPace extends EncounterClock {
  lootPerMinute: number;
}

export function expeditionPace(
  ctx: GameContext,
  env?: AbilityEnv,
  encounterBerries?: ItemStack | null,
  growthMinutes?: number,
): ExpeditionPace {
  return {
    ...encounterClock(ctx, env, encounterBerries, growthMinutes),
    lootPerMinute:
      (env ? abilityMultiplier(ctx, env, 'lootRolls') : 1) /
      ctx.balance.expeditions.lootIntervalMinutes,
  };
}

/** Rencontres et tirages de butin après `minutes`, au rythme donné. */
export function planAfter(pace: ExpeditionPace, minutes: number): ExpeditionPlan {
  return {
    encounters: encountersAfter(pace, minutes),
    lootRolls: Math.floor(pace.lootPerMinute * minutes + EPSILON),
  };
}

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

// --- Filtre de capture -------------------------------------------------------------------

/**
 * Pokémon à tenter de capturer ; les autres rencontres sont ignorées (ni Ball ni baie).
 * Les critères se cumulent ; `shiny: 'always'` tente en plus tout shiny, quels que soient
 * les autres critères.
 */
export interface CaptureFilter {
  /** Espèces visées ; vide = toutes. */
  speciesIds: number[];
  /** Nombre minimal d'IV au maximum (31). */
  minPerfectIvs: number;
  shiny: 'any' | 'always' | 'only';
  /**
   * Uniquement les Pokémon pas encore capturés (espèce, ou forme pour une forme régionale,
   * Méga…) ; une fois l'un d'eux capturé, ses rencontres suivantes sont ignorées.
   */
  newOnly?: boolean;
}

/** Captures déjà enregistrées au Pokédex, pour le filtre « nouveaux Pokémon ». */
export interface CaughtDex {
  speciesIds: ReadonlySet<number>;
  formIds: ReadonlySet<number>;
}

export function isNewToDex(
  caught: CaughtDex,
  wild: Pick<PokemonInstance, 'speciesId' | 'formId'>,
): boolean {
  return wild.formId != null
    ? !caught.formIds.has(wild.formId)
    : !caught.speciesIds.has(wild.speciesId);
}

export function perfectIvCount(pokemon: Pick<PokemonInstance, 'ivs'>): number {
  return STAT_NAMES.filter((stat) => pokemon.ivs[stat] === MAX_IV).length;
}

export function matchesCaptureFilter(
  filter: CaptureFilter | null | undefined,
  wild: Pick<PokemonInstance, 'speciesId' | 'formId' | 'isShiny' | 'ivs'>,
  caught?: CaughtDex,
): boolean {
  if (!filter) return true;
  if (filter.shiny === 'always' && wild.isShiny) return true;
  if (filter.shiny === 'only' && !wild.isShiny) return false;
  if (filter.newOnly && caught && !isNewToDex(caught, wild)) return false;
  if (filter.speciesIds.length > 0 && !filter.speciesIds.includes(wild.speciesId)) return false;
  return perfectIvCount(wild) >= filter.minPerfectIvs;
}

// --- Balls par catégorie ------------------------------------------------------------------

/**
 * Déjà capturé avec au moins N IV parfaits (`iv1` à `iv6`) : catégories facultatives du plan,
 * qui affinent « déjà capturé ».
 */
export const IV_BALL_CATEGORIES = ['iv1', 'iv2', 'iv3', 'iv4', 'iv5', 'iv6'] as const;
export type IvBallCategory = (typeof IV_BALL_CATEGORIES)[number];
export const ivBallCategory = (count: number) => `iv${count}` as IvBallCategory;

/** Catégorie d'un Pokémon rencontré, qui décide de la Ball lancée. */
export type BallCategory = 'new' | 'shiny' | 'caught' | IvBallCategory;
export const BALL_CATEGORIES: readonly BallCategory[] = [
  'new',
  'shiny',
  'caught',
  ...IV_BALL_CATEGORIES,
];

/**
 * Ball à lancer pour chaque catégorie ; null = pas de capture. Une catégorie d'IV absente n'est
 * pas réglée : ses Pokémon tombent dans la catégorie d'IV inférieure réglée, sinon « déjà capturé ».
 */
export type BallPlan = Record<'new' | 'shiny' | 'caught', string | null> &
  Partial<Record<IvBallCategory, string | null>>;
export const NO_BALL_PLAN: BallPlan = { new: null, shiny: null, caught: null };

/**
 * Chromatique d'abord, puis absent du Pokédex (au départ, ou capturé depuis), sinon déjà capturé :
 * avec le plus grand nombre d'IV parfaits réglé dans le plan qu'il atteint, ou sans précision.
 */
export function ballCategory(
  wild: Pick<PokemonInstance, 'speciesId' | 'formId' | 'isShiny' | 'ivs'>,
  caught: CaughtDex,
  plan?: BallPlan | null,
): BallCategory {
  if (wild.isShiny) return 'shiny';
  if (isNewToDex(caught, wild)) return 'new';
  for (let count = perfectIvCount(wild); count >= 1 && plan; count--) {
    if (plan[ivBallCategory(count)] !== undefined) return ivBallCategory(count);
  }
  return 'caught';
}

/** Ball d'une catégorie du plan (null : pas de capture ou catégorie non réglée). */
export const planBall = (plan: BallPlan, category: BallCategory) => plan[category] ?? null;

export const planHasBall = (plan: BallPlan) =>
  BALL_CATEGORIES.some((c) => planBall(plan, c) !== null);

/**
 * Journal des lancers d'une expédition, un caractère par rencontre, écrit au fil de l'expédition
 * quand la Ball est retirée du sac : la catégorie dont la Ball est lancée, `NO_THROW` si la
 * catégorie n'a pas de Ball, `MISSED_THROW` si sa Ball manquait dans le sac à ce moment-là.
 */
export const THROW_CODES: Record<BallCategory, string> = {
  new: 'n',
  shiny: 's',
  caught: 'c',
  iv1: '1',
  iv2: '2',
  iv3: '3',
  iv4: '4',
  iv5: '5',
  iv6: '6',
};
export const NO_THROW = '-';
export const MISSED_THROW = 'x';
const CODE_CATEGORIES = new Map(BALL_CATEGORIES.map((c) => [THROW_CODES[c], c]));

/** Lancer décidé pour une rencontre : une Ball, ou rien (et pourquoi). */
export type ThrowDecision = { ballItemId: string } | { outcome: 'noBall' | 'ignored' };

export interface ThrowContext {
  /** Rang de la rencontre (à partir de 1). */
  n: number;
  wild: PokemonInstance;
  category: BallCategory;
  /** Rencontre ordinaire de la zone (ni fuyard ni rencontre spéciale). */
  ordinary: boolean;
  /** Captures connues à ce moment (Pokédex du départ et captures de l'expédition). */
  caught: CaughtDex;
}

export type ChooseThrow = (t: ThrowContext) => ThrowDecision;

/**
 * Lancers d'après le plan de Balls. Avec un journal (`throws`), il fait foi : les rencontres
 * qu'il ne couvre pas ne reçoivent pas de Ball. Sans journal (simulateur), stock illimité.
 */
export function planThrows(plan: BallPlan, throws?: string): ChooseThrow {
  return ({ n, category }) => {
    const code = throws === undefined ? THROW_CODES[category] : (throws[n - 1] ?? NO_THROW);
    if (code === MISSED_THROW) return { outcome: 'noBall' };
    const ballItemId = planBall(plan, CODE_CATEGORIES.get(code) ?? category);
    return code !== NO_THROW && ballItemId ? { ballItemId } : { outcome: 'ignored' };
  };
}

/** Lancers des anciennes expéditions : Balls réservées au départ et filtre de capture. */
function reservedThrows(
  balls: ItemStack | null | undefined,
  filter: CaptureFilter | null | undefined,
): ChooseThrow {
  let left = balls?.quantity ?? 0;
  return ({ wild, ordinary, caught }) => {
    if (!balls || left <= 0) return { outcome: 'noBall' };
    if (ordinary && !matchesCaptureFilter(filter, wild, caught)) return { outcome: 'ignored' };
    left--;
    return { ballItemId: balls.itemId };
  };
}

/**
 * État figé au départ d'une expédition à plan de Balls, pour rejouer ses rencontres à l'identique
 * à chaque retrait de Balls puis à la réclamation : captures du Pokédex et pitié des Pokémon
 * qu'elle peut croiser.
 */
export interface CaptureSnapshot {
  speciesIds: number[];
  formIds: number[];
  pity: Record<number, number>;
}

/** Instantané limité aux Pokémon que l'expédition peut croiser (`speciesIds`), formes comprises. */
export function captureSnapshot(
  dex: CaughtDex,
  pity: Readonly<Record<number, number>>,
  speciesIds: Iterable<number>,
): CaptureSnapshot {
  const relevant = new Set(speciesIds);
  return {
    speciesIds: [...dex.speciesIds].filter((id) => relevant.has(id)),
    formIds: [...dex.formIds].filter((id) => relevant.has(getForm(id)?.speciesId ?? -1)),
    pity: Object.fromEntries(Object.entries(pity).filter(([id]) => relevant.has(Number(id)))),
  };
}

/** Espèces qu'une expédition dans la zone peut croiser (zone, rencontres spéciales, fuyards). */
export function zoneSpeciesIds(zone: Zone, roamers: readonly ExpeditionRoamer[] = []): number[] {
  return [
    ...new Set([
      ...zone.encounters.map((e) => e.speciesId),
      ...zone.specialEncounters.map((s) => s.speciesId),
      ...roamers.map((r) => r.target.speciesId),
    ]),
  ];
}

// --- Résolution ----------------------------------------------------------------------------

/** Suite de tirages du butin, distincte de celle des rencontres. */
const LOOT_SEED_MASK = 0x5bd1e995;

export interface ExpeditionInput {
  zone: Zone;
  /** Temps écoulé entre le départ et l'arrêt de l'expédition. */
  elapsedMinutes: number;
  seed: number;
  team: readonly TeamMember[];
  /**
   * Ball à lancer selon la catégorie du Pokémon rencontré. Les Balls sont retirées du sac au fil
   * de l'expédition (voir `throws`).
   */
  ballPlan?: BallPlan | null;
  /**
   * Journal des lancers (voir `THROW_CODES`), qui fait foi pour le plan de Balls ; absent = stock
   * illimité (simulateur).
   */
  throws?: string;
  /** Anciennes expéditions : Balls réservées au départ (une par tentative de capture). */
  balls?: ItemStack | null;
  /** Baies de capture : la capture est facilitée le temps de leur effet, depuis le départ. */
  berries: ItemStack | null;
  /** Baies de rencontres : les rencontres s'accélèrent le temps de leur effet, depuis le départ. */
  encounterBerries?: ItemStack | null;
  /**
   * Allongement de l'intervalle entre deux rencontres par heure passée, figé au départ (0 pour
   * les anciennes expéditions) ; par défaut, le réglage du contenu.
   */
  intervalGrowthMinutes?: number;
  /** Échecs de capture accumulés par espèce. */
  pity: Readonly<Record<number, number>>;
  /** Par défaut, calculée à partir de l'équipe (le simulateur la fixe directement). */
  affinityCount?: number;
  /** Bonus permanents du joueur (paliers, collections) ; aucun par défaut. */
  bonuses?: PlayerBonuses;
  /** Chaîne de zone et Charme Chroma ; aucun multiplicateur par défaut. */
  shiny?: ShinyFactors;
  /** Anciennes expéditions : Pokémon à tenter de capturer ; absent = tous. */
  captureFilter?: CaptureFilter | null;
  /**
   * Captures du Pokédex, figées au départ : décident de la catégorie (nouveau ou déjà capturé) et
   * du filtre « nouveaux Pokémon ».
   */
  caught?: CaughtDex;
  /** Heure locale du joueur au départ (talents de jour ou de nuit). */
  hour?: number | null;
  /** Météo de la zone au départ (voir `zoneWeather`) ; absente = temps clair. */
  weather?: Weather | null;
  /**
   * Fuyards présents dans la zone au départ (voir `roamerPositions`) : chaque rencontre a
   * `target.roaming` % de chances d'être l'un d'eux, croisé une fois au plus.
   */
  roamers?: readonly ExpeditionRoamer[];
}

/** Fuyard emporté par une expédition. */
export interface ExpeditionRoamer {
  questId: string;
  target: QuestPokemon;
}

/** `ignored` : écarté par le filtre de capture. */
/** `fled` : le joueur a pris la fuite (expédition légendaire). */
export type EncounterOutcome = 'captured' | 'escaped' | 'noBall' | 'ignored' | 'fled';

export interface EncounterResult {
  speciesId: number;
  /** Forme rencontrée ; null = forme par défaut. */
  formId: number | null;
  level: number;
  isShiny: boolean;
  outcome: EncounterOutcome;
  captureChance: number;
  /** Ball lancée (absent sans lancer). */
  ballItemId?: string;
  /** Présent si capturé. */
  pokemon?: PokemonInstance;
  /** Fuyard de cette quête (absent pour une rencontre ordinaire). */
  questId?: string;
  /** Rencontre spéciale, ouverte par un Pokémon de l'équipe. */
  special?: true;
}

/** XP de base que rapporte un Pokémon vaincu (ou rencontré), avant multiplicateur. */
export function defeatXp(species: { baseExperience: number | null }, level: number): number {
  return ((species.baseExperience ?? 50) * level) / 7;
}

/** XP totale (non arrondie) d'adversaires vaincus, avant multiplicateur. */
export function defeatedXp(
  ctx: GameContext,
  enemies: readonly { speciesId: number; formId?: number | null; level: number }[],
): number {
  return enemies.reduce((sum, e) => {
    const species = ctx.species(e.speciesId, e.formId);
    return sum + (species ? defeatXp(species, e.level) : 0);
  }, 0);
}

/**
 * XP moyenne que rapportera une expédition à chaque membre (pour l'affichage) : espérance sur
 * les rencontres et leurs niveaux, sans tenir compte de la pitié qui évolue en cours de route.
 * Avec un environnement, les talents de l'équipe sont pris en compte (rencontres, types attirés,
 * niveaux, bonus d'XP).
 */
export function expectedExpeditionXp(
  ctx: GameContext,
  zone: Zone,
  minutes: number,
  bonuses: PlayerBonuses = NO_BONUSES,
  env?: AbilityEnv,
): number {
  const attracted = env ? attractedTypes(ctx, env) : undefined;
  const entries = weightedEncounters(ctx, zone, undefined, attracted);
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  if (total === 0) return 0;
  const xpBonus = env ? abilityBonuses(ctx, env, bonuses).xp : bonuses.xp;
  const extraLevels = env ? Math.round(abilityModifier(ctx, env, 'wildLevel')) : 0;
  const multiplier = ctx.balance.xp.multiplier * xpBonus;
  const perEncounter = entries.reduce((sum, { value: e, weight }) => {
    const species = ctx.species(e.speciesId, e.formId);
    if (!species) return sum;
    let xp = 0;
    for (let level = e.minLevel; level <= e.maxLevel; level++) {
      const wildLevel = Math.min(MAX_LEVEL, Math.max(1, level + extraLevels));
      xp += Math.floor(defeatXp(species, wildLevel) * multiplier);
    }
    return sum + ((weight / total) * xp) / (e.maxLevel - e.minLevel + 1);
  }, 0);
  return Math.round(perEncounter * expeditionPlan(ctx, minutes, env).encounters);
}

export interface TeamMemberResult {
  id: string;
  xpGained: number;
  levelBefore: number;
  levelAfter: number;
  xpAfter: number;
  happinessAfter: number;
}

export interface ExpeditionResult {
  encounters: EncounterResult[];
  loot: ItemStack[];
  team: TeamMemberResult[];
  /** XP gagnée par chaque membre (avant plafonnement au niveau maximal). */
  xpPerMember: number;
  /** Nouveaux compteurs de pitié des espèces concernées. */
  pity: Record<number, number>;
  ballsUsed: number;
  /** Baies de capture entamées. */
  berriesUsed: number;
  /** Baies de rencontres entamées (absent des expéditions anciennes). */
  encounterBerriesUsed?: number;
  /** Probabilité shiny de chaque rencontre (multiplicateurs compris). */
  shinyChance: number;
  /**
   * Tirages de butin de l'expédition, table de butin ou non (chances d'objet de quête) ; absent
   * des résultats anciens.
   */
  lootRolls?: number;
  /**
   * Météo de l'expédition : celle qu'impose un talent de l'équipe, sinon celle de la zone au
   * départ (conditions de météo des quêtes) ; null = temps clair, absent des résultats anciens.
   */
  weather?: Weather | null;
}

/**
 * XP (plafonnée au niveau maximal) et bonheur (borné entre 0 et 255) gagnés par l'équipe. `xp`
 * est l'XP de chaque membre avant les bonus de région (complétions d'expédition), propres à
 * chacun.
 */
export function applyTeamXp(
  ctx: GameContext,
  team: readonly TeamMember[],
  xp: number,
  happinessDelta: number,
  bonuses?: Pick<PlayerBonuses, 'regionXp'>,
): TeamMemberResult[] {
  return team.map((m) => {
    const growth = ctx.species(m.speciesId, m.formId)?.growthRate;
    const xpCap = growth ? xpForLevel(growth, MAX_LEVEL) : m.xp;
    const gained = pokemonXpGain(ctx, bonuses, m.speciesId, xp);
    const xpAfter = Math.max(m.xp, Math.min(m.xp + gained, xpCap));
    return {
      id: m.id,
      xpGained: xpAfter - m.xp,
      levelBefore: m.level,
      levelAfter: growth ? Math.max(m.level, levelForXp(growth, xpAfter)) : m.level,
      xpAfter,
      happinessAfter: Math.min(255, Math.max(0, m.happiness + happinessDelta)),
    };
  });
}

/** Expédition jouée rencontre par rencontre (voir `createExpeditionRun`). */
export interface ExpeditionRun {
  /** Moment de la n-ième rencontre (à partir de 1), en minutes depuis le départ. */
  encounterMinutes(n: number): number;
  /** Rencontres survenues après `minutes`. */
  encountersAfter(minutes: number): number;
  /** Rencontres déjà jouées. */
  readonly played: number;
  /**
   * Joue la rencontre suivante ; `choose` décide de la Ball lancée. null si la zone n'a plus
   * aucune rencontre active.
   */
  next(choose: ChooseThrow): EncounterResult | null;
  /** Résultat après `elapsedMinutes` (butin, XP, pitié…), sur les rencontres jouées. */
  finish(elapsedMinutes: number): ExpeditionResult;
}

/**
 * Expédition jouée pas à pas, de façon déterministe (seed + contenu de la version active au
 * départ) : les rencontres, puis le butin, suivent chacun leur propre suite de tirages. Rejouer
 * les mêmes lancers redonne les mêmes rencontres ; le serveur s'en sert pour retirer les Balls du
 * sac au fil de l'expédition.
 */
export function createExpeditionRun(
  ctx: GameContext,
  input: Omit<ExpeditionInput, 'elapsedMinutes'>,
): ExpeditionRun {
  const rng = createRng(input.seed);
  const zone = { ...input.zone, weather: input.weather ?? null };
  const pity = new Map(Object.entries(input.pity).map(([k, v]) => [Number(k), v]));
  const touched = new Set<number>();
  const affinityCount = input.affinityCount ?? countAffinity(ctx, zone, input.team, input.hour);
  const captureBerry = input.berries
    ? ctx.itemEffect(input.berries.itemId, 'captureBoost')
    : undefined;
  const captureBerryMinutes = captureBerry
    ? input.berries!.quantity * ctx.balance.expeditions.berryDurationMinutes
    : 0;
  const env = expeditionEnv(zone, input.team, input.hour);
  const shinyChance = Math.min(
    1,
    shinyProbability(ctx, input.shiny) * abilityMultiplier(ctx, env, 'shinyChance'),
  );
  const perfectIvs = Math.min(
    6,
    chainPerfectIvs(ctx, input.shiny?.chain ?? 0) +
      Math.max(0, Math.round(abilityModifier(ctx, env, 'perfectIvs'))),
  );
  const bonuses = abilityBonuses(ctx, env, input.bonuses ?? NO_BONUSES);
  const attracted = attractedTypes(ctx, env);
  const extraLevels = Math.round(abilityModifier(ctx, env, 'wildLevel'));
  const clock = encounterClock(ctx, env, input.encounterBerries, input.intervalGrowthMinutes);
  // Copie enrichie au fil des captures : un nouveau Pokémon capturé ne l'est plus ensuite.
  const caught = {
    speciesIds: new Set(input.caught?.speciesIds),
    formIds: new Set(input.caught?.formIds),
  };
  // Fuyards et rencontres spéciales : une fois au plus chacun.
  const roamers = [...(input.roamers ?? [])];
  const specials = specialEncountersFor(ctx, zone, input.team);

  const wildOf = (speciesId: number, level: number, formId: number | null, shiny: number) => {
    const wild = generatePokemon(ctx, rng, speciesId, level, { shinyProbability: shiny, formId });
    if (perfectIvs > 0) wild.ivs = withPerfectIvs(rng, wild.ivs, perfectIvs);
    applyWildAbilities(ctx, env, rng, wild);
    return wild;
  };
  const wildLevel = (min: number, max: number) =>
    Math.min(MAX_LEVEL, Math.max(1, rng.int(min, max) + extraLevels));
  /** Pokémon de la prochaine rencontre ; null si la zone n'a plus aucune rencontre active. */
  const meet = () => {
    const roamerIndex = roamers.findIndex((r) =>
      rng.chance(roamerEncounterChance(ctx, r.target, r.target.roaming ?? 0, attracted) / 100),
    );
    if (roamerIndex >= 0) {
      const [{ questId, target }] = roamers.splice(roamerIndex, 1) as [ExpeditionRoamer];
      return {
        wild: generateQuestPokemon(ctx, rng, target, shinyChance),
        extra: { questId },
        ordinary: false,
      };
    }
    const specialIndex = specials.findIndex((s) => rng.chance(s.chance / 100));
    if (specialIndex >= 0) {
      const [special] = specials.splice(specialIndex, 1) as [SpecialEncounter];
      const formId = ctx.species(special.speciesId, special.formId)!.form?.id ?? null;
      const level = wildLevel(special.minLevel, special.maxLevel);
      return {
        wild: wildOf(special.speciesId, level, formId, 0),
        extra: { special: true as const },
        ordinary: false,
      };
    }
    const table = weightedEncounters(ctx, zone, pity, attracted);
    if (table.length === 0) return null;
    const encounter = rng.weighted(table);
    const formId = ctx.species(encounter.speciesId, encounter.formId)!.form?.id ?? null;
    const level = wildLevel(encounter.minLevel, encounter.maxLevel);
    return {
      wild: wildOf(encounter.speciesId, level, formId, shinyChance),
      extra: {},
      ordinary: true,
    };
  };

  const encounters: EncounterResult[] = [];
  let xpPerMember = 0;
  let ballsUsed = 0;

  return {
    encounterMinutes: (n) => encounterTime(clock, n),
    encountersAfter: (minutes) => encountersAfter(clock, minutes),
    get played() {
      return encounters.length;
    },
    next(choose) {
      const n = encounters.length + 1;
      const met = meet();
      if (!met) return null;
      const { wild, extra, ordinary } = met;
      const species = ctx.species(wild.speciesId, wild.formId)!;
      const formId = wild.formId ?? null;
      xpPerMember += Math.floor(
        defeatXp(species, wild.level) * ctx.balance.xp.multiplier * bonuses.xp,
      );
      const base = {
        speciesId: wild.speciesId,
        formId,
        level: wild.level,
        isShiny: wild.isShiny,
        ...extra,
      };
      const category = ballCategory(wild, caught, input.ballPlan);
      const decision = choose({ n, wild, ordinary, caught, category });
      if ('outcome' in decision) {
        const skipped: EncounterResult = { ...base, outcome: decision.outcome, captureChance: 0 };
        encounters.push(skipped);
        return skipped;
      }
      const ball = ctx.itemEffect(decision.ballItemId, 'ball');
      const captureChance = captureProbability(ctx, {
        captureRate: species.captureRate,
        ballMultiplier: ball?.catchMultiplier ?? 1,
        guaranteed: ball?.guaranteed === true,
        boostMultiplier:
          encounterTime(clock, n) <= captureBerryMinutes + EPSILON ? captureBerry!.multiplier : 1,
        affinityCount,
        // Fuyard : capture facilitée (équilibrage des légendaires).
        bonusMultiplier:
          bonuses.capture *
          ('questId' in extra ? ctx.balance.legendary.roamerCaptureMultiplier : 1),
      });
      ballsUsed++;
      const captured = rng.chance(captureChance);
      if (ordinary) {
        pity.set(wild.speciesId, captured ? 0 : (pity.get(wild.speciesId) ?? 0) + 1);
        touched.add(wild.speciesId);
      }
      if (captured) {
        caught.speciesIds.add(wild.speciesId);
        if (formId != null) caught.formIds.add(formId);
      }
      const result: EncounterResult = {
        ...base,
        outcome: captured ? 'captured' : 'escaped',
        captureChance,
        ballItemId: decision.ballItemId,
        ...(captured && { pokemon: wild }),
      };
      encounters.push(result);
      return result;
    },
    finish(elapsedMinutes) {
      const lootRng = createRng(input.seed ^ LOOT_SEED_MASK);
      const lootTotals = new Map<string, number>();
      const lootTable = zone.lootTableId ? ctx.lootTable(zone.lootTableId) : undefined;
      const { lootRolls } = expeditionPlan(ctx, elapsedMinutes, env, input.encounterBerries);
      if (lootTable) {
        for (let i = 0; i < lootRolls; i++) addStacks(lootTotals, rollLoot(lootRng, lootTable));
      }
      return {
        encounters: [...encounters],
        loot: [...lootTotals].map(([itemId, quantity]) => ({ itemId, quantity })),
        team: applyTeamXp(
          ctx,
          input.team,
          xpPerMember,
          abilityHappiness(ctx, env, ctx.balance.xp.happinessPerExpedition),
          bonuses,
        ),
        xpPerMember,
        pity: Object.fromEntries([...touched].map((id) => [id, pity.get(id) ?? 0])),
        ballsUsed,
        berriesUsed: captureBerry
          ? berriesConsumed(ctx, input.berries!.quantity, elapsedMinutes)
          : 0,
        encounterBerriesUsed:
          clock.boostMinutes > 0
            ? berriesConsumed(ctx, input.encounterBerries!.quantity, elapsedMinutes)
            : 0,
        shinyChance,
        lootRolls,
        weather: resolveWeather(ctx, env),
      };
    },
  };
}

/**
 * Calcule le résultat d'une expédition arrêtée après `elapsedMinutes` (voir
 * `createExpeditionRun`) : s'arrêter plus tard ajoute des rencontres sans changer les
 * précédentes. Le serveur applique ensuite le résultat en base ; le client ne fait qu'afficher.
 */
export function resolveExpedition(ctx: GameContext, input: ExpeditionInput): ExpeditionResult {
  const run = createExpeditionRun(ctx, input);
  const choose = input.ballPlan
    ? planThrows(input.ballPlan, input.throws)
    : reservedThrows(input.balls, input.captureFilter);
  const total = run.encountersAfter(input.elapsedMinutes);
  while (run.played < total && run.next(choose));
  return run.finish(input.elapsedMinutes);
}
