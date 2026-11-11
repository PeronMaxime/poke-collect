import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { isHealing, pokemonEvolutions } from '@poke/game-core';
import type { EvolutionCheck, GameContext } from '@poke/game-core';
import type { CandyDto, PokemonDto, PokemonTagDto, PokemonTeamDto } from '@poke/shared';
import { api } from '../api';
import { useInventory } from './inventory';
import { keys } from './keys';
import { useDexCatches, usePokedexForms } from './pokedex';

/**
 * Les Pokémon du joueur : collection du PC, étiquettes, équipes enregistrées, Bonbons et
 * évolutions possibles.
 */

export const usePokemon = () =>
  useQuery({ queryKey: keys.pokemon, queryFn: () => api<PokemonDto[]>('/api/pokemon') });

/** Étiquettes du joueur, dans leur ordre de création. */
export const useTags = () =>
  useQuery({ queryKey: keys.tags, queryFn: () => api<PokemonTagDto[]>('/api/tags') });

/** Équipes enregistrées du joueur (page « Équipe Pkmn »), dans leur ordre de création. */
export const useTeams = () =>
  useQuery({ queryKey: keys.teams, queryFn: () => api<PokemonTeamDto[]>('/api/teams') });

/** Pokémon engageable : ni occupé, ni K.O., ni en soins (le serveur vérifie de nouveau). */
export const isUsable = (p: PokemonDto, now: number) =>
  !p.busy && !p.knockedOut && !isHealing(p.healUntil, now);

/**
 * Évolutions possibles de chaque Pokémon, avec l'inventaire et l'heure locale (affichage :
 * le serveur vérifie de nouveau).
 */
export function useEvolutionChecker(ctx: GameContext | undefined) {
  const inventory = useInventory();
  const hour = new Date().getHours();
  return useMemo(() => {
    const stock = new Map(inventory.data?.map((i) => [i.itemId, i.quantity]));
    const env = { itemQuantity: (id: string) => stock.get(id) ?? 0, hour };
    return (p: PokemonDto): EvolutionCheck[] => (ctx ? pokemonEvolutions(ctx, p, env) : []);
  }, [ctx, inventory.data, hour]);
}

/**
 * Le Pokémon peut-il évoluer maintenant vers une espèce ou forme qui manque encore au Pokédex ?
 * (pastille « Évol. » du PC et compteur de l'onglet).
 */
export function useNewEvolutionChecker(ctx: GameContext | undefined) {
  const evolutionsOf = useEvolutionChecker(ctx);
  const { caughtSpeciesIds } = useDexCatches();
  const forms = usePokedexForms();
  return useMemo(() => {
    const caughtFormIds = new Set(forms.data?.map((f) => f.formId));
    return (p: PokemonDto) =>
      evolutionsOf(p).some(
        ({ option, method }) =>
          method &&
          (option.toFormId === null
            ? !caughtSpeciesIds.has(option.toSpeciesId)
            : !caughtFormIds.has(option.toFormId)),
      );
  }, [evolutionsOf, caughtSpeciesIds, forms.data]);
}

export const useCandies = () =>
  useQuery({ queryKey: keys.candies, queryFn: () => api<CandyDto[]>('/api/candies') });
