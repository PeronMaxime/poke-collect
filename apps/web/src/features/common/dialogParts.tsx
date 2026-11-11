import { useState } from 'react';
import type { ReactNode } from 'react';
import { CollapseBody, CollapseButton, useCollapsedSection } from '../../components/Collapsible';

/** Pièces communes des grandes fenêtres de départ (expédition, choix de l'équipe). */

/** Grande fenêtre en colonne (en-tête, contenu qui défile, barre du bas), sans marge propre. */
export const LAUNCH_DIALOG_CLASS = 'flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden p-0';

/** Même fenêtre, à hauteur fixe : son contenu (une grille de Pokémon) remplit l'écran. */
export const FULL_DIALOG_CLASS =
  'flex h-[calc(100dvh-2rem)] max-h-[60rem] flex-col overflow-hidden p-0';

/** Case choisie (Ball, baie, Pokémon) : fond doré, comme la ligne choisie d'un menu. */
export const SELECTED_CELL = 'border-amber-600 bg-selected dark:border-[#f8d878]';

/** Numéro de case d'un Pokémon choisi, en pastille dorée. */
export const SLOT_BADGE =
  'grid h-5 min-w-5 place-items-center rounded border-2 border-ink bg-amber-600 px-0.5 font-pixel text-[9px] leading-none text-white dark:bg-[#f8d878] dark:text-[#10203a]';

/** Petit bouton carré (monter, descendre, retirer) d'une case de l'équipe. */
export const SLOT_BUTTON =
  'grid size-8 shrink-0 place-items-center rounded-md border-2 border-well-line text-slate-500 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-35 dark:text-slate-400 dark:hover:text-white';

/** Fond d'une case de l'équipe. */
export const SLOT_CLASS = 'rounded-md border-2 bg-slate-50 dark:bg-slate-950/50';

/** Titre d'une section dans une fenêtre. */
export const SECTION_TITLE = 'pixel-label uppercase text-title';

/**
 * Fenêtre d'un résultat (combat, éclosion, retour d'expédition), à poser dans un `Modal` aux
 * classes `LAUNCH_DIALOG_CLASS` : bandeau navy avec le titre (ou `header`), contenu qui défile,
 * barre du bas avec `footer` (« Continuer » par défaut) et `note` au-dessus des boutons.
 */
export function ResultFrame({
  title,
  header,
  onClose,
  footer,
  note,
  children,
}: {
  title?: ReactNode;
  /** Bandeau à la place du bandeau navy (bandeau de zone d'une expédition). */
  header?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      {header ?? (
        <header className="flex shrink-0 items-center gap-2 border-b-[3px] border-ink bg-hud px-3 py-2.5 text-white sm:gap-3 sm:px-4">
          <h2 className="min-w-0 flex-1 truncate font-pixel text-[10px] text-[#f8d030] uppercase sm:text-xs">
            {title}
          </h2>
          <button
            type="button"
            className="btn size-9 shrink-0 border-[#0b0f1e] bg-brand-500 p-0 text-white"
            onClick={onClose}
            aria-label="Fermer"
          >
            ✕
          </button>
        </header>
      )}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 sm:p-4">
        {children}
      </div>
      <footer className="shrink-0 space-y-2 border-t-[3px] border-ink bg-tile px-3 py-2.5 sm:px-4">
        {note && <div className="text-right text-sm">{note}</div>}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {footer ?? (
            <button className="btn-primary px-6 py-3" onClick={onClose}>
              Continuer
            </button>
          )}
        </div>
      </footer>
    </>
  );
}

/** Étiquette posée au-dessus d'une case de résultat (Nouveau !, Fuyard !, Spécial !). */
export function CornerTag({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span
      className={`pixel-label absolute -top-2.5 left-1/2 z-10 -translate-x-1/2 rounded border-2 border-ink px-1.5 text-[8px] whitespace-nowrap text-white ${className}`}
    >
      {children}
    </span>
  );
}

/** Jauge de PE : pleine à un tiers au-dessus du minimum, qu'un trait repère. */
export function PowerGauge({
  power,
  minPower,
  className = '',
}: {
  power: number;
  minPower: number;
  className?: string;
}) {
  const scale = Math.max(power, (minPower * 4) / 3, 1);
  return (
    <span
      aria-hidden
      className={`relative block h-3 rounded-sm border-2 border-ink bg-well ${className}`}
    >
      <span
        className={`block h-full ${power >= minPower ? 'bg-emerald-500' : 'bg-red-500'}`}
        style={{ width: `${(power / scale) * 100}%` }}
      />
      {minPower > 0 && (
        <span
          className="absolute -inset-y-1.5 w-[3px] bg-ink dark:bg-slate-200"
          style={{ left: `${(minPower / scale) * 100}%` }}
        />
      )}
    </span>
  );
}

/** Ton d'un état : bon, mauvais, ou rien à signaler. */
export type StatusTone = 'ok' | 'bad' | 'idle';

/** État d'une équipe dans la barre du bas : prête, règle non respectée, ou rien de choisi. */
export function StatusPill({ tone, text }: { tone: StatusTone; text: string }) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-md border-2 px-2.5 py-1 text-sm font-semibold ${
        tone === 'ok'
          ? 'border-emerald-600 bg-emerald-50 text-emerald-700 dark:border-emerald-400 dark:bg-emerald-950/50 dark:text-emerald-300'
          : tone === 'bad'
            ? 'border-red-600 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950/50 dark:text-red-300'
            : 'border-well-line text-slate-600 dark:text-slate-300'
      }`}
    >
      {tone === 'ok' && (
        <svg viewBox="0 0 14 12" className="h-3 w-3.5 shrink-0" aria-hidden>
          <path d="M1 6l4 4 8-9" fill="none" stroke="currentColor" strokeWidth="2.5" />
        </svg>
      )}
      {tone === 'bad' && (
        <svg viewBox="0 0 12 12" className="size-3 shrink-0" aria-hidden>
          <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="2.5" />
        </svg>
      )}
      <span className="truncate">{text}</span>
    </span>
  );
}

/** Croix de fermeture d'une fenêtre ou de retrait d'un Pokémon. */
export function CrossIcon({ className = 'size-3' }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={className} aria-hidden>
      <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}

/**
 * Ligne coupée par « … » (effet d'un talent) : en entier au survol, ou d'un appui (téléphone,
 * sans survol), qui la déplie sur plusieurs lignes.
 */
export function ExpandableLine({
  className = '',
  title,
  children,
}: {
  className?: string;
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      title={title}
      aria-expanded={open}
      onClick={() => setOpen(!open)}
      className={`min-w-0 cursor-help text-left ${open ? 'whitespace-normal' : 'truncate'} ${className}`}
    >
      {children}
    </button>
  );
}

/** Bloc d'une fiche (Pokédex, PC) : simple cadre, titre en police pixel, `aside` à droite. */
export function SheetSection({
  title,
  aside,
  children,
}: {
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className={SECTION_TITLE}>{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Petite case d'information d'une fiche (taille, bonheur…), avec une seconde ligne facultative. */
export function InfoCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card min-w-0 px-2.5 py-1.5">
      <dt className="pixel-label text-[8px] text-slate-500 uppercase">{label}</dt>
      <dd className="truncate font-semibold" title={value}>
        {value}
      </dd>
      {sub && <dd className="truncate text-xs text-slate-500">{sub}</dd>}
    </div>
  );
}

/**
 * Bloc d'une fiche repliable en accordéon, comme les widgets : chevron à droite, ouvert par
 * défaut, état gardé dans le navigateur sous `id`.
 */
export function CollapsibleSheetSection({
  id,
  title,
  aside,
  children,
}: {
  id: string;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const [collapsed, toggle] = useCollapsedSection(id);
  return (
    <section className="card p-3">
      <div className="flex items-center gap-2">
        <h3
          className={`${SECTION_TITLE} min-w-0 flex-1 cursor-pointer select-none`}
          onClick={toggle}
        >
          {title}
        </h3>
        {aside}
        <CollapseButton collapsed={collapsed} onToggle={toggle} label={`la rubrique ${title}`} />
      </div>
      <CollapseBody open={!collapsed} className="mt-2">
        {children}
      </CollapseBody>
    </section>
  );
}
