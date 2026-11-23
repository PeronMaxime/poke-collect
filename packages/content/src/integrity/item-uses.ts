import type { GameContentData, Item, ProgressReward } from '../schemas';
import type { IntegrityCheck } from './context';

/**
 * Objets à usage réservé, donnés là où ils n'ont pas leur place : un objet de quête ne s'obtient
 * que pendant l'étape qui le demande (et se rend à la réclamation), une parcelle ne s'achète qu'en
 * boutique (elle s'ouvre à l'achat, sans passer par le sac).
 */

/** Toutes les façons d'obtenir un objet hors de la boutique, par objet : « butin « x » »… */
function itemSourcesOutsideShop(content: GameContentData): Map<string, string[]> {
  const { balance } = content;
  const sources = new Map<string, string[]>();
  const note = (itemId: string, where: string) => {
    const list = sources.get(itemId) ?? [];
    if (!list.includes(where)) list.push(where);
    sources.set(itemId, list);
  };
  const noteReward = (reward: ProgressReward, where: string) => {
    for (const stack of reward.items) note(stack.itemId, where);
  };
  for (const s of balance.newPlayer.startingInventory) note(s.itemId, 'inventaire de départ');
  for (const table of content.lootTables) {
    for (const e of table.entries) note(e.itemId, `butin « ${table.id} »`);
  }
  for (const e of content.chestEntries) note(e.itemId, `coffre (lot « ${e.id} »)`);
  for (const e of content.shopEntries) {
    if (e.gift) note(e.gift.itemId, `cadeau de l’article « ${e.id} »`);
  }
  for (const c of content.collections) noteReward(c.rewards, `collection « ${c.id} »`);
  for (const q of content.quests) noteReward(q.rewards, `quête « ${q.id} »`);
  for (const c of balance.expeditionCompletions ?? []) {
    noteReward(c.rewards, `complétion « ${c.id} »`);
  }
  return sources;
}

/**
 * Objets qu'un joueur peut obtenir : article actif de la boutique, butin, coffre, cadeau d'achat,
 * récompense ou inventaire de départ (sans regarder les conditions de déblocage).
 */
export function obtainableItemIds(content: GameContentData): Set<string> {
  const ids = new Set(itemSourcesOutsideShop(content).keys());
  for (const e of content.shopEntries) if (e.enabled) ids.add(e.itemId);
  return ids;
}

/** Objet de quête : demandé par une étape, obtenu nulle part ailleurs, invendable. */
function checkQuestItem(check: IntegrityCheck, item: Item, elsewhere: readonly string[]): void {
  const { content, add } = check;
  const shopEntries = content.shopEntries.filter((e) => e.itemId === item.id);
  const others = [...elsewhere, ...shopEntries.map((e) => `boutique (article « ${e.id} »)`)];
  if (others.length > 0) {
    add(
      'warning',
      'item',
      item.id,
      `Objet de quête aussi obtenu ailleurs (${others.join(', ')}) : rendu à la réclamation de la quête, il sera retiré du sac`,
    );
  }
  if (item.sellPrice !== null) {
    add(
      'warning',
      'item',
      item.id,
      'Objet de quête revendable : le joueur peut le vendre avant de rendre la quête',
    );
  }
  const asked = content.quests.some((q) =>
    q.steps.some((s) => s.condition.type === 'questItem' && s.condition.itemId === item.id),
  );
  if (!asked) add('warning', 'item', item.id, 'Objet de quête demandé par aucune étape de quête');
}

/** Objets de quête et parcelles : là où ils sont donnés, et pour les objets de quête, à quoi ils servent. */
export function checkItemUses(check: IntegrityCheck): void {
  const { content, add } = check;
  const sources = itemSourcesOutsideShop(content);
  for (const item of content.items) {
    const elsewhere = sources.get(item.id) ?? [];
    if (item.category === 'quest') checkQuestItem(check, item, elsewhere);
    if (item.effects.some((e) => e.type === 'farmPlot') && elsewhere.length > 0) {
      add(
        'warning',
        'item',
        item.id,
        `Parcelle donnée hors de la boutique (${elsewhere.join(', ')}) : elle n’ouvre une parcelle qu’à l’achat`,
      );
    }
  }
}
