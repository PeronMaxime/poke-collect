/**
 * Petites pièces d'affichage du formulaire de départ en expédition.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { IV_BALL_CATEGORIES } from '@poke/game-core';
import type { BallCategory, GameContext, IvBallCategory } from '@poke/game-core';
import { HoverBubble } from '../../../components/ui';
import { itemName } from '../../../lib/labels';
import { SECTION_TITLE } from '../../common/dialogParts';
import { formatChance } from './preview';

/** Petite Poké Ball dessinée ; `dim` la grise (Pokémon pas encore capturé). */
export function BallIcon({
  label,
  dim = false,
  className = 'h-3 w-3',
}: {
  label?: string;
  dim?: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`shrink-0 ${className} ${dim ? 'opacity-40 grayscale' : ''}`}
      {...(label ? { 'aria-label': label, role: 'img' } : { 'aria-hidden': true })}
    >
      <path d="M1 8a7 7 0 0 1 14 0z" fill="#ef4444" />
      <path d="M1 8a7 7 0 0 0 14 0z" fill="#fff" />
      <circle cx="8" cy="8" r="7" fill="none" stroke="#1e293b" strokeWidth="1.5" />
      <path d="M1 8h14" stroke="#1e293b" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="2.2" fill="#fff" stroke="#1e293b" strokeWidth="1.5" />
    </svg>
  );
}

/** Quantité possédée, en pastille au coin d'une icône d'objet. */
export const COUNT_BADGE =
  'absolute -right-1.5 -bottom-1 rounded border-2 border-ink bg-win px-0.5 font-mono text-[10px] leading-3 text-slate-900 dark:text-slate-100';

/** Catégories de Pokémon rencontrés, chacune avec sa Ball. */
export const BALL_ROWS: Record<BallCategory, { label: string; hint: string; short: string }> = {
  new: { label: 'Nouveau Pokémon', hint: 'Absent de ton Pokédex', short: 'Nouv.' },
  shiny: { label: 'Shiny', hint: 'Chromatique, nouveau ou non', short: '✦' },
  caught: { label: 'Déjà capturé', hint: 'Déjà dans ton Pokédex', short: 'Déjà' },
  ...(Object.fromEntries(
    IV_BALL_CATEGORIES.map((c, i) => [
      c,
      {
        label: `Déjà capturé · ${i + 1} IV`,
        hint: `${i + 1} IV parfait${i > 0 ? 's' : ''} (à 31)`,
        short: `${i + 1} IV`,
      },
    ]),
  ) as Record<IvBallCategory, { label: string; hint: string; short: string }>),
};

/** Colonnes d'une ligne de l'aperçu : Pokémon (ou objet), part, capture (ou quantité). */
export const PREVIEW_ROW = 'grid grid-cols-[minmax(0,1fr)_5rem_3.25rem] items-center gap-x-2';

/** Chiffre de l'en-tête (arrêt, retour, rythme, taux chromatique). */
export function Stat({
  label,
  value,
  sub,
  title,
  accent = false,
  tone,
}: {
  label: string;
  value: string;
  /** Précision sous la valeur (ex. l'allongement de l'intervalle). */
  sub?: string | null;
  title?: string;
  accent?: boolean;
  /** Valeur modifiée par l'équipe (talents) : en vert si meilleure, en rouge si moins bonne. */
  tone?: 'better' | 'worse';
}) {
  return (
    <div
      title={title}
      className={`flex min-w-0 flex-col gap-0.5 rounded-md border-2 bg-slate-50 px-2 py-1 sm:px-2.5 sm:py-1.5 dark:bg-hud-pill ${
        accent ? 'border-amber-500 dark:border-[#a07a20]' : 'border-well-line'
      }`}
    >
      <dt
        className={`font-pixel text-[8px] leading-normal uppercase ${
          accent ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400'
        }`}
      >
        {label}
      </dt>
      <dd
        className={`truncate text-sm font-semibold ${
          tone === 'better'
            ? 'text-emerald-700 dark:text-emerald-400'
            : tone === 'worse'
              ? 'text-red-700 dark:text-red-400'
              : ''
        }`}
      >
        {value}
      </dd>
      {sub && (
        <dd className="truncate text-[11px] leading-tight text-slate-500 dark:text-slate-400">
          {sub}
        </dd>
      )}
    </div>
  );
}

/** Part d'une rencontre ou chance d'un objet : pourcentage et barre (relative au plus fréquent). */
export function ShareBar({ value, max }: { value: number; max: number }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-xs font-medium tabular-nums">{formatChance(value)}</span>
      <span className="block h-1.5 overflow-hidden rounded-sm border border-ink bg-well">
        <span className="block h-full bg-[#48a8e8]" style={{ width: `${(value / max) * 100}%` }} />
      </span>
    </span>
  );
}

export function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 10 6"
      aria-hidden
      className={`h-1.5 w-2.5 shrink-0 text-slate-500 transition-transform dark:text-slate-400 ${open ? 'rotate-180' : ''}`}
    >
      <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/** Explication d'une section, dans une bulle au survol (ou au toucher). */
function HelpBubble({ text }: { text: string }) {
  return (
    <HoverBubble width={260} height={130} className="inline-flex shrink-0" content={text}>
      <span className="grid size-5 cursor-help place-items-center rounded border-2 border-well-line font-pixel text-[8px] text-slate-500 dark:text-slate-400">
        <span aria-hidden>?</span>
        <span className="sr-only">{text}</span>
      </span>
    </HoverBubble>
  );
}

/**
 * Section des réglages : toujours dépliée sur ordinateur ; sur un écran étroit, repliée en une
 * ligne qui résume le choix (les réglages sont retenus par zone, il suffit de les vérifier).
 */
export function Section({
  title,
  note,
  help,
  summary,
  children,
}: {
  title: string;
  note?: string;
  help?: string;
  summary: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="tile">
      <div className="flex min-h-11 items-center gap-2 px-3 py-2">
        <h3 className={SECTION_TITLE}>{title}</h3>
        {note && <span className="text-xs text-slate-500 dark:text-slate-400">{note}</span>}
        {help && <HelpBubble text={help} />}
        <button
          type="button"
          className="flex min-h-9 min-w-0 flex-1 items-center justify-end gap-2 lg:hidden"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <span className="sr-only">
            {open ? 'Replier' : 'Déplier'} : {title}
          </span>
          {!open && (
            <span className="flex min-w-0 items-center justify-end gap-1.5 text-xs text-slate-600 dark:text-slate-300">
              {summary}
            </span>
          )}
          <Chevron open={open} />
        </button>
      </div>
      <div className={`px-3 pb-3 ${open ? '' : 'hidden'} lg:block`}>{children}</div>
    </section>
  );
}

/** Nom et description d'un objet au survol. */
export function ItemBubble({
  ctx,
  itemId,
  children,
}: {
  ctx: GameContext;
  itemId: string;
  children: ReactNode;
}) {
  return (
    <HoverBubble
      width={220}
      height={70}
      focusable={false}
      className="block"
      content={
        <span className="block space-y-0.5">
          <span className="block font-medium">{itemName(ctx, itemId)}</span>
          {ctx.item(itemId)?.description && (
            <span className="block">{ctx.item(itemId)!.description}</span>
          )}
        </span>
      }
    >
      {children}
    </HoverBubble>
  );
}
