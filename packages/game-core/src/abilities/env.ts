import type { Weather } from '@poke/content';
import type { GameContext } from '../context';
import type { PokemonInstance } from '../pokemon';
import type { AbilityActivity } from './activities';

/**
 * Environnement d'une activité (équipe, zone, météo, heure) contre lequel les conditions des
 * talents sont évaluées, et talent en vigueur d'un Pokémon.
 */

/** Pokémon dont le talent agit (membre d'équipe, parent, assistant). */
export type AbilityHolder = Pick<PokemonInstance, 'speciesId' | 'formId' | 'ability'> &
  Partial<Pick<PokemonInstance, 'nature' | 'gender'>>;

/** Ce qu'il faut garder d'un assistant pour rejouer plus tard l'effet de son talent. */
export function abilityHolder(pokemon: AbilityHolder): AbilityHolder {
  const { speciesId, formId, ability, nature, gender } = pokemon;
  return { speciesId, formId: formId ?? null, ability, nature, gender };
}

/** Contexte d'une activité : qui participe, et contre quoi. */
export interface AbilityEnv {
  activity: AbilityActivity;
  /** Équipe, dans l'ordre (le premier est en tête). */
  team: readonly AbilityHolder[];
  /** Types en affinité de la zone (expéditions). */
  zoneTypes?: readonly string[];
  /** Types de l'adversaire (équipe du dresseur, ou Pokémon en face). */
  opponentTypes?: readonly string[];
  /** Heure locale du joueur au départ (0 à 23) ; inconnue = conditions jour/nuit fausses. */
  hour?: number | null;
  /** Météo du lieu (zone, donjon) ; un talent de l'équipe peut en imposer une autre. */
  weather?: Weather | null;
  /** Météo déjà résolue (talents compris) : ne plus la recalculer. */
  weatherResolved?: boolean;
}

/** Talent en vigueur : celui de la forme Méga pendant une Méga-Évolution, sinon le sien. */
export function effectiveAbility(
  ctx: GameContext,
  pokemon: Pick<PokemonInstance, 'speciesId' | 'formId' | 'ability'>,
): string {
  const species = ctx.species(pokemon.speciesId, pokemon.formId);
  return (species?.form?.kind === 'mega' && species.abilities[0]?.name) || pokemon.ability;
}
