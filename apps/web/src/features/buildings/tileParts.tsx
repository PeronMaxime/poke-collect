/**
 * Pièces communes des fenêtres de la colonne des bâtiments : cadre, poignée, repli, pages, pastilles
 * et classes des boutons.
 */
import { createContext, useContext, useState } from 'react';
import type { KeyboardEvent, MouseEvent, PointerEvent, ReactNode } from 'react';
import { CollapseBody, CollapseButton } from '../../components/Collapsible';
import type { BuildingTab } from '../../lib/widgets';

/** Temps restant en minutes ou en heures (« 34 min », « 2 h 05 »). */
export function shortCountdown(ms: number) {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

export const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

/**
 * Commandes de la fenêtre : poignée (glisser pour la déplacer, flèches du clavier pour la
 * monter/descendre) et repli en accordéon.
 */
export type WidgetHandle = {
  start: (e: PointerEvent<HTMLElement>) => void;
  move: (delta: -1 | 1) => void;
  collapsed: boolean;
  toggle: () => void;
};

export const WidgetHandleContext = createContext<WidgetHandle | null>(null);

/** Bouton de repli de l'en-tête d'une fenêtre (à gauche de la poignée). */
function WidgetCollapseButton({ title }: { title: string }) {
  const handle = useContext(WidgetHandleContext);
  if (!handle) return null;
  return (
    <CollapseButton
      collapsed={handle.collapsed}
      onToggle={handle.toggle}
      label={`la fenêtre ${title}`}
    />
  );
}

/** Contenu d'une fenêtre, masqué en accordéon quand elle est repliée. */
function TileBody({ children }: { children: ReactNode }) {
  const handle = useContext(WidgetHandleContext);
  return (
    <CollapseBody open={!handle?.collapsed} className="flex flex-col gap-2.5 pt-2.5">
      {children}
    </CollapseBody>
  );
}

/** Poignée à six points de l'en-tête d'une fenêtre. */
function DragHandle({ title }: { title: string }) {
  const handle = useContext(WidgetHandleContext);
  if (!handle) return null;
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const button = e.currentTarget;
    handle.move(e.key === 'ArrowUp' ? -1 : 1);
    // La fenêtre change de place dans le DOM : la poignée garde le focus.
    requestAnimationFrame(() => button.focus());
  };
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        e.preventDefault();
        handle.start(e);
      }}
      onKeyDown={onKeyDown}
      aria-label={`Déplacer la fenêtre ${title} (flèches haut et bas)`}
      title="Glisser pour déplacer"
      className="-my-1 -mr-1 grid size-7 shrink-0 cursor-grab touch-none place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing dark:hover:bg-slate-800 dark:hover:text-slate-200"
    >
      <svg viewBox="0 0 6 10" width="9" height="15" shapeRendering="crispEdges" aria-hidden>
        <path
          d="M0 0h2v2h-2zM4 0h2v2h-2zM0 4h2v2h-2zM4 4h2v2h-2zM0 8h2v2h-2zM4 8h2v2h-2z"
          fill="currentColor"
        />
      </svg>
    </button>
  );
}

/** Fenêtre d'un bâtiment : un clic hors des boutons et des liens ouvre sa page. */
export function Tile({
  tab,
  title,
  icon,
  badge,
  children,
}: {
  tab: BuildingTab;
  title: string;
  icon: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
}) {
  const open = (e: MouseEvent<HTMLElement>) => {
    const target = e.target as Element;
    // Clic dans une fenêtre en portail (modale) : il remonte l'arbre React, pas celui de la page.
    if (!e.currentTarget.contains(target)) return;
    if (target.closest('a, button, input, select, textarea, label')) return;
    // Texte sélectionné à la souris : pas de changement de page.
    if (window.getSelection()?.type === 'Range') return;
    window.location.hash = `#${tab}`;
  };
  return (
    <section
      onClick={open}
      className="card flex cursor-pointer flex-col p-3 transition hover:ring-2 hover:ring-brand-500/40"
    >
      <div className="flex items-center gap-2">
        <span className="shrink-0" aria-hidden>
          {icon}
        </span>
        <h2 className="min-w-0 flex-1">
          <a
            href={`#${tab}`}
            className="font-pixel text-[10px] leading-relaxed text-title uppercase hover:text-brand-500"
          >
            {title}
          </a>
        </h2>
        {badge}
        <WidgetCollapseButton title={title} />
        <DragHandle title={title} />
      </div>
      <TileBody>{children}</TileBody>
    </section>
  );
}

/** Pied d'une fenêtre : résumé à gauche, action à droite. */
export function TileFooter({ text, children }: { text?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-2 text-sm">
      <span className="min-w-0 text-slate-600 dark:text-slate-300">{text}</span>
      {children}
    </div>
  );
}

/** Page affichée d'une fenêtre, ramenée dans les bornes si le nombre de bâtiments baisse. */
export function usePage(count: number) {
  const [page, setPage] = useState(0);
  return [Math.max(0, Math.min(page, count - 1)), setPage] as const;
}

/**
 * Sélecteur de bâtiment : le nom de celui affiché, puis un petit carré par Centre, pension,
 * place ou champ. Un carré jaune signale qu'une action y attend le joueur.
 */
export function Pager({
  label,
  count,
  index,
  onChange,
  waiting,
  name = (i) => `${label} ${i + 1}`,
}: {
  label: string;
  count: number;
  index: number;
  onChange: (index: number) => void;
  waiting?: readonly boolean[];
  /** Nom d'une page (« Places 1 et 2 »…) ; par défaut le libellé suivi du numéro. */
  name?: (index: number) => string;
}) {
  if (count <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="shrink-0 text-xs font-semibold text-slate-600 dark:text-slate-300">
        {name(index)}
      </span>
      <div className="flex flex-wrap justify-end" role="group" aria-label={`Choisir : ${label}`}>
        {Array.from({ length: count }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onChange(i)}
            aria-label={`${name(i)}${waiting?.[i] ? ' (action en attente)' : ''}`}
            aria-current={i === index ? 'true' : undefined}
            className="group grid size-5 place-items-center"
          >
            <span
              className={`block size-2.5 rounded-[2px] border-2 transition group-hover:scale-125 ${
                i === index
                  ? 'border-ink bg-ink dark:border-title dark:bg-title'
                  : waiting?.[i]
                    ? 'border-[#b07a10] bg-[#f8d030]'
                    : 'border-slate-400 dark:border-slate-500'
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

export const SMALL_BTN = 'shrink-0 whitespace-nowrap px-2.5 py-1.5';

/**
 * Survol bien visible des boutons d'action des widgets (Soigner, Couver, Récupérer…) : le fond
 * change franchement de couleur.
 */
export const HOVER_PRIMARY = 'enabled:hover:bg-[#2878c8]! enabled:hover:text-white!';

export const HOVER_GHOST = 'enabled:hover:bg-[#b8dcf6]! dark:enabled:hover:bg-[#2c5578]!';

export const FREE_PLACE =
  'border-2 border-dashed border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400';

export const CLOSED_PLACE =
  'border-2 border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-600';

export function Badge({
  count,
  className = 'bg-brand-500 text-white',
  title,
}: {
  count: number;
  className?: string;
  title?: string;
}) {
  return count > 0 ? (
    <span className={`count-badge ${className}`} title={title}>
      {count}
    </span>
  ) : null;
}
