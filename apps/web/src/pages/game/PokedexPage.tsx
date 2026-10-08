import { useState } from 'react';
import { DEX_FORM_SECTIONS, speciesForms } from '@poke/data';
import { collectionState, dexProgress, milestoneState } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { PlayerProfileDto } from '@poke/shared';
import { PokemonSprite, ProgressBar, ShinyStar, TypeBadge } from '../../components/ui';
import {
  useClaimedRewards,
  useDexCatches,
  usePokedex,
  usePokedexForms,
  useShinyCharm,
} from '../../lib/game';
import { formatShinyRate } from '../../lib/labels';
import { CollectionsView, MilestonesView } from './ProgressionViews';

type Filter = 'all' | 'caught' | 'missing';

/** Case du Pokédex : une espèce (formId null) ou l'une de ses formes. */
interface DexSlot {
  speciesId: number;
  formId: number | null;
}

/** État d'une case : inconnue (silhouette), vue ou capturée. */
interface SlotState {
  seen: boolean;
  caught: boolean;
  /** Date de première capture (ISO). */
  caughtAt: string | null;
  caughtShiny: boolean;
}

const VIEWS = [
  { id: 'dex', label: 'Pokédex' },
  { id: 'milestones', label: 'Paliers' },
  { id: 'collections', label: 'Collections' },
] as const;
type View = (typeof VIEWS)[number]['id'];

/** Pokédex, paliers de récompenses et collections thématiques. */
export function PokedexPage({ ctx, profile }: { ctx: GameContext; profile: PlayerProfileDto }) {
  const claimed = useClaimedRewards();
  const [view, setView] = useState<View>('dex');
  const progress = useDexCatches();
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

/** Pokédex normal, ou Pokédex shiny (espèces capturées en version shiny). */
function DexView({ ctx, profile }: { ctx: GameContext; profile: PlayerProfileDto }) {
  const pokedex = usePokedex();
  const catches = useDexCatches();
  const charm = useShinyCharm(ctx);
  const [regionId, setRegionId] = useState(profile.regionUnlocked);
  const [filter, setFilter] = useState<Filter>('all');
  const [shiny, setShiny] = useState(false);
  const [selected, setSelected] = useState<DexSlot | null>(null);
  const formsDex = usePokedexForms();
  const entries = new Map(pokedex.data?.map((e) => [e.speciesId, e]));
  const formEntries = new Map(formsDex.data?.map((e) => [e.formId, e]));
  const region = ctx.region(regionId) ?? ctx.regions[0];
  if (!region) return <p className="text-slate-500">Aucune région configurée.</p>;

  const progress = dexProgress(ctx, region.id, catches, shiny);
  const seenCount = region.speciesIds.filter((id) => entries.get(id)?.seen).length;
  const slotState = ({ speciesId, formId }: DexSlot): SlotState => {
    const entry = entries.get(speciesId);
    if (formId === null) {
      return {
        seen: entry?.seen ?? false,
        caught: (shiny ? entry?.caughtShiny : entry?.caught) ?? false,
        caughtAt: entry?.firstCaughtAt ?? null,
        caughtShiny: entry?.caughtShiny ?? false,
      };
    }
    // Une forme est connue dès que son espèce a été vue.
    const formEntry = formEntries.get(formId);
    return {
      seen: !!formEntry || (entry?.seen ?? false),
      caught: shiny ? !!formEntry?.caughtShiny : !!formEntry,
      caughtAt: formEntry?.firstCaughtAt ?? null,
      caughtShiny: formEntry?.caughtShiny ?? false,
    };
  };
  const keep = (slot: DexSlot) => {
    const { caught } = slotState(slot);
    return filter === 'all' || (filter === 'caught' ? caught : !caught);
  };
  const slots = region.speciesIds.map((speciesId) => ({ speciesId, formId: null }));
  const regionForms = region.speciesIds.flatMap((id) => speciesForms(id));
  const formSections = DEX_FORM_SECTIONS.map((section) => {
    const all = regionForms
      .filter((f) => f.kind === section.kind)
      .map((f) => ({ speciesId: f.speciesId, formId: f.id }));
    return {
      ...section,
      total: all.length,
      caught: all.filter((slot) => slotState(slot).caught).length,
      slots: all.filter(keep),
    };
  }).filter((section) => section.total > 0);
  const detail = selected ? ctx.species(selected.speciesId, selected.formId) : undefined;
  const detailState = selected ? slotState(selected) : undefined;

  const grid = (list: DexSlot[]) => (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
      {list.map((slot) => (
        <DexTile
          key={`${slot.speciesId}:${slot.formId}`}
          ctx={ctx}
          slot={slot}
          state={slotState(slot)}
          shiny={shiny}
          onSelect={() => setSelected(slot)}
        />
      ))}
    </div>
  );

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
            {shiny ? 'Shiny' : `Vus : ${seenCount} · Capturés`} : {progress.caught} /{' '}
            {progress.total} ({progress.percent.toFixed(1)} %)
          </p>
        </div>
        <ProgressBar className="mt-3" value={progress.percent / 100} />
        {shiny && (
          <p className="mt-2 text-xs text-slate-500">
            Taux shiny de base : {formatShinyRate(1 / ctx.balance.shiny.baseRateDenominator)}
            {charm > 1 && ` · Charme Chroma : × ${charm}`}. Relancer une zone de suite allonge la
            chaîne ; des parents de régions différentes favorisent les œufs shiny.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          className={shiny ? 'btn-ghost' : 'btn-primary'}
          onClick={() => setShiny(false)}
          aria-pressed={!shiny}
        >
          Normal
        </button>
        <button
          className={shiny ? 'btn-primary' : 'btn-ghost'}
          onClick={() => setShiny(true)}
          aria-pressed={shiny}
        >
          <ShinyStar className={shiny ? 'text-white' : ''} /> Shiny
        </button>
        <span className="mx-1 w-px bg-slate-200 dark:bg-slate-800" />
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

      {grid(slots.filter(keep))}

      {formSections.map((section) => (
        <section key={section.kind} className="space-y-2">
          <div className="flex items-baseline justify-between gap-2 border-b border-slate-200 pb-1 dark:border-slate-800">
            <h3 className="font-semibold">{section.label}</h3>
            <span className="text-sm text-slate-500">
              {section.caught} / {section.total}
            </span>
          </div>
          {section.slots.length > 0 ? (
            grid(section.slots)
          ) : (
            <p className="text-sm text-slate-500">Aucune forme à afficher.</p>
          )}
        </section>
      ))}

      {selected && detail && detailState && (
        <div className="card fixed inset-x-4 bottom-4 z-20 mx-auto flex max-w-md items-center gap-4 p-4 shadow-xl">
          <PokemonSprite
            speciesId={detail.id}
            formId={selected.formId}
            kind="artwork"
            size={96}
            shiny={shiny && detailState.caughtShiny}
          />
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
              {detailState.caughtAt
                ? `Capturé le ${new Date(detailState.caughtAt).toLocaleDateString('fr-FR')}`
                : selected.formId === null
                  ? 'Vu, pas encore capturé'
                  : 'Forme pas encore capturée'}
              {detailState.caughtShiny && ' · version shiny obtenue ★'}
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

/** Case d'une espèce ou d'une forme : silhouette tant qu'elle n'a pas été vue. */
function DexTile({
  ctx,
  slot,
  state,
  shiny,
  onSelect,
}: {
  ctx: GameContext;
  slot: DexSlot;
  state: SlotState;
  shiny: boolean;
  onSelect: () => void;
}) {
  const { seen, caught } = state;
  const species = ctx.species(slot.speciesId, slot.formId);
  return (
    <button
      type="button"
      disabled={!seen}
      onClick={onSelect}
      title={seen ? species?.nameFr : undefined}
      className={`relative flex flex-col items-center rounded-xl border p-1 text-[11px] ${
        caught
          ? shiny
            ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40'
            : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
          : 'border-dashed border-slate-300 dark:border-slate-700'
      }`}
    >
      <span className="self-start text-slate-400">{String(slot.speciesId).padStart(3, '0')}</span>
      <PokemonSprite
        speciesId={slot.speciesId}
        formId={slot.formId}
        size={56}
        shiny={shiny && caught}
        silhouette={!seen}
        className={seen && !caught ? 'opacity-50 grayscale' : ''}
      />
      <span className="w-full truncate text-center">{seen ? species?.nameFr : '???'}</span>
      {caught &&
        (shiny ? (
          <ShinyStar className="absolute top-0.5 right-1 text-xs" />
        ) : (
          <span
            className="absolute top-1 right-1 h-2 w-2 rounded-full bg-brand-500"
            title="Capturé"
          />
        ))}
    </button>
  );
}
