import type { LootEntry, LootTable, Trainer, Zone } from '../schemas';

/**
 * Une table de butin par zone d'expédition, en remplacement des tables partagées (route, forêt,
 * grotte…). Elles ne contiennent que des Balls, des baies et des fossiles : l'utilisateur ajoute
 * le reste dans l'admin. Les dresseurs ne donnent que de l'argent : ni table ni tirage. Même règles
 * que les migrations 0099, 0100 et 0140 (à garder en phase).
 */
const loot = (itemId: string, chance: number, min = 1, max = min): LootEntry => ({
  itemId,
  chance,
  min,
  max,
});

const zoneLootTableId = (zoneId: string) => `butin-zone-${zoneId}`;

/** PE minimale à partir de laquelle une zone donne des Hyper Balls. */
const ULTRA_BALL_MIN_POWER = 2100;

/**
 * Chance d'une Ball par tirage, de la première zone de la région qui la donne à la dernière.
 * Un tirage pour deux rencontres et 2 Balls en moyenne par drop : la chance vaut la part des
 * Balls lancées que le butin rend (au total 40 à 55 % en début de région, 85 % à la fin).
 */
const BALL_CHANCES = {
  'poke-ball': [0.4, 0.55],
  'great-ball': [0.15, 0.2],
  'ultra-ball': [0.05, 0.1],
} as const;

/**
 * Balls d'une zone, par 1 à 3, à une chance qui monte avec sa PE minimale dans la région (même
 * règle que la migration 0140).
 */
function balls(zone: Zone, zones: readonly Zone[]): LootEntry[] {
  const region = zones.filter((z) => z.regionId === zone.regionId);
  const drops = (ballId: keyof typeof BALL_CHANCES, z: Zone) =>
    ballId !== 'ultra-ball' || z.minPower >= ULTRA_BALL_MIN_POWER;
  const top = Math.max(...region.map((z) => z.minPower));
  return (Object.keys(BALL_CHANCES) as (keyof typeof BALL_CHANCES)[])
    .filter((ballId) => drops(ballId, zone))
    .map((ballId) => {
      const [from, to] = BALL_CHANCES[ballId];
      const first = Math.min(...region.filter((z) => drops(ballId, z)).map((z) => z.minPower));
      const t = top > first ? (zone.minPower - first) / (top - first) : 1;
      return loot(ballId, Math.round((from + (to - from) * t) * 100) / 100, 1, 3);
    });
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

function zoneLootTable(zone: Zone, zones: readonly Zone[]): LootTable {
  return {
    id: zoneLootTableId(zone.id),
    name: tableName(zone.name),
    entries: [...balls(zone, zones), ...berries(zone.habitat), ...zoneFossils(zone)],
  };
}

/** Ajoute une table par zone et l'y rattache ; retire le butin des dresseurs. */
export function withOwnLootTables<
  T extends { lootTables: LootTable[]; zones: Zone[]; trainers: Trainer[] },
>(content: T): T {
  return {
    ...content,
    lootTables: [
      ...content.lootTables,
      ...content.zones.map((z) => zoneLootTable(z, content.zones)),
    ],
    zones: content.zones.map((z) => ({ ...z, lootTableId: zoneLootTableId(z.id) })),
    trainers: content.trainers.map((t) => ({ ...t, lootTableId: null, lootRolls: 0 })),
  };
}
