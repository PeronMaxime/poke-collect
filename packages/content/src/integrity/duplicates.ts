import { duplicates } from './context';
import type { IntegrityCheck } from './context';

/** Deux entités ne portent jamais le même identifiant. */
export function checkDuplicates(check: IntegrityCheck): void {
  const { content, add } = check;
  for (const id of duplicates(content.regions.map((r) => r.id)))
    add('error', 'region', id, 'Identifiant de région en double');
  for (const id of duplicates(content.zones.map((z) => z.id)))
    add('error', 'zone', id, 'Identifiant de zone en double');
  for (const id of duplicates(content.items.map((i) => i.id)))
    add('error', 'item', id, 'Identifiant d’objet en double');
  for (const id of duplicates(content.lootTables.map((t) => t.id)))
    add('error', 'lootTable', id, 'Identifiant de table de butin en double');
  for (const id of duplicates(content.trainers.map((t) => t.id)))
    add('error', 'trainer', id, 'Identifiant de dresseur en double');
  for (const id of duplicates(content.speciesOverrides.map((o) => o.speciesId)))
    add('error', 'speciesOverride', id, 'Surcharge d’espèce en double');
  for (const id of duplicates(content.abilities.map((a) => a.id)))
    add('error', 'ability', id, 'Talent en double');
  for (const id of duplicates(content.shopCategories.map((c) => c.id)))
    add('error', 'shopCategory', id, 'Identifiant de catégorie de boutique en double');
  for (const id of duplicates(content.shopEntries.map((e) => e.id)))
    add('error', 'shopEntry', id, 'Identifiant d’article de boutique en double');
  for (const id of duplicates(content.evolutionOverrides.map((o) => o.id)))
    add('error', 'evolutionOverride', id, 'Surcharge d’évolution en double');
  for (const id of duplicates(content.collections.map((c) => c.id)))
    add('error', 'collection', id, 'Identifiant de collection en double');
  for (const id of duplicates(content.quests.map((q) => q.id)))
    add('error', 'quest', id, 'Identifiant de quête en double');
  for (const id of duplicates(content.dungeons.map((d) => d.id)))
    add('error', 'dungeon', id, 'Identifiant de donjon en double');
  for (const id of duplicates(content.guildQuests.map((q) => q.id)))
    add('error', 'guildQuest', id, 'Identifiant de quête de guilde en double');
  for (const id of duplicates(content.chestEntries.map((e) => e.id)))
    add('error', 'chestEntry', id, 'Identifiant de lot de coffre en double');
}
