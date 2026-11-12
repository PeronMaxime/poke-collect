import { getSpecies } from '@poke/data';
import { KNOWN_TYPES, formError } from './context';
import type { IntegrityCheck } from './context';

/** Zones : région, butin, types, rencontres actives, rencontres spéciales. */
export function checkZones(check: IntegrityCheck): void {
  const { content, balance, add, checkUnlock, lootTableIds, disabled } = check;
  for (const zone of content.zones) {
    const region = content.regions.find((r) => r.id === zone.regionId);
    if (!region) add('error', 'zone', zone.id, `Région « ${zone.regionId} » inconnue`);
    if (zone.lootTableId && !lootTableIds.has(zone.lootTableId)) {
      add('error', 'zone', zone.id, `Table de butin « ${zone.lootTableId} » inconnue`);
    }
    if (!zone.lootTableId) add('warning', 'zone', zone.id, 'Aucune table de butin');
    for (const t of [...zone.affinityTypes, ...zone.requiredTypes.map((r) => r.type)]) {
      if (!KNOWN_TYPES.has(t)) add('error', 'zone', zone.id, `Type « ${t} » inconnu`);
    }
    const requiredCount = zone.requiredTypes.reduce((sum, r) => sum + r.count, 0);
    if (requiredCount > balance.expeditions.maxTeamSize) {
      add('error', 'zone', zone.id, 'Plus de Pokémon requis que la taille d’équipe maximale');
    }
    if (zone.minDurationMinutes > balance.expeditions.maxDurationMinutes) {
      add('error', 'zone', zone.id, 'Durée minimum au-delà de la durée maximale des expéditions');
    }
    checkUnlock('zone', zone.id, zone.unlock);

    // Les Pokémon des régions précédentes peuvent apparaître (Kanto à Johto), pas les suivants.
    const included = new Set(
      content.regions
        .filter((r) => region && (r.id === region.id || r.order < region.order))
        .flatMap((r) => r.speciesIds),
    );
    let enabledCount = 0;
    for (const e of zone.encounters) {
      const species = getSpecies(e.speciesId);
      if (!species) {
        add('error', 'zone', zone.id, `Espèce ${e.speciesId} inconnue`);
        continue;
      }
      const formIssue = formError(e);
      if (formIssue) add('error', 'zone', zone.id, formIssue);
      if (disabled.has(e.speciesId)) {
        add('warning', 'zone', zone.id, `${species.nameFr} est désactivé : rencontre ignorée`);
      } else {
        enabledCount++;
      }
      if (species.isLegendary || species.isMythical) {
        add(
          'warning',
          'zone',
          zone.id,
          `${species.nameFr} est légendaire/mythique (réservé aux quêtes)`,
        );
      }
      if (region && !included.has(e.speciesId)) {
        add(
          'warning',
          'zone',
          zone.id,
          `${species.nameFr} n’appartient ni à la région ni à une région précédente`,
        );
      }
    }
    if (enabledCount === 0) add('error', 'zone', zone.id, 'Aucune rencontre active');

    // Rencontres spéciales : le Pokémon requis doit pouvoir faire partie de l'équipe (Pokédex de
    // la région de la zone).
    for (const s of zone.specialEncounters) {
      const species = getSpecies(s.speciesId);
      const required = getSpecies(s.requiredSpeciesId);
      if (!species)
        add('error', 'zone', zone.id, `Rencontre spéciale : espèce ${s.speciesId} inconnue`);
      if (!required) {
        add(
          'error',
          'zone',
          zone.id,
          `Rencontre spéciale : espèce requise ${s.requiredSpeciesId} inconnue`,
        );
      }
      const formIssue =
        formError(s) ?? formError({ speciesId: s.requiredSpeciesId, formId: s.requiredFormId });
      if (formIssue) add('error', 'zone', zone.id, `Rencontre spéciale : ${formIssue}`);
      if (species && disabled.has(s.speciesId)) {
        add('warning', 'zone', zone.id, `Rencontre spéciale : ${species.nameFr} est désactivé`);
      }
      if (required && region && !region.speciesIds.includes(required.id)) {
        add(
          'warning',
          'zone',
          zone.id,
          `Rencontre spéciale : ${required.nameFr} n’est pas dans le Pokédex de la région, il ne peut pas faire partie de l’équipe`,
        );
      }
    }
  }
}
