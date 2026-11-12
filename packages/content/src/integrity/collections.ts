import { getForm, getSpecies } from '@poke/data';
import type { IntegrityCheck } from './context';

/** Collections : espèces, formes et région connues, récompense valide. */
export function checkCollections(check: IntegrityCheck): void {
  const { content, add, checkReward, regionIds } = check;
  for (const c of content.collections) {
    const unknown = c.speciesIds.filter((id) => !getSpecies(id));
    if (unknown.length > 0) {
      add('error', 'collection', c.id, `Espèces inconnues : ${unknown.join(', ')}`);
    }
    if (new Set(c.speciesIds).size !== c.speciesIds.length) {
      add('warning', 'collection', c.id, 'Espèce en double dans la liste');
    }
    const unknownForms = c.formIds.filter((id) => !getForm(id));
    if (unknownForms.length > 0) {
      add('error', 'collection', c.id, `Formes inconnues : ${unknownForms.join(', ')}`);
    }
    if (new Set(c.formIds).size !== c.formIds.length) {
      add('warning', 'collection', c.id, 'Forme en double dans la liste');
    }
    if (c.regionId && !regionIds.has(c.regionId)) {
      add('error', 'collection', c.id, `Région « ${c.regionId} » inconnue`);
    }
    checkReward('collection', c.id, c.rewards);
  }
}
