import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ASSISTANT_POST_PLACES, facilityPlaces, isHealing } from '@poke/game-core';
import type { AssistantPost, GameContext, PlayerProgress } from '@poke/game-core';
import type {
  AssignAssistantInput,
  AssistantDto,
  BagEggDto,
  BerryPlotDto,
  CollectEggsInput,
  CollectEggsResponse,
  DaycareResponse,
  FarmResponse,
  FossilRevivalDto,
  HarvestBerriesResponse,
  HatchEggsResponse,
  IncubateEggsResponse,
  MuseumResponse,
  PlantBerryInput,
  PokemonDto,
  ReviveFossilsResponse,
  SetDaycareParentInput,
} from '@poke/shared';
import { api } from '../api';
import { useInventory } from './inventory';
import { keys, refresh } from './keys';

/**
 * Les bâtiments : Pension et couveuses, Musée, Ferme à baies, Centre Pokémon, et leurs
 * assistants.
 */

export const useDaycare = () =>
  useQuery({ queryKey: keys.daycare, queryFn: () => api<DaycareResponse>('/api/daycare') });

export const useMuseum = () =>
  useQuery({ queryKey: keys.museum, queryFn: () => api<MuseumResponse>('/api/museum') });

export const useFarm = () =>
  useQuery({ queryKey: keys.farm, queryFn: () => api<FarmResponse>('/api/farm') });

/** Assistants de la Pension, de la couveuse, du Musée, du Centre Pokémon et de la ferme. */
export const useAssistants = () =>
  useQuery({ queryKey: keys.assistants, queryFn: () => api<AssistantDto[]>('/api/assistants') });

/**
 * Centre Pokémon : Pokémon en soins (par fin de soins), Pokémon K.O. qui attendent et places
 * libres (affichage : le serveur vérifie de nouveau).
 */
export function centerState(
  ctx: GameContext,
  pokemon: readonly PokemonDto[],
  now: number,
  progress: PlayerProgress,
) {
  const healing = pokemon
    .filter((p) => isHealing(p.healUntil, now))
    .sort((a, b) => Date.parse(a.healUntil!) - Date.parse(b.healUntil!));
  const knockedOut = pokemon.filter((p) => p.knockedOut);
  const slots = facilityPlaces(ctx, 'center', progress);
  const takenOpen = healing.filter((p) => (p.healSlot ?? 0) < slots).length;
  return { slots, healing, knockedOut, free: slots - takenOpen };
}

/**
 * Places à afficher : ouvertes, plus celles encore occupées au-delà (réglage baissé), pour que le
 * joueur puisse toujours les récupérer.
 */
export const shownPlaces = (open: number, taken: readonly number[]) =>
  Math.max(open, ...taken.map((place) => place + 1));

/** Première place couverte par chaque assistant d'un poste (voir `shownPlaces`). */
export const assistantPlaces = (
  assistants: readonly AssistantDto[] | undefined,
  post: AssistantPost,
) =>
  (assistants ?? [])
    .filter((a) => a.post === post)
    .map((a) => a.slot * ASSISTANT_POST_PLACES[post]);

/** Envoie des Pokémon K.O. au Centre Pokémon. */
export function useHeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pokemonIds: string[]) =>
      api<PokemonDto[]>('/api/center', { method: 'POST', json: { pokemonIds } }),
    onSuccess: () => refresh(queryClient, keys.pokemon),
  });
}

/** Rappels du sac (objets `revive`), avec leur quantité. */
export function useReviveStacks(ctx: GameContext) {
  const inventory = useInventory();
  return (inventory.data ?? []).filter((s) => s.quantity > 0 && ctx.itemEffect(s.itemId, 'revive'));
}

/** Ranime des Pokémon K.O. avec un Rappel chacun. */
export function useRevive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { itemId: string; pokemonIds: string[] }) =>
      api<PokemonDto[]>('/api/center/revive', { method: 'POST', json: input }),
    onSuccess: () => refresh(queryClient, keys.pokemon, keys.inventory),
  });
}

// --- Requêtes d'action ---------------------------------------------------------------------

/** Place un Pokémon comme assistant d'un bâtiment. */
export const assignAssistant = (post: AssistantPost, slot: number, input: AssignAssistantInput) =>
  api<AssistantDto>(`/api/assistants/${post}/${slot}`, { method: 'PUT', json: input });

/** Retire l'assistant d'une place. */
export const removeAssistant = (post: AssistantPost, slot: number) =>
  api(`/api/assistants/${post}/${slot}`, { method: 'DELETE' });

/** Ramasse les œufs d'une pension, vers les couveuses ou vers le sac. */
export const collectEggs = (slot: number, to: CollectEggsInput['to']) =>
  api<CollectEggsResponse>(`/api/daycare/${slot}/collect`, { method: 'POST', json: { to } });

/** Dépose (ou remplace) un parent d'une pension. */
export const setDaycareParent = (slot: number, side: 0 | 1, input: SetDaycareParentInput) =>
  api<CollectEggsResponse>(`/api/daycare/${slot}/parents/${side}`, { method: 'PUT', json: input });

/** Retire un parent d'une pension : ses œufs prêts sont ramassés, son XP versée. */
export const withdrawDaycareParent = (slot: number, side: 0 | 1) =>
  api<CollectEggsResponse>(`/api/daycare/${slot}/parents/${side}`, { method: 'DELETE' });

/** Fait éclore tous les œufs prêts. */
export const hatchEggs = () => api<HatchEggsResponse>('/api/eggs/hatch', { method: 'POST' });

/** Place des œufs du sac en couveuse. */
export const incubateEggs = (ids: string[]) =>
  api<IncubateEggsResponse>('/api/eggs/incubate', { method: 'POST', json: { ids } });

/** Range dans le sac un œuf en couveuse. */
export const withdrawEgg = (id: string) => api<BagEggDto>(`/api/eggs/${id}`, { method: 'DELETE' });

/** Dépose un fossile du sac au Musée. */
export const depositFossil = (itemId: string) =>
  api<FossilRevivalDto>('/api/museum', { method: 'POST', json: { itemId } });

/** Reprend un fossile déposé au Musée. */
export const withdrawFossil = (id: string) =>
  api<FossilRevivalDto>(`/api/museum/${id}`, { method: 'DELETE' });

/** Récupère les Pokémon des fossiles restaurés. */
export const reviveFossils = () =>
  api<ReviveFossilsResponse>('/api/museum/revive', { method: 'POST' });

/** Plante une baie sur une parcelle. */
export const plantBerry = (input: PlantBerryInput) =>
  api<BerryPlotDto>('/api/farm', { method: 'POST', json: input });

/** Arrache ce qui pousse sur une parcelle. */
export const uprootBerry = (plot: number) =>
  api<BerryPlotDto>(`/api/farm/${plot}`, { method: 'DELETE' });

/** Récolte une parcelle, ou toutes les baies mûres sans `plot`. */
export const harvestBerries = (plot?: number) =>
  api<HarvestBerriesResponse>(
    plot === undefined ? '/api/farm/harvest' : `/api/farm/${plot}/harvest`,
    { method: 'POST' },
  );
