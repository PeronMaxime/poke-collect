import type { IntegrityCheck } from './context';

/** Tables de butin : objets connus, table utilisée quelque part. */
export function checkLootTables(check: IntegrityCheck): void {
  const { content, add, itemIds } = check;
  for (const table of content.lootTables) {
    for (const entry of table.entries) {
      if (!itemIds.has(entry.itemId)) {
        add('error', 'lootTable', table.id, `Objet « ${entry.itemId} » inconnu`);
      }
    }
    if (table.entries.length === 0) add('warning', 'lootTable', table.id, 'Table vide');
    const used =
      content.zones.some((z) => z.lootTableId === table.id) ||
      content.trainers.some((t) => t.lootTableId === table.id) ||
      content.dungeons.some((d) => d.lootTableId === table.id);
    if (!used) {
      add('warning', 'lootTable', table.id, 'Table utilisée nulle part');
    }
  }
}
