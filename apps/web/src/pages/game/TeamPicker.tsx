import { useState } from 'react';
import { types } from '@poke/data';
import {
  MAX_MEGAS_PER_TEAM,
  isMegaForm,
  isRegionalSpecies,
  megaCount,
  pokemonPower,
} from '@poke/game-core';
import type { ExpeditionSite, GameContext } from '@poke/game-core';
import type { PokemonDto, PokemonTagDto, PokemonTeamDto } from '@poke/shared';
import { PokemonTagBadges, TagFilterSelect, useTagFilterOver } from '../../components/tags';
import { PokemonSprite, ShinyStar, TypeBadge, useNow } from '../../components/ui';
import { isUsable, usePokemon, useTags, useTeams } from '../../lib/game';
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

/**
 * Un seul Pokémon Méga-Évolué par équipe : une fois l'un choisi, les autres sont grisés.
 * `members` = membres déjà choisis.
 */
export function megaLocked(p: PokemonDto, members: readonly PokemonDto[]): boolean {
  return (
    isMegaForm(p.formId) &&
    !members.some((m) => m.id === p.id) &&
    megaCount(members) >= MAX_MEGAS_PER_TEAM
  );
}

export const MEGA_LOCKED_TITLE = 'Un seul Pokémon Méga-Évolué par équipe';

/**
 * Équipes enregistrées (page « Équipe Pkmn ») : un clic remplace la sélection par les membres
 * d'une équipe qui peuvent partir (`usable`), dans l'ordre de l'équipe et dans la limite de taille.
 */
export function SavedTeamsBar({
  ctx,
  teams,
  pokemon,
  usable,
  maxSize,
  current,
  onPick,
}: {
  ctx: GameContext;
  teams: readonly PokemonTeamDto[];
  /** Pokémon du joueur, pour l'aperçu des équipes au survol. */
  pokemon: readonly PokemonDto[];
  usable: ReadonlySet<string>;
  maxSize: number;
  /** Sélection en cours, pour marquer l'équipe choisie. */
  current: readonly string[];
  onPick: (ids: string[]) => void;
}) {
  const shown = teams.filter((t) => t.pokemonIds.length > 0);
  if (shown.length === 0) return null;
  const byId = new Map(pokemon.map((p) => [p.id, p]));
  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold">Équipes enregistrées</h3>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {shown.map((t) => {
          const ids = t.pokemonIds.filter((id) => usable.has(id)).slice(0, maxSize);
          const missing = t.pokemonIds.length - ids.length;
          const active =
            ids.length > 0 &&
            ids.length === current.length &&
            ids.every((id, i) => current[i] === id);
          const members = t.pokemonIds.flatMap((id) => byId.get(id) ?? []);
          return (
            <div key={t.id} className="group relative">
              <button
                type="button"
                disabled={ids.length === 0}
                onClick={() => onPick(ids)}
                className={`flex flex-col items-start rounded-xl border px-3 py-1.5 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  active
                    ? 'border-brand-500 bg-brand-500 text-white'
                    : 'border-slate-200 bg-white hover:border-brand-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800'
                }`}
              >
                <span className="font-semibold">{t.name}</span>
                <span className={`text-xs ${active ? 'text-white/80' : 'text-slate-500'}`}>
                  {ids.length} Pokémon
                  {missing > 0 && ` · ${missing} indisponible${missing > 1 ? 's' : ''}`}
                </span>
              </button>
              {/* Aperçu au survol : les membres qui ne peuvent pas partir sont grisés. */}
              <div className="pointer-events-none invisible absolute top-full left-0 z-20 mt-1 w-max max-w-[18rem] rounded-xl border border-slate-200 bg-white p-2 opacity-0 shadow-lg transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 dark:border-slate-700 dark:bg-slate-900">
                <div className="flex flex-wrap gap-1">
                  {members.map((p) => {
                    const ok = ids.includes(p.id);
                    return (
                      <span
                        key={p.id}
                        className={`flex w-14 flex-col items-center text-[10px] ${
                          ok ? 'text-slate-600 dark:text-slate-300' : 'opacity-40 grayscale'
                        }`}
                      >
                        <PokemonSprite
                          speciesId={p.speciesId}
                          formId={p.formId}
                          shiny={p.isShiny}
                          size={48}
                        />
                        <span className="max-w-full truncate">
                          {ctx.species(p.speciesId, p.formId)?.nameFr}
                        </span>
                        N.{p.level}
                      </span>
                    );
                  })}
                </div>
                {missing > 0 && (
                  <p className="mt-1 text-[10px] text-slate-500">
                    Grisés : occupés, K.O., hors du Pokédex régional ou en trop.
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
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
  return useTeamPickerOver(
    ctx,
    zone,
    usePokemon().data ?? [],
    useTags().data ?? [],
    useTeams().data ?? [],
  );
}

/** Même choix d'équipe, sur des Pokémon et étiquettes donnés (PC fictif du simulateur de l'admin). */
export function useTeamPickerOver(
  ctx: GameContext,
  zone: ExpeditionSite,
  pokemon: readonly PokemonDto[],
  tags: readonly PokemonTagDto[],
  /** Équipes enregistrées proposées d'un clic (aucune dans le simulateur de l'admin). */
  savedTeams: readonly PokemonTeamDto[] = [],
) {
  const [team, setTeam] = useState<string[]>([]);
  const [sort, setSort] = useState<Sort>('power');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const tagFilter = useTagFilterOver(tags);
  const now = useNow(10_000);
  const matchesName = nameMatcher(search);
  const usablePokemon = pokemon.filter(
    (p) =>
      isUsable(p, now) && (!zone.regionId || isRegionalSpecies(ctx, zone.regionId, p.speciesId)),
  );
  const usable = new Set(usablePokemon.map((p) => p.id));
  const available = usablePokemon
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
    usable,
    savedTeams,
    pokemon,
  };
}

export function TeamPicker({
  ctx,
  zone,
  picker,
  power,
  maxTeamSize = ctx.balance.expeditions.maxTeamSize,
}: {
  ctx: GameContext;
  zone: ExpeditionSite;
  picker: ReturnType<typeof useTeamPicker>;
  /** PE de l'équipe choisie. */
  power: number;
  /** Taille maximale (par défaut, celle des expéditions). */
  maxTeamSize?: number;
}) {
  const {
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
    usable,
    savedTeams,
    pokemon,
  } = picker;
  const region = zone.regionId ? ctx.region(zone.regionId) : undefined;
  const from = region ? ` de ${region.name}` : '';

  function toggle(p: PokemonDto) {
    if (megaLocked(p, members)) return;
    setTeam((t) =>
      t.includes(p.id) ? t.filter((id) => id !== p.id) : t.length < maxTeamSize ? [...t, p.id] : t,
    );
  }

  return (
    <>
      <SavedTeamsBar
        ctx={ctx}
        teams={savedTeams}
        pokemon={pokemon}
        usable={usable}
        maxSize={maxTeamSize}
        current={team}
        onPick={setTeam}
      />
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
        {zone.requiredTypes.length > 0 && (
          <div className="flex w-full flex-wrap items-center gap-1 text-xs">
            <span className="text-slate-500">Types requis :</span>
            {zone.requiredTypes.map((r) => (
              <button
                key={r.type}
                type="button"
                onClick={() => setType(type === r.type ? 'all' : r.type)}
                title={
                  type === r.type
                    ? 'Retirer le filtre'
                    : `N'afficher que les Pokémon de type ${typeLabel(r.type)}`
                }
                className={`rounded-full transition ${
                  type === r.type
                    ? 'ring-2 ring-brand-500 ring-offset-1 dark:ring-offset-slate-900'
                    : 'opacity-70 hover:opacity-100'
                }`}
              >
                <TypeBadge type={r.type} />
              </button>
            ))}
          </div>
        )}
        <span
          className={`text-sm font-medium ${power >= zone.minPower ? 'text-emerald-600' : 'text-red-600'}`}
        >
          PE {power}
          {zone.minPower > 0 && ` / ${zone.minPower}`}
        </span>
      </div>
      <div className="mt-2 grid max-h-64 grid-cols-3 gap-2 overflow-y-auto p-1 sm:grid-cols-5">
        {available.map(({ p, species, power, affinity }) => {
          const selected = team.includes(p.id);
          const locked = megaLocked(p, members);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p)}
              disabled={locked}
              title={locked ? MEGA_LOCKED_TITLE : affinity ? 'Affinité' : undefined}
              className={`relative flex flex-col items-center rounded-xl border p-1 text-xs transition disabled:cursor-not-allowed disabled:opacity-40 disabled:grayscale ${
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
