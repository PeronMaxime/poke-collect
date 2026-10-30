import type { LootEntry, LootTable, Trainer, Zone } from './schemas';

/**
 * Une table de butin par zone d'expédition, en remplacement des tables partagées (route, forêt,
 * grotte…). Elles ne contiennent que des Poké Balls, des baies et des fossiles : l'utilisateur ajoute
 * le reste dans l'admin. Les dresseurs ne donnent que de l'argent : ni table ni tirage. Même règles
 * que les migrations 0099 et 0100 (à garder en phase).
 */
const loot = (itemId: string, chance: number, min = 1, max = min): LootEntry => ({
  itemId,
  chance,
  min,
  max,
});

export const zoneLootTableId = (zoneId: string) => `butin-zone-${zoneId}`;

type Tier = 1 | 2 | 3 | 4;

/** Palier de progression d'une zone, d'après sa PE minimale. */
function zoneTier(zone: Zone): Tier {
  if (zone.minPower < 1000) return 1;
  if (zone.minPower < 2100) return 2;
  if (zone.minPower < 3500) return 3;
  return 4;
}

/** Poké Balls de plus en plus fortes au fil de la progression. */
function balls(tier: Tier): LootEntry[] {
  switch (tier) {
    case 1:
      return [loot('poke-ball', 0.7, 1, 3), loot('great-ball', 0.05)];
    case 2:
      return [loot('poke-ball', 0.6, 1, 3), loot('great-ball', 0.2, 1, 2)];
    case 3:
      return [
        loot('poke-ball', 0.5, 2, 4),
        loot('great-ball', 0.3, 1, 2),
        loot('ultra-ball', 0.05),
      ];
    case 4:
      return [
        loot('poke-ball', 0.3, 2, 5),
        loot('great-ball', 0.4, 1, 3),
        loot('ultra-ball', 0.3, 1, 2),
      ];
  }
}

/** Baies selon l'habitat, rares (1 à 2 % par tirage) : la culture prend ensuite le relais. */
function berries(habitat: string | null): LootEntry[] {
  switch (habitat) {
    case 'grassland':
      return [loot('razz-berry', 0.02), loot('nanab-berry', 0.015)];
    case 'forest':
      return [loot('razz-berry', 0.02), loot('pomeg-berry', 0.015), loot('sitrus-berry', 0.01)];
    case 'waters-edge':
    case 'sea':
      return [loot('sitrus-berry', 0.015), loot('nanab-berry', 0.01)];
    case 'cave':
    case 'mountain':
    case 'rough-terrain':
      return [loot('pomeg-berry', 0.01)];
    default:
      return [loot('sitrus-berry', 0.01)];
  }
}

/** Fossiles de la région, avec leurs probabilités (l'Ambre Ancien est plus rare). */
function fossils(regionId: string, chance: number, amberChance: number): LootEntry[] {
  switch (regionId) {
    case 'kanto':
    case 'johto':
      return [
        loot('helix-fossil', chance),
        loot('dome-fossil', chance),
        loot('old-amber', amberChance),
      ];
    case 'hoenn':
      return [loot('root-fossil', chance), loot('claw-fossil', chance)];
    case 'sinnoh':
      return [loot('skull-fossil', chance), loot('armor-fossil', chance)];
    default:
      return [];
  }
}

/** Sites de fouilles (anciennes tables « butin-fouilles… ») : fossiles fréquents. */
const EXCAVATION_TABLE_PREFIX = 'butin-fouilles';
const ROCKY_HABITATS = new Set(['cave', 'mountain', 'rough-terrain']);

function zoneFossils(zone: Zone): LootEntry[] {
  if (zone.lootTableId?.startsWith(EXCAVATION_TABLE_PREFIX)) {
    return fossils(zone.regionId, 0.04, 0.015);
  }
  if (zone.habitat && ROCKY_HABITATS.has(zone.habitat)) return fossils(zone.regionId, 0.01, 0.004);
  return [];
}

const tableName = (label: string) => `Butin — ${label}`.slice(0, 64);

export function zoneLootTable(zone: Zone): LootTable {
  return {
    id: zoneLootTableId(zone.id),
    name: tableName(zone.name),
    entries: [...balls(zoneTier(zone)), ...berries(zone.habitat), ...zoneFossils(zone)],
  };
}

/** Ajoute une table par zone et l'y rattache ; retire le butin des dresseurs. */
export function withOwnLootTables<
  T extends { lootTables: LootTable[]; zones: Zone[]; trainers: Trainer[] },
>(content: T): T {
  return {
    ...content,
    lootTables: [...content.lootTables, ...content.zones.map(zoneLootTable)],
    zones: content.zones.map((z) => ({ ...z, lootTableId: zoneLootTableId(z.id) })),
    trainers: content.trainers.map((t) => ({ ...t, lootTableId: null, lootRolls: 0 })),
  };
}
