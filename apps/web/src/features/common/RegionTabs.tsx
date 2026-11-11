import { useState } from 'react';
import type { Region } from '@poke/content';
import { isRegionUnlocked } from '@poke/game-core';
import type { GameContext, PlayerProgress } from '@poke/game-core';
import { ScrollRow } from '../../components/ui';
import { unlockConditionText } from '../../lib/labels';
import { readStoredText, writeStoredText } from '../../lib/storage';

/** Régions débloquées, puis la suivante (verrouillée) : les autres restent cachées. */
export function visibleRegions(ctx: GameContext, progress: PlayerProgress) {
  const unlocked = ctx.regions.filter((r) => isRegionUnlocked(ctx, r, progress));
  const next = ctx.regions.find((r) => !unlocked.includes(r));
  return { unlocked, next };
}

/** Onglet extra (ex. quêtes sans région, « Tous »), affiché avant ou après les régions. */
export interface ExtraTab {
  id: string;
  label: string;
}

/**
 * Onglets par région : régions débloquées et la suivante, grisée, avec sa condition au survol.
 * `marker` signale un onglet à consulter (starter à choisir, récompense à réclamer…).
 * `leading` s'affiche avant les régions, `extra` après. `regions` remplace les régions débloquées
 * (sans onglet verrouillé), ex. le Pokédex d'un autre dresseur.
 */
export function RegionTabs({
  ctx,
  progress,
  selected,
  onSelect,
  marker,
  extra = [],
  leading = [],
  regions,
}: {
  ctx: GameContext;
  progress: PlayerProgress;
  selected: string;
  onSelect: (id: string) => void;
  marker?: (regionId: string) => string | null;
  extra?: ExtraTab[];
  leading?: ExtraTab[];
  regions?: Region[];
}) {
  const visible = visibleRegions(ctx, progress);
  const unlocked = regions ?? visible.unlocked;
  const next = regions ? undefined : visible.next;
  const tabs: ExtraTab[] = [
    ...leading,
    ...unlocked.map((r) => ({ id: r.id, label: r.name })),
    ...extra,
  ];
  return (
    <ScrollRow role="tablist" selectedKey={selected} className="gap-1">
      {tabs.map((t) => {
        const mark = marker?.(t.id);
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={t.id === selected}
            onClick={() => onSelect(t.id)}
            className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap pixel-label rounded-md border-2 border-ink px-3 py-2 shadow-[inset_0_-3px_0_rgb(0_0_0/0.18)] transition ${
              t.id === selected
                ? 'bg-brand-500 text-white'
                : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600'
            }`}
          >
            {t.label}
            {mark && (
              <span
                className="h-2.5 w-2.5 rounded-full bg-[#f8d030] ring-2 ring-ink"
                title={mark}
              />
            )}
          </button>
        );
      })}
      {next && <LockedRegionTab ctx={ctx} region={next} />}
    </ScrollRow>
  );
}

function LockedRegionTab({ ctx, region }: { ctx: GameContext; region: Region }) {
  const condition = unlockConditionText(ctx, region.unlock) ?? 'Région verrouillée';
  return (
    <span
      role="tab"
      aria-disabled
      title={`Pour débloquer ${region.name} : ${condition}`}
      className="flex shrink-0 cursor-help items-center whitespace-nowrap gap-1.5 pixel-label rounded-md border-2 border-dashed border-slate-400 px-3 py-2 text-slate-500 dark:border-slate-600 dark:text-slate-400"
    >
      🔒 {region.name}
    </span>
  );
}

/** Onglet effectivement affiché : le choix du joueur s'il est encore visible, sinon la dernière région débloquée. */
export function currentRegionTab(
  ctx: GameContext,
  progress: PlayerProgress,
  selected: string | null,
  extra: ExtraTab[] = [],
): string {
  const { unlocked } = visibleRegions(ctx, progress);
  const ids = [...unlocked.map((r) => r.id), ...extra.map((t) => t.id)];
  if (selected && ids.includes(selected)) return selected;
  return unlocked.at(-1)?.id ?? ids[0] ?? '';
}

/** Onglet choisi par le joueur, conservé d'une visite à l'autre (une clé par section). */
export function useSavedRegionTab(section: string) {
  const key = `region-tab:${section}`;
  const [selected, setSelected] = useState<string | null>(() => readStoredText(key));
  const select = (id: string) => {
    setSelected(id);
    writeStoredText(key, id);
  };
  return [selected, select] as const;
}
