import { types as typeData } from '@poke/data';
import { BAG_SECTIONS, FACILITIES, MENU_TABS } from '../schemas';
import { KNOWN_TYPES, NON_POKEMON_TYPES } from './context';
import type { IntegrityCheck } from './context';

const KNOWN_TABS: ReadonlySet<string> = new Set(MENU_TABS.map((t) => t.id));
const KNOWN_BAG_SECTIONS: ReadonlySet<string> = new Set(BAG_SECTIONS);

/**
 * Identifiants d'une liste d'onglets ou de rubriques que le jeu ignore sans rien dire : inconnus
 * (retirés du code, fautes de frappe), ou déjà placés plus haut (seule la première place compte).
 */
function ignoredIds(lists: readonly (readonly string[])[], known: ReadonlySet<string>) {
  const seen = new Set<string>();
  const unknown = new Set<string>();
  const twice = new Set<string>();
  for (const id of lists.flat()) {
    if (!known.has(id)) unknown.add(id);
    else if (seen.has(id)) twice.add(id);
    seen.add(id);
  }
  return { unknown: [...unknown], twice: [...twice] };
}

/** Menu, Sac et onglets à débloquer : identifiants que le jeu ignorerait. */
function checkLayout(check: IntegrityCheck): void {
  const { balance, add } = check;
  const report = (message: string) => add('warning', 'balance', null, message);
  const list = (ids: string[]) => ids.map((id) => `« ${id} »`).join(', ');
  const menu = ignoredIds(balance.menu?.groups ?? [], KNOWN_TABS);
  if (menu.unknown.length) report(`Menu : onglet(s) inconnu(s) ignoré(s) : ${list(menu.unknown)}`);
  if (menu.twice.length) {
    report(
      `Menu : onglet(s) placé(s) deux fois (seule la première place compte) : ${list(menu.twice)}`,
    );
  }
  const extraTitles = (balance.menu?.titles?.length ?? 0) - (balance.menu?.groups.length ?? 0);
  if (extraTitles > 0) report(`Menu : ${extraTitles} titre(s) sans section`);
  const bag = ignoredIds(
    (balance.bag?.tabs ?? []).map((t) => t.sections),
    KNOWN_BAG_SECTIONS,
  );
  if (bag.unknown.length) report(`Sac : rubrique(s) inconnue(s) ignorée(s) : ${list(bag.unknown)}`);
  if (bag.twice.length) {
    report(
      `Sac : rubrique(s) placée(s) deux fois (seule la première place compte) : ${list(bag.twice)}`,
    );
  }
  const unknownTitles = Object.keys(balance.bag?.sectionTitles ?? {}).filter(
    (id) => !KNOWN_BAG_SECTIONS.has(id),
  );
  if (unknownTitles.length) {
    report(`Sac : titre(s) de rubrique(s) inconnue(s) ignoré(s) : ${list(unknownTitles)}`);
  }
  const unknownTabs = Object.keys(balance.tabUnlocks ?? {}).filter((id) => !KNOWN_TABS.has(id));
  if (unknownTabs.length) {
    report(
      `Onglets à débloquer : onglet(s) inconnu(s), condition sans effet : ${list(unknownTabs)}`,
    );
  }
}

/**
 * Équilibrage : bornes cohérentes, objets et types cités, menu et Sac, conditions d'ouverture des
 * onglets et des bâtiments, complétions d'expédition.
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
  if (balance.transfer.candiesPerLevelStart > balance.transfer.candiesPerLevelEnd) {
    add(
      'warning',
      'balance',
      null,
      'Bonbons : un niveau élevé coûte moins de Bonbons qu’un niveau bas (départ > arrivée)',
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

  checkLayout(check);
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
    if (c.scope === 'region' && c.zoneId) {
      add('warning', 'balance', c.id, 'Complétion de région : l’expédition choisie est ignorée');
    } else if (c.zoneId) {
      const zone = content.zones.find((z) => z.id === c.zoneId);
      if (!zone) add('error', 'balance', c.id, `Complétion : expédition « ${c.zoneId} » inconnue`);
      else if (c.regionId && zone.regionId !== c.regionId) {
        add('error', 'balance', c.id, 'Complétion : l’expédition n’est pas dans la région choisie');
      }
    }
    checkReward('balance', c.id, c.rewards);
  }
}
