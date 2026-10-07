import { STAT_NAMES } from '@poke/data';
import type { StatName, Stats } from '@poke/data';
import type { GameContext, GameSpecies } from './context';
import { MAX_LEVEL, generatePokemon, levelForXp, xpForLevel } from './pokemon';
import type { PokemonInstance } from './pokemon';
import { createRng } from './rng';
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

export type BreedingParent = Pick<PokemonInstance, 'speciesId' | 'gender'> & { id?: string };

export type BreedingCheck =
  | {
      ok: true;
      eggSpeciesId: number;
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
  const sa = ctx.species(a.speciesId);
  const sb = ctx.species(b.speciesId);
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
    const mother = motherIndex === 0 ? sa : sb;
    return { ok: true, eggSpeciesId: baseSpeciesId(ctx, mother.id), motherIndex };
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
  return {
    ok: true,
    eggSpeciesId: baseSpeciesId(ctx, (motherIndex === 0 ? sa : sb).id),
    motherIndex,
  };
}

// --- Objets tenus et règles d'héritage ------------------------------------------------

export interface DaycareParent extends PokemonInstance {
  /** Objet tenu pendant le séjour en pension (Nœud Destin, Pierre Stase…). */
  heldItemId: string | null;
  /** Région d'origine (bonus Masuda) ; absente des œufs pondus avant la phase 6. */
  originRegion?: string | null;
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
  return {
    ivCount: Math.min(ivCount, STAT_NAMES.length),
    natureChance: [
      effect(0, 'breedingNature')?.chance ?? 0,
      effect(1, 'breedingNature')?.chance ?? 0,
    ],
  };
}

// --- Durées --------------------------------------------------------------------------------

/** Cycles d'éclosion par défaut si PokéAPI n'en donne pas. */
const DEFAULT_HATCH_COUNTER = 20;

export function hatchMinutes(ctx: GameContext, speciesId: number): number {
  const counter = ctx.species(speciesId)?.hatchCounter ?? DEFAULT_HATCH_COUNTER;
  return counter * ctx.balance.breeding.hatchMinutesPerCounter;
}

/** Œufs pondus depuis `since` (évaluation paresseuse, sans tâche planifiée). */
export function eggsLaid(ctx: GameContext, since: Date, now: Date): number {
  const elapsed = now.getTime() - since.getTime();
  return Math.max(0, Math.floor(elapsed / (ctx.balance.breeding.eggMinutes * 60_000)));
}

// --- Éclosion --------------------------------------------------------------------------------

export interface EggInput {
  seed: number;
  speciesId: number;
  /** Les deux parents, dans l'ordre du dépôt en pension. */
  parents: readonly [DaycareParent, DaycareParent];
  /** Index de la mère (parent qui transmet le talent caché). */
  motherIndex: 0 | 1;
  /** Multiplicateur du Charme Chroma possédé à l'éclosion (1 = aucun). */
  shinyCharm?: number;
}

/** Probabilité shiny d'un œuf : Charme Chroma et bonus Masuda des parents. */
export function eggShinyProbability(
  ctx: GameContext,
  parents: readonly [DaycareParent, DaycareParent],
  shinyCharm = 1,
): number {
  return shinyProbability(ctx, { charm: shinyCharm, masuda: isMasudaPair(parents[0], parents[1]) });
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
  const species = ctx.species(input.speciesId);
  if (!species) throw new Error(`Espèce inconnue : ${input.speciesId}`);
  const { breeding } = ctx.balance;
  const [pa, pb] = input.parents;
  const rules = inheritanceRules(ctx, [pa.heldItemId, pb.heldItemId]);

  // Base aléatoire (IV, nature, talent standard, sexe, shiny), puis héritage par-dessus.
  const child = generatePokemon(ctx, rng, species.id, breeding.eggLevel, {
    shinyProbability: eggShinyProbability(ctx, input.parents, input.shinyCharm),
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
  const motherSpecies = ctx.species(mother.speciesId);
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

  return { ...child, ivs, nature, ability };
}

// --- Transfert et Bonbons de lignée -----------------------------------------------------------

/** Lignée = chaîne d'évolution PokéAPI. */
export function lineageId(ctx: GameContext, speciesId: number): number | undefined {
  return ctx.species(speciesId)?.evolutionChainId;
}

export function transferCandies(ctx: GameContext, pokemon: Pick<PokemonInstance, 'isShiny'>) {
  const { candiesPerPokemon, shinyBonusCandies } = ctx.balance.transfer;
  return candiesPerPokemon + (pokemon.isShiny ? shinyBonusCandies : 0);
}

/** Bonbons nécessaires pour monter `pokemon` au niveau maximal (0 si déjà au max). */
export function candiesToMaxLevel(
  ctx: GameContext,
  pokemon: Pick<PokemonInstance, 'speciesId' | 'xp'>,
): number {
  const species = ctx.species(pokemon.speciesId);
  const { xpPerCandy } = ctx.balance.transfer;
  if (!species || xpPerCandy <= 0) return 0;
  const missing = xpForLevel(species.growthRate, MAX_LEVEL) - pokemon.xp;
  return Math.max(0, Math.ceil(missing / xpPerCandy));
}

/** XP et niveau après avoir donné `count` Bonbons (plafonnés au niveau maximal). */
export function applyCandies(
  ctx: GameContext,
  pokemon: Pick<PokemonInstance, 'speciesId' | 'xp' | 'level'>,
  count: number,
): { xp: number; level: number } {
  const species = ctx.species(pokemon.speciesId);
  if (!species) return { xp: pokemon.xp, level: pokemon.level };
  const cap = xpForLevel(species.growthRate, MAX_LEVEL);
  const xp = Math.min(cap, pokemon.xp + count * ctx.balance.transfer.xpPerCandy);
  return { xp, level: Math.max(pokemon.level, levelForXp(species.growthRate, xp)) };
}
