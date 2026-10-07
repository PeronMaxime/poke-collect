import { useMemo, useState } from 'react';
import { collectionState, milestoneState, regionDexProgress } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { PlayerProfileDto } from '@poke/shared';
import { PokemonSprite, ProgressBar, TypeBadge } from '../../components/ui';
import { useClaimedRewards, usePokedex } from '../../lib/game';
import { CollectionsView, MilestonesView } from './ProgressionViews';

type Filter = 'all' | 'caught' | 'missing';

const VIEWS = [
  { id: 'dex', label: 'Pokédex' },
  { id: 'milestones', label: 'Paliers' },
  { id: 'collections', label: 'Collections' },
] as const;
type View = (typeof VIEWS)[number]['id'];

/** Pokédex, paliers de récompenses et collections thématiques. */
export function PokedexPage({ ctx, profile }: { ctx: GameContext; profile: PlayerProfileDto }) {
  const pokedex = usePokedex();
  const claimed = useClaimedRewards();
  const [view, setView] = useState<View>('dex');
  const progress = useMemo(
    () => ({
      caughtSpeciesIds: new Set(pokedex.data?.filter((e) => e.caught).map((e) => e.speciesId)),
    }),
    [pokedex.data],
  );
  const claimable = {
    dex: 0,
    milestones: ctx.content.dexMilestones.filter(
      (m) => milestoneState(ctx, m, progress, claimed) === 'claimable',
    ).length,
    collections: ctx.content.collections.filter(
      (c) => collectionState(c, progress, claimed) === 'claimable',
    ).length,
  };

  return (
    <div className="space-y-4">
      <nav className="flex gap-1">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={view === v.id ? 'btn-primary py-1.5' : 'btn-ghost py-1.5'}
          >
            {v.label}
            {claimable[v.id] > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-400 px-1.5 text-xs text-amber-950">
                {claimable[v.id]}
              </span>
            )}
          </button>
        ))}
      </nav>
      {view === 'dex' && <DexView ctx={ctx} profile={profile} />}
      {view === 'milestones' && <MilestonesView ctx={ctx} progress={progress} />}
      {view === 'collections' && <CollectionsView ctx={ctx} progress={progress} />}
    </div>
  );
}

function DexView({ ctx, profile }: { ctx: GameContext; profile: PlayerProfileDto }) {
  const pokedex = usePokedex();
  const [regionId, setRegionId] = useState(profile.regionUnlocked);
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<number | null>(null);
  const entries = new Map(pokedex.data?.map((e) => [e.speciesId, e]));
  const region = ctx.region(regionId) ?? ctx.regions[0];
  if (!region) return <p className="text-slate-500">Aucune région configurée.</p>;

  const progress = regionDexProgress(ctx, region.id, {
    caughtSpeciesIds: new Set(pokedex.data?.filter((e) => e.caught).map((e) => e.speciesId)),
  });
  const seenCount = region.speciesIds.filter((id) => entries.get(id)?.seen).length;
  const ids = region.speciesIds.filter((id) => {
    const caught = entries.get(id)?.caught ?? false;
    return filter === 'all' || (filter === 'caught' ? caught : !caught);
  });
  const detail = selected !== null ? ctx.species(selected) : undefined;
  const detailEntry = selected !== null ? entries.get(selected) : undefined;

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {ctx.regions.length > 1 ? (
            <select
              className="input w-auto"
              value={region.id}
              onChange={(e) => setRegionId(e.target.value)}
            >
              {ctx.regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          ) : (
            <h2 className="text-lg font-semibold">Pokédex de {region.name}</h2>
          )}
          <p className="text-sm text-slate-500">
            Vus : {seenCount} · Capturés : {progress.caught} / {progress.total} (
            {progress.percent.toFixed(1)} %)
          </p>
        </div>
        <ProgressBar className="mt-3" value={progress.percent / 100} />
      </div>

      <div className="flex gap-2">
        {(
          [
            ['all', 'Tous'],
            ['caught', 'Capturés'],
            ['missing', 'Manquants'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            className={filter === value ? 'btn-primary' : 'btn-ghost'}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
        {ids.map((id) => {
          const entry = entries.get(id);
          const species = ctx.species(id);
          return (
            <button
              key={id}
              type="button"
              disabled={!entry?.seen}
              onClick={() => setSelected(id)}
              className={`relative flex flex-col items-center rounded-xl border p-1 text-[11px] ${
                entry?.caught
                  ? 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                  : 'border-dashed border-slate-300 dark:border-slate-700'
              }`}
            >
              <span className="self-start text-slate-400">{String(id).padStart(3, '0')}</span>
              <PokemonSprite
                speciesId={id}
                size={56}
                silhouette={!entry?.seen}
                className={entry?.seen && !entry.caught ? 'opacity-50 grayscale' : ''}
              />
              <span className="truncate">{entry?.seen ? species?.nameFr : '???'}</span>
              {entry?.caught && (
                <span
                  className="absolute top-1 right-1 h-2 w-2 rounded-full bg-brand-500"
                  title="Capturé"
                />
              )}
            </button>
          );
        })}
      </div>

      {detail && (
        <div className="card fixed inset-x-4 bottom-4 z-20 mx-auto flex max-w-md items-center gap-4 p-4 shadow-xl">
          <PokemonSprite speciesId={detail.id} kind="artwork" size={96} />
          <div className="flex-1 text-sm">
            <p className="font-semibold">
              N° {String(detail.id).padStart(3, '0')} — {detail.nameFr}
            </p>
            <div className="mt-1 flex gap-1">
              {detail.types.map((t) => (
                <TypeBadge key={t} type={t} />
              ))}
            </div>
            <p className="mt-1 text-slate-500">
              {detailEntry?.caught
                ? `Capturé le ${new Date(detailEntry.firstCaughtAt!).toLocaleDateString('fr-FR')}`
                : 'Vu, pas encore capturé'}
            </p>
          </div>
          <button
            className="text-slate-400 hover:text-slate-600"
            onClick={() => setSelected(null)}
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
