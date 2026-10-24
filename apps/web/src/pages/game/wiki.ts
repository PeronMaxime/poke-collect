import { DEX_FORM_SECTIONS, speciesForms } from '@poke/data';
import type { GameContext, GameSpecies } from '@poke/game-core';

/** Ancre de la page du wiki (hors onglets du menu : lien « Wiki » de l'en-tête). */
export const WIKI_HASH = 'wiki';

export const wikiLink = (...parts: (string | number)[]) => `#${[WIKI_HASH, ...parts].join('/')}`;

/** Fiche d'un Pokémon : `#wiki/pokemon/19` ou, pour une forme, `#wiki/pokemon/19/10091`. */
export const wikiPokemonLink = (speciesId: number, formId: number | null = null) =>
  formId === null ? wikiLink('pokemon', speciesId) : wikiLink('pokemon', speciesId, formId);

export const wikiAbilityLink = (abilityId: string) => wikiLink('talents', abilityId);

/** Pokémon du wiki : une espèce (formId null) ou l'une de ses formes du Pokédex. */
export interface WikiEntry {
  speciesId: number;
  formId: number | null;
  species: GameSpecies;
  /** Régions (activées) dont le Pokédex contient l'espèce. */
  regionIds: string[];
}

const FORM_KINDS = new Set<string>(DEX_FORM_SECTIONS.map((s) => s.kind));

/** Espèces des régions activées, par numéro, chacune suivie de ses formes du Pokédex. */
export function wikiEntries(ctx: GameContext): WikiEntry[] {
  const regionsOf = new Map<number, string[]>();
  for (const region of ctx.regions) {
    for (const id of region.speciesIds) {
      const list = regionsOf.get(id);
      if (!list) regionsOf.set(id, [region.id]);
      else if (!list.includes(region.id)) list.push(region.id);
    }
  }
  return [...regionsOf.keys()]
    .sort((a, b) => a - b)
    .flatMap((speciesId) => {
      const species = ctx.species(speciesId);
      if (!species) return [];
      const regionIds = regionsOf.get(speciesId)!;
      return [
        { speciesId, formId: null, species, regionIds },
        ...speciesForms(speciesId)
          .filter((f) => FORM_KINDS.has(f.kind))
          .map((f) => ({
            speciesId,
            formId: f.id,
            species: ctx.species(speciesId, f.id)!,
            regionIds,
          })),
      ];
    });
}

/** Pokémon pouvant avoir un talent (`hidden` : talent caché). */
export interface AbilityHolderEntry {
  entry: WikiEntry;
  hidden: boolean;
}

/** Talents des Pokémon du wiki, avec leurs porteurs (dans l'ordre du Pokédex). */
export function wikiAbilities(ctx: GameContext): { id: string; holders: AbilityHolderEntry[] }[] {
  const holders = new Map<string, AbilityHolderEntry[]>();
  for (const entry of wikiEntries(ctx)) {
    for (const ability of entry.species.abilities) {
      const list = holders.get(ability.name) ?? [];
      if (!list.some((h) => h.entry === entry)) list.push({ entry, hidden: ability.isHidden });
      holders.set(ability.name, list);
    }
  }
  return [...holders].map(([id, list]) => ({ id, holders: list }));
}

export { searchKey } from '@poke/shared';
