/**
 * Recherche, filtres et tri de la « boîte » des Pokémon à déposer à la pension.
 */
import { useState } from 'react';
import { checkBreedingPair } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { PokemonDto } from '@poke/shared';
import { useTagFilter } from '../../../components/tags';
import { nameMatcher } from '../../common/teamPicker/filters';
import { usePinnedSelection } from '../../common/teamPicker/useTeamPicker';

/** Filtre par sexe et son libellé. */
export const GENDER_FILTERS = {
  all: 'Tous les sexes',
  male: '♂ Mâles',
  female: '♀ Femelles',
  genderless: 'Asexués',
} as const;
/** Filtre de sexe de la boîte (tous, mâles, femelles…). */
export type GenderFilter = keyof typeof GENDER_FILTERS;

/** Tri de la boîte et son libellé. */
export const SORTS = {
  dex: 'N° du Pokédex',
  level: 'Niveau',
  recent: 'Récents',
  tag: 'Étiquette',
} as const;
/** Tri de la boîte de la pension. */
export type Sort = keyof typeof SORTS;

/**
 * Filtres et tri de la boîte. Le Pokémon choisi (`chosen`) passe en tête au changement de filtre
 * ou de tri, pas au clic. `viewKey` change avec eux : la grille repart alors du début.
 */
export function useBoxFilters(chosen: string | null) {
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
  const viewKey = [
    sort,
    search,
    gender,
    eggGroup,
    onlyShiny,
    favoritesOnly,
    onlyCompatible,
    tagFilter.filter,
  ].join('|');
  return {
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
    pinned,
    filterCount,
    resetFilters,
    viewKey,
  };
}

/**
 * Pokémon de la boîte, filtrés et triés, chacun avec son espèce et sa compatibilité avec le
 * partenaire déjà en pension. Le Pokémon choisi reste visible, quels que soient les filtres.
 */
export function boxEntries(
  ctx: GameContext,
  usable: readonly PokemonDto[],
  partner: PokemonDto | undefined,
  chosen: string | null,
  filters: ReturnType<typeof useBoxFilters>,
) {
  const { tagFilter, search, gender, eggGroup, onlyShiny, favoritesOnly, sort, pinned } = filters;
  const compatibleFilter = !!partner && filters.onlyCompatible;
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
  return available;
}
