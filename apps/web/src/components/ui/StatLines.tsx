import type { ReactNode } from 'react';
import { STAT_NAMES } from '@poke/data';
import type { StatName, Stats } from '@poke/data';
import { MAX_IV } from '@poke/game-core';
import { STAT_LABELS } from '../../lib/labels';
import { HoverBubble } from './HoverBubble';

/**
 * Statistiques d'un Pokémon, en lignes ou en bulle au survol.
 */

/** Lignes « statistique — valeur » d'une bulle, avec un total. */
export function StatLines({
  values,
  highlight,
  total,
}: {
  values: Stats;
  /** Valeurs mises en avant (IV parfaits…). */
  highlight?: (stat: StatName) => boolean;
  total: ReactNode;
}) {
  return (
    <>
      {STAT_NAMES.map((s) => (
        <span key={s} className="flex justify-between gap-2">
          <span className="text-slate-500">{STAT_LABELS[s]}</span>
          <span className={highlight?.(s) ? 'font-bold text-amber-600' : ''}>{values[s]}</span>
        </span>
      ))}
      <span className="mt-1 flex justify-between gap-2 border-t border-slate-200 pt-1 font-medium dark:border-slate-700">
        <span>Total</span>
        <span>{total}</span>
      </span>
    </>
  );
}

/** IV d'un Pokémon dans une bulle, au survol de son contenu. */
export function IvHover({
  ivs,
  children,
  className,
  focusable,
}: {
  ivs: Stats | undefined;
  children: ReactNode;
  /** Classe de l'enveloppe (par défaut `inline-block`). */
  className?: string;
  /** Faux autour d'un bouton, qui prend déjà le focus. */
  focusable?: boolean;
}) {
  if (!ivs) return children;
  const total = STAT_NAMES.reduce((sum, s) => sum + ivs[s], 0);
  return (
    <HoverBubble
      height={140}
      className={className}
      focusable={focusable}
      content={
        <StatLines
          values={ivs}
          highlight={(s) => ivs[s] === MAX_IV}
          total={`${total} / ${MAX_IV * 6}`}
        />
      }
    >
      {children}
    </HoverBubble>
  );
}
