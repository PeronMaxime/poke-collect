import { STAT_NAMES } from '@poke/data';
import type { StatName, Stats } from '@poke/data';
import type { GameContext, GameSpecies } from './context';
import { abilityFlat, abilityMultiplier, applyWildAbilities } from './abilities';
import type { AbilityEnv, AbilityHolder } from './abilities';
import { MAX_LEVEL, generatePokemon, levelForXp, withPerfectIvs, xpForLevel } from './pokemon';
import type { PokemonInstance } from './pokemon';
import { pokemonXpGain, pokemonXpMultiplier } from './progression';
import type { PlayerBonuses } from './progression';
import { createRng } from './rng';
import { counterpartFormId, isEventForm } from './forms';
import { isMasudaPair, shinyProbability } from './shiny';

// --- Compatibilité ------------------------------------------------------------------

const DITTO_GROUP = 'ditto';
const NO_EGGS_GROUP = 'no-eggs';

/** Hors `no-eggs` (légendaires, mythiques…), sauf surcharge de l'admin. */
export function isBreedable(species: GameSpecies): boolean {
  return species.override?.breedable ?? !species.eggGroups.includes(NO_EGGS_GROUP);
}

const isDitto = (species: GameSpecies) => species.eggGroups.includes(DITTO_GROUP);

/** Première espèce de la lignée (l'œuf contient toujours la forme de base). */
export function baseSpeciesId(ctx: GameContext, speciesId: number): number {
  let current = ctx.species(speciesId);
  const seen = new Set<number>();
  while (current?.evolvesFromSpeciesId != null && !seen.has(current.id)) {
    seen.add(current.id);
    const parent = ctx.species(current.evolvesFromSpeciesId);
    if (!parent) break;
    current = parent;
  }
  return current?.id ?? speciesId;
}

export type BreedingError =
  | { code: 'SAME_POKEMON' }
  | { code: 'NOT_BREEDABLE'; speciesId: number }
  | { code: 'TWO_DITTOS' }
  | { code: 'NO_COMMON_EGG_GROUP' }
  | { code: 'INCOMPATIBLE_GENDERS' };

export type BreedingParent = Pick<PokemonInstance, 'speciesId' | 'formId' | 'gender'> & {
  id?: string;
};

export type BreedingCheck =
  | {
      ok: true;
      eggSpeciesId: number;
      /** Forme de l'œuf : celle de la mère quand l'espèce de base l'a (formes régionales). */
      eggFormId: number | null;
      /** Index du parent qui détermine l'espèce. */ motherIndex: 0 | 1;
    }
  | { ok: false; errors: BreedingError[] };

/**
 * Deux parents compatibles : même groupe d'œufs et sexes opposés, ou l'un des deux est
 * Métamorph. L'œuf est de l'espèce de base de la mère (ou du parent non Métamorph).
 */
export function checkBreedingPair(
  ctx: GameContext,
  a: BreedingParent,
  b: BreedingParent,
): BreedingCheck {
  const errors: BreedingError[] = [];
  if (a.id !== undefined && a.id === b.id) return { ok: false, errors: [{ code: 'SAME_POKEMON' }] };
  const sa = ctx.species(a.speciesId, a.formId);
  const sb = ctx.species(b.speciesId, b.formId);
  if (!sa || !sb) return { ok: false, errors: [{ code: 'NO_COMMON_EGG_GROUP' }] };
  for (const s of [sa, sb]) {
    if (!isBreedable(s)) errors.push({ code: 'NOT_BREEDABLE', speciesId: s.id });
  }
  if (errors.length > 0) return { ok: false, errors };

  const dittoA = isDitto(sa);
  const dittoB = isDitto(sb);
  if (dittoA && dittoB) return { ok: false, errors: [{ code: 'TWO_DITTOS' }] };
  if (dittoA || dittoB) {
    const motherIndex = dittoA ? 1 : 0;
    return { ok: true, ...eggOf(ctx, motherIndex === 0 ? a : b), motherIndex };
  }

  if (!sa.eggGroups.some((g) => sb.eggGroups.includes(g))) {
    errors.push({ code: 'NO_COMMON_EGG_GROUP' });
  }
  const genders = new Set([a.gender, b.gender]);
  if (!(genders.has('male') && genders.has('female'))) {
    errors.push({ code: 'INCOMPATIBLE_GENDERS' });
  }
  if (errors.length > 0) return { ok: false, errors };
  const motherIndex = a.gender === 'female' ? 0 : 1;
  return { ok: true, ...eggOf(ctx, motherIndex === 0 ? a : b), motherIndex };
}

function eggOf(ctx: GameContext, mother: BreedingParent) {
  const eggSpeciesId = baseSpeciesId(ctx, mother.speciesId);
  // Une forme événementielle (Évoli Partenaire) ne se transmet pas : œuf de forme par défaut.
  const eggFormId = isEventForm(mother.formId)
    ? null
    : counterpartFormId(mother.formId, eggSpeciesId);
  return { eggSpeciesId, eggFormId };
}

// --- Objets tenus et règles d'héritage ------------------------------------------------

export interface DaycareParent extends PokemonInstance {
  /** Objet tenu pendant le séjour en pension (Nœud Destin, Pierre Stase…). */
  heldItemId: string | null;
  /** Région d'origine (bonus Masuda) ; absente des œufs pondus avant la phase 6. */
  originRegion?: string | null;
}

/** Environnement des talents de la pension : les deux parents, puis l'assistant. */
export function breedingEnv(
  parents: readonly AbilityHolder[],
  helper?: AbilityHolder | null,
): AbilityEnv {
  return { activity: 'breeding', team: helper ? [...parents, helper] : [...parents] };
}

export interface InheritanceRules {
  /** Nombre d'IV transmis par les parents. */
  ivCount: number;
  /** Chance de transmettre la nature, par parent (0 sans objet). */
  natureChance: [number, number];
}

export function inheritanceRules(
  ctx: GameContext,
  heldItemIds: readonly [string | null, string | null],
  env?: AbilityEnv,
): InheritanceRules {
  const { inheritedIvCount } = ctx.balance.breeding;
  const effect = <T extends 'breedingIvs' | 'breedingNature'>(i: 0 | 1, type: T) => {
    const id = heldItemIds[i];
    return id ? ctx.itemEffect(id, type) : undefined;
  };
  const ivCount = Math.max(
    inheritedIvCount,
    effect(0, 'breedingIvs')?.count ?? 0,
    effect(1, 'breedingIvs')?.count ?? 0,
  );
  const extra = env ? abilityFlat(ctx, env, 'inheritedIvs', 0, STAT_NAMES.length) : 0;
  return {
    ivCount: Math.min(ivCount + extra, STAT_NAMES.length),
    natureChance: [
      effect(0, 'breedingNature')?.chance ?? 0,
      effect(1, 'breedingNature')?.chance ?? 0,
    ],
  };
}

// --- Durées --------------------------------------------------------------------------------

/** Cycles d'éclosion par défaut si PokéAPI n'en donne pas. */
const DEFAULT_HATCH_COUNTER = 20;

/** Durée d'éclosion, raccourcie par le talent de l'assistant de la couveuse. */
export function hatchMinutes(
  ctx: GameContext,
  speciesId: number,
  incubatorHelper?: AbilityHolder | null,
): number {
  const counter = ctx.species(speciesId)?.hatchCounter ?? DEFAULT_HATCH_COUNTER;
  const minutes = counter * ctx.balance.breeding.hatchMinutesPerCounter;
  if (!incubatorHelper) return minutes;
  const env: AbilityEnv = { activity: 'incubator', team: [incubatorHelper] };
  return minutes * abilityMultiplier(ctx, env, 'hatchTime');
}

/** Minutes entre deux œufs d'une pension (talents des parents et de l'assistant compris). */
export function eggCycleMinutes(ctx: GameContext, env?: AbilityEnv): number {
  const { eggMinutes } = ctx.balance.breeding;
  if (!env) return eggMinutes;
  // Vitesse de ponte : +100 % = deux fois plus d'œufs ; au plus dix fois plus lent.
  return eggMinutes / Math.max(0.1, abilityMultiplier(ctx, env, 'eggSpeed'));
}

/**
 * Œufs pondus depuis `since` (évaluation paresseuse, sans tâche planifiée), un toutes les
 * `cycleMinutes` (voir `eggCycleMinutes`).
 */
export function eggsLaid(
  ctx: GameContext,
  since: Date,
  now: Date,
  cycleMinutes = ctx.balance.breeding.eggMinutes,
): number {
  const elapsed = now.getTime() - since.getTime();
  return Math.max(0, Math.floor(elapsed / (cycleMinutes * 60_000)));
}

// --- XP des parents ----------------------------------------------------------------------------

export interface DaycareXp {
  xpGained: number;
  levelBefore: number;
  levelAfter: number;
  xpAfter: number;
}

/**
 * XP gagnée par un parent depuis son dépôt en pension (`parentXpPerHour`, au prorata du temps,
 * augmentée des bonus de sa région), plafonnée au niveau maximal. Elle n'est versée qu'au retrait.
 */
export function daycareXp(
  ctx: GameContext,
  parent: Pick<PokemonInstance, 'speciesId' | 'formId' | 'xp' | 'level'>,
  depositedAt: Date,
  now: Date,
  bonuses?: Pick<PlayerBonuses, 'regionXp'>,
): DaycareXp {
  const growth = ctx.species(parent.speciesId, parent.formId)?.growthRate;
  const hours = Math.max(0, now.getTime() - depositedAt.getTime()) / 3_600_000;
  const earned = pokemonXpGain(
    ctx,
    bonuses,
    parent.speciesId,
    Math.floor(hours * ctx.balance.breeding.parentXpPerHour),
  );
  if (!growth) {
    return { xpGained: 0, levelBefore: parent.level, levelAfter: parent.level, xpAfter: parent.xp };
  }
  const cap = xpForLevel(growth, MAX_LEVEL);
  const xpAfter = Math.max(parent.xp, Math.min(parent.xp + earned, cap));
  return {
    xpGained: xpAfter - parent.xp,
    levelBefore: parent.level,
    levelAfter: Math.max(parent.level, levelForXp(growth, xpAfter)),
    xpAfter,
  };
}

// --- Éclosion --------------------------------------------------------------------------------

export interface EggInput {
  seed: number;
  speciesId: number;
  /** Forme de l'œuf ; absente = forme par défaut. */
  formId?: number | null;
  /** Les deux parents, dans l'ordre du dépôt en pension. */
  parents: readonly [DaycareParent, DaycareParent];
  /** Index de la mère (parent qui transmet le talent caché). */
  motherIndex: 0 | 1;
  /** Multiplicateur du Charme Chroma possédé à l'éclosion (1 = aucun). */
  shinyCharm?: number;
  /** Assistant de la Pension au ramassage (talent figé dans l'œuf). */
  helper?: AbilityHolder | null;
}

type ShinyParent = AbilityHolder & Pick<DaycareParent, 'originRegion'>;

/**
 * Probabilité shiny d'un œuf : Charme Chroma, bonus Masuda des parents et talents des parents
 * et de l'assistant de la Pension.
 */
export function eggShinyProbability(
  ctx: GameContext,
  parents: readonly [ShinyParent, ShinyParent],
  shinyCharm = 1,
  helper?: AbilityHolder | null,
): number {
  return Math.min(
    1,
    shinyProbability(ctx, { charm: shinyCharm, masuda: isMasudaPair(parents[0], parents[1]) }) *
      abilityMultiplier(ctx, breedingEnv(parents, helper), 'shinyChance'),
  );
}

function shuffled<T>(rng: ReturnType<typeof createRng>, list: readonly T[]): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/**
 * Pokémon qui sort de l'œuf, de façon déterministe (seed + parents + contenu de la version
 * de ponte). L'ordre des tirages est figé : le changer modifierait les œufs déjà pondus.
 */
export function resolveEgg(ctx: GameContext, input: EggInput): PokemonInstance {
  const rng = createRng(input.seed);
  const species = ctx.species(input.speciesId, input.formId);
  if (!species) throw new Error(`Espèce inconnue : ${input.speciesId}`);
  const { breeding } = ctx.balance;
  const [pa, pb] = input.parents;
  const env = breedingEnv(input.parents, input.helper);
  const rules = inheritanceRules(ctx, [pa.heldItemId, pb.heldItemId], env);

  // Base aléatoire (IV, nature, talent standard, sexe, shiny), puis héritage par-dessus.
  const child = generatePokemon(ctx, rng, species.id, breeding.eggLevel, {
    shinyProbability: eggShinyProbability(ctx, input.parents, input.shinyCharm, input.helper),
    formId: species.form?.id ?? null,
  });

  const ivs: Stats = { ...child.ivs };
  for (const stat of shuffled<StatName>(rng, STAT_NAMES).slice(0, rules.ivCount)) {
    ivs[stat] = input.parents[rng.int(0, 1)]!.ivs[stat];
  }

  let nature = child.nature;
  const natureSources = ([0, 1] as const).filter((i) => rng.chance(rules.natureChance[i]));
  if (natureSources.length > 0) {
    nature = input.parents[natureSources[rng.int(0, natureSources.length - 1)]!]!.nature;
  }

  const regular = species.abilities.filter((a) => !a.isHidden);
  const hidden = species.abilities.filter((a) => a.isHidden);
  const mother = input.parents[input.motherIndex];
  const motherSpecies = ctx.species(mother.speciesId, mother.formId);
  const motherHasHidden = !!motherSpecies?.abilities.some(
    (a) => a.isHidden && a.name === mother.ability,
  );
  const abilityRoll = rng.next();
  const abilityPick = rng.next();
  let ability: string;
  if (
    hidden.length > 0 &&
    (regular.length === 0 || (motherHasHidden && abilityRoll < breeding.hiddenAbilityInheritChance))
  ) {
    ability = hidden[Math.floor(abilityPick * hidden.length)]!.name;
  } else {
    ability = regular[Math.floor(abilityPick * regular.length)]?.name ?? child.ability;
  }

  // Talents : tirages en plus seulement s'ils jouent (les œufs déjà pondus restent identiques).
  const egg = { ...child, ivs, nature, ability };
  const perfect = abilityFlat(ctx, env, 'perfectIvs', 0, STAT_NAMES.length);
  if (perfect > 0) egg.ivs = withPerfectIvs(rng, egg.ivs, perfect);
  applyWildAbilities(ctx, env, rng, egg);
  return egg;
}

// --- Transfert et Bonbons de lignée -----------------------------------------------------------

/** Lignée = chaîne d'évolution PokéAPI. */
export function lineageId(ctx: GameContext, speciesId: number): number | undefined {
  return ctx.species(speciesId)?.evolutionChainId;
}

/** Les légendaires et les fabuleux ne se transfèrent pas. */
export function isTransferableSpecies(ctx: GameContext, speciesId: number): boolean {
  const species = ctx.species(speciesId);
  return !species?.isLegendary && !species?.isMythical;
}

export function transferCandies(
  ctx: GameContext,
  pokemon: Pick<PokemonInstance, 'speciesId' | 'isShiny'> &
    Partial<Pick<PokemonInstance, 'formId' | 'ability'>>,
) {
  const { candiesPerPokemon, shinyBonusCandies } = ctx.balance.transfer;
  // Un Pokémon évolué rapporte le double des Bonbons de base.
  const evolved = ctx.species(pokemon.speciesId)?.evolvesFromSpeciesId != null;
  const base = candiesPerPokemon * (evolved ? 2 : 1) + (pokemon.isShiny ? shinyBonusCandies : 0);
  const env: AbilityEnv = {
    activity: 'transfer',
    team: [{ ...pokemon, ability: pokemon.ability ?? '' }],
  };
  return Math.round(base * abilityMultiplier(ctx, env, 'candies'));
}

/** Marge des calculs en fractions de Bonbon (évite qu'un arrondi coûte un Bonbon de plus). */
const CANDY_EPSILON = 1e-9;

/**
 * Bonbons pour passer du niveau `level` au suivant : de `candiesPerLevelStart` (niveau 1) à
 * `candiesPerLevelEnd` (niveau 99), en ligne droite, arrondi à l'entier le plus proche.
 */
export function candiesForLevel(ctx: GameContext, level: number): number {
  const { candiesPerLevelStart: start, candiesPerLevelEnd: end } = ctx.balance.transfer;
  const t = Math.min(Math.max((level - 1) / (MAX_LEVEL - 2), 0), 1);
  return Math.max(1, Math.round(start + (end - start) * t));
}

/**
 * Bonbons nécessaires pour monter `pokemon` au niveau maximal (0 si déjà au max). Un Bonbon
 * donne 1/N du niveau en cours (N = `candiesForLevel`) ; le surplus passe au niveau suivant.
 */
export function candiesToMaxLevel(
  ctx: GameContext,
  pokemon: Pick<PokemonInstance, 'speciesId' | 'xp'>,
  bonuses?: Pick<PlayerBonuses, 'regionXp'>,
): number {
  const species = ctx.species(pokemon.speciesId);
  if (!species) return 0;
  const growth = species.growthRate;
  let needed = 0;
  for (let level = levelForXp(growth, pokemon.xp); level < MAX_LEVEL; level++) {
    const start = xpForLevel(growth, level);
    const next = xpForLevel(growth, level + 1);
    const done = Math.max(0, pokemon.xp - start) / (next - start);
    needed += Math.max(0, 1 - done) * candiesForLevel(ctx, level);
  }
  if (needed <= 0) return 0;
  return Math.max(
    1,
    Math.ceil(needed / pokemonXpMultiplier(ctx, bonuses, pokemon.speciesId) - CANDY_EPSILON),
  );
}

/**
 * XP et niveau après avoir donné `count` Bonbons (plafonnés au niveau maximal). Chaque Bonbon
 * donne 1/N du niveau en cours ; celui qui termine un niveau reporte son surplus sur le suivant,
 * en proportion du nouveau niveau.
 */
export function applyCandies(
  ctx: GameContext,
  pokemon: Pick<PokemonInstance, 'speciesId' | 'xp' | 'level'>,
  count: number,
  bonuses?: Pick<PlayerBonuses, 'regionXp'>,
): { xp: number; level: number } {
  const species = ctx.species(pokemon.speciesId);
  if (!species) return { xp: pokemon.xp, level: pokemon.level };
  const growth = species.growthRate;
  let xp = pokemon.xp;
  let level = levelForXp(growth, xp);
  // Bonus d'XP de région : +4 % → chaque Bonbon vaut 1,04 Bonbon.
  let budget = Math.max(0, count) * pokemonXpMultiplier(ctx, bonuses, pokemon.speciesId);
  while (budget > CANDY_EPSILON && level < MAX_LEVEL) {
    const start = xpForLevel(growth, level);
    const next = xpForLevel(growth, level + 1);
    const span = next - start;
    const cost = candiesForLevel(ctx, level);
    const toFinish = ((next - xp) / span) * cost;
    if (budget + CANDY_EPSILON >= toFinish) {
      budget -= toFinish;
      xp = next;
      level++;
    } else {
      xp = Math.min(next - 1, xp + Math.floor((budget * span) / cost + CANDY_EPSILON));
      budget = 0;
    }
  }
  return { xp, level: Math.max(pokemon.level, levelForXp(growth, xp)) };
}
