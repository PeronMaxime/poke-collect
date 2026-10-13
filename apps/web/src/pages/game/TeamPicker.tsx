import { useState } from 'react';
import { types } from '@poke/data';
import { isRegionalSpecies, pokemonPower } from '@poke/game-core';
import type { ExpeditionSite, GameContext } from '@poke/game-core';
import type { PokemonDto } from '@poke/shared';
import { PokemonTagBadges, TagFilterSelect, useTagFilter } from '../../components/tags';
import { PokemonSprite, ShinyStar, useNow } from '../../components/ui';
import { isUsable, usePokemon } from '../../lib/game';
import { typeLabel } from '../../lib/labels';

const SORTS = {
  power: 'PE',
  affinity: 'Affinité',
  level: 'Niveau',
  tag: 'Étiquette',
} as const;
type Sort = keyof typeof SORTS;

/** Types de Pokémon, sans les types techniques des données (Stellaire, ???, Obscur). */
const NON_POKEMON_TYPES = new Set(['stellar', 'unknown', 'shadow']);
const POKEMON_TYPES = types.filter((t) => !NON_POKEMON_TYPES.has(t.name));

/** Filtre par type (sélecteurs d'équipe, PC) : `all` ou le nom d'un type. */
export function TypeFilterSelect({
  value,
  onChange,
  className = 'ml-1 py-0.5 text-xs',
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <select
      className={`input w-auto ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Filtrer par type"
    >
      <option value="all">Tous les types</option>
      {POKEMON_TYPES.map((t) => (
        <option key={t.name} value={t.name}>
          {typeLabel(t.name)}
        </option>
      ))}
    </select>
  );
}

/** Recherche par nom, insensible à la casse et aux accents (« evoli » trouve « Évoli »). */
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
export function nameMatcher(search: string) {
  const needle = fold(search.trim());
  return (name: string) => !needle || fold(name).includes(needle);
}

/** Champ de recherche par nom des sélecteurs d'équipe. */
export function NameSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      className="input ml-1 w-32 py-0.5 text-xs"
      placeholder="Rechercher…"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export const pillClass = (active: boolean) =>
  `rounded-full px-2 py-0.5 ${
    active
      ? 'bg-brand-500 text-white'
      : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700'
  }`;

/**
 * Choix de l'équipe d'une expédition : Pokémon disponibles (du Pokédex de la région du lieu,
 * s'il en a une), triables et filtrables par étiquette, ceux en affinité mis en évidence.
 * Renvoie les membres choisis (dans l'ordre de sélection) pour valider l'équipe.
 */
export function useTeamPicker(ctx: GameContext, zone: ExpeditionSite) {
  const pokemon = usePokemon();
  const [team, setTeam] = useState<string[]>([]);
  const [sort, setSort] = useState<Sort>('power');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const tagFilter = useTagFilter();
  const now = useNow(10_000);
  const matchesName = nameMatcher(search);
  const available = (pokemon.data ?? [])
    .filter(
      (p) =>
        isUsable(p, now) && (!zone.regionId || isRegionalSpecies(ctx, zone.regionId, p.speciesId)),
    )
    .map((p) => {
      const species = ctx.species(p.speciesId, p.formId)!;
      return {
        p,
        species,
        power: pokemonPower(species, p),
        affinity: species.types.some((t) => zone.affinityTypes.includes(t)),
      };
    })
    // Les membres déjà choisis restent visibles, quels que soient les filtres.
    .filter(
      ({ p, species }) =>
        (tagFilter.matches(p) &&
          matchesName(species.nameFr) &&
          (type === 'all' || species.types.includes(type))) ||
        team.includes(p.id),
    )
    .sort(
      (a, b) =>
        (sort === 'affinity' ? Number(b.affinity) - Number(a.affinity) : 0) ||
        (sort === 'level' ? b.p.level - a.p.level : 0) ||
        (sort === 'tag' ? tagFilter.compare(a.p, b.p) : 0) ||
        b.power - a.power,
    );
  const members = team.flatMap((id) => available.find((a) => a.p.id === id)?.p ?? []);
  return {
    team,
    setTeam,
    sort,
    setSort,
    search,
    setSearch,
    type,
    setType,
    tagFilter,
    available,
    members,
  };
}

export function TeamPicker({
  ctx,
  zone,
  picker,
  power,
}: {
  ctx: GameContext;
  zone: ExpeditionSite;
  picker: ReturnType<typeof useTeamPicker>;
  /** PE de l'équipe choisie. */
  power: number;
}) {
  const { team, setTeam, sort, setSort, search, setSearch, type, setType, tagFilter, available } =
    picker;
  const { maxTeamSize } = ctx.balance.expeditions;
  const region = zone.regionId ? ctx.region(zone.regionId) : undefined;
  const from = region ? ` de ${region.name}` : '';

  function toggle(p: PokemonDto) {
    setTeam((t) =>
      t.includes(p.id) ? t.filter((id) => id !== p.id) : t.length < maxTeamSize ? [...t, p.id] : t,
    );
  }

  return (
    <>
      <div className="mt-5 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">
          Équipe ({team.length} / {maxTeamSize})
        </h3>
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <span className="text-slate-500">Trier par</span>
          {(Object.keys(SORTS) as Sort[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setSort(key)}
              className={pillClass(sort === key)}
            >
              {SORTS[key]}
            </button>
          ))}
          <TagFilterSelect
            tags={tagFilter.tags}
            value={tagFilter.filter}
            onChange={tagFilter.setFilter}
            className="ml-1 py-0.5 text-xs"
          />
          <TypeFilterSelect value={type} onChange={setType} />
          <NameSearch value={search} onChange={setSearch} />
        </div>
        <span
          className={`text-sm font-medium ${power >= zone.minPower ? 'text-emerald-600' : 'text-red-600'}`}
        >
          PE {power} / {zone.minPower}
        </span>
      </div>
      <div className="mt-2 grid max-h-64 grid-cols-3 gap-2 overflow-y-auto p-1 sm:grid-cols-5">
        {available.map(({ p, species, power, affinity }) => {
          const selected = team.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p)}
              title={affinity ? 'Affinité' : undefined}
              className={`relative flex flex-col items-center rounded-xl border p-1 text-xs transition ${
                selected
                  ? 'border-brand-500 bg-brand-500/10'
                  : affinity
                    ? 'border-emerald-400 hover:bg-slate-100 dark:border-emerald-500 dark:hover:bg-slate-800'
                    : 'border-slate-200 hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800'
              } ${affinity ? 'shadow-[0_0_8px_2px_rgba(52,211,153,0.65)]' : ''}`}
            >
              <PokemonSprite
                speciesId={p.speciesId}
                formId={p.formId}
                shiny={p.isShiny}
                size={56}
              />
              <span className="truncate">
                {species.nameFr} {p.isShiny && <ShinyStar />}
              </span>
              <span className="text-slate-500">
                N.{p.level} · PE {power}
              </span>
              <PokemonTagBadges pokemon={p} tags={tagFilter.tags} />
            </button>
          );
        })}
        {available.length === 0 && (
          <p className="col-span-full text-sm text-slate-500">
            {tagFilter.filter === 'all' && type === 'all' && !search.trim()
              ? `Aucun Pokémon${from} disponible : ils sont occupés, K.O., ou pas encore capturés.`
              : `Aucun Pokémon${from} disponible avec ces filtres.`}
          </p>
        )}
      </div>
      {region && (
        <p className="mt-1 text-xs text-slate-500">
          Seuls les Pokémon du Pokédex de {region.name} peuvent partir.
        </p>
      )}
    </>
  );
}
