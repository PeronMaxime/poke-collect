import type { ReactNode } from 'react';
import { CollapseBody, CollapseButton, useCollapsedSection } from '../../components/Collapsible';

/**
 * Pièces communes des pages des bâtiments (Centre Pokémon, Pension, Musée, Ferme à baies) : une
 * fenêtre par section, comme les Expéditions.
 */

/** Place libre ou fermée d'un bâtiment : cadre en pointillés, comme un emplacement d'expédition. */
export const EMPTY_PLACE =
  'rounded-lg border-[3px] border-dashed border-slate-400 text-slate-500 dark:border-slate-600 dark:text-slate-400';

/** Petit bouton dans une tuile (Changer, Retirer, Reprendre…). */
export const SMALL_BUTTON = 'px-2.5 py-1.5';

/** Fenêtre d'une section : chevron de repli, titre, compteur et actions à droite. */
export function BuildingSection({
  id,
  title,
  label,
  count,
  countTitle,
  actions,
  intro,
  className = 'space-y-4',
  children,
}: {
  /** Identifiant stable du repli (« center.patients »…). */
  id: string;
  title: ReactNode;
  /** Ce que replie le chevron, pour les lecteurs d'écran (« le Centre Pokémon »). */
  label: string;
  count?: ReactNode;
  countTitle?: string;
  actions?: ReactNode;
  /** Explication sous le titre. */
  intro?: ReactNode;
  /** Classes du contenu. */
  className?: string;
  children: ReactNode;
}) {
  const [collapsed, toggle] = useCollapsedSection(id);
  return (
    <section className="card p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <CollapseButton collapsed={collapsed} onToggle={toggle} label={label} />
          <h2>{title}</h2>
          {count !== undefined && (
            <span className="count-badge" title={countTitle}>
              {count}
            </span>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <CollapseBody open={!collapsed} className="pt-3">
        {intro && <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">{intro}</p>}
        <div className={className}>{children}</div>
      </CollapseBody>
    </section>
  );
}

const NOTICE_TONES = {
  ok: 'border-emerald-600 bg-emerald-50 text-emerald-800 dark:border-emerald-500 dark:bg-emerald-950/50 dark:text-emerald-300',
  warn: 'border-amber-600 bg-amber-50 text-amber-800 dark:border-[#a07a20] dark:bg-[#3d3416] dark:text-[#f8d878]',
  bad: 'border-red-600 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950/50 dark:text-red-300',
} as const;

/** Message encadré (récolte, œufs ramassés, erreur), qu'on peut fermer. */
export function Notice({
  tone,
  onClose,
  className = '',
  children,
}: {
  tone: keyof typeof NOTICE_TONES;
  onClose?: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <p
      className={`flex items-start justify-between gap-2 rounded-md border-2 px-3 py-2 text-sm ${NOTICE_TONES[tone]} ${className}`}
    >
      <span className="min-w-0">{children}</span>
      {onClose && (
        <button onClick={onClose} aria-label="Fermer" className="shrink-0">
          ✕
        </button>
      )}
    </p>
  );
}

/** Petite étiquette d'état (Arrosé, Prêt, En soins…), en police des titres. */
export const STATE_TAGS = {
  ok: 'border-emerald-600 bg-emerald-50 text-emerald-700 dark:border-emerald-400 dark:bg-emerald-950 dark:text-emerald-300',
  water:
    'border-sky-600 bg-sky-50 text-sky-700 dark:border-sky-400 dark:bg-sky-950 dark:text-sky-300',
  heal: 'border-pink-600 bg-pink-50 text-pink-700 dark:border-pink-400 dark:bg-pink-950 dark:text-pink-300',
  ready: 'border-amber-600 bg-done text-amber-800 dark:text-[#f8d878]',
  bad: 'border-red-600 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950 dark:text-red-300',
  idle: 'border-well-line text-slate-500 dark:text-slate-400',
} as const;

/** Étiquette d'état d'un bâtiment (arrosé, prêt, libre…), à la couleur de `tone`. */
export function StateTag({
  tone,
  children,
}: {
  tone: keyof typeof STATE_TAGS;
  children: ReactNode;
}) {
  return (
    <span
      className={`pixel-label inline-block shrink-0 rounded border-2 px-1.5 text-[8px] whitespace-nowrap ${STATE_TAGS[tone]}`}
    >
      {children}
    </span>
  );
}
