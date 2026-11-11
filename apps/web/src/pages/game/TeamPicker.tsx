import { useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { AbilityEffect } from '@poke/content';
import { STAT_NAMES, types } from '@poke/data';
import type { StatName } from '@poke/data';
import {
  MAX_MEGAS_PER_TEAM,
  abilityEffectText,
  activityAbilityEffects,
  autoTeam,
  computeStats,
  dungeonTypeEffectiveness,
  effectiveAbility,
  hasAffinity,
  isMegaForm,
  isRegionalSpecies,
  megaCount,
  memberPower,
  possibleAbilityEffects,
} from '@poke/game-core';
import type {
  AbilityEnv,
  AutoTeamRules,
  DungeonMove,
  ExpeditionSite,
  GameContext,
} from '@poke/game-core';
import { searchKey } from '@poke/shared';
import type { PokemonDto, PokemonTagDto, PokemonTeamDto } from '@poke/shared';
import { PokemonTagBadges, TagFilterSelect, useTagFilterOver } from '../../components/tags';
import { ProgressiveItems } from '../../components/ProgressiveGrid';
import {
  HoverBubble,
  PokemonSprite,
  ShinyStar,
  StatLines,
  TypeBadge,
  ViewTabs,
  useNow,
} from '../../components/ui';
import { isUsable, usePokemon, useTags, useTeams } from '../../lib/queries';
import { STAT_LABELS, abilityLabel, speciesName, typeLabel } from '../../lib/labels';
import { CombatTeamOrder, effectivenessLabel } from './CombatTeamOrder';
import type { CombatTarget } from './CombatTeamOrder';
import {
  CrossIcon,
  ExpandableLine,
  PowerGauge,
  SECTION_TITLE,
  SELECTED_CELL,
  SLOT_BADGE,
  SLOT_BUTTON,
  SLOT_CLASS,
  StatusPill,
} from './dialogParts';

const SORTS = {
  power: 'PE (plus forts)',
  level: 'Niveau',
  dex: 'N° du Pokédex',
} as const;
/** `stat` : tri par la statistique choisie (proposé dans les combats et donjons). */
type Sort = keyof typeof SORTS | 'stat';

/** Règles d'une activité, en plus de celles du lieu, pour la sélection automatique. */
export type AutoTeamLimits = Pick<AutoTeamRules, 'forbiddenTypes' | 'maxLevel'>;

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
export function nameMatcher(search: string) {
  const needle = searchKey(search.trim());
  return (name: string) => !needle || searchKey(name).includes(needle);
}

/** Champ de recherche par nom des sélecteurs d'équipe. */
export function NameSearch({
  value,
  onChange,
  className = 'ml-1 w-32 py-0.5 text-xs',
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <input
      type="search"
      className={`input ${className}`}
      placeholder="Rechercher un Pokémon…"
      aria-label="Rechercher par nom"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/**
 * Bouton « Sélection auto » : les plus forts en affinité, puis les plus forts sans affinité
 * (types requis servis d'abord). Grisé sans Pokémon disponible.
 */
export function AutoSelectButton({
  onClick,
  disabled = false,
  className = 'btn-ghost',
  label = '⚡ Sélection auto',
}: {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      disabled={disabled}
      title="Choisir d’un clic les Pokémon les plus forts en affinité, puis les plus forts sans affinité (types requis compris)"
    >
      {label}
    </button>
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
 * Équipes enregistrées (page « Équipe Pkmn »), en onglets : un clic remplace la sélection par les
 * membres d'une équipe qui peuvent partir (`usable`), dans l'ordre de l'équipe et dans la limite
 * de taille. Au survol, l'aperçu de ses membres.
 */
function SavedTeamsBar({
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
    <div className="flex flex-wrap items-center gap-1.5">
      <h3 className={`${SECTION_TITLE} mr-1`}>Équipes</h3>
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
              aria-pressed={active}
              className={`flex items-center gap-1.5 rounded-md border-2 border-ink px-2.5 py-1 text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
                active
                  ? 'bg-brand-500 text-white'
                  : 'bg-white hover:bg-slate-100 dark:bg-slate-700 dark:hover:bg-slate-600'
              }`}
            >
              <span className="font-semibold">{t.name}</span>
              <span
                className={`text-xs ${active ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}
              >
                {ids.length}
                {missing > 0 && ` · ${missing} indisponible${missing > 1 ? 's' : ''}`}
              </span>
            </button>
            {/* Aperçu au survol : les membres qui ne peuvent pas partir sont grisés. */}
            <div className="tile pointer-events-none invisible absolute top-full left-0 z-20 mt-1 w-max max-w-[18rem] p-2 opacity-0 shadow-[3px_3px_0_rgb(0_0_0/0.3)] transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
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
                      <span className="line-clamp-2 w-full text-center leading-tight break-words">
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
/**
 * `initialTeam` : équipe préparée à reprendre (lue une fois, à l'ouverture) ; `limits` : règles
 * de l'activité respectées par la sélection automatique (dresseurs).
 */
export function useTeamPicker(
  ctx: GameContext,
  zone: ExpeditionSite,
  initialTeam?: () => string[],
  limits?: AutoTeamLimits,
) {
  return useTeamPickerOver(
    ctx,
    zone,
    usePokemon().data ?? [],
    useTags().data ?? [],
    useTeams().data ?? [],
    initialTeam,
    limits,
  );
}

/** Rang d'un Pokémon dans la sélection ; les non-sélectionnés viennent après. */
function selectionRank(team: readonly string[], id: string) {
  const i = team.indexOf(id);
  return i === -1 ? team.length : i;
}

/**
 * Sélection à placer en tête de liste : celle du dernier changement de filtre ou de tri
 * (`view`), pour qu'un Pokémon choisi ne saute pas en haut de la liste au clic.
 */
export function usePinnedSelection(team: readonly string[], view: readonly unknown[]) {
  const key = JSON.stringify(view);
  const [pinned, setPinned] = useState({ key, team });
  if (pinned.key !== key) {
    setPinned({ key, team });
    return team;
  }
  return pinned.team;
}

/** Même choix d'équipe, sur des Pokémon et étiquettes donnés (PC fictif du simulateur de l'admin). */

export function useTeamPickerOver(
  ctx: GameContext,
  zone: ExpeditionSite,
  pokemon: readonly PokemonDto[],
  tags: readonly PokemonTagDto[],
  /** Équipes enregistrées proposées d'un clic (aucune dans le simulateur de l'admin). */
  savedTeams: readonly PokemonTeamDto[] = [],
  initialTeam?: () => string[],
  limits: AutoTeamLimits = {},
) {
  const [team, setTeam] = useState<string[]>(() => initialTeam?.() ?? []);
  const [sort, setSort] = useState<Sort>('power');
  const [stat, setStat] = useState<StatName>('attack');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [abilityOnly, setAbilityOnly] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [affinityOnly, setAffinityOnly] = useState(false);
  const tagFilter = useTagFilterOver(tags);
  const pinned = usePinnedSelection(team, [
    sort,
    stat,
    search,
    type,
    abilityOnly,
    favoritesOnly,
    affinityOnly,
    tagFilter.filter,
  ]);
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
        power: memberPower(ctx, p),
        stats: computeStats(species, p),
        affinity: hasAffinity(ctx, p, zone.affinityTypes),
      };
    })
    // Les membres déjà choisis restent visibles, quels que soient les filtres.
    .filter(
      ({ p, species, affinity }) =>
        (tagFilter.matches(p) &&
          matchesName(species.nameFr) &&
          (!favoritesOnly || p.locked) &&
          (!affinityOnly || affinity) &&
          (type === 'all' || species.types.includes(type))) ||
        team.includes(p.id),
    )
    // Les membres choisis passent en tête (dans l'ordre de sélection) au changement de filtre ou de tri.
    .sort(
      (a, b) =>
        selectionRank(pinned, a.p.id) - selectionRank(pinned, b.p.id) ||
        (sort === 'dex'
          ? a.p.speciesId - b.p.speciesId || (a.p.formId ?? 0) - (b.p.formId ?? 0)
          : 0) ||
        (sort === 'level' ? b.p.level - a.p.level : 0) ||
        (sort === 'stat' ? b.stats[stat] - a.stats[stat] : 0) ||
        b.power - a.power,
    );
  const members = team.flatMap((id) => available.find((a) => a.p.id === id)?.p ?? []);
  /** Équipe choisie d'un clic parmi tous les Pokémon disponibles (sans tenir compte des filtres). */
  const autoSelect = (size: number) =>
    setTeam(
      autoTeam(ctx, usablePokemon, {
        size,
        affinityTypes: zone.affinityTypes,
        requiredTypes: zone.requiredTypes,
        minPower: zone.minPower,
        ...limits,
      }),
    );
  const activeFilters =
    Number(tagFilter.filter !== 'all') +
    Number(type !== 'all') +
    Number(search.trim() !== '') +
    Number(abilityOnly) +
    Number(favoritesOnly) +
    Number(affinityOnly);
  const resetFilters = () => {
    tagFilter.setFilter('all');
    setType('all');
    setSearch('');
    setAbilityOnly(false);
    setFavoritesOnly(false);
    setAffinityOnly(false);
  };
  return {
    team,
    setTeam,
    autoSelect,
    activeFilters,
    resetFilters,
    sort,
    setSort,
    stat,
    setStat,
    search,
    setSearch,
    type,
    setType,
    abilityOnly,
    setAbilityOnly,
    favoritesOnly,
    setFavoritesOnly,
    affinityOnly,
    setAffinityOnly,
    tagFilter,
    available,
    members,
    usable,
    savedTeams,
    pokemon,
    limits,
  };
}

/** Filtre allumé ou non de la barre de recherche (♥ Favoris, ✦ Talent actif…). */
export const filterPill = (active: boolean) =>
  `rounded-full border-2 px-2.5 py-0.5 text-sm whitespace-nowrap transition ${
    active
      ? 'border-ink bg-[#48a8e8] font-semibold text-[#10203a]'
      : 'border-well-line text-slate-600 hover:border-slate-400 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
  }`;

/** Pastille verte d'un Pokémon en affinité avec le lieu. */
function AffinityMark({ className = 'size-5' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`grid place-items-center rounded border-2 border-ink bg-emerald-400 ${className}`}
    >
      <svg viewBox="0 0 10 10" className="size-2.5">
        <path d="M5 1L9 7H1z" fill="#10203a" />
      </svg>
    </span>
  );
}

/** Case cochée (✓) ou non (✗) d'une condition de départ. */
function CheckMark({ ok }: { ok: boolean }) {
  return (
    <span
      aria-hidden
      className={`mt-px grid size-[18px] shrink-0 place-items-center rounded border-2 border-ink text-[11px] font-bold ${
        ok
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
          : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
      }`}
    >
      {ok ? '✓' : '✗'}
    </span>
  );
}

/** Case libre de l'équipe. */
function FreeSlot({ n }: { n: number }) {
  return (
    <li className="flex min-h-14 items-center gap-2 rounded-md border-2 border-dashed border-well-line px-1.5 text-sm text-slate-500 dark:text-slate-400">
      <span className="w-5 text-center font-pixel text-[10px]">{n}</span>
      Case libre : touche un Pokémon
    </li>
  );
}

/** Combat : ordre d'entrée et attaque de chaque Pokémon, réglés dans la colonne de l'équipe. */
export interface CombatSetup {
  moves: Readonly<Record<string, DungeonMove>>;
  setMoves: Dispatch<SetStateAction<Record<string, DungeonMove>>>;
  /** Adversaires contre lesquels l'efficacité des attaques est affichée. */
  targets: readonly CombatTarget[];
}

/** Meilleure efficacité des types d'un Pokémon contre l'un des adversaires (null sans adversaire). */
function bestEffectiveness(types: readonly string[], targets: readonly CombatTarget[]) {
  if (targets.length === 0) return null;
  return Math.max(
    ...types.flatMap((t) => targets.map((target) => dungeonTypeEffectiveness(t, target.types))),
  );
}

/**
 * Choix de l'équipe, dans la fenêtre `TeamPickerDialog` : à gauche la « boîte » des Pokémon
 * disponibles (recherche, tri, filtres, équipes enregistrées), à droite l'équipe en cases
 * (en combat : ordre d'entrée et attaques), ses talents actifs et les conditions de départ ;
 * en bas, l'état de l'équipe et Vider · Auto · Valider. Sur téléphone, la boîte et l'équipe
 * passent en onglets.
 */
export function TeamPicker({
  ctx,
  zone,
  picker,
  power,
  maxTeamSize = ctx.balance.expeditions.maxTeamSize,
  statSort = false,
  abilityEnv,
  errors,
  onDone,
  combat,
  affinityHint = 'En affinité avec la zone',
  extra,
}: {
  ctx: GameContext;
  zone: ExpeditionSite;
  picker: ReturnType<typeof useTeamPicker>;
  /** PE de l'équipe choisie. */
  power: number;
  /** Taille maximale (par défaut, celle des expéditions). */
  maxTeamSize?: number;
  /** Propose le tri par statistique et les statistiques au survol (combats, où elles comptent). */
  statSort?: boolean;
  /** Activité de l'équipe : talents qui y agiraient ; son équipe = les membres choisis. */
  abilityEnv: AbilityEnv;
  /** Règles non respectées par l'équipe choisie. */
  errors: readonly string[];
  /** Bouton « Valider ». */
  onDone: () => void;
  /** Combat : ordre d'entrée et attaques dans les cases de l'équipe. */
  combat?: CombatSetup;
  /** Légende du bord vert (Pokémon en affinité). */
  affinityHint?: string;
  /** Contenu ajouté sous la grille (PC fictif du simulateur de l'admin). */
  extra?: ReactNode;
}) {
  const {
    team,
    setTeam,
    autoSelect,
    activeFilters,
    resetFilters,
    sort,
    setSort,
    stat,
    setStat,
    search,
    setSearch,
    type,
    setType,
    abilityOnly,
    setAbilityOnly,
    favoritesOnly,
    setFavoritesOnly,
    affinityOnly,
    setAffinityOnly,
    tagFilter,
    available: candidates,
    members,
    usable,
    savedTeams,
    pokemon,
    limits,
  } = picker;
  const [view, setView] = useState<'box' | 'team'>('box');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [hideBlocked, setHideBlocked] = useState(false);
  const region = zone.regionId ? ctx.region(zone.regionId) : undefined;
  const from = region ? ` de ${region.name}` : '';
  const forbidden = new Set(limits.forbiddenTypes ?? []);
  const maxLevel = limits.maxLevel ?? null;
  const hasLimits = maxLevel !== null || forbidden.size > 0;

  const withInfo = candidates.map((c) => {
    const effects = possibleAbilityEffects(ctx, abilityEnv, c.p);
    const chosen = team.includes(c.p.id);
    // Hors des règles de l'activité (niveau, types) : grisé, sauf s'il est déjà choisi.
    const blocked = chosen
      ? null
      : maxLevel !== null && c.p.level > maxLevel
        ? `Niveau ${c.p.level} : ${maxLevel} maximum ici`
        : c.species.types.some((t) => forbidden.has(t))
          ? 'Type interdit ici'
          : null;
    return {
      ...c,
      activeAbility: effects.length > 0,
      // Seulement les effets qui joueraient ici.
      abilityText: effects.map(abilityEffectText).join(' · '),
      blocked,
      effectiveness: combat ? bestEffectiveness(c.species.types, combat.targets) : null,
    };
  });
  const available = withInfo
    .filter(
      (c) =>
        (!abilityOnly || c.activeAbility || team.includes(c.p.id)) && !(hideBlocked && c.blocked),
    )
    // Les Pokémon hors des règles passent en fin de liste (tri stable : l'ordre choisi reste).
    .sort((a, b) => Number(!!a.blocked) - Number(!!b.blocked));
  const filterCount = activeFilters + Number(hideBlocked);
  const resetAll = () => {
    resetFilters();
    setHideBlocked(false);
  };

  function toggle(p: PokemonDto) {
    if (megaLocked(p, members)) return;
    setTeam((t) =>
      t.includes(p.id) ? t.filter((id) => id !== p.id) : t.length < maxTeamSize ? [...t, p.id] : t,
    );
  }
  const remove = (id: string) => setTeam((t) => t.filter((m) => m !== id));

  // Talents de l'équipe qui agissent ici, par membre.
  const active = activityAbilityEffects(ctx, abilityEnv);
  const effectsOf = (i: number) => active.filter((a) => a.holder === i).map((a) => a.effect);
  const holders = new Set(active.map((a) => a.holder)).size;

  // Conditions remplies (✓), puis règles non respectées (✗, textes de l'activité).
  const memberTypes = members.map((p) => ctx.species(p.speciesId, p.formId)?.types ?? []);
  const met: { key: string; text: ReactNode }[] = [];
  if (members.length > 0) {
    if (zone.minPower > 0 && power >= zone.minPower) {
      met.push({ key: 'power', text: `PE ${power} / ${zone.minPower}` });
    }
    for (const r of zone.requiredTypes) {
      if (memberTypes.filter((t) => t.includes(r.type)).length >= r.count) {
        met.push({
          key: `type-${r.type}`,
          text: (
            <span className="inline-flex items-center gap-1">
              {r.count} × <TypeBadge type={r.type} />
            </span>
          ),
        });
      }
    }
    if (maxLevel !== null && members.every((p) => p.level <= maxLevel)) {
      met.push({ key: 'level', text: `Niveau ${maxLevel} maximum` });
    }
    if (forbidden.size > 0 && !memberTypes.some((t) => t.some((x) => forbidden.has(x)))) {
      met.push({
        key: 'forbidden',
        text: `Sans type ${[...forbidden].map(typeLabel).join(', ')}`,
      });
    }
  }
  const failed = members.length > 0 ? errors : [];
  const status =
    members.length === 0
      ? { tone: 'idle' as const, text: 'Choisis ton équipe' }
      : errors.length > 0
        ? { tone: 'bad' as const, text: errors[0]! }
        : { tone: 'ok' as const, text: 'Équipe prête' };
  const teamTitle = combat ? 'Ordre d’entrée' : 'Ton équipe';
  const sortSelect = (
    <label className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
      Trier
      <select
        className="input w-auto py-1 text-sm"
        value={sort === 'stat' ? `stat:${stat}` : sort}
        onChange={(e) => {
          const value = e.target.value;
          if (value.startsWith('stat:')) {
            setStat(value.slice(5) as StatName);
            setSort('stat');
          } else setSort(value as Sort);
        }}
      >
        {(Object.keys(SORTS) as (keyof typeof SORTS)[]).map((key) => (
          <option key={key} value={key}>
            {SORTS[key]}
          </option>
        ))}
        {statSort && (
          <optgroup label="Statistique">
            {STAT_NAMES.map((s) => (
              <option key={s} value={`stat:${s}`}>
                {STAT_LABELS[s]}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </label>
  );

  return (
    <>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-4 lg:grid lg:grid-cols-[minmax(0,1fr)_23rem] lg:grid-rows-[minmax(0,1fr)] lg:gap-3 lg:overflow-hidden">
        <ViewTabs
          className="mb-3 lg:hidden"
          tabs={[
            { id: 'box', label: 'Pokémon' },
            {
              id: 'team',
              label: combat ? 'Ordre et attaques' : 'Équipe',
              badge: `${members.length}/${maxTeamSize}`,
            },
          ]}
          selected={view}
          onSelect={setView}
        />

        {/* La boîte : Pokémon disponibles. */}
        <div
          className={`flex min-w-0 flex-col gap-2.5 lg:min-h-0 ${view === 'team' ? 'max-lg:hidden' : ''}`}
        >
          {/* Téléphone : l'équipe en mini-cases, toucher l'une ouvre l'onglet de l'équipe. */}
          <div className="tile flex flex-col gap-2 p-2.5 lg:hidden">
            <div className="flex items-center gap-2">
              <h3 className={SECTION_TITLE}>
                Équipe {members.length}/{maxTeamSize}
              </h3>
              {zone.minPower > 0 && (
                <PowerGauge power={power} minPower={zone.minPower} className="min-w-12 flex-1" />
              )}
              <span
                className={`ml-auto text-sm font-bold whitespace-nowrap ${
                  power >= zone.minPower
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                PE {power}
              </span>
            </div>
            <ol className="grid grid-cols-6 gap-1.5">
              {Array.from({ length: maxTeamSize }, (_, i) => {
                const p = members[i];
                return (
                  <li key={p?.id ?? `free-${i}`} className="min-w-0">
                    {p ? (
                      <button
                        type="button"
                        onClick={() => setView('team')}
                        aria-label={`${speciesName(ctx, p.speciesId, p.formId)} : voir l’équipe`}
                        className={`sprite-well relative aspect-square w-full ${p.isShiny ? 'shiny-well' : ''} ${
                          effectsOf(i).length > 0
                            ? 'border-emerald-500 dark:border-emerald-400'
                            : ''
                        }`}
                      >
                        <PokemonSprite
                          speciesId={p.speciesId}
                          formId={p.formId}
                          shiny={p.isShiny}
                          size={48}
                          className="h-auto w-[85%]"
                        />
                        <span className={`${SLOT_BADGE} absolute -top-1.5 -right-1.5`}>
                          {i + 1}
                        </span>
                      </button>
                    ) : (
                      <span className="grid aspect-square w-full place-items-center rounded-md border-2 border-dashed border-well-line font-pixel text-[9px] text-slate-500 dark:text-slate-400">
                        {i + 1}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
            {members.length > 0 && holders > 0 && (
              <p className="truncate text-xs text-emerald-700 dark:text-emerald-400">
                ✦ {holders} talent{holders > 1 ? 's' : ''} actif{holders > 1 ? 's' : ''} :{' '}
                {[...new Set(active.map((a) => a.holder))]
                  .map(
                    (i) => members[i] && speciesName(ctx, members[i].speciesId, members[i].formId),
                  )
                  .join(', ')}
              </p>
            )}
          </div>

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
              <TypeFilterSelect value={type} onChange={setType} className="py-1 text-sm" />
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
                onClick={() => setAbilityOnly(!abilityOnly)}
                title="N'afficher que les Pokémon dont le talent agit ici (lieu, heure, météo, équipiers)"
                aria-pressed={abilityOnly}
                className={filterPill(abilityOnly)}
              >
                ✦ Talent actif
              </button>
              {zone.affinityTypes.length > 0 && (
                <button
                  type="button"
                  onClick={() => setAffinityOnly(!affinityOnly)}
                  title={`N'afficher que les Pokémon en affinité (${zone.affinityTypes
                    .map(typeLabel)
                    .join(', ')})`}
                  aria-pressed={affinityOnly}
                  className={`${filterPill(affinityOnly)} inline-flex items-center gap-1.5`}
                >
                  {combat ? (
                    <span
                      aria-hidden
                      className="inline-block size-3 rounded-sm border-2 border-emerald-500 dark:border-emerald-400"
                    />
                  ) : (
                    <AffinityMark className="size-4" />
                  )}
                  {combat ? 'Efficaces' : 'Affinité'}
                </button>
              )}
              {hasLimits && (
                <button
                  type="button"
                  onClick={() => setHideBlocked(!hideBlocked)}
                  title="Masquer les Pokémon que les règles excluent (niveau, types interdits)"
                  aria-pressed={hideBlocked}
                  className={filterPill(hideBlocked)}
                >
                  {maxLevel !== null && forbidden.size === 0
                    ? `Masquer niv. > ${maxLevel}`
                    : 'Masquer les exclus'}
                </button>
              )}
              {filterCount > 0 && (
                <button
                  type="button"
                  onClick={resetAll}
                  className="text-sm text-brand-600 hover:underline dark:text-brand-400"
                >
                  Effacer les filtres ({filterCount})
                </button>
              )}
              <span className="ml-auto text-sm text-slate-500 dark:text-slate-400">
                {available.length} Pokémon{from}
              </span>
            </div>
            {zone.requiredTypes.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-sm">
                <span className="text-slate-500 dark:text-slate-400">Requis</span>
                {zone.requiredTypes.map((r) => (
                  <button
                    key={r.type}
                    type="button"
                    onClick={() => setType(type === r.type ? 'all' : r.type)}
                    aria-pressed={type === r.type}
                    title={
                      type === r.type
                        ? 'Retirer le filtre'
                        : `N'afficher que les Pokémon de type ${typeLabel(r.type)}`
                    }
                    className={`${filterPill(type === r.type)} inline-flex items-center gap-1 py-0.5 pl-1`}
                  >
                    <TypeBadge type={r.type} />
                    {r.count > 1 && <span>× {r.count}</span>}
                  </button>
                ))}
              </div>
            )}
          </section>

          <SavedTeamsBar
            ctx={ctx}
            teams={savedTeams}
            pokemon={pokemon}
            usable={usable}
            maxSize={maxTeamSize}
            current={team}
            onPick={setTeam}
          />

          <section
            aria-label="Pokémon disponibles"
            className="tile p-1.5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
          >
            <div className="grid grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))] gap-1 sm:grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))]">
              <ProgressiveItems
                items={available}
                resetKey={[
                  sort,
                  stat,
                  search,
                  type,
                  abilityOnly,
                  favoritesOnly,
                  affinityOnly,
                  hideBlocked,
                  tagFilter.filter,
                ].join('|')}
              >
                {({
                  p,
                  species,
                  power,
                  stats,
                  affinity,
                  activeAbility,
                  abilityText,
                  blocked,
                  effectiveness,
                }) => {
                  const index = team.indexOf(p.id);
                  const selected = index >= 0;
                  const mega = megaLocked(p, members);
                  const locked = mega || !!blocked;
                  const eff = effectiveness !== null && effectiveness !== 1 ? effectiveness : null;
                  const card = (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggle(p)}
                      disabled={locked}
                      aria-pressed={selected}
                      title={
                        mega
                          ? MEGA_LOCKED_TITLE
                          : (blocked ??
                            `${selected ? 'Retirer' : 'Ajouter'} ${species.nameFr}${affinity ? ' · en affinité' : ''}${
                              eff !== null ? ` · ${effectivenessLabel(eff)} au mieux` : ''
                            }`)
                      }
                      className={`relative flex w-full min-w-0 flex-col items-center gap-0.5 rounded-md border-2 p-1 text-center transition disabled:cursor-not-allowed ${
                        selected
                          ? SELECTED_CELL
                          : 'border-transparent enabled:hover:border-well-line enabled:hover:bg-well/40'
                      }`}
                    >
                      <span
                        className={`sprite-well size-14 sm:size-16 ${p.isShiny ? 'shiny-well' : ''} ${
                          affinity && !locked
                            ? 'border-emerald-500 ring-2 ring-emerald-500/30 dark:border-emerald-400'
                            : ''
                        } ${locked ? 'opacity-45 grayscale' : ''}`}
                      >
                        <PokemonSprite
                          speciesId={p.speciesId}
                          formId={p.formId}
                          shiny={p.isShiny}
                          size={56}
                          className="h-auto w-[92%]"
                        />
                      </span>
                      <span
                        className={`w-full truncate text-xs font-semibold ${locked ? 'opacity-60' : ''}`}
                      >
                        {species.nameFr} {p.isShiny && <ShinyStar />}
                      </span>
                      <span
                        className={`max-w-full truncate text-[11px] ${
                          blocked
                            ? 'text-red-600 dark:text-red-400'
                            : sort === 'stat'
                              ? 'font-medium text-[#2a78c0] dark:text-[#48a8e8]'
                              : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {blocked && maxLevel !== null && p.level > maxLevel ? (
                          `N.${p.level} · trop haut`
                        ) : blocked ? (
                          'Type interdit'
                        ) : sort === 'stat' ? (
                          `${STAT_LABELS[stat]} ${stats[stat]}`
                        ) : (
                          <>
                            N.{p.level} ·<span className="max-sm:hidden"> PE</span> {power}
                          </>
                        )}
                      </span>
                      {activeAbility && (
                        <span
                          className="w-full truncate text-[10px] text-emerald-700 dark:text-emerald-400"
                          title={abilityText}
                        >
                          ✦ {abilityLabel(effectiveAbility(ctx, p))}
                        </span>
                      )}
                      <PokemonTagBadges pokemon={p} tags={tagFilter.tags} />
                      {selected && (
                        <span className={`${SLOT_BADGE} absolute top-0.5 right-0.5`}>
                          {index + 1}
                        </span>
                      )}
                      {combat
                        ? eff !== null &&
                          !locked && (
                            <span
                              className={`absolute top-0.5 left-0.5 rounded border-2 border-ink px-1 text-[11px] leading-4 font-bold ${
                                eff > 1
                                  ? 'bg-emerald-400 text-[#10203a]'
                                  : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                              }`}
                            >
                              {effectivenessLabel(eff)}
                            </span>
                          )
                        : affinity &&
                          !locked && <AffinityMark className="absolute top-0.5 left-0.5 size-5" />}
                    </button>
                  );
                  return statSort ? (
                    <HoverBubble
                      key={p.id}
                      className="grid"
                      focusable={false}
                      height={140}
                      content={<StatLines values={stats} total={power} />}
                    >
                      {card}
                    </HoverBubble>
                  ) : (
                    card
                  );
                }}
              </ProgressiveItems>
              {available.length === 0 && (
                <p className="col-span-full p-3 text-sm text-slate-500 dark:text-slate-400">
                  {filterCount === 0 ? (
                    `Aucun Pokémon${from} disponible : ils sont occupés, K.O., ou pas encore capturés.`
                  ) : (
                    <>
                      Aucun Pokémon{from} disponible avec ces filtres.{' '}
                      <button
                        type="button"
                        onClick={resetAll}
                        className="text-brand-600 hover:underline dark:text-brand-400"
                      >
                        Effacer les filtres
                      </button>
                    </>
                  )}
                </p>
              )}
            </div>
            {extra}
          </section>

          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            {zone.affinityTypes.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                {combat ? (
                  <span
                    aria-hidden
                    className="inline-block size-3.5 rounded border-2 border-emerald-500 dark:border-emerald-400"
                  />
                ) : (
                  <AffinityMark className="size-4" />
                )}
                {affinityHint}
              </span>
            )}
            {combat && (
              <span>
                <b className="text-emerald-600 dark:text-emerald-400">×2</b> /{' '}
                <b className="text-red-600 dark:text-red-400">×½</b> : meilleure efficacité
              </span>
            )}
            <span>
              <b className="text-emerald-600 dark:text-emerald-400">✦</b> talent qui agit ici
            </span>
            {statSort && <span className="max-sm:hidden">Statistiques au survol</span>}
            {region && <span>Pokédex de {region.name} seulement</span>}
          </p>
        </div>

        {/* L'équipe (en combat : ordre d'entrée et attaques), ses talents, ses conditions. */}
        <aside
          className={`tile flex min-w-0 flex-col gap-2.5 p-3 lg:min-h-0 ${view === 'box' ? 'max-lg:hidden' : ''}`}
        >
          <div className="flex items-center gap-2">
            <h3 className={SECTION_TITLE}>
              {teamTitle} {members.length} / {maxTeamSize}
            </h3>
            <span
              className={`ml-auto text-sm font-bold whitespace-nowrap ${
                zone.minPower === 0
                  ? 'text-slate-600 dark:text-slate-300'
                  : power >= zone.minPower
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
              }`}
            >
              PE {power}
              {zone.minPower > 0 && ` / ${zone.minPower}`}
            </span>
          </div>
          {zone.minPower > 0 && <PowerGauge power={power} minPower={zone.minPower} />}
          {combat && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Le n° 1 entre en premier ; au K.O., le suivant prend le relais. Choisis l’attaque de
              chacun : un de ses types, physique ou spéciale.
            </p>
          )}
          <ol className="flex flex-col gap-1.5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            {combat ? (
              <CombatTeamOrder
                ctx={ctx}
                members={members}
                effectsOf={effectsOf}
                moves={combat.moves}
                setMoves={combat.setMoves}
                setTeam={setTeam}
                targets={combat.targets}
              />
            ) : (
              members.map((p, i) => (
                <TeamSlotRow
                  key={p.id}
                  ctx={ctx}
                  pokemon={p}
                  n={i + 1}
                  effects={effectsOf(i)}
                  onRemove={() => remove(p.id)}
                />
              ))
            )}
            {Array.from({ length: Math.max(0, maxTeamSize - members.length) }, (_, i) => (
              <FreeSlot key={`free-${i}`} n={members.length + i + 1} />
            ))}
          </ol>
          {members.length > 0 && (
            <p className="text-sm font-semibold">
              {holders > 0 ? (
                <span className="text-emerald-700 dark:text-emerald-400">
                  ✦ {holders} talent{holders > 1 ? 's' : ''} actif{holders > 1 ? 's' : ''}
                  <span className="font-normal text-slate-500 dark:text-slate-400">
                    {' '}
                    · détail au survol des cases
                  </span>
                </span>
              ) : (
                <span className="font-normal text-slate-500 dark:text-slate-400">
                  Aucun talent de l’équipe n’agit ici.
                </span>
              )}
            </p>
          )}
          {(met.length > 0 || failed.length > 0) && (
            <div className="border-t-2 border-well-line pt-2.5">
              <h3 className={SECTION_TITLE}>Conditions</h3>
              <ul className="mt-1.5 space-y-1 text-sm">
                {met.map((m) => (
                  <li key={m.key} className="flex items-start gap-2">
                    <CheckMark ok />
                    {m.text}
                  </li>
                ))}
                {failed.map((e) => (
                  <li
                    key={e}
                    className="flex items-start gap-2 font-medium text-red-600 dark:text-red-400"
                  >
                    <CheckMark ok={false} />
                    {e}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t-[3px] border-ink bg-tile px-3 py-2.5 sm:px-4">
        <StatusPill tone={status.tone} text={status.text} />
        <span className="hidden min-w-0 flex-1 truncate text-sm text-slate-600 sm:block dark:text-slate-300">
          {members.length > 0 &&
            (combat
              ? `${members.length} Pokémon · ${speciesName(ctx, members[0]!.speciesId, members[0]!.formId)} entre en premier`
              : `${members.length} Pokémon · PE ${power}`)}
        </span>
        <div className="grid w-full grid-cols-[auto_auto_minmax(0,1fr)] gap-2 sm:flex sm:w-auto">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setTeam([])}
            disabled={team.length === 0}
          >
            Vider
          </button>
          <AutoSelectButton
            onClick={() => autoSelect(maxTeamSize)}
            disabled={usable.size === 0}
            label="⚡ Auto"
          />
          <button type="button" className="btn-primary px-6" onClick={onDone}>
            Valider
          </button>
        </div>
      </footer>
    </>
  );
}

/**
 * Case d'un membre de l'équipe (expédition) : numéro, sprite, niveau et PE, puis son talent avec
 * l'effet qu'il a ici (coupé, en entier au survol), et le bouton pour le retirer.
 */
function TeamSlotRow({
  ctx,
  pokemon: p,
  n,
  effects,
  onRemove,
}: {
  ctx: GameContext;
  pokemon: PokemonDto;
  n: number;
  /** Effets de son talent qui agissent ici. */
  effects: readonly AbilityEffect[];
  onRemove: () => void;
}) {
  const name = speciesName(ctx, p.speciesId, p.formId);
  const ability = abilityLabel(effectiveAbility(ctx, p));
  const effectText = effects.map(abilityEffectText).join(' · ');
  return (
    <li
      className={`${SLOT_CLASS} grid min-h-14 grid-cols-[1.25rem_3.25rem_minmax(0,1fr)_auto] items-center gap-2 p-1.5 ${
        effects.length > 0 ? 'border-emerald-500 dark:border-emerald-400' : 'border-well-line'
      }`}
    >
      <span className="text-center font-pixel text-[10px] text-slate-500 dark:text-slate-400">
        {n}
      </span>
      <span className={`sprite-well size-13 ${p.isShiny ? 'shiny-well' : ''}`}>
        <PokemonSprite speciesId={p.speciesId} formId={p.formId} shiny={p.isShiny} size={48} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-semibold">
          {name} {p.isShiny && <ShinyStar />}{' '}
          <span className="font-normal text-slate-500 dark:text-slate-400">
            N.{p.level} · PE {memberPower(ctx, p)}
          </span>
        </span>
        {effects.length > 0 ? (
          <ExpandableLine
            className="text-xs text-emerald-700 dark:text-emerald-400"
            title={`${name} · ${ability} : ${effectText}`}
          >
            ✦ {ability} : {effectText}
          </ExpandableLine>
        ) : (
          <span className="truncate text-xs text-slate-500 dark:text-slate-400">
            {ability} · n’agit pas ici
          </span>
        )}
      </span>
      <button
        type="button"
        className={SLOT_BUTTON}
        onClick={onRemove}
        aria-label={`Retirer ${name}`}
      >
        <CrossIcon className="size-2.5" />
      </button>
    </li>
  );
}
