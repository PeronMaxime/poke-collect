import { useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { eggGroups } from '@poke/data';
import { checkBreedingPair, hatchMinutes, inheritanceRules } from '@poke/game-core';
import type { BreedingError, GameContext } from '@poke/game-core';
import type {
  CollectEggsResponse,
  DaycareDto,
  PokemonDto,
  SetDaycareParentInput,
} from '@poke/shared';
import { IvHover, PokemonSprite, ShinyStar, ViewTabs, useNow } from '../../components/ui';
import { PokemonTagBadges, TagFilterSelect, useTagFilter } from '../../components/tags';
import { ProgressiveItems } from '../../components/ProgressiveGrid';
import { api } from '../../lib/api';
import { isUsable, keys, refresh, useInventory, usePokemon } from '../../lib/game';
import { errorText, formatDuration, itemName, speciesName } from '../../lib/labels';
import { AbilityLine } from './AssistantCard';
import { SECTION_TITLE, SELECTED_CELL, SLOT_CLASS, StatusPill } from './dialogParts';
import type { StatusTone } from './dialogParts';
import { NameSearch, filterPill, nameMatcher, usePinnedSelection } from './TeamPicker';
import { TeamPickerDialog } from './TeamSection';
import { formatXp } from './XpPreview';

const GENDER_LABELS = { male: '♂', female: '♀', genderless: '' } as const;

const GENDER_FILTERS = {
  all: 'Tous les sexes',
  male: '♂ Mâles',
  female: '♀ Femelles',
  genderless: 'Asexués',
} as const;
type GenderFilter = keyof typeof GENDER_FILTERS;

const SORTS = {
  dex: 'N° du Pokédex',
  level: 'Niveau',
  recent: 'Récents',
  tag: 'Étiquette',
} as const;
type Sort = keyof typeof SORTS;

const EGG_GROUP_NAMES = new Map(eggGroups.map((g) => [g.name, g.nameFr]));
const eggGroupName = (name: string) => EGG_GROUP_NAMES.get(name) ?? name;

function breedingErrorText(ctx: GameContext, e: BreedingError): string {
  switch (e.code) {
    case 'SAME_POKEMON':
      return 'Choisis deux Pokémon différents.';
    case 'NOT_BREEDABLE':
      return `${speciesName(ctx, e.speciesId)} ne peut pas avoir d’œuf.`;
    case 'TWO_DITTOS':
      return 'Deux Métamorph ne peuvent pas avoir d’œuf ensemble.';
    case 'NO_COMMON_EGG_GROUP':
      return 'Aucun groupe d’œufs en commun.';
    case 'INCOMPATIBLE_GENDERS':
      return 'Il faut un mâle et une femelle (ou un Métamorph).';
  }
}

/** Objet tenu d'un parent de la pension (0 : parent A, 1 : parent B). */
const heldOf = (pension: DaycareDto | undefined, side: 0 | 1) =>
  pension ? (side === 0 ? pension.heldItemAId : pension.heldItemBId) : null;

/** Pastille verte (un œuf) d'un Pokémon compatible avec le partenaire. */
function CompatMark({ className = 'size-5' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`grid place-items-center rounded border-2 border-ink bg-emerald-400 ${className}`}
    >
      <svg viewBox="0 0 10 10" className="size-2.5">
        <ellipse cx="5" cy="5.4" rx="3.2" ry="4" fill="#10203a" />
      </svg>
    </span>
  );
}

/**
 * Choix d'un Pokémon (et de son objet tenu) pour une place de pension, dans la même fenêtre que
 * le choix d'une équipe : à gauche la « boîte » des Pokémon disponibles (recherche, tri, filtres),
 * à droite la pension (le Pokémon choisi, son partenaire, l'aperçu de l'œuf) ; en bas, l'état du
 * couple et Annuler · Déposer. Sur téléphone, la boîte et la pension passent en onglets.
 * S'il y avait déjà un Pokémon à cette place, il est remplacé.
 */
export function DepositDialog({
  ctx,
  slotIndex,
  side: initialSide,
  pension,
  onDeposited,
  onClose,
}: {
  ctx: GameContext;
  /** Pension choisie (son assistant agira sur le couple). */
  slotIndex: number;
  /**
   * Place du Pokémon dans la pension (0 ou 1). Si l'autre place est libre, la fenêtre passe
   * ensuite à celle-ci pour lui choisir un partenaire, parmi les compatibles.
   */
  side: 0 | 1;
  /** Pension telle qu'elle est (partenaire, Pokémon remplacé). */
  pension?: DaycareDto;
  /** Après le dépôt : XP du Pokémon remplacé, œufs couvés. */
  onDeposited?: (res: CollectEggsResponse) => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const pokemon = usePokemon();
  const inventory = useInventory();
  const all = pokemon.data ?? [];
  const [side, setSide] = useState(initialSide);
  /** Pokémon qui vient d'entrer seul dans la pension : on lui choisit maintenant un partenaire. */
  const [pairing, setPairing] = useState<PokemonDto | null>(null);
  const sideId = (s: 0 | 1) => (pension ? (s === 0 ? pension.parentAId : pension.parentBId) : null);
  const currentId = sideId(side);
  const partnerId = sideId(side === 0 ? 1 : 0);
  const current = all.find((p) => p.id === currentId);
  const partner = all.find((p) => p.id === partnerId);
  const partnerItem = heldOf(pension, side === 0 ? 1 : 0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [item, setItem] = useState<string | null>(heldOf(pension, side));
  const [view, setView] = useState<'box' | 'pension'>('box');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const deposit = useMutation({
    mutationFn: (input: SetDaycareParentInput) =>
      api<CollectEggsResponse>(`/api/daycare/${slotIndex}/parents/${side}`, {
        method: 'PUT',
        json: input,
      }),
    onSuccess: async (res, input) => {
      const deposited = all.find((p) => p.id === input.pokemonId) ?? null;
      // L'autre place était libre : on enchaîne sur le choix de son partenaire.
      const choosePartner = !partnerId && deposited !== null;
      await refresh(queryClient, keys.daycare, keys.pokemon, keys.inventory);
      onDeposited?.(res);
      if (!choosePartner) {
        onClose();
        return;
      }
      setSide(side === 0 ? 1 : 0);
      setPairing(deposited);
      setChosen(null);
      setItem(null);
      resetFilters();
      setOnlyCompatible(true);
      setView('box');
    },
  });

  const now = useNow(10_000);
  const tagFilter = useTagFilter();
  const [search, setSearch] = useState('');
  const [gender, setGender] = useState<GenderFilter>('all');
  const [eggGroup, setEggGroup] = useState('all');
  const [onlyShiny, setOnlyShiny] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sort, setSort] = useState<Sort>('dex');
  /** Décoché, on peut déposer un Pokémon incompatible avec son partenaire, pour l'XP. */
  const [onlyCompatible, setOnlyCompatible] = useState(true);
  // Le Pokémon choisi passe en tête au changement de filtre ou de tri (pas au clic).
  const pinned = usePinnedSelection(chosen ? [chosen] : [], [
    sort,
    search,
    gender,
    eggGroup,
    onlyShiny,
    favoritesOnly,
    onlyCompatible,
    tagFilter.filter,
  ]);

  // Un Pokémon Méga-Évolué n'entre pas en pension (il transmettrait sa forme Méga). Les Pokémon
  // qui ne peuvent pas avoir d'œuf y entrent quand même, pour gagner de l'XP.
  const usable = all.filter(
    (p) => isUsable(p, now) && !p.megaStone && p.id !== partnerId && p.id !== currentId,
  );
  const picked = usable.find((p) => p.id === chosen);
  const compatibleFilter = !!partner && onlyCompatible;
  const groupsInPc = [
    ...new Set(usable.flatMap((p) => ctx.species(p.speciesId, p.formId)!.eggGroups)),
  ].sort((x, y) => eggGroupName(x).localeCompare(eggGroupName(y)));
  const matchesName = nameMatcher(search);
  const available = usable
    .map((p) => ({
      p,
      species: ctx.species(p.speciesId, p.formId)!,
      compatible: !!partner && checkBreedingPair(ctx, partner, p).ok,
    }))
    // Le Pokémon choisi reste visible, quels que soient les filtres.
    .filter(
      ({ p, species, compatible }) =>
        chosen === p.id ||
        ((!compatibleFilter || compatible) &&
          matchesName(species.nameFr) &&
          (gender === 'all' || p.gender === gender) &&
          (eggGroup === 'all' || species.eggGroups.includes(eggGroup)) &&
          (!onlyShiny || p.isShiny) &&
          (!favoritesOnly || p.locked) &&
          tagFilter.matches(p)),
    )
    .sort(({ p: x }, { p: y }) => {
      const first = Number(pinned[0] !== x.id) - Number(pinned[0] !== y.id);
      if (first) return first;
      switch (sort) {
        case 'dex':
          return (
            x.speciesId - y.speciesId || (x.formId ?? 0) - (y.formId ?? 0) || y.level - x.level
          );
        case 'level':
          return y.level - x.level || x.speciesId - y.speciesId;
        case 'recent':
          return Date.parse(y.caughtAt) - Date.parse(x.caughtAt);
        case 'tag':
          return tagFilter.compare(x, y) || x.speciesId - y.speciesId;
      }
    });
  const filterCount =
    Number(search.trim() !== '') +
    Number(gender !== 'all') +
    Number(eggGroup !== 'all') +
    Number(onlyShiny) +
    Number(favoritesOnly) +
    Number(tagFilter.filter !== 'all');
  const resetFilters = () => {
    setSearch('');
    setGender('all');
    setEggGroup('all');
    setOnlyShiny(false);
    setFavoritesOnly(false);
    tagFilter.setFilter('all');
  };

  // Le couple dans l'ordre de la pension (parent A, parent B).
  const couple = side === 0 ? [picked, partner] : [partner, picked];
  const check = picked && partner ? checkBreedingPair(ctx, couple[0]!, couple[1]!) : null;
  const owned = new Map(inventory.data?.map((i) => [i.itemId, i.quantity]));
  // Objet tenu par le Pokémon remplacé : rendu au changement, donc utilisable.
  const oldItem = heldOf(pension, side);
  if (oldItem) owned.set(oldItem, (owned.get(oldItem) ?? 0) + 1);
  const breedingItems = ctx.content.items.filter(
    (i) =>
      (ctx.itemEffect(i.id, 'breedingIvs') || ctx.itemEffect(i.id, 'breedingNature')) &&
      (owned.get(i.id) ?? 0) > 0,
  );
  const rules = inheritanceRules(ctx, side === 0 ? [item, partnerItem] : [partnerItem, item]);

  function pick(p: PokemonDto) {
    setChosen((id) => (id === p.id ? null : p.id));
  }

  const name = (p: PokemonDto) => speciesName(ctx, p.speciesId, p.formId);
  const partnerLabel = partner ? `${name(partner)} ${GENDER_LABELS[partner.gender]}`.trim() : '';
  const status: { tone: StatusTone; text: string } = !picked
    ? { tone: 'idle', text: 'Choisis un Pokémon' }
    : check?.ok
      ? { tone: 'ok', text: `Œufs de ${speciesName(ctx, check.eggSpeciesId)}` }
      : check
        ? { tone: 'idle', text: 'Pas d’œuf : XP seulement' }
        : { tone: 'ok', text: 'Gagnera de l’XP' };
  const actionLabel = current ? 'Changer' : 'Déposer';

  const sortSelect = (
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

  /** Case d'un parent dans la colonne de la pension. */
  const parentSlot = (p: PokemonDto | undefined, label: string, extra: ReactNode) => (
    <div
      className={`${SLOT_CLASS} ${p ? 'border-well-line' : 'border-dashed border-well-line'} flex flex-col gap-2 p-2`}
    >
      <h4 className="pixel-label text-[8px] text-slate-500 uppercase dark:text-slate-400">
        {label}
      </h4>
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
            <>
              <span className="truncate text-sm font-semibold">
                {name(p)} {GENDER_LABELS[p.gender]} {p.isShiny && <ShinyStar />}{' '}
                <span className="font-normal text-slate-500 dark:text-slate-400">N.{p.level}</span>
              </span>
              <span className="truncate text-xs text-slate-500 dark:text-slate-400">
                {ctx.species(p.speciesId, p.formId)!.eggGroups.map(eggGroupName).join(' · ')}
              </span>
              <AbilityLine ctx={ctx} p={p} activities={['breeding']} />
            </>
          ) : (
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {label === 'Partenaire' ? 'Place libre' : 'Case libre : touche un Pokémon'}
            </span>
          )}
        </span>
      </div>
      {extra}
    </div>
  );

  return (
    <TeamPickerDialog
      open
      onClose={onClose}
      title={
        pairing ? 'Choisir un partenaire' : current ? 'Changer de Pokémon' : 'Déposer un Pokémon'
      }
      header={
        <span className="text-sm text-slate-600 dark:text-slate-300">
          Pension {slotIndex + 1}
          {partner && <> · avec {partnerLabel}</>}
        </span>
      }
    >
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-4 lg:grid lg:grid-cols-[minmax(0,1fr)_23rem] lg:grid-rows-[minmax(0,1fr)] lg:gap-3 lg:overflow-hidden">
        <ViewTabs
          className="mb-3 lg:hidden"
          tabs={[
            { id: 'box', label: 'Pokémon' },
            { id: 'pension', label: 'Pension', badge: picked ? '1/1' : '0/1' },
          ]}
          selected={view}
          onSelect={setView}
        />

        {/* La boîte : Pokémon disponibles. */}
        <div
          className={`flex min-w-0 flex-col gap-2.5 lg:min-h-0 ${view === 'pension' ? 'max-lg:hidden' : ''}`}
        >
          {/* Téléphone : le couple en mini-cases, toucher ouvre l'onglet de la pension. */}
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
                  <PokemonSprite
                    speciesId={p.speciesId}
                    formId={p.formId}
                    shiny={p.isShiny}
                    size={40}
                  />
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

          {pairing && (
            <p className="rounded-md border-2 border-emerald-600 bg-emerald-50 px-2.5 py-1.5 text-sm dark:border-emerald-400 dark:bg-emerald-950/50">
              <b>{name(pairing)}</b> est entré en pension. Choisis-lui un partenaire compatible pour
              avoir des œufs, ou termine pour le laisser seul (il gagnera de l’XP).
            </p>
          )}

          {/* Recherche, tri, puis filtres (repliés derrière un bouton sur téléphone). */}
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
            <div
              className={`${filtersOpen ? 'flex' : 'hidden'} flex-wrap items-center gap-1.5 sm:flex`}
            >
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

          <section
            aria-label="Pokémon disponibles"
            className="tile p-1.5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
          >
            <div className="grid grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))] gap-1 sm:grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))]">
              <ProgressiveItems
                items={available}
                resetKey={[
                  sort,
                  search,
                  gender,
                  eggGroup,
                  onlyShiny,
                  favoritesOnly,
                  onlyCompatible,
                  tagFilter.filter,
                ].join('|')}
              >
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

        {/* La pension : le Pokémon choisi, son partenaire et l'aperçu de l'œuf. */}
        <aside
          className={`tile flex min-w-0 flex-col gap-2.5 p-3 lg:min-h-0 lg:overflow-y-auto ${view === 'box' ? 'max-lg:hidden' : ''}`}
        >
          <h3 className={SECTION_TITLE}>Pension {slotIndex + 1}</h3>
          {parentSlot(
            picked,
            current ? 'Nouveau Pokémon' : 'Pokémon déposé',
            <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
              Objet tenu
              <select
                className="input py-1 text-sm"
                value={item ?? ''}
                onChange={(e) => setItem(e.target.value || null)}
              >
                <option value="">Aucun objet tenu</option>
                {breedingItems.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} (× {owned.get(i.id)})
                  </option>
                ))}
              </select>
            </label>,
          )}
          {parentSlot(
            partner,
            'Partenaire',
            partnerItem ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tient : {itemName(ctx, partnerItem)}
              </p>
            ) : null,
          )}

          {check?.ok && (
            <div className="flex items-center gap-3 rounded-md border-2 border-emerald-600 bg-emerald-50 p-2 text-sm dark:border-emerald-400 dark:bg-emerald-950/50">
              <span className="sprite-well size-12 shrink-0">
                <PokemonSprite speciesId={check.eggSpeciesId} size={40} />
              </span>
              <div className="min-w-0">
                <p className="font-semibold">Œufs de {speciesName(ctx, check.eggSpeciesId)}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Un œuf toutes les {formatDuration(ctx.balance.breeding.eggMinutes)} · éclosion en{' '}
                  {formatDuration(hatchMinutes(ctx, check.eggSpeciesId))} · {rules.ivCount} IV
                  hérités des parents
                  {rules.natureChance.map((chance, i) =>
                    chance > 0
                      ? ` · nature du parent ${i + 1}${chance < 1 ? ` (${Math.round(chance * 100)} %)` : ''}`
                      : '',
                  )}
                </p>
              </div>
            </div>
          )}
          {check && !check.ok && (
            <div className="rounded-md border-2 border-amber-600 bg-amber-50 p-2 text-sm dark:border-amber-400 dark:bg-amber-950/40">
              <p className="font-semibold">Pas d’œuf avec ce couple</p>
              <ul className="text-xs text-slate-600 dark:text-slate-400">
                {check.errors.map((e) => (
                  <li key={e.code}>{breedingErrorText(ctx, e)}</li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Ils peuvent quand même séjourner à la pension pour gagner{' '}
                {formatXp(ctx.balance.breeding.parentXpPerHour)} par heure.
              </p>
            </div>
          )}

          <div className="mt-auto space-y-1 border-t-2 border-well-line pt-2.5 text-xs text-slate-500 dark:text-slate-400">
            <p>
              {partner
                ? 'Avec un partenaire compatible, il pondra des œufs ; sinon, il gagnera seulement de l’XP.'
                : 'Seul, il gagne de l’XP ; ajoute-lui un partenaire compatible pour avoir des œufs.'}{' '}
              L’œuf contient la forme de base de la mère (ou du parent qui n’est pas Métamorph).
            </p>
            {current && (
              <p>
                {name(current)} quitte la pension : il reçoit son XP et les œufs prêts vont dans la
                couveuse (le surplus dans le sac).
              </p>
            )}
          </div>
        </aside>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t-[3px] border-ink bg-tile px-3 py-2.5 sm:px-4">
        <StatusPill tone={status.tone} text={status.text} />
        <span className="hidden min-w-0 flex-1 truncate text-sm text-slate-600 sm:block dark:text-slate-300">
          {picked && (partner ? `${name(picked)} + ${partnerLabel}` : `${name(picked)} seul`)}
        </span>
        {deposit.error && (
          <span className="w-full text-sm text-red-600 sm:w-auto">{errorText(deposit.error)}</span>
        )}
        <div className="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-2 sm:flex sm:w-auto">
          <button type="button" className="btn-ghost" onClick={onClose}>
            {pairing ? 'Terminer' : 'Annuler'}
          </button>
          <button
            type="button"
            className="btn-primary px-6"
            disabled={!picked || deposit.isPending}
            onClick={() => deposit.mutate({ pokemonId: picked!.id, heldItemId: item })}
          >
            {actionLabel}
          </button>
        </div>
      </footer>
    </TeamPickerDialog>
  );
}
