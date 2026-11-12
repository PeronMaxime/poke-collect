import type { ReactNode } from 'react';
import { ScrollRow } from './ScrollRow';

/**
 * Onglets de vue à l'intérieur d'une page.
 */

export interface ViewTab<T extends string> {
  id: T;
  label: ReactNode;
  /** Compteur à droite du libellé (quantité, avancement…). */
  badge?: ReactNode;
  /** Le compteur signale une action à faire (récompense à réclamer…) : pastille jaune. */
  alert?: boolean;
}

/**
 * Onglets principaux d'une page : barre sombre pleine largeur, onglet actif en jaune. Ils se
 * distinguent ainsi des onglets de région (pastilles rouges et blanches) et des filtres.
 */
export function ViewTabs<T extends string>({
  tabs,
  selected,
  onSelect,
  className = '',
}: {
  tabs: readonly ViewTab<T>[];
  selected: T;
  onSelect: (id: T) => void;
  className?: string;
}) {
  return (
    <nav
      className={`rounded-lg border-2 border-ink bg-hud p-1 shadow-[3px_3px_0_rgb(40_48_72/0.3)] ${className}`}
    >
      <ScrollRow role="tablist" selectedKey={selected} className="gap-1">
        {tabs.map((t) => {
          const active = t.id === selected;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelect(t.id)}
              className={`flex flex-auto shrink-0 items-center justify-center gap-1.5 whitespace-nowrap pixel-label rounded-md px-3 py-2.5 transition ${
                active
                  ? 'bg-[#f8d030] text-ink shadow-[inset_0_-3px_0_rgb(0_0_0/0.2)]'
                  : 'text-slate-300 hover:bg-hud-pill hover:text-white'
              }`}
            >
              {t.label}
              {t.badge !== undefined &&
                t.badge !== null &&
                (t.alert ? (
                  <span
                    className={`rounded-full px-1.5 text-[10px] ${
                      active ? 'bg-ink text-[#f8d030]' : 'bg-[#f8d030] text-ink'
                    }`}
                  >
                    {t.badge}
                  </span>
                ) : (
                  <span
                    className={`font-mono text-[10px] ${active ? 'text-ink/70' : 'text-slate-400'}`}
                  >
                    {t.badge}
                  </span>
                ))}
            </button>
          );
        })}
      </ScrollRow>
    </nav>
  );
}
