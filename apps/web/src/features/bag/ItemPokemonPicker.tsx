import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { effectiveAbility, evolutionOptions } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { PokemonDto } from '@poke/shared';
import { IvHover, PokemonSprite, ShinyStar } from '../../components/ui';
import { PokemonTagBadges, TagFilterSelect, useTagFilter } from '../../components/tags';
import { ProgressiveItems } from '../../components/ProgressiveGrid';
import { itemIcon, speciesName } from '../../lib/labels';
import { SELECTED_CELL } from '../common/dialogParts';
import { AbilityFilterSelect, GENDER_LABELS } from '../pc/PcBrowser';
import type { PcEntry } from '../pc/PcBrowser';
import {
  NameSearch,
  TypeFilterSelect,
  filterPill,
  nameMatcher,
} from '../common/teamPicker/filters';
import { usePinnedSelection } from '../common/teamPicker/useTeamPicker';
import { TeamPickerDialog } from '../common/TeamSection';
import { BANNER_LABEL } from '../common/zoneBanner';

/**
 * Choix des Pokémon sur qui utiliser un objet du sac (Baie Grena, Super Bonbon, Rappel…), dans la
 * même fenêtre que le choix d'une équipe ou d'un Pokémon de pension : à gauche la « boîte »
 * (recherche, tri, filtres, grille), à droite le panneau propre à l'objet (`aside`), en bas
 * l'état et les boutons (`footer`).
 */

const BASE_SORTS = {
  level: 'Niveau',
  dex: 'N° du Pokédex',
  recent: 'Récents',
  tag: 'Étiquette',
} as const;
type BaseSort = keyof typeof BASE_SORTS;

/** Tri ou filtre propre à un objet (bonheur pour une Baie Grena…). */
interface ExtraSort {
  label: string;
  compare: (a: PokemonDto, b: PokemonDto) => number;
}
interface ExtraToggle {
  label: string;
  title: string;
  icon?: ReactNode;
  test: (p: PokemonDto) => boolean;
  /** Allumé à l'ouverture. */
  initial?: boolean;
}

type Sort = BaseSort | 'extra';

/** Ce que reçoit le choix d'un Pokémon pour un objet (Rappel, baie, Super Bonbon…). */
interface ItemPokemonPickerProps {
  ctx: GameContext;
  itemId: string;
  title: string;
  /** Quantité restante dans le sac. */
  left: number;
  /** Effet de l'objet, dans l'en-tête. */
  summary: ReactNode;
  /** Pokémon sur qui l'objet agirait. */
  candidates: readonly PokemonDto[];
  /** Texte de la grille sans aucun Pokémon possible. */
  emptyText: string;
  selected: readonly string[];
  onToggle: (p: PokemonDto) => void;
  extraSort?: ExtraSort;
  extraToggle?: ExtraToggle;
  /** Seconde ligne d'une case (niveau, bonheur…). */
  cellLine: (p: PokemonDto) => ReactNode;
  /** Pastille du coin haut gauche d'une case (évolution proche…). */
  cellBadge?: (p: PokemonDto) => ReactNode;
  aside: ReactNode;
  footer: ReactNode;
  onClose: () => void;
}

/** État du choix d'un Pokémon pour un objet : recherche, tri, filtres et liste affichée. */
function useItemPokemonPicker(props: ItemPokemonPickerProps) {
  const { ctx, candidates, selected, extraSort, extraToggle } = props;
  const tagFilter = useTagFilter();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>(extraSort ? 'extra' : 'level');
  const [type, setType] = useState('all');
  const [ability, setAbility] = useState('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [onlyShiny, setOnlyShiny] = useState(false);
  const [extraOn, setExtraOn] = useState(extraToggle?.initial ?? false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const view = [sort, search, type, ability, favoritesOnly, onlyShiny, extraOn, tagFilter.filter];
  // Le Pokémon choisi passe en tête au changement de filtre ou de tri (pas au clic).
  const pinned = usePinnedSelection(selected, view);

  const list: PcEntry[] = useMemo(
    () =>
      candidates.map((p) => ({
        p,
        species: ctx.species(p.speciesId, p.formId),
        power: 0,
        ability: effectiveAbility(ctx, p),
        canEvolve: false,
      })),
    [ctx, candidates],
  );
  const matchesName = nameMatcher(search);
  const shown = list
    // Les Pokémon choisis restent visibles, quels que soient les filtres.
    .filter(
      (e) =>
        selected.includes(e.p.id) ||
        (matchesName(e.species?.nameFr ?? '') &&
          (type === 'all' || !!e.species?.types.includes(type)) &&
          (ability === 'all' || e.ability === ability) &&
          (!favoritesOnly || e.p.locked) &&
          (!onlyShiny || e.p.isShiny) &&
          (!extraToggle || !extraOn || extraToggle.test(e.p)) &&
          tagFilter.matches(e.p)),
    )
    .sort(({ p: x }, { p: y }) => {
      const first = Number(!pinned.includes(x.id)) - Number(!pinned.includes(y.id));
      if (first) return first;
      switch (sort) {
        case 'extra':
          return extraSort!.compare(x, y) || y.level - x.level;
        case 'level':
          return y.level - x.level || x.speciesId - y.speciesId;
        case 'dex':
          return (
            x.speciesId - y.speciesId || (x.formId ?? 0) - (y.formId ?? 0) || y.level - x.level
          );
        case 'recent':
          return Date.parse(y.caughtAt) - Date.parse(x.caughtAt);
        case 'tag':
          return tagFilter.compare(x, y) || y.level - x.level;
      }
    });

  const filterCount = [
    search.trim() !== '',
    type !== 'all',
    ability !== 'all',
    favoritesOnly,
    onlyShiny,
    extraOn,
    tagFilter.filter !== 'all',
  ].filter(Boolean).length;
  const resetFilters = () => {
    setSearch('');
    setType('all');
    setAbility('all');
    setFavoritesOnly(false);
    setOnlyShiny(false);
    setExtraOn(false);
    tagFilter.setFilter('all');
  };

  const sortSelect = (
    <label className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
      Trier
      <select
        className="input w-auto py-1 text-sm"
        value={sort}
        onChange={(e) => setSort(e.target.value as Sort)}
      >
        {extraSort && <option value="extra">{extraSort.label}</option>}
        {(Object.keys(BASE_SORTS) as BaseSort[]).map((key) => (
          <option key={key} value={key}>
            {BASE_SORTS[key]}
          </option>
        ))}
      </select>
    </label>
  );

  return {
    ...props,
    tagFilter,
    search,
    setSearch,
    type,
    setType,
    ability,
    setAbility,
    favoritesOnly,
    setFavoritesOnly,
    onlyShiny,
    setOnlyShiny,
    extraOn,
    setExtraOn,
    filtersOpen,
    setFiltersOpen,
    view,
    list,
    shown,
    filterCount,
    resetFilters,
    sortSelect,
  };
}

/** Ce qu'affichent les pièces de `ItemPokemonPicker`. */
type ItemPokemonPickerModel = ReturnType<typeof useItemPokemonPicker>;

export function ItemPokemonPicker(props: ItemPokemonPickerProps) {
  const m = useItemPokemonPicker(props);
  const { ctx, itemId, title, left, summary, aside, footer, onClose } = props;
  return (
    <TeamPickerDialog
      open
      onClose={onClose}
      title={title}
      header={
        <span className="inline-flex min-w-0 items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <img
            src={itemIcon(ctx, itemId)}
            alt=""
            className="size-7 shrink-0 [image-rendering:pixelated]"
          />
          <span className={BANNER_LABEL}>× {left}</span>
          <span className="max-sm:hidden">{summary}</span>
        </span>
      }
    >
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-4 lg:grid lg:grid-cols-[minmax(0,1fr)_21rem] lg:grid-rows-[minmax(0,1fr)] lg:gap-3 lg:overflow-hidden">
        <div className="flex min-w-0 flex-col gap-2.5 lg:min-h-0">
          <p className="text-sm text-slate-600 sm:hidden dark:text-slate-300">{summary}</p>

          {/* Recherche, tri, puis filtres (repliés derrière un bouton sur téléphone). */}
          <PickerFilters m={m} />

          <PickerGrid m={m} />
          <p className="text-xs text-slate-500 max-sm:hidden dark:text-slate-400">IV au survol</p>
        </div>

        <aside className="tile flex min-w-0 flex-col gap-2.5 p-3 max-lg:mt-3 lg:min-h-0 lg:overflow-y-auto">
          {aside}
        </aside>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t-[3px] border-ink bg-tile px-3 py-2.5 sm:px-4">
        {footer}
      </footer>
    </TeamPickerDialog>
  );
}

/** Recherche, tri, puis filtres (repliés derrière un bouton sur téléphone). */
function PickerFilters({ m }: { m: ItemPokemonPickerModel }) {
  const {
    extraToggle,
    tagFilter,
    search,
    setSearch,
    type,
    setType,
    ability,
    setAbility,
    favoritesOnly,
    setFavoritesOnly,
    onlyShiny,
    setOnlyShiny,
    extraOn,
    setExtraOn,
    filtersOpen,
    setFiltersOpen,
    list,
    shown,
    filterCount,
    resetFilters,
    sortSelect,
  } = m;
  return (
    <section className="tile flex flex-col gap-2 p-2.5">
      <div className="flex items-center gap-2">
        <NameSearch value={search} onChange={setSearch} className="min-w-0 flex-1 py-1.5" />
        <button
          type="button"
          className="btn-ghost px-3 py-2 sm:hidden"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          Filtres{filterCount > 0 && ` (${filterCount})`}
        </button>
        <span className="hidden sm:block">{sortSelect}</span>
      </div>
      <div className={`${filtersOpen ? 'flex' : 'hidden'} flex-wrap items-center gap-1.5 sm:flex`}>
        <span className="w-full sm:hidden">{sortSelect}</span>
        <TypeFilterSelect value={type} onChange={setType} className="py-1 text-sm" />
        <AbilityFilterSelect
          list={list}
          value={ability}
          onChange={setAbility}
          className="input w-auto py-1 text-sm"
        />
        <TagFilterSelect
          tags={tagFilter.tags}
          value={tagFilter.filter}
          onChange={tagFilter.setFilter}
          className="py-1 text-sm"
        />
        <button
          type="button"
          onClick={() => setFavoritesOnly(!favoritesOnly)}
          title="N'afficher que les Pokémon favoris (♥)"
          aria-pressed={favoritesOnly}
          className={filterPill(favoritesOnly)}
        >
          ♥ Favoris
        </button>
        <button
          type="button"
          onClick={() => setOnlyShiny(!onlyShiny)}
          title="N'afficher que les Pokémon chromatiques"
          aria-pressed={onlyShiny}
          className={filterPill(onlyShiny)}
        >
          ★ Chromatiques
        </button>
        {extraToggle && (
          <button
            type="button"
            onClick={() => setExtraOn(!extraOn)}
            title={extraToggle.title}
            aria-pressed={extraOn}
            className={`${filterPill(extraOn)} inline-flex items-center gap-1`}
          >
            {extraToggle.icon}
            {extraToggle.label}
          </button>
        )}
        {filterCount > 0 && (
          <button
            type="button"
            onClick={resetFilters}
            className="text-sm text-brand-600 hover:underline dark:text-brand-400"
          >
            Effacer les filtres ({filterCount})
          </button>
        )}
        <span className="ml-auto text-sm text-slate-500 dark:text-slate-400">
          {shown.length} Pokémon
        </span>
      </div>
    </section>
  );
}

/** Les Pokémon à qui l'objet peut servir, ou le texte « aucun Pokémon ». */
function PickerGrid({ m }: { m: ItemPokemonPickerModel }) {
  const {
    ctx,
    candidates,
    emptyText,
    selected,
    onToggle,
    cellLine,
    cellBadge,
    tagFilter,
    view,
    shown,
    resetFilters,
  } = m;
  return (
    <section aria-label="Pokémon" className="tile p-1.5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))] gap-1 sm:grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))]">
        <ProgressiveItems items={shown} resetKey={view.join('|')}>
          {({ p, species }) => {
            const isSelected = selected.includes(p.id);
            const name = species?.nameFr ?? speciesName(ctx, p.speciesId, p.formId);
            return (
              <IvHover key={p.id} ivs={p.ivs} className="grid" focusable={false}>
                <button
                  type="button"
                  onClick={() => onToggle(p)}
                  aria-pressed={isSelected}
                  title={`${isSelected ? 'Retirer' : 'Choisir'} ${name}`}
                  className={`relative flex w-full min-w-0 flex-col items-center gap-0.5 rounded-md border-2 p-1 text-center transition ${
                    isSelected
                      ? SELECTED_CELL
                      : 'border-transparent hover:border-well-line hover:bg-well/40'
                  }`}
                >
                  <span
                    className={`sprite-well size-14 sm:size-16 ${p.isShiny ? 'shiny-well' : ''}`}
                  >
                    <PokemonSprite
                      speciesId={p.speciesId}
                      formId={p.formId}
                      shiny={p.isShiny}
                      size={56}
                      className="h-auto w-[92%]"
                    />
                  </span>
                  <span className="w-full truncate text-xs font-semibold">
                    {name} {p.isShiny && <ShinyStar />}
                  </span>
                  <span className="max-w-full truncate text-[11px] text-slate-500 dark:text-slate-400">
                    {cellLine(p)}
                  </span>
                  <PokemonTagBadges pokemon={p} tags={tagFilter.tags} />
                  {cellBadge && <span className="absolute top-0.5 left-0.5">{cellBadge(p)}</span>}
                </button>
              </IvHover>
            );
          }}
        </ProgressiveItems>
        {shown.length === 0 && (
          <p className="col-span-full p-3 text-sm text-slate-500 dark:text-slate-400">
            {candidates.length === 0 ? (
              emptyText
            ) : (
              <>
                Aucun Pokémon ne correspond à ces filtres.{' '}
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-brand-600 hover:underline dark:text-brand-400"
                >
                  Effacer les filtres
                </button>
              </>
            )}
          </p>
        )}
      </div>
    </section>
  );
}

/** Nom et sexe d'un Pokémon (« Évoli ♀ »). */
export function pokemonLabel(ctx: GameContext, p: PokemonDto): string {
  return `${speciesName(ctx, p.speciesId, p.formId)} ${GENDER_LABELS[p.gender]}`.trim();
}

/**
 * Prochaine évolution par bonheur (`happiness`) ou par niveau (`level`) encore à atteindre :
 * espèce visée et seuil le plus bas.
 */
export function pendingEvolution(
  ctx: GameContext,
  p: PokemonDto,
  kind: 'happiness' | 'level',
): { speciesId: number; formId: number | null; required: number } | null {
  let best: { speciesId: number; formId: number | null; required: number } | null = null;
  for (const option of evolutionOptions(ctx, p.speciesId, p.formId)) {
    for (const m of option.methods) {
      const required = kind === 'happiness' ? m.minHappiness : m.minLevel;
      const current = kind === 'happiness' ? p.happiness : p.level;
      // Méthode à objet : le Super Bonbon ou la baie ne suffit pas.
      if (required === null || required <= current || m.itemId !== null) continue;
      if (!best || required < best.required) {
        best = { speciesId: option.toSpeciesId, formId: option.toFormId, required };
      }
    }
  }
  return best;
}

/** Case du Pokémon choisi, dans le panneau de droite. */
export function ChosenPokemon({
  ctx,
  p,
  children,
}: {
  ctx: GameContext;
  p: PokemonDto | undefined;
  children?: ReactNode;
}) {
  return (
    <div
      className={`rounded-md border-2 bg-slate-50 p-2 dark:bg-slate-950/50 ${p ? 'border-well-line' : 'border-dashed border-well-line'}`}
    >
      <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-2">
        {p ? (
          <IvHover ivs={p.ivs}>
            <span className={`sprite-well size-13 ${p.isShiny ? 'shiny-well' : ''}`}>
              <PokemonSprite
                speciesId={p.speciesId}
                formId={p.formId}
                shiny={p.isShiny}
                size={48}
              />
            </span>
          </IvHover>
        ) : (
          <span className="grid size-13 place-items-center rounded-md border-2 border-dashed border-well-line font-pixel text-[10px] text-slate-500 dark:text-slate-400">
            ?
          </span>
        )}
        <span className="flex min-w-0 flex-col">
          {p ? (
            <span className="truncate text-sm font-semibold">
              {pokemonLabel(ctx, p)} {p.isShiny && <ShinyStar />}{' '}
              <span className="font-normal text-slate-500 dark:text-slate-400">N.{p.level}</span>
            </span>
          ) : (
            <span className="text-sm text-slate-500 dark:text-slate-400">
              Touche un Pokémon dans la liste
            </span>
          )}
        </span>
      </div>
      {p && children && <div className="mt-2">{children}</div>}
    </div>
  );
}
