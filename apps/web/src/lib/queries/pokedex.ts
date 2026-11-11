import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DexCatches } from '@poke/game-core';
import type { PokedexEntryDto, PokedexFormEntryDto } from '@poke/shared';
import { api } from '../api';
import { keys } from './keys';

/**
 * Le Pokédex du joueur : espèces et formes vues ou capturées.
 */

export const usePokedex = () =>
  useQuery({ queryKey: keys.pokedex, queryFn: () => api<PokedexEntryDto[]>('/api/pokedex') });

/** Formes vues et capturées du Pokédex. */
export const usePokedexForms = () =>
  useQuery({
    queryKey: [...keys.pokedex, 'forms'],
    queryFn: () => api<PokedexFormEntryDto[]>('/api/pokedex/forms'),
  });

/** Pokédex normal et shiny et formes capturées (collections, complétions d'expédition). */
export function useDexCatches(): Required<DexCatches> {
  const pokedex = usePokedex();
  const forms = usePokedexForms();
  return useMemo(
    () => ({
      caughtSpeciesIds: new Set(pokedex.data?.filter((d) => d.caught).map((d) => d.speciesId)),
      caughtShinySpeciesIds: new Set(
        pokedex.data?.filter((d) => d.caughtShiny).map((d) => d.speciesId),
      ),
      caughtFormIds: new Set(forms.data?.map((f) => f.formId)),
      caughtShinyFormIds: new Set(forms.data?.filter((f) => f.caughtShiny).map((f) => f.formId)),
    }),
    [pokedex.data, forms.data],
  );
}

/** Pokédex indexé : entrée par espèce, entrée par forme, quantité par objet du sac. */
export function useDexIndex() {
  const pokedex = usePokedex();
  const forms = usePokedexForms();
  return useMemo(
    () => ({
      bySpecies: new Map((pokedex.data ?? []).map((e) => [e.speciesId, e])),
      byForm: new Map((forms.data ?? []).map((f) => [f.formId, f])),
    }),
    [pokedex.data, forms.data],
  );
}

/**
 * Repère, au fil d'une liste de Pokémon obtenus, le premier de chaque espèce ou forme (régionale,
 * Méga…) nouvelle au Pokédex, pour n'afficher « Nouveau ! » qu'une fois.
 */
export function newInDexTracker(dex: { newSpeciesIds: number[]; newFormIds?: number[] }) {
  const species = new Set(dex.newSpeciesIds);
  const forms = new Set(dex.newFormIds ?? []);
  return (p: { speciesId: number; formId?: number | null }) => {
    if (p.formId != null && forms.delete(p.formId)) {
      species.delete(p.speciesId);
      return true;
    }
    return species.delete(p.speciesId);
  };
}
