import { types as typeData } from '@poke/data';
import { FACILITIES } from '../schemas';
import { KNOWN_TYPES, NON_POKEMON_TYPES } from './context';
import type { IntegrityCheck } from './context';

/**
 * Équilibrage : bornes cohérentes, objets et types cités, conditions d'ouverture des onglets et
 * des bâtiments, complétions d'expédition.
 */
export function checkBalance(check: IntegrityCheck): void {
  const { content, balance, add, checkUnlock, checkReward, regionIds, itemIds } = check;
  if (balance.expeditions.initialSlots > balance.expeditions.maxSlots) {
    add('error', 'balance', null, 'Expéditions : emplacements initiaux > maximum');
  }
  if (balance.combat.minAttackIntervalMs > balance.combat.maxAttackIntervalMs) {
    add('error', 'balance', null, 'Combat : délai minimal entre deux attaques > maximal');
  }
  if (balance.combat.baseAttackIntervalMs > balance.combat.maxAttackIntervalMs) {
    add('error', 'balance', null, 'Combat : délai de référence > délai à Vitesse 0');
  }
  for (const t of Object.keys(balance.combat.attacks)) {
    if (!KNOWN_TYPES.has(t)) add('error', 'balance', null, `Combat : type « ${t} » inconnu`);
  }
  const missingAttacks = typeData
    .filter((t) => !NON_POKEMON_TYPES.has(t.name) && !balance.combat.attacks[t.name])
    .map((t) => t.nameFr);
  if (missingAttacks.length > 0) {
    add(
      'warning',
      'balance',
      null,
      `Combat : aucune attaque pour ${missingAttacks.join(', ')} (attaque par défaut)`,
    );
  }
  for (const stack of balance.newPlayer.startingInventory) {
    if (!itemIds.has(stack.itemId)) {
      add('error', 'balance', null, `Inventaire de départ : objet « ${stack.itemId} » inconnu`);
    }
  }
  if (balance.evolution.tradeItemId && !itemIds.has(balance.evolution.tradeItemId)) {
    add(
      'error',
      'balance',
      null,
      `Évolutions : objet de remplacement de l’échange « ${balance.evolution.tradeItemId} » inconnu`,
    );
  }
  if (balance.evolution.dayStartHour === balance.evolution.nightStartHour) {
    add('error', 'balance', null, 'Évolutions : le jour et la nuit commencent à la même heure');
  }
  const ballIds = new Set(
    content.items.filter((i) => i.effects.some((e) => e.type === 'ball')).map((i) => i.id),
  );
  if (ballIds.size === 0)
    add('warning', 'item', null, 'Aucun objet n’a l’effet « Ball » : capture impossible');
  if (!balance.newPlayer.startingInventory.some((s) => ballIds.has(s.itemId))) {
    add('warning', 'balance', null, 'Les nouveaux joueurs ne reçoivent aucune Ball');
  }

  for (const [tab, unlock] of Object.entries(balance.tabUnlocks ?? {})) {
    checkUnlock('balance', tab, unlock);
  }
  for (const { id } of FACILITIES) {
    for (const step of balance.facilityUnlocks?.[id] ?? []) checkUnlock('balance', id, step.unlock);
  }
  for (const c of balance.expeditionCompletions ?? []) {
    if (c.regionId && !regionIds.has(c.regionId)) {
      add('error', 'balance', c.id, `Complétion : région « ${c.regionId} » inconnue`);
    }
    if (c.zoneId) {
      const zone = content.zones.find((z) => z.id === c.zoneId);
      if (!zone) add('error', 'balance', c.id, `Complétion : expédition « ${c.zoneId} » inconnue`);
      else if (c.regionId && zone.regionId !== c.regionId) {
        add('error', 'balance', c.id, 'Complétion : l’expédition n’est pas dans la région choisie');
      }
    }
    checkReward('balance', c.id, c.rewards);
  }
}
