import { isTransferableSpecies } from './breeding';
import type { GameContext } from './context';
import { isNewToDex, perfectIvCount } from './expedition';
import type { CaughtDex, EncounterResult } from './expedition';

/**
 * Transfert automatique au retour d'expédition : les captures déjà présentes au Pokédex qui ont
 * au plus `maxPerfectIvs` IV parfaits sont transférées contre des Bonbons, sans passer par le PC.
 * Jamais les chromatiques, les nouveaux au Pokédex, les légendaires et fabuleux, les fuyards ni
 * les rencontres spéciales. null (côté expédition) = pas de transfert automatique.
 */
export interface AutoTransferFilter {
  /** De 0 (aucun IV parfait) à 6 (tous les déjà capturés non chromatiques). */
  maxPerfectIvs: number;
}

/**
 * Rencontres (indices) dont la capture est transférée, dans l'ordre de l'expédition : la
 * première capture d'une espèce (ou forme) absente du Pokédex est gardée, les suivantes ne sont
 * plus nouvelles.
 */
export function autoTransferIndexes(
  ctx: GameContext,
  encounters: readonly EncounterResult[],
  caught: CaughtDex,
  filter: AutoTransferFilter | null | undefined,
): Set<number> {
  const transferred = new Set<number>();
  if (!filter) return transferred;
  const speciesIds = new Set(caught.speciesIds);
  const formIds = new Set(caught.formIds);
  encounters.forEach((e, i) => {
    const p = e.pokemon;
    if (!p) return;
    const isNew = isNewToDex({ speciesIds, formIds }, p);
    speciesIds.add(p.speciesId);
    if (p.formId != null) formIds.add(p.formId);
    if (
      !isNew &&
      !p.isShiny &&
      !e.questId &&
      !e.special &&
      isTransferableSpecies(ctx, p.speciesId) &&
      perfectIvCount(p) <= filter.maxPerfectIvs
    ) {
      transferred.add(i);
    }
  });
  return transferred;
}

/**
 * Pokémon échappés (indices) résumés au retour plutôt qu'affichés : ni nouveaux au Pokédex, ni
 * chromatiques, ni fuyards. Un échappé reste nouveau tant que son espèce (ou forme) n'a pas été
 * capturée plus tôt dans l'expédition.
 */
export function hiddenEscapeIndexes(
  encounters: readonly EncounterResult[],
  caught: CaughtDex,
): Set<number> {
  const hidden = new Set<number>();
  const speciesIds = new Set(caught.speciesIds);
  const formIds = new Set(caught.formIds);
  encounters.forEach((e, i) => {
    if (e.pokemon) {
      speciesIds.add(e.speciesId);
      if (e.formId != null) formIds.add(e.formId);
    } else if (
      e.outcome === 'escaped' &&
      !e.isShiny &&
      !e.questId &&
      !isNewToDex({ speciesIds, formIds }, e)
    ) {
      hidden.add(i);
    }
  });
  return hidden;
}
