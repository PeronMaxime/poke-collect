import { getSpecies } from '@poke/data';
import type { IntegrityCheck } from './context';

/** Surcharges d'espèces : l'espèce doit exister. */
export function checkSpeciesOverrides(check: IntegrityCheck): void {
  const { content, add } = check;
  for (const o of content.speciesOverrides) {
    if (!getSpecies(o.speciesId)) add('error', 'speciesOverride', o.speciesId, 'Espèce inconnue');
  }
}
