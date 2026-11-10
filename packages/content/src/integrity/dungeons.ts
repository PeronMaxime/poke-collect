import { getSpecies } from '@poke/data';
import { KNOWN_NATURES, formError } from './context';
import type { IntegrityCheck } from './context';
import type { ContentIssue } from './types';

/** Donjons : région, butin, Méga-Gemme, adversaires, lignée du boss. */
export function checkDungeons(check: IntegrityCheck): void {
  const { content, add, checkUnlock, regionIds, itemIds, lootTableIds } = check;
  for (const dungeon of content.dungeons) {
    const report = (severity: ContentIssue['severity'], message: string) =>
      add(severity, 'dungeon', dungeon.id, message);
    if (!regionIds.has(dungeon.regionId))
      report('error', `Région « ${dungeon.regionId} » inconnue`);
    if (dungeon.lootTableId && !lootTableIds.has(dungeon.lootTableId)) {
      report('error', `Table de butin « ${dungeon.lootTableId} » inconnue`);
    }
    if (dungeon.lootTableId && dungeon.lootRolls === 0) {
      report('warning', 'Table de butin choisie mais aucun tirage');
    }
    if (dungeon.gemItemId && !itemIds.has(dungeon.gemItemId)) {
      report('error', `Méga-Gemme « ${dungeon.gemItemId} » inconnue`);
    }
    if (dungeon.gemItemId && dungeon.gemChance === 0) {
      report('warning', 'Méga-Gemme choisie mais probabilité nulle');
    }
    for (const [label, member] of [
      ...dungeon.opponents.map((m, i) => [`Adversaire ${i + 1}`, m] as const),
      ['Boss', dungeon.boss] as const,
    ]) {
      if (!getSpecies(member.speciesId)) {
        report('error', `${label} : espèce ${member.speciesId} inconnue`);
      }
      const formIssue = formError(member);
      if (formIssue) report('error', `${label} : ${formIssue}`);
      if (member.nature && !KNOWN_NATURES.has(member.nature)) {
        report('error', `${label} : nature « ${member.nature} » inconnue`);
      }
    }
    const unknownFamily = dungeon.familySpeciesIds.filter((id) => !getSpecies(id));
    if (unknownFamily.length > 0) {
      report('error', `Lignée : espèces inconnues : ${unknownFamily.join(', ')}`);
    }
    if (!dungeon.familySpeciesIds.includes(dungeon.boss.speciesId)) {
      report('warning', 'L’espèce du boss ne fait pas partie de la lignée à capturer');
    }
    const region = content.regions.find((r) => r.id === dungeon.regionId);
    if (region && !region.speciesIds.includes(dungeon.boss.speciesId)) {
      report('warning', 'L’espèce du boss n’appartient pas au Pokédex de la région');
    }
    checkUnlock('dungeon', dungeon.id, dungeon.unlock);
  }
}
