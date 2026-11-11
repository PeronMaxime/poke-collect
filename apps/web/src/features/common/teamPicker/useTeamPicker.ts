/**
 * État du choix d'équipe d'une activité (expédition, combat, donjon) : Pokémon disponibles, tri,
 * filtres, membres choisis et sélection automatique.
 */
import { useState } from 'react';
import type { StatName } from '@poke/data';
import {
  autoTeam,
  computeStats,
  hasAffinity,
  isRegionalSpecies,
  memberPower,
} from '@poke/game-core';
import type { AutoTeamRules, ExpeditionSite, GameContext } from '@poke/game-core';
import type { PokemonDto, PokemonTagDto, PokemonTeamDto } from '@poke/shared';
import { useTagFilterOver } from '../../../components/tags';
import { useNow } from '../../../components/ui';
import { isUsable, usePokemon, useTags, useTeams } from '../../../lib/queries';
import { nameMatcher } from './filters';

/** Tris de la boîte et leur libellé. */
export const SORTS = {
  power: 'PE (plus forts)',
  level: 'Niveau',
  dex: 'N° du Pokédex',
} as const;
/** `stat` : tri par la statistique choisie (proposé dans les combats et donjons). */
export type Sort = keyof typeof SORTS | 'stat';

/** Règles d'une activité, en plus de celles du lieu, pour la sélection automatique. */
export type AutoTeamLimits = Pick<AutoTeamRules, 'forbiddenTypes' | 'maxLevel'>;

/**
 * Choix de l'équipe parmi les Pokémon du joueur : disponibles (du Pokédex de la région du lieu,
 * s'il en a une), triables et filtrables, ceux en affinité signalés ; `members` = les membres
 * choisis, dans l'ordre de sélection. `initialTeam` : équipe préparée à reprendre (lue une fois,
 * à l'ouverture) ; `limits` : règles de l'activité respectées par la sélection automatique
 * (dresseurs).
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
