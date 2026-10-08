import type { Region } from '@poke/content';
import { isUnlocked } from '@poke/game-core';
import type { GameContext, PlayerProgress } from '@poke/game-core';
import { unlockConditionText } from '../../lib/labels';

/** Régions débloquées, puis la suivante (verrouillée) : les autres restent cachées. */
export function visibleRegions(ctx: GameContext, progress: PlayerProgress) {
  const unlocked = ctx.regions.filter((r) => isUnlocked(ctx, r.unlock, progress));
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
 * `leading` s'affiche avant les régions, `extra` après.
 */
export function RegionTabs({
  ctx,
  progress,
  selected,
  onSelect,
  marker,
  extra = [],
  leading = [],
}: {
  ctx: GameContext;
  progress: PlayerProgress;
  selected: string;
  onSelect: (id: string) => void;
  marker?: (regionId: string) => string | null;
  extra?: ExtraTab[];
  leading?: ExtraTab[];
}) {
  const { unlocked, next } = visibleRegions(ctx, progress);
  const tabs: ExtraTab[] = [
    ...leading,
    ...unlocked.map((r) => ({ id: r.id, label: r.name })),
    ...extra,
  ];
  return (
    <div className="flex flex-wrap gap-1" role="tablist">
      {tabs.map((t) => {
        const mark = marker?.(t.id);
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={t.id === selected}
            onClick={() => onSelect(t.id)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition ${
              t.id === selected
                ? 'bg-brand-500 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            {t.label}
            {mark && <span className="h-2 w-2 rounded-full bg-amber-400" title={mark} />}
          </button>
        );
      })}
      {next && <LockedRegionTab ctx={ctx} region={next} />}
    </div>
  );
}

function LockedRegionTab({ ctx, region }: { ctx: GameContext; region: Region }) {
  const condition = unlockConditionText(ctx, region.unlock) ?? 'Région verrouillée';
  return (
    <span
      role="tab"
      aria-disabled
      title={`Pour débloquer ${region.name} : ${condition}`}
      className="flex cursor-help items-center gap-1.5 rounded-full border border-dashed border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-400 dark:border-slate-700"
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
