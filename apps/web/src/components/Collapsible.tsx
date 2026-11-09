import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

/**
 * Repli en accordéon commun : chevron de l'en-tête et contenu animé (widgets de la colonne de
 * droite, sections des pages). L'état des sections repliées est propre à l'appareil.
 */

/** Chevron pixel art de repli : pointe vers la droite quand c'est replié. */
export function CollapseButton({
  collapsed,
  onToggle,
  label,
}: {
  collapsed: boolean;
  onToggle: () => void;
  /** Ce qui est replié, pour les lecteurs d'écran (« la fenêtre Pension »). */
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-label={`${collapsed ? 'Déplier' : 'Replier'} ${label}`}
      title={collapsed ? 'Déplier' : 'Replier'}
      className="-my-1 grid size-7 shrink-0 place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
    >
      <svg
        viewBox="0 0 7 4"
        width="11"
        height="7"
        shapeRendering="crispEdges"
        aria-hidden
        className={`transition-transform ${collapsed ? '-rotate-90' : ''}`}
      >
        <path d="M0 0h7v1h-1v1h-1v1h-1v1h-1v-1h-1v-1h-1v-1h-1z" fill="currentColor" />
      </svg>
    </button>
  );
}

/** Contenu masqué en accordéon quand `open` est faux. */
export function CollapseBody({
  open,
  className,
  children,
}: {
  open: boolean;
  /** Classes du bloc intérieur (marge sous l'en-tête, espacement…). */
  className?: string;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0, overflow: 'hidden' }}
          animate={{ height: 'auto', opacity: 1, transitionEnd: { overflow: 'visible' } }}
          exit={{ height: 0, opacity: 0, overflow: 'hidden' }}
          transition={{ duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' }}
        >
          <div className={className}>{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const SECTIONS_KEY = 'dexpedition.collapsedSections';

function readSections(): ReadonlySet<string> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(SECTIONS_KEY) ?? '[]');
    return new Set(Array.isArray(raw) ? raw.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

let collapsedSections = readSections();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function toggleSection(id: string) {
  const next = new Set(collapsedSections);
  if (!next.delete(id)) next.add(id);
  collapsedSections = next;
  try {
    localStorage.setItem(SECTIONS_KEY, JSON.stringify([...next]));
  } catch {
    // Stockage indisponible : le réglage vaut pour la session.
  }
  for (const listener of listeners) listener();
}

/**
 * Section de page repliable (`id` stable, ex. « expeditions.active »), gardée dans le navigateur.
 * Repliée par défaut avec `defaultCollapsed` : on retient alors les sections dépliées (« id.open »).
 */
export function useCollapsedSection(id: string, defaultCollapsed = false) {
  const key = defaultCollapsed ? `${id}.open` : id;
  const toggled = useSyncExternalStore(subscribe, () => collapsedSections).has(key);
  return [toggled !== defaultCollapsed, () => toggleSection(key)] as const;
}
