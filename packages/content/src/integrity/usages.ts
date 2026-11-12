import { FACILITIES, MENU_TABS, unlockParts } from '../schemas';
import type { GameContentData, QuestCondition } from '../schemas';
import type { ContentEntityKind } from './types';

/**
 * Où une entité est-elle utilisée ? Sert à refuser la suppression d'une entité encore citée.
 */

/**
 * Entités qui portent une condition de déblocage, et étapes de quête (avec un libellé pour les
 * usages).
 */
const unlockables = (content: GameContentData): { unlock: QuestCondition; name: string }[] =>
  [
    ...content.regions,
    ...content.zones,
    ...content.trainers,
    ...content.dungeons,
    ...content.shopEntries.map((e) => ({
      unlock: e.unlock,
      name: `Article ${content.items.find((i) => i.id === e.itemId)?.name ?? e.itemId} (${e.id})`,
    })),
    ...content.chestEntries.map((e) => ({
      unlock: e.unlock,
      name: `Lot de coffre ${content.items.find((i) => i.id === e.itemId)?.name ?? e.itemId} (${e.id})`,
    })),
    ...content.quests,
    ...content.quests.flatMap((q) =>
      q.steps.map((s, i) => ({ unlock: s.condition, name: `Quête ${q.name}, étape ${i + 1}` })),
    ),
    ...Object.entries(content.balance.tabUnlocks ?? {}).map(([tab, unlock]) => ({
      unlock,
      name: `Onglet ${MENU_TABS.find((t) => t.id === tab)?.label ?? tab}`,
    })),
    ...FACILITIES.flatMap(({ id, label }) =>
      (content.balance.facilityUnlocks?.[id] ?? []).map((step) => ({
        unlock: step.unlock,
        name: `${label} (+${step.amount})`,
      })),
    ),
  ].flatMap((e) => unlockParts(e.unlock).map((unlock) => ({ unlock, name: e.name })));

/** Où une entité est-elle utilisée ? (avant suppression : intégrité des références) */
export function findUsages(
  content: GameContentData,
  entity: ContentEntityKind,
  id: string | number,
): string[] {
  const usages: string[] = [];
  switch (entity) {
    case 'item':
      if (content.balance.newPlayer.startingInventory.some((s) => s.itemId === id)) {
        usages.push('Équilibrage : inventaire de départ');
      }
      for (const t of content.lootTables) {
        if (t.entries.some((e) => e.itemId === id)) usages.push(`Table de butin « ${t.name} »`);
      }
      for (const e of content.shopEntries) {
        if (e.itemId === id) usages.push(`Article de boutique « ${e.id} »`);
        if (e.gift?.itemId === id) usages.push(`Cadeau de l’article « ${e.id} »`);
      }
      if (content.balance.evolution.tradeItemId === id) {
        usages.push('Équilibrage : objet qui remplace l’échange');
      }
      for (const o of content.evolutionOverrides) {
        if (o.methods.some((m) => m.itemId === id)) usages.push(`Évolution « ${o.id} »`);
      }
      for (const c of content.collections) {
        if (c.rewards.items.some((s) => s.itemId === id)) usages.push(`Collection « ${c.name} »`);
      }
      for (const q of content.quests) {
        if (q.rewards.items.some((s) => s.itemId === id)) usages.push(`Quête « ${q.name} »`);
        q.steps.forEach((st, i) => {
          if (st.condition.type === 'questItem' && st.condition.itemId === id) {
            usages.push(`Quête « ${q.name} », étape ${i + 1}`);
          }
        });
      }
      for (const d of content.dungeons) {
        if (d.gemItemId === id) usages.push(`Donjon « ${d.name} »`);
      }
      for (const e of content.chestEntries) {
        if (e.itemId === id) usages.push(`Lot de coffre « ${e.id} »`);
      }
      break;
    case 'shopCategory':
      for (const e of content.shopEntries) {
        if (e.categoryId === id) usages.push(`Article de boutique « ${e.id} »`);
      }
      break;
    case 'lootTable':
      for (const z of content.zones) {
        if (z.lootTableId === id) usages.push(`Zone « ${z.name} »`);
      }
      for (const t of content.trainers) {
        if (t.lootTableId === id) usages.push(`Dresseur « ${t.name} »`);
      }
      for (const d of content.dungeons) {
        if (d.lootTableId === id) usages.push(`Donjon « ${d.name} »`);
      }
      break;
    case 'region': {
      for (const z of content.zones) {
        if (z.regionId === id) usages.push(`Zone « ${z.name} »`);
      }
      for (const t of content.trainers) {
        if (t.regionId === id) usages.push(`Dresseur « ${t.name} »`);
      }
      for (const q of content.quests) {
        if (q.regionId === id) usages.push(`Quête « ${q.name} »`);
      }
      for (const d of content.dungeons) {
        if (d.regionId === id) usages.push(`Donjon « ${d.name} »`);
      }
      const unlocks = unlockables(content).filter(
        (e) =>
          (e.unlock.type === 'regionDexPercent' || e.unlock.type === 'regionUnlocked') &&
          e.unlock.regionId === id,
      );
      for (const e of unlocks) usages.push(`Condition de déblocage de « ${e.name} »`);
      break;
    }
    case 'zone': {
      for (const t of content.trainers) {
        if (t.zoneId === id) usages.push(`Dresseur « ${t.name} »`);
      }
      const steps = unlockables(content).filter(
        (e) =>
          (e.unlock.type === 'expedition' ||
            e.unlock.type === 'catchPokemon' ||
            e.unlock.type === 'questItem') &&
          e.unlock.zoneId === id,
      );
      for (const e of steps) usages.push(e.name);
      break;
    }
    case 'quest': {
      for (const t of content.trainers) {
        if (t.questId === id) usages.push(`Dresseur de quête « ${t.name} »`);
      }
      const unlocks = unlockables(content).filter(
        (e) =>
          (e.unlock.type === 'questStepsDone' || e.unlock.type === 'questCompleted') &&
          e.unlock.questId === id,
      );
      for (const e of unlocks) usages.push(`Condition de « ${e.name} »`);
      break;
    }
    case 'trainer': {
      const unlocks = unlockables(content).filter(
        (e) => e.unlock.type === 'trainerDefeated' && e.unlock.trainerId === id,
      );
      for (const e of unlocks) usages.push(`Condition de déblocage de « ${e.name} »`);
      break;
    }
    case 'speciesOverride':
    case 'ability':
    case 'shopEntry':
    case 'evolutionOverride':
    case 'collection':
    case 'dungeon':
    case 'guildQuest':
    case 'chestEntry':
    case 'balance':
      break;
  }
  return usages;
}
