/**
 * Données de référence issues de PokéAPI (lecture seule).
 * Les fichiers JSON de `generated/` sont produits par `pnpm import:pokeapi`.
 */

export type StatName = 'hp' | 'attack' | 'defense' | 'special-attack' | 'special-defense' | 'speed';

export const STAT_NAMES: readonly StatName[] = [
  'hp',
  'attack',
  'defense',
  'special-attack',
  'special-defense',
  'speed',
];

export type Stats = Record<StatName, number>;

export interface SpeciesAbility {
  name: string;
  isHidden: boolean;
}

export interface Species {
  id: number;
  name: string;
  nameFr: string;
  generation: number;
  types: string[];
  baseStats: Stats;
  abilities: SpeciesAbility[];
  captureRate: number;
  baseHappiness: number | null;
  baseExperience: number | null;
  growthRate: string;
  eggGroups: string[];
  /** -1 = asexué, sinon chance d'être femelle en huitièmes. */
  genderRate: number;
  hatchCounter: number | null;
  habitat: string | null;
  color: string;
  shape: string | null;
  isBaby: boolean;
  isLegendary: boolean;
  isMythical: boolean;
  evolutionChainId: number;
  evolvesFromSpeciesId: number | null;
  heightDm: number;
  weightHg: number;
}

/** Détail d'évolution PokéAPI, compacté (les champs vides sont omis). */
export interface EvolutionDetail {
  trigger: string;
  minLevel?: number;
  item?: string;
  heldItem?: string;
  minHappiness?: number;
  minAffection?: number;
  minBeauty?: number;
  timeOfDay?: string;
  knownMove?: string;
  knownMoveType?: string;
  location?: string;
  gender?: number;
  partySpecies?: string;
  partyType?: string;
  relativePhysicalStats?: number;
  tradeSpecies?: string;
  needsOverworldRain?: boolean;
  turnUpsideDown?: boolean;
}

export interface EvolutionNode {
  speciesId: number;
  details: EvolutionDetail[];
  evolvesTo: EvolutionNode[];
}

export interface EvolutionChain {
  id: number;
  chain: EvolutionNode;
}

export interface Nature {
  name: string;
  nameFr: string;
  increasedStat: StatName | null;
  decreasedStat: StatName | null;
}

export interface NamedEntry {
  name: string;
  nameFr: string;
}

/** Type, avec ses relations offensives (PokéAPI `type.damage_relations`). */
export interface TypeEntry extends NamedEntry {
  /** Types défenseurs qui subissent ×2 / ×0,5 / ×0 des attaques de ce type. */
  doubleDamageTo: string[];
  halfDamageTo: string[];
  noDamageTo: string[];
}

export interface Ability extends NamedEntry {
  descriptionFr: string | null;
}

export interface Item extends NamedEntry {
  category: string;
  descriptionFr: string | null;
  sprite: string | null;
}

export interface GrowthRate {
  name: string;
  /** XP totale requise pour atteindre chaque niveau (index 0 = niveau 1). */
  experienceByLevel: number[];
}

export interface DataMeta {
  importedAt: string;
  generations: number[];
  counts: Record<string, number>;
}
