/**
 * Onglet « Pokédex » : Pokédex par région (normal ou chromatique), collections et complétion des
 * expéditions ; aussi le Pokédex d'un autre dresseur, en lecture seule.
 */
import { useState } from 'react';
import { DEX_FORM_SECTIONS, speciesForms } from '@poke/data';
import {
  claimableCompletionCount,
  collectionState,
  dexProgress,
  isRegionUnlocked,
} from '@poke/game-core';
import type { DexCatches, GameContext, PlayerProgress } from '@poke/game-core';
import type { PokedexEntryDto, PokedexFormEntryDto } from '@poke/shared';
import { PokemonSprite, ProgressBar, ShinyStar, ViewTabs } from '../../components/ui';
import {
  useClaimedRewards,
  useDexCatches,
  usePokedex,
  usePokedexForms,
  usePlayerProgress,
} from '../../lib/queries';
import { DexSheet, dexSlotState } from './DexSheet';
import type { DexSlot, SlotState } from './DexSheet';
import { CollectionsView, CompletionsView, useVisibleCollections } from './ProgressionViews';
import { RegionTabs, currentRegionTab, useSavedRegionTab } from '../common/RegionTabs';

type Filter = 'all' | 'caught' | 'missing';

const VIEWS = [
  { id: 'dex', label: 'Pokédex' },
  { id: 'collections', label: 'Collections' },
  { id: 'completions', label: 'Expéditions' },
] as const;
type View = (typeof VIEWS)[number]['id'];

/** Pokédex, collections thématiques et complétion des expéditions. */
export function PokedexPage({ ctx }: { ctx: GameContext }) {
  const claimed = useClaimedRewards();
  const [view, setView] = useState<View>('dex');
  const progress = useDexCatches();
  const collections = useVisibleCollections(ctx);
  const claimable = {
    dex: 0,
    collections: collections.filter((c) => collectionState(c, progress, claimed) === 'claimable')
      .length,
    completions: claimableCompletionCount(ctx, progress, claimed),
  };

  return (
    <div className="space-y-4">
      <ViewTabs
        tabs={VIEWS.map((v) => ({
          ...v,
          badge: claimable[v.id] > 0 ? claimable[v.id] : undefined,
          alert: true,
        }))}
        selected={view}
        onSelect={setView}
      />
      {view === 'dex' && <DexView ctx={ctx} />}
      {view === 'collections' && <CollectionsView ctx={ctx} progress={progress} />}
      {view === 'completions' && <CompletionsView ctx={ctx} progress={progress} />}
    </div>
  );
}

/** Pokédex d'un autre dresseur, affiché en lecture seule. */
export interface ForeignDex {
  entries: PokedexEntryDto[];
  forms: PokedexFormEntryDto[];
  /** Son avancement (régions débloquées). */
  progress: PlayerProgress;
}

/**
 * Pokédex normal, ou Pokédex shiny (espèces capturées en version shiny) ; celui d'un autre
 * dresseur avec `foreign`.
 */
export function DexView({ ctx, foreign }: { ctx: GameContext; foreign?: ForeignDex }) {
  const pokedex = usePokedex();
  const ownCatches = useDexCatches();
  const [savedRegion, setRegionId] = useSavedRegionTab(foreign ? 'pokedex-other' : 'pokedex');
  const [filter, setFilter] = useState<Filter>('all');
  const [shiny, setShiny] = useState(false);
  const [selected, setSelected] = useState<DexSlot | null>(null);
  const formsDex = usePokedexForms();
  const entryList = foreign?.entries ?? pokedex.data;
  const entries = new Map(entryList?.map((e) => [e.speciesId, e]));
  const formEntries = new Map((foreign?.forms ?? formsDex.data)?.map((e) => [e.formId, e]));
  const catches: Required<DexCatches> = foreign
    ? {
        caughtSpeciesIds: new Set(entryList?.filter((e) => e.caught).map((e) => e.speciesId)),
        caughtShinySpeciesIds: new Set(
          entryList?.filter((e) => e.caughtShiny).map((e) => e.speciesId),
        ),
        caughtFormIds: new Set(foreign.forms.map((f) => f.formId)),
        caughtShinyFormIds: new Set(
          foreign.forms.filter((f) => f.caughtShiny).map((f) => f.formId),
        ),
      }
    : ownCatches;
  const ownProgress = usePlayerProgress();
  const playerProgress = foreign?.progress ?? ownProgress;
  // Pokédex d'un autre dresseur : ses régions débloquées, et toute région où il a déjà vu une
  // espèce (Pokémon reçus avant d'avoir débloqué la région, par exemple).
  const foreignRegions = foreign
    ? ctx.regions.filter(
        (r) =>
          isRegionUnlocked(ctx, r, foreign.progress) ||
          r.speciesIds.some((id) => entries.get(id)?.seen),
      )
    : undefined;
  const region = ctx.region(
    foreignRegions
      ? ((foreignRegions.find((r) => r.id === savedRegion) ?? foreignRegions.at(-1))?.id ?? '')
      : currentRegionTab(ctx, playerProgress, savedRegion),
  );
  if (!region) return <p className="text-slate-500">Aucune région configurée.</p>;

  const progress = dexProgress(ctx, region.id, catches, shiny);
  const seenCount = region.speciesIds.filter((id) => entries.get(id)?.seen).length;
  /** État d'une case, dans le Pokédex normal ou chromatique (`shinyMode`). */
  const slotStateIn = (slot: DexSlot, shinyMode: boolean): SlotState =>
    dexSlotState(entries, formEntries, slot, shinyMode);
  const slotState = (slot: DexSlot) => slotStateIn(slot, shiny);
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
  // Pourcentage du Pokédex régional : espèces seules, comme pour le déblocage des régions. Les
  // formes de ses sections (régionales, Méga…) sont comptées à part.
  const formsCaught = formSections.reduce((n, s) => n + s.caught, 0);
  const formsTotal = formSections.reduce((n, s) => n + s.total, 0);
  // Cases voisines de la fiche ouverte : celles de la grille affichée, dans l'ordre, sans les
  // silhouettes (fermées).
  const visibleSlots = [...slots.filter(keep), ...formSections.flatMap((s) => s.slots)].filter(
    (slot) => slotState(slot).seen,
  );
  const selectedIndex = selected
    ? visibleSlots.findIndex(
        (s) => s.speciesId === selected.speciesId && s.formId === selected.formId,
      )
    : -1;

  const grid = (list: DexSlot[]) => (
    // Cases de largeur bornée, comme au PC : le nombre de colonnes suit la largeur de l'écran
    // au lieu d'étirer les cartes sur un grand écran ou de les écraser sur un petit.
    <div className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2 sm:grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))]">
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
      <RegionTabs
        ctx={ctx}
        progress={playerProgress}
        selected={region.id}
        onSelect={setRegionId}
        regions={foreignRegions}
      />
      <DexProgressCard
        region={region}
        shiny={shiny}
        seenCount={seenCount}
        progress={progress}
        formsCaught={formsCaught}
        formsTotal={formsTotal}
      />

      {/* Mobile : deux rangées séparées par un trait horizontal ; bureau : une rangée, trait vertical. */}
      <DexFilters shiny={shiny} setShiny={setShiny} filter={filter} setFilter={setFilter} />

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

      {selected && (
        <DexSheet
          ctx={ctx}
          slot={selected}
          stateOf={(slot) => slotStateIn(slot, false)}
          initialShiny={shiny}
          foreign={!!foreign}
          progress={playerProgress}
          prev={selectedIndex > 0 ? visibleSlots[selectedIndex - 1] : undefined}
          next={selectedIndex >= 0 ? visibleSlots[selectedIndex + 1] : undefined}
          onSelect={setSelected}
          onClose={() => setSelected(null)}
        />
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
      <span className="line-clamp-2 w-full text-center leading-tight break-words">
        {seen ? species?.nameFr : '???'}
      </span>
      {caught && shiny && <ShinyStar className="absolute top-0.5 right-1 text-xs" />}
    </button>
  );
}

/** Avancement du Pokédex de la région : espèces vues et capturées, puis formes à part. */
function DexProgressCard({
  region,
  shiny,
  seenCount,
  progress,
  formsCaught,
  formsTotal,
}: {
  region: NonNullable<ReturnType<GameContext['region']>>;
  shiny: boolean;
  seenCount: number;
  progress: ReturnType<typeof dexProgress>;
  formsCaught: number;
  formsTotal: number;
}) {
  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Pokédex de {region.name}</h2>
        <p className="text-sm text-slate-500">
          {shiny ? 'Chromatiques' : `Vus : ${seenCount} · Capturés`} :{' '}
          {`${progress.caught} / ${progress.total} (${progress.percent.toFixed(1)} %)`}
        </p>
      </div>
      <ProgressBar className="mt-3" value={progress.percent / 100} />
      {formsTotal > 0 && (
        <>
          <p className="mt-3 text-xs text-slate-500">
            Formes alternatives (hors pourcentage) : {formsCaught} / {formsTotal} (
            {((formsCaught / formsTotal) * 100).toFixed(1)} %)
          </p>
          <ProgressBar
            className="mt-1"
            value={formsCaught / formsTotal}
            barClassName="bg-[#48a8e8]"
          />
        </>
      )}
    </div>
  );
}

/** Pokédex normal ou chromatique, puis tous, capturés ou manquants. */
function DexFilters({
  shiny,
  setShiny,
  filter,
  setFilter,
}: {
  shiny: boolean;
  setShiny: (shiny: boolean) => void;
  filter: Filter;
  setFilter: (filter: Filter) => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <div className="flex gap-2">
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
          <ShinyStar className={shiny ? 'text-white' : ''} /> Chromatique
        </button>
      </div>
      <span className="h-0.5 rounded-full bg-slate-300 sm:mx-1 sm:h-auto sm:w-0.5 dark:bg-slate-500" />
      <div className="flex gap-1.5 sm:gap-2">
        {(
          [
            ['all', 'Tous'],
            ['caught', 'Capturés'],
            ['missing', 'Manquants'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            className={`${filter === value ? 'btn-primary' : 'btn-ghost'} max-sm:flex-1 max-sm:px-2 max-sm:py-2 max-sm:text-[9px]`}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
