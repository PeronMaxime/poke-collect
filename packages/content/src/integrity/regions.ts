import { getSpecies } from '@poke/data';
import type { IntegrityCheck } from './context';

/** Régions : espèces et starters connus, première région jouable. */
export function checkRegions(check: IntegrityCheck): void {
  const { content, add, checkUnlock } = check;
  const sortedRegions = [...content.regions].sort((a, b) => a.order - b.order);
  if (sortedRegions.length === 0) add('error', 'region', null, 'Aucune région');
  for (const region of content.regions) {
    const unknown = region.speciesIds.filter((id) => !getSpecies(id));
    if (unknown.length > 0) {
      add('error', 'region', region.id, `Espèces inconnues : ${unknown.join(', ')}`);
    }
    const included = new Set(region.speciesIds);
    const outside = region.starterSpeciesIds.filter((id) => !included.has(id));
    if (outside.length > 0) {
      add('error', 'region', region.id, `Starters hors de la région : ${outside.join(', ')}`);
    }
    checkUnlock('region', region.id, region.unlock);
    if (!content.zones.some((z) => z.regionId === region.id)) {
      add('warning', 'region', region.id, 'Aucune zone d’expédition dans cette région');
    }
  }
  // Les nouveaux joueurs commencent dans la première région active.
  const first = sortedRegions.find((r) => r.enabled);
  if (sortedRegions.length > 0 && !first) add('error', 'region', null, 'Aucune région active');
  if (first && first.starterSpeciesIds.length === 0) {
    add('error', 'region', first.id, 'La première région active doit proposer au moins un starter');
  }
}
