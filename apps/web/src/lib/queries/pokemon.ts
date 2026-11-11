import { utcOffsetMinutes } from './clock';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { isHealing, pokemonEvolutions } from '@poke/game-core';
import type { EvolutionCheck, GameContext } from '@poke/game-core';
import type {
  CandyDto,
  EvolveResponse,
  MegaEvolveInput,
  PokemonDto,
  PokemonTagDto,
  PokemonTeamDto,
  ReleaseLegendaryResponse,
  TagInput,
  TeamInput,
  TransferPokemonResponse,
  UseItemInput,
  UseItemResponse,
} from '@poke/shared';
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

// --- Requêtes d'action ---------------------------------------------------------------------

/** Verrouille ou déverrouille un Pokémon, ou change ses étiquettes. */
export const updatePokemon = (id: string, patch: { locked?: boolean; tagIds?: string[] }) =>
  api<PokemonDto>(`/api/pokemon/${id}`, { method: 'PATCH', json: patch });

/** Transfère des Pokémon contre des Bonbons (au plus `TRANSFER_BATCH_MAX` par requête). */
export const transferPokemon = (ids: string[]) =>
  api<TransferPokemonResponse>('/api/pokemon/transfer', { method: 'POST', json: { ids } });

/** Fait évoluer un Pokémon vers l'espèce (et la forme) choisie. */
export const evolvePokemon = (
  id: string,
  target: { toSpeciesId: number; toFormId: number | null },
) =>
  api<EvolveResponse>(`/api/pokemon/${id}/evolve`, {
    method: 'POST',
    json: { ...target, utcOffsetMinutes: utcOffsetMinutes() },
  });

/** Méga-Évolution au PC, avec une Méga-Gemme du sac. */
export const megaEvolvePokemon = (id: string, input: MegaEvolveInput) =>
  api<EvolveResponse>(`/api/pokemon/${id}/mega`, { method: 'POST', json: input });

/** Annule la Méga-Évolution : la gemme revient dans le sac. */
export const revertMegaEvolution = (id: string) =>
  api<PokemonDto>(`/api/pokemon/${id}/mega`, { method: 'DELETE' });

/** Donne `count` niveaux à un Pokémon avec les Bonbons de sa lignée. */
export const giveCandies = (id: string, count: number) =>
  api<PokemonDto>(`/api/pokemon/${id}/candies`, { method: 'POST', json: { count } });

/** Utilise un objet du sac sur un Pokémon. */
export const applyItem = (id: string, input: UseItemInput) =>
  api<UseItemResponse>(`/api/pokemon/${id}/use-item`, { method: 'POST', json: input });

/** Relâche un Pokémon légendaire : sa quête peut reprendre. */
export const releaseLegendary = (id: string) =>
  api<ReleaseLegendaryResponse>(`/api/pokemon/${id}/release`, { method: 'POST' });

/** Crée une étiquette (`id` null) ou la modifie. */
export const saveTag = (id: string | null, input: TagInput) =>
  id
    ? api<PokemonTagDto>(`/api/tags/${id}`, { method: 'PUT', json: input })
    : api<PokemonTagDto>('/api/tags', { method: 'POST', json: input });

/** Supprime une étiquette. */
export const deleteTag = (id: string) => api<void>(`/api/tags/${id}`, { method: 'DELETE' });

/** Crée une équipe enregistrée (`id` absent) ou la modifie. */
export const saveTeam = (id: string | null | undefined, input: TeamInput) =>
  api<PokemonTeamDto>(id ? `/api/teams/${id}` : '/api/teams', {
    method: id ? 'PUT' : 'POST',
    json: input,
  });

/** Supprime une équipe enregistrée. */
export const deleteTeam = (id: string) => api(`/api/teams/${id}`, { method: 'DELETE' });
