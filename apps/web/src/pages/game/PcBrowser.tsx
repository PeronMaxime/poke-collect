import { useState } from 'react';
import type { ReactNode } from 'react';
import { effectiveAbility, isHealing, isRegionalSpecies, memberPower } from '@poke/game-core';
import type { GameContext, GameSpecies } from '@poke/game-core';
import { searchKey } from '@poke/shared';
import type { PokemonActivity, PokemonDto, PokemonTagDto } from '@poke/shared';
import { PokemonSprite, ShinyStar } from '../../components/ui';
import { PokemonTagBadges, TagFilterSelect, useTagFilter } from '../../components/tags';
import { useNewEvolutionChecker, usePlayerProgress } from '../../lib/game';
import { abilityLabel, formatCountdown } from '../../lib/labels';
import { RegionTabs, currentRegionTab } from './RegionTabs';
import { TypeFilterSelect } from './TeamPicker';

/**
 * Parcours du PC (onglets de région, recherche, tri, filtres) et cartes de sa grille : partagés par
 * le PC et la page « Équipe Pkmn ».
 */

type Sort = 'recent' | 'level' | 'power' | 'dex' | 'tag';

const SORTS: Record<Sort, string> = {
  recent: 'Plus récents',
  level: 'Niveau',
  power: 'PE',
  dex: 'N° Pokédex',
  tag: 'Étiquette',
};

/** Dernier tri choisi, conservé d'une visite à l'autre. */
const SORT_KEY = 'pc-sort';

function savedSort(): Sort {
  const saved = localStorage.getItem(SORT_KEY);
  return saved && Object.hasOwn(SORTS, saved) ? (saved as Sort) : 'dex';
}

/** Onglet de tout le PC, avant les onglets de région (Pokédex régional de chaque espèce). */
const ALL_TAB = { id: '__tous', label: 'Tous' };

export const GENDER_LABELS = { male: '♂', female: '♀', genderless: '' } as const;

const ACTIVITY_LABELS: Record<PokemonActivity, string> = {
  expedition: 'En route',
  battle: 'Combat',
  daycare: 'Pension',
  dungeon: 'Donjon',
  assistant: 'Assistant',
};

export interface PcEntry {
  p: PokemonDto;
  species: GameSpecies | undefined;
  power: number;
  /** Talent en vigueur (nom PokéAPI) ; vide = aucun. */
  ability: string;
  /** Évolution possible vers une espèce ou forme absente du Pokédex. */
  canEvolve: boolean;
}

/** État des filtres du PC et Pokémon affichés (dans l'ordre du tri). */
export function usePcBrowser(ctx: GameContext, pokemon: readonly PokemonDto[]) {
  const hasNewEvolution = useNewEvolutionChecker(ctx);
  const progress = usePlayerProgress();
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>(savedSort);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [onlyShiny, setOnlyShiny] = useState(false);
  const [onlyEvolvable, setOnlyEvolvable] = useState(false);
  const [type, setType] = useState('all');
  const [ability, setAbility] = useState('all');
  const tagFilter = useTagFilter();

  const list: PcEntry[] = pokemon.map((p) => ({
    p,
    species: ctx.species(p.speciesId, p.formId),
    power: memberPower(ctx, p),
    ability: effectiveAbility(ctx, p),
    canEvolve: hasNewEvolution(p),
  }));
  const tab = currentRegionTab(ctx, progress, selectedRegion ?? ALL_TAB.id, [ALL_TAB]);
  const needle = searchKey(search.trim());
  const filtered = list
    .filter(({ p }) => tab === ALL_TAB.id || isRegionalSpecies(ctx, tab, p.speciesId))
    .filter(({ species }) => !needle || searchKey(species?.nameFr ?? '').includes(needle))
    .filter(({ p }) => (!onlyFavorites || p.locked) && (!onlyShiny || p.isShiny))
    .filter(({ canEvolve }) => !onlyEvolvable || canEvolve)
    .filter(({ species }) => type === 'all' || !!species?.types.includes(type))
    .filter((e) => ability === 'all' || e.ability === ability)
    .filter(({ p }) => tagFilter.matches(p))
    .sort((a, b) => {
      switch (sort) {
        case 'recent':
          return Date.parse(b.p.caughtAt) - Date.parse(a.p.caughtAt);
        case 'level':
          return b.p.level - a.p.level;
        case 'power':
          return b.power - a.power;
        case 'dex':
          return a.p.speciesId - b.p.speciesId || b.power - a.power;
        case 'tag':
          return tagFilter.compare(a.p, b.p) || b.power - a.power;
      }
    });

  return {
    progress,
    tab,
    isAllTab: tab === ALL_TAB.id,
    setSelectedRegion,
    search,
    setSearch,
    sort,
    setSort,
    onlyFavorites,
    setOnlyFavorites,
    onlyShiny,
    setOnlyShiny,
    onlyEvolvable,
    setOnlyEvolvable,
    type,
    setType,
    ability,
    setAbility,
    tagFilter,
    list,
    filtered,
  };
}

export type PcBrowser = ReturnType<typeof usePcBrowser>;

/** Onglets de région et barre de filtres ; `children` = boutons ajoutés à droite. */
export function PcFilterBar({
  ctx,
  browser: b,
  children,
}: {
  ctx: GameContext;
  browser: PcBrowser;
  children?: ReactNode;
}) {
  return (
    <>
      {ctx.regions.length > 1 && (
        <div className="mb-4">
          <RegionTabs
            ctx={ctx}
            progress={b.progress}
            selected={b.tab}
            onSelect={b.setSelectedRegion}
            leading={[ALL_TAB]}
          />
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          className="input max-w-56"
          placeholder="Rechercher…"
          value={b.search}
          onChange={(e) => b.setSearch(e.target.value)}
        />
        <select
          className="input w-auto"
          value={b.sort}
          onChange={(e) => {
            const next = e.target.value as Sort;
            b.setSort(next);
            localStorage.setItem(SORT_KEY, next);
          }}
        >
          {Object.entries(SORTS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <TypeFilterSelect value={b.type} onChange={b.setType} className="" />
        <AbilityFilterSelect list={b.list} value={b.ability} onChange={b.setAbility} />
        <label className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={b.onlyFavorites}
            onChange={(e) => b.setOnlyFavorites(e.target.checked)}
          />
          Favoris
        </label>
        <label className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={b.onlyShiny}
            onChange={(e) => b.setOnlyShiny(e.target.checked)}
          />
          Chromatique
        </label>
        <label
          className="flex items-center gap-1 text-sm"
          title="Évolution possible vers une espèce ou forme absente du Pokédex"
        >
          <input
            type="checkbox"
            checked={b.onlyEvolvable}
            onChange={(e) => b.setOnlyEvolvable(e.target.checked)}
          />
          Peut évoluer
        </label>
        <TagFilterSelect
          tags={b.tagFilter.tags}
          value={b.tagFilter.filter}
          onChange={b.tagFilter.setFilter}
        />
        <span className="ml-auto text-sm text-slate-500">
          {b.isAllTab ? b.list.length : `${b.filtered.length} / ${b.list.length}`} Pokémon
        </span>
        {children}
      </div>
    </>
  );
}

/** Filtre par talent : ceux des Pokémon du PC, par ordre alphabétique, avec leur nombre. */
function AbilityFilterSelect({
  list,
  value,
  onChange,
}: {
  list: readonly PcEntry[];
  value: string;
  onChange: (value: string) => void;
}) {
  const counts = new Map<string, number>();
  for (const { ability } of list) counts.set(ability, (counts.get(ability) ?? 0) + 1);
  // « Aucun talent » (NO_ABILITY, chaîne vide) en tête.
  const abilities = [...counts.keys()].sort(
    (a, b) => Number(!!a) - Number(!!b) || abilityLabel(a).localeCompare(abilityLabel(b), 'fr'),
  );
  return (
    <select
      className="input w-auto"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Filtrer par talent"
    >
      <option value="all">Tous les talents</option>
      {/* Talent choisi absent du PC (Pokémon relâché…) : gardé pour pouvoir le retirer. */}
      {value !== 'all' && !counts.has(value) && (
        <option value={value}>{abilityLabel(value)} (0)</option>
      )}
      {abilities.map((a) => (
        <option key={a} value={a}>
          {abilityLabel(a)} ({counts.get(a)})
        </option>
      ))}
    </select>
  );
}

/** Pastille « K.O. », ou « Soins » avec le temps restant au Centre Pokémon. */
export function KoBadge({ p, now }: { p: PokemonDto; now: number }) {
  if (p.knockedOut) {
    return (
      <span
        className="rounded bg-red-100 px-1 text-[10px] text-red-700 dark:bg-red-950 dark:text-red-300"
        title="K.O. : indisponible jusqu’à ses soins au Centre Pokémon"
      >
        K.O.
      </span>
    );
  }
  if (!isHealing(p.healUntil, now)) return null;
  return (
    <span
      className="rounded bg-pink-100 px-1 font-mono text-[10px] text-pink-700 dark:bg-pink-950 dark:text-pink-300"
      title="En soins au Centre Pokémon"
    >
      Soins {formatCountdown(Date.parse(p.healUntil!) - now)}
    </span>
  );
}

/** Carte d'un Pokémon dans la grille du PC. */
export function PcPokemonCard({
  entry: { p, species, power, canEvolve },
  tags,
  now,
  onSelect,
  topLeft,
  badges,
  className = '',
  title,
}: {
  entry: PcEntry;
  tags: readonly PokemonTagDto[];
  now: number;
  onSelect: () => void;
  /** Coin haut gauche (cœur des favoris…). */
  topLeft?: ReactNode;
  /** Pastilles ajoutées sous celles d'activité, de K.O. et d'évolution. */
  badges?: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      title={title}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        onSelect();
      }}
      className={`card relative flex cursor-pointer flex-col items-center p-2 text-xs transition hover:-translate-y-0.5 ${className}`}
    >
      {topLeft}
      <span className="absolute top-1.5 right-2 flex flex-col items-end gap-0.5">
        {p.activity && (
          <span className="rounded bg-sky-100 px-1 text-[10px] text-sky-700 dark:bg-sky-950 dark:text-sky-300">
            {ACTIVITY_LABELS[p.activity]}
          </span>
        )}
        <KoBadge p={p} now={now} />
        {canEvolve && (
          <span
            className="rounded bg-emerald-100 px-1 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
            title="Peut évoluer"
          >
            Évol. ↑
          </span>
        )}
        {badges}
      </span>
      <PokemonSprite speciesId={p.speciesId} formId={p.formId} shiny={p.isShiny} size={72} />
      <span className="truncate font-medium">
        {species?.nameFr}
        {p.gender !== 'genderless' && (
          <span className={p.gender === 'male' ? 'text-sky-500' : 'text-pink-500'}>
            {' '}
            {GENDER_LABELS[p.gender]}
          </span>
        )}{' '}
        {p.isShiny && <ShinyStar />}
      </span>
      <span className="text-slate-500">
        N.{p.level} · PE {power}
      </span>
      <PokemonTagBadges pokemon={p} tags={tags} className="mt-0.5 gap-0.5" />
    </div>
  );
}
