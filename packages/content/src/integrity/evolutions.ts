import { getSpecies } from '@poke/data';
import type { IntegrityCheck } from './context';
import type { ContentIssue } from './types';

/** Surcharges d'évolution : espèces et objets connus. */
export function checkEvolutionOverrides(check: IntegrityCheck): void {
  const { content, add, itemIds } = check;
  for (const o of content.evolutionOverrides) {
    const report = (severity: ContentIssue['severity'], message: string) =>
      add(severity, 'evolutionOverride', o.id, message);
    if (!getSpecies(o.fromSpeciesId)) report('error', `Espèce ${o.fromSpeciesId} inconnue`);
    if (!getSpecies(o.toSpeciesId)) report('error', `Espèce ${o.toSpeciesId} inconnue`);
    for (const m of o.methods) {
      if (m.itemId && !itemIds.has(m.itemId)) report('error', `Objet « ${m.itemId} » inconnu`);
    }
  }
}
