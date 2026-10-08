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
  /** Habitat PokéAPI (jusqu'à la Gen III), sinon habitat maison déduit (`habitatInferred`). */
  habitat: string | null;
  habitatInferred: boolean;
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

/**
 * Nature d'une forme :
 * - `regional` : Alola, Galar, Hisui, Paldea ;
 * - `alternate` : autre variété avec ses propres statistiques ou types (Motisma Lavage, Deoxys
 *   Attaque, Pikachu Casquette…) ;
 * - `cosmetic` : simple variante d'apparence (Zarbi B, Prismillon Toundra, Sancoki Orient…) ;
 * - `mega` / `primal` / `gmax` : Méga-Évolutions, Primo-Résurgences, Gigamax (et Ultra-Gigamax) ;
 * - `battle` : forme de combat (Darumacho Transe, Exagide Assaut…) ;
 * - `totem` : Pokémon Dominants d'Alola.
 */
export type FormKind =
  'regional' | 'alternate' | 'cosmetic' | 'mega' | 'primal' | 'gmax' | 'battle' | 'totem';

/**
 * Forme d'une espèce autre que sa forme par défaut : variétés PokéAPI (`pokemon-species.varieties`)
 * et formes d'apparence (`pokemon.forms`). Elle remplace les types, statistiques et talents de
 * l'espèce ; le reste (capture, œufs, croissance) vient de l'espèce.
 */
export interface PokemonForm {
  /**
   * Identifiant PokéAPI `pokemon` (≥ 10001) pour une variété ; 100000 + identifiant
   * `pokemon-form` pour une forme d'apparence (les deux numérotations se chevauchent).
   */
  id: number;
  speciesId: number;
  /** Nom PokéAPI (`rattata-alola`, `unown-b`). */
  name: string;
  /** Suffixe de forme (`alola`), partagé par les formes d'une même lignée. */
  formName: string;
  /** Nom complet (`Rattata d’Alola`). */
  nameFr: string;
  /** Nom de la forme seule (`Forme d’Alola`). */
  formNameFr: string;
  kind: FormKind;
  /** Nom de fichier des sprites (`10091`, `201-b`), ou null s'il n'y en a pas (sprite de l'espèce). */
  sprite: string | null;
  types: string[];
  baseStats: Stats;
  abilities: SpeciesAbility[];
  baseExperience: number | null;
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
  usedMove?: string;
  minMoveCount?: number;
  minSteps?: number;
  minDamageTaken?: number;
  allowedNatures?: string[];
  nearSpecialRock?: boolean;
  needsMultiplayer?: boolean;
  /** Le détail ne vaut que pour cette forme de départ (nom PokéAPI `pokemon-form`). */
  requiredForm?: string;
  /** Forme obtenue (nom PokéAPI `pokemon-form`), sinon même suffixe que la forme de départ. */
  evolvedForm?: string;
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
