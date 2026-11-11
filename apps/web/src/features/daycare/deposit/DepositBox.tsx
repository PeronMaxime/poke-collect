/**
 * La « boîte » de la fenêtre de dépôt : Pokémon disponibles, avec recherche, tri et filtres.
 */
import { useState } from 'react';
import { IvHover, PokemonSprite, ShinyStar } from '../../../components/ui';
import { PokemonTagBadges, TagFilterSelect } from '../../../components/tags';
import { ProgressiveItems } from '../../../components/ProgressiveGrid';
import { SELECTED_CELL } from '../../common/dialogParts';
import { NameSearch, filterPill } from '../../common/teamPicker/filters';
import { CompatMark, GENDER_LABELS, eggGroupName } from './parts';
import { GENDER_FILTERS, SORTS } from './boxFilters';
import type { GenderFilter, Sort } from './boxFilters';
import type { DepositModel } from './useDepositDialog';

/** Colonne de la boîte : résumé du couple (téléphone), filtres, grille des Pokémon et légende. */
export function DepositBox({ d }: { d: DepositModel }) {
  const { pairing, partner, view, name, partnerLabel } = d;
  return (
    <div
      className={`flex min-w-0 flex-col gap-2.5 lg:min-h-0 ${view === 'pension' ? 'max-lg:hidden' : ''}`}
    >
      <CoupleSummary d={d} />

      {pairing && (
        <p className="rounded-md border-2 border-emerald-600 bg-emerald-50 px-2.5 py-1.5 text-sm dark:border-emerald-400 dark:bg-emerald-950/50">
          <b>{name(pairing)}</b> est entré en pension. Choisis-lui un partenaire compatible pour
          avoir des œufs, ou termine pour le laisser seul (il gagnera de l’XP).
        </p>
      )}

      <BoxFilters d={d} />

      <BoxGrid d={d} />

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        {partner && (
          <span className="inline-flex items-center gap-1.5">
            <CompatMark className="size-4" />
            Compatible avec {partnerLabel}
          </span>
        )}
        <span className="max-sm:hidden">IV au survol</span>
        <span>Les Pokémon Méga-Évolués n’entrent pas en pension</span>
      </p>
    </div>
  );
}

/** Téléphone : le couple en mini-cases ; le toucher ouvre l'onglet de la pension. */
function CoupleSummary({ d }: { d: DepositModel }) {
  const { partner, setView, picked, name, partnerLabel } = d;
  return (
    <button
      type="button"
      onClick={() => setView('pension')}
      className="tile flex items-center gap-2 p-2.5 text-left lg:hidden"
    >
      {[picked, partner].map((p, i) =>
        p ? (
          <span
            key={p.id}
            className={`sprite-well size-12 shrink-0 ${p.isShiny ? 'shiny-well' : ''} ${i === 0 ? SELECTED_CELL : ''}`}
          >
            <PokemonSprite speciesId={p.speciesId} formId={p.formId} shiny={p.isShiny} size={40} />
          </span>
        ) : (
          <span
            key={`free-${i}`}
            className="grid size-12 shrink-0 place-items-center rounded-md border-2 border-dashed border-well-line font-pixel text-[9px] text-slate-500 dark:text-slate-400"
          >
            ?
          </span>
        ),
      )}
      <span className="min-w-0 flex-1 truncate text-sm">
        {picked ? (
          <>
            <b>{name(picked)}</b>
            {partner && <> + {partnerLabel}</>}
          </>
        ) : (
          <span className="text-slate-500 dark:text-slate-400">Choisis un Pokémon</span>
        )}
      </span>
    </button>
  );
}

/** Recherche, tri, puis filtres (repliés derrière un bouton sur téléphone). */
function BoxFilters({ d }: { d: DepositModel }) {
  const {
    partner,
    tagFilter,
    search,
    setSearch,
    gender,
    setGender,
    eggGroup,
    setEggGroup,
    onlyShiny,
    setOnlyShiny,
    favoritesOnly,
    setFavoritesOnly,
    sort,
    setSort,
    onlyCompatible,
    setOnlyCompatible,
    filterCount,
    resetFilters,
    groupsInPc,
    available,
    partnerLabel,
  } = d;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const sortSelect = <SortSelect sort={sort} setSort={setSort} />;
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
        <select
          className="input w-auto py-1 text-sm"
          value={gender}
          onChange={(e) => setGender(e.target.value as GenderFilter)}
          aria-label="Filtrer par sexe"
        >
          {Object.entries(GENDER_FILTERS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          className="input w-auto py-1 text-sm"
          value={eggGroup}
          onChange={(e) => setEggGroup(e.target.value)}
          aria-label="Filtrer par groupe d’œufs"
        >
          <option value="all">Tous les groupes d’œufs</option>
          {groupsInPc.map((g) => (
            <option key={g} value={g}>
              {eggGroupName(g)}
            </option>
          ))}
        </select>
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
        {partner && (
          <button
            type="button"
            onClick={() => setOnlyCompatible(!onlyCompatible)}
            title={`N'afficher que les partenaires compatibles avec ${partnerLabel} (un couple incompatible ne pond pas, mais gagne de l’XP)`}
            aria-pressed={onlyCompatible}
            className={`${filterPill(onlyCompatible)} inline-flex items-center gap-1.5`}
          >
            <CompatMark className="size-4" />
            Compatibles
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
          {available.length} Pokémon
        </span>
      </div>
    </section>
  );
}

/** Choix du tri de la boîte. */
function SortSelect({ sort, setSort }: { sort: Sort; setSort: (sort: Sort) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
      Trier
      <select
        className="input w-auto py-1 text-sm"
        value={sort}
        onChange={(e) => setSort(e.target.value as Sort)}
      >
        {(Object.keys(SORTS) as Sort[]).map((key) => (
          <option key={key} value={key}>
            {SORTS[key]}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Grille des Pokémon disponibles ; un liseré vert marque ceux compatibles avec le partenaire. */
function BoxGrid({ d }: { d: DepositModel }) {
  const {
    chosen,
    tagFilter,
    filterCount,
    resetFilters,
    viewKey,
    usable,
    available,
    pick,
    partnerLabel,
  } = d;
  return (
    <section
      aria-label="Pokémon disponibles"
      className="tile p-1.5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
    >
      <div className="grid grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))] gap-1 sm:grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))]">
        <ProgressiveItems items={available} resetKey={viewKey}>
          {({ p, species, compatible }) => {
            const selected = chosen === p.id;
            return (
              <IvHover key={p.id} ivs={p.ivs} className="grid" focusable={false}>
                <button
                  type="button"
                  onClick={() => pick(p)}
                  aria-pressed={selected}
                  title={`${selected ? 'Retirer' : 'Choisir'} ${species.nameFr}${
                    compatible ? ` · compatible avec ${partnerLabel}` : ''
                  } · ${species.eggGroups.map(eggGroupName).join(', ')}`}
                  className={`relative flex w-full min-w-0 flex-col items-center gap-0.5 rounded-md border-2 p-1 text-center transition ${
                    selected
                      ? SELECTED_CELL
                      : 'border-transparent hover:border-well-line hover:bg-well/40'
                  }`}
                >
                  <span
                    className={`sprite-well size-14 sm:size-16 ${p.isShiny ? 'shiny-well' : ''} ${
                      compatible
                        ? 'border-emerald-500 ring-2 ring-emerald-500/30 dark:border-emerald-400'
                        : ''
                    }`}
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
                    {species.nameFr} {p.isShiny && <ShinyStar />}
                  </span>
                  <span className="max-w-full truncate text-[11px] text-slate-500 dark:text-slate-400">
                    N.{p.level}
                    {GENDER_LABELS[p.gender] && <> · {GENDER_LABELS[p.gender]}</>}
                  </span>
                  <span className="w-full truncate text-[10px] text-slate-500 dark:text-slate-400">
                    {species.eggGroups.map(eggGroupName).join(' · ')}
                  </span>
                  <PokemonTagBadges pokemon={p} tags={tagFilter.tags} />
                  {compatible && <CompatMark className="absolute top-0.5 left-0.5 size-5" />}
                </button>
              </IvHover>
            );
          }}
        </ProgressiveItems>
        {available.length === 0 && (
          <p className="col-span-full p-3 text-sm text-slate-500 dark:text-slate-400">
            {usable.length === 0 ? (
              'Aucun Pokémon disponible : ils sont occupés, K.O., ou Méga-Évolués.'
            ) : (
              <>
                Aucun Pokémon ne correspond à ces filtres.{' '}
                {filterCount > 0 && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="text-brand-600 hover:underline dark:text-brand-400"
                  >
                    Effacer les filtres
                  </button>
                )}
              </>
            )}
          </p>
        )}
      </div>
    </section>
  );
}
