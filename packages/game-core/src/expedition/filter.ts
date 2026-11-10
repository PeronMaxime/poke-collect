import { STAT_NAMES } from '@poke/data';
import { MAX_IV } from '../pokemon';
import type { PokemonInstance } from '../pokemon';

/**
 * Filtre de capture : quelles rencontres le joueur veut garder.
 */

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
