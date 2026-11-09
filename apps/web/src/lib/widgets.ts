import { useSyncExternalStore } from 'react';

/**
 * Widgets de la colonne de droite (grand écran) : un par bâtiment, la couveuse à côté de la
 * pension. L'ordre et les widgets masqués sont propres à l'appareil (navigateur).
 */
export const WIDGETS = ['center', 'daycare', 'incubator', 'museum', 'farm'] as const;
export type WidgetId = (typeof WIDGETS)[number];

export const WIDGET_LABELS: Record<WidgetId, string> = {
  center: 'Centre Pokémon',
  daycare: 'Pension',
  incubator: 'Couveuse',
  museum: 'Musée',
  farm: 'Ferme à baies',
};

/** Onglet (bâtiment) qui débloque le widget. */
export const widgetTab = (id: WidgetId) => (id === 'incubator' ? 'daycare' : id);

const ORDER_KEY = 'dexpedition.buildingsOrder';
const HIDDEN_KEY = 'dexpedition.hiddenWidgets';
const COLLAPSED_KEY = 'dexpedition.collapsedWidgets';

export type WidgetSettings = {
  order: readonly WidgetId[];
  /** Masqués depuis la fenêtre « Widgets ». */
  hidden: ReadonlySet<WidgetId>;
  /** Repliés : seul l'en-tête reste visible. */
  collapsed: ReadonlySet<WidgetId>;
};

function readIds(key: string): WidgetId[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return [...new Set(raw)].filter((id): id is WidgetId => WIDGETS.includes(id as WidgetId));
  } catch {
    return [];
  }
}

function write(key: string, ids: readonly WidgetId[]) {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // Stockage indisponible : le réglage vaut pour la session.
  }
}

function load(): WidgetSettings {
  const saved = readIds(ORDER_KEY);
  // Widgets absents de l'ordre enregistré (nouveaux) : à la suite, dans l'ordre par défaut.
  return {
    order: [...saved, ...WIDGETS.filter((id) => !saved.includes(id))],
    hidden: new Set(readIds(HIDDEN_KEY)),
    collapsed: new Set(readIds(COLLAPSED_KEY)),
  };
}

let settings = load();
const listeners = new Set<() => void>();

function update(next: WidgetSettings) {
  settings = next;
  write(ORDER_KEY, next.order);
  write(HIDDEN_KEY, [...next.hidden]);
  write(COLLAPSED_KEY, [...next.collapsed]);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Réglages des widgets, partagés entre la colonne et la fenêtre « Widgets ». */
export function useWidgetSettings() {
  return useSyncExternalStore(subscribe, () => settings);
}

/** Nouvel ordre des widgets affichés ; les autres gardent leur rang relatif, à la suite. */
export function reorderWidgets(shown: readonly WidgetId[]) {
  update({
    ...settings,
    order: [...shown, ...settings.order.filter((id) => !shown.includes(id))],
  });
}

export function setWidgetVisible(id: WidgetId, visible: boolean) {
  const hidden = new Set(settings.hidden);
  if (visible) hidden.delete(id);
  else hidden.add(id);
  update({ ...settings, hidden });
}

export function toggleWidgetCollapsed(id: WidgetId) {
  const collapsed = new Set(settings.collapsed);
  if (!collapsed.delete(id)) collapsed.add(id);
  update({ ...settings, collapsed });
}
