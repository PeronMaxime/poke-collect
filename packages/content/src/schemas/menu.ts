import { z } from 'zod';
import { unlockConditionSchema } from './unlock';
import type { UnlockCondition } from './unlock';

/**
 * Menu du jeu (onglets, sections, conditions d'ouverture) et rangement du Sac.
 */

/** Onglets du jeu (l'identifiant est aussi l'ancre de l'URL : `#pc`). */
export const MENU_TABS = [
  { id: 'expeditions', label: 'Expéditions' },
  { id: 'battles', label: 'Combats' },
  { id: 'dungeons', label: 'Donjons' },
  { id: 'quests', label: 'Quêtes' },
  { id: 'center', label: 'Centre Pokémon' },
  { id: 'daycare', label: 'Pension' },
  { id: 'museum', label: 'Musée' },
  { id: 'farm', label: 'Ferme à baies' },
  { id: 'pc', label: 'PC' },
  { id: 'teams', label: 'Équipe Pkmn' },
  { id: 'pokedex', label: 'Pokédex' },
  { id: 'shop', label: 'Boutique' },
  { id: 'bag', label: 'Sac' },
  { id: 'trainer', label: 'Fiche Dresseur' },
  { id: 'guild', label: 'Guilde' },
  { id: 'leaderboard', label: 'Classement' },
] as const;

export type MenuTabId = (typeof MENU_TABS)[number]['id'];

/** Groupes du menu quand l'admin n'en a pas défini. */
export const DEFAULT_MENU_GROUPS: MenuTabId[][] = [
  ['expeditions', 'battles', 'dungeons', 'quests'],
  ['center', 'daycare', 'museum', 'farm'],
  ['pc', 'teams', 'pokedex', 'shop', 'bag'],
  ['trainer', 'guild', 'leaderboard'],
];

/** Titre de chaque groupe par défaut (sections de l'accordéon du menu). */
export const DEFAULT_MENU_TITLES = ['Aventure', 'Bâtiments', 'Collection', 'Dresseur'];

/** Titre d'une section du menu. */
export const menuTitleSchema = z.string().trim().min(1, 'Titre obligatoire').max(30);

/**
 * Groupes d'onglets du menu, chacun une section repliable de l'accordéon. Identifiants libres : un
 * onglet retiré du code est ignoré, un onglet absent est ajouté à la fin (voir `normalizeMenu`).
 * `titles[i]` : titre du groupe `i` (absent des anciens contenus : titre du groupe par défaut).
 */
export const menuSettingsSchema = z.object({
  groups: z.array(z.array(z.string())),
  titles: z.array(menuTitleSchema).optional(),
});

export type MenuSettings = z.infer<typeof menuSettingsSchema>;

/**
 * Rangement du Sac : onglets (titre + rubriques dans l'ordre) et titres des rubriques. Une
 * rubrique est une catégorie d'objets, ou « eggs » / « candies » ; identifiants libres comme le
 * menu : une rubrique inconnue est ignorée, une rubrique absente va dans le dernier onglet (voir
 * `normalizeBag`).
 */
export const bagSettingsSchema = z.object({
  tabs: z.array(z.object({ title: menuTitleSchema, sections: z.array(z.string()) })),
  sectionTitles: z.record(z.string(), menuTitleSchema).optional(),
});

export type BagSettings = z.infer<typeof bagSettingsSchema>;

/**
 * Condition de déblocage de chaque onglet du menu (identifiants libres, comme les groupes) ; un
 * onglet absent est toujours ouvert.
 */
export const tabUnlocksSchema = z.record(z.string(), unlockConditionSchema);

export type TabUnlocks = z.infer<typeof tabUnlocksSchema>;

/** Condition de déblocage d'un onglet (« toujours » sans réglage). */
export function tabUnlock(
  balance: { tabUnlocks?: TabUnlocks | undefined },
  tab: MenuTabId,
): UnlockCondition {
  return balance.tabUnlocks?.[tab] ?? { type: 'always' };
}

/** Section du menu : un titre et ses onglets. */
export interface MenuSection {
  title: string;
  tabs: MenuTabId[];
}

/** Titre par défaut d'un groupe : celui du groupe par défaut de son premier onglet. */
function defaultMenuTitle(tabs: readonly MenuTabId[], index: number): string {
  const group = DEFAULT_MENU_GROUPS.findIndex((g) => tabs[0] && g.includes(tabs[0]));
  return DEFAULT_MENU_TITLES[group] ?? `Section ${index + 1}`;
}

/** Sections prêtes à afficher (voir `normalizeMenuGroups`), avec leur titre. */
export function normalizeMenu(menu: Partial<MenuSettings> | undefined): MenuSection[] {
  const titled = menu?.groups
    ? menu.groups.map((g, i) => ({ tabs: g, title: menu.titles?.[i]?.trim() || null }))
    : DEFAULT_MENU_GROUPS.map((g, i) => ({ tabs: g, title: DEFAULT_MENU_TITLES[i] ?? null }));
  return normalizeTitledGroups(titled).map((s, i) => ({
    tabs: s.tabs,
    title: s.title ?? defaultMenuTitle(s.tabs, i),
  }));
}

/** Groupes prêts à afficher : onglets inconnus et doublons retirés, oubliés ajoutés, vides retirés. */
export function normalizeMenuGroups(groups: readonly (readonly string[])[] | undefined) {
  return normalizeTitledGroups((groups ?? DEFAULT_MENU_GROUPS).map((tabs) => ({ tabs }))).map(
    (s) => s.tabs,
  );
}

function normalizeTitledGroups(
  groups: readonly { tabs: readonly string[]; title?: string | null }[],
): { tabs: MenuTabId[]; title: string | null }[] {
  const known = new Set<string>(MENU_TABS.map((t) => t.id));
  const seen = new Set<string>();
  const sections = groups.map((g) => ({
    title: g.title ?? null,
    tabs: g.tabs.filter((id) => known.has(id) && !seen.has(id) && seen.add(id)) as MenuTabId[],
  }));
  const result = sections.map((s) => s.tabs);
  // Onglet oublié (souvent ajouté au jeu après le réglage de l'admin) : placé à côté de son voisin
  // dans les groupes par défaut (celui d'avant, sinon celui d'après) s'il est affiché, sinon dans
  // un groupe final.
  const missing: MenuTabId[] = [];
  for (const id of MENU_TABS.map((t) => t.id).filter((id) => !seen.has(id))) {
    const defaults = DEFAULT_MENU_GROUPS.find((g) => g.includes(id)) ?? [];
    const before = defaults.slice(0, defaults.indexOf(id)).reverse();
    const after = defaults.slice(defaults.indexOf(id) + 1);
    const previous = before.find((other) => seen.has(other));
    const anchor = previous ?? after.find((other) => seen.has(other));
    const group = anchor && result.find((g) => g.includes(anchor));
    if (group && anchor) group.splice(group.indexOf(anchor) + (previous ? 1 : 0), 0, id);
    else missing.push(id);
    seen.add(id);
  }
  if (missing.length) sections.push({ tabs: missing, title: 'Autres' });
  return sections.filter((s) => s.tabs.length > 0);
}
