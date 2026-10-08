import type {
  Ability,
  DataMeta,
  EvolutionChain,
  GrowthRate,
  Item,
  NamedEntry,
  Nature,
  PokemonForm,
  Species,
  TypeEntry,
} from './types';
import speciesJson from '../generated/species.json';
import formsJson from '../generated/forms.json';
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
export * from './habitat';

export const species = speciesJson as Species[];
export const forms = formsJson as PokemonForm[];
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

const formsById = new Map(forms.map((f) => [f.id, f]));

export function getForm(id: number): PokemonForm | undefined {
  return formsById.get(id);
}

const formsBySpecies = new Map<number, PokemonForm[]>();
for (const f of forms) {
  const list = formsBySpecies.get(f.speciesId);
  if (list) list.push(f);
  else formsBySpecies.set(f.speciesId, [f]);
}
const formsByName = new Map(forms.map((f) => [f.name, f]));

export function getFormByName(name: string): PokemonForm | undefined {
  return formsByName.get(name);
}

/** Formes d'une espèce (la forme par défaut n'en fait pas partie). */
export function speciesForms(speciesId: number): PokemonForm[] {
  return formsBySpecies.get(speciesId) ?? [];
}

/** Nom de fichier du sprite d'un Pokémon (sprite de l'espèce si la forme n'en a pas). */
export function pokemonSprite(speciesId: number, formId?: number | null): number | string {
  const form = formId != null ? formsById.get(formId) : undefined;
  return form?.speciesId === speciesId && form.sprite ? form.sprite : speciesId;
}
