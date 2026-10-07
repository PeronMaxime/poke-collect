import type {
  Ability,
  DataMeta,
  EvolutionChain,
  GrowthRate,
  Item,
  NamedEntry,
  Nature,
  Species,
  TypeEntry,
} from './types';
import speciesJson from '../generated/species.json';
import evolutionChainsJson from '../generated/evolution-chains.json';
import naturesJson from '../generated/natures.json';
import typesJson from '../generated/types.json';
import eggGroupsJson from '../generated/egg-groups.json';
import habitatsJson from '../generated/habitats.json';
import abilitiesJson from '../generated/abilities.json';
import itemsJson from '../generated/items.json';
import growthRatesJson from '../generated/growth-rates.json';
import metaJson from '../generated/meta.json';

export * from './types';
export * from './sprites';
export * from './display';

export const species = speciesJson as Species[];
export const evolutionChains = evolutionChainsJson as EvolutionChain[];
export const natures = naturesJson as Nature[];
export const types = typesJson as TypeEntry[];
export const eggGroups = eggGroupsJson as NamedEntry[];
export const habitats = habitatsJson as NamedEntry[];
export const abilities = abilitiesJson as Ability[];
export const items = itemsJson as Item[];
export const growthRates = growthRatesJson as GrowthRate[];
export const dataMeta = metaJson as DataMeta;

const speciesById = new Map(species.map((s) => [s.id, s]));
const speciesByName = new Map(species.map((s) => [s.name, s]));

export function getSpecies(idOrName: number | string): Species | undefined {
  return typeof idOrName === 'number' ? speciesById.get(idOrName) : speciesByName.get(idOrName);
}
