import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  charmMultiplier,
  createGameContext,
  isKnockedOut,
  pokemonEvolutions,
} from '@poke/game-core';
import type {
  ClaimedRewards,
  DexCatches,
  EvolutionCheck,
  GameContext,
  PlayerProgress,
} from '@poke/game-core';
import type {
  BattlesResponse,
  CandyDto,
  DaycareResponse,
  ExpeditionsResponse,
  InventoryEntryDto,
  PokedexEntryDto,
  PokemonDto,
  ProgressionResponse,
  PublicContentDto,
  ShopResponse,
} from '@poke/shared';
import { api } from './api';

/** Clés TanStack Query de l'état du joueur (invalidées après chaque action). */
export const keys = {
  content: ['content'],
  pokemon: ['pokemon'],
  pokedex: ['pokedex'],
  inventory: ['inventory'],
  expeditions: ['expeditions'],
  daycare: ['daycare'],
  candies: ['candies'],
  battles: ['battles'],
  shop: ['shop'],
  progression: ['progression'],
  /** Profil (argent) : voir `App`. */
  me: ['me'],
} as const;

export const PLAYER_STATE_KEYS = [
  keys.pokemon,
  keys.pokedex,
  keys.inventory,
  keys.expeditions,
  keys.daycare,
  keys.candies,
  keys.battles,
  keys.shop,
  keys.progression,
  keys.me,
];

/** Contenu publié, transformé en contexte `game-core` (affichage uniquement : le serveur décide). */
export function useGameContext(): GameContext | undefined {
  const content = useQuery({
    queryKey: keys.content,
    queryFn: () => api<PublicContentDto>('/api/content'),
    staleTime: 5 * 60_000,
  });
  return useMemo(
    () => (content.data ? createGameContext(content.data) : undefined),
    [content.data],
  );
}

export const usePokemon = () =>
  useQuery({ queryKey: keys.pokemon, queryFn: () => api<PokemonDto[]>('/api/pokemon') });

export const usePokedex = () =>
  useQuery({ queryKey: keys.pokedex, queryFn: () => api<PokedexEntryDto[]>('/api/pokedex') });

export const useInventory = () =>
  useQuery({
    queryKey: keys.inventory,
    queryFn: () => api<InventoryEntryDto[]>('/api/inventory'),
  });

export const useExpeditions = () =>
  useQuery({
    queryKey: keys.expeditions,
    queryFn: () => api<ExpeditionsResponse>('/api/expeditions'),
  });

export const useDaycare = () =>
  useQuery({ queryKey: keys.daycare, queryFn: () => api<DaycareResponse>('/api/daycare') });

export const useBattles = () =>
  useQuery({ queryKey: keys.battles, queryFn: () => api<BattlesResponse>('/api/battles') });

export const useShop = () =>
  useQuery({ queryKey: keys.shop, queryFn: () => api<ShopResponse>('/api/shop') });

/** Avancement du joueur pour les déblocages (Pokédex, dresseurs battus, œufs éclos). */
export function usePlayerProgress(): PlayerProgress {
  const pokedex = usePokedex();
  const battles = useBattles();
  const daycare = useDaycare();
  return useMemo(
    () => ({
      caughtSpeciesIds: new Set(pokedex.data?.filter((d) => d.caught).map((d) => d.speciesId)),
      defeatedTrainerIds: new Set(
        battles.data?.records.filter((r) => r.wins > 0).map((r) => r.trainerId),
      ),
      eggsHatched: daycare.data?.eggsHatched ?? 0,
    }),
    [pokedex.data, battles.data, daycare.data],
  );
}

/** Pokédex normal et shiny (paliers et collections). */
export function useDexCatches(): Required<DexCatches> {
  const pokedex = usePokedex();
  return useMemo(
    () => ({
      caughtSpeciesIds: new Set(pokedex.data?.filter((d) => d.caught).map((d) => d.speciesId)),
      caughtShinySpeciesIds: new Set(
        pokedex.data?.filter((d) => d.caughtShiny).map((d) => d.speciesId),
      ),
    }),
    [pokedex.data],
  );
}

/** Multiplicateur du Charme Chroma possédé (1 = aucun). */
export function useShinyCharm(ctx: GameContext | undefined): number {
  const inventory = useInventory();
  return useMemo(
    () =>
      ctx
        ? charmMultiplier(
            ctx,
            (inventory.data ?? []).filter((i) => i.quantity > 0).map((i) => i.itemId),
          )
        : 1,
    [ctx, inventory.data],
  );
}

/** Pokémon engageable : ni occupé, ni K.O. (le serveur vérifie de nouveau). */
export const isUsable = (p: PokemonDto, now: number) => !p.busy && !isKnockedOut(p.koUntil, now);

export const useProgression = () =>
  useQuery({
    queryKey: keys.progression,
    queryFn: () => api<ProgressionResponse>('/api/progression'),
  });

/** Récompenses de progression déjà réclamées (paliers, collections). */
export function useClaimedRewards(): ClaimedRewards {
  const progression = useProgression();
  return useMemo(() => {
    const claims = progression.data?.claims ?? [];
    const ids = (kind: string) =>
      new Set(claims.filter((c) => c.kind === kind).map((c) => c.rewardId));
    return { milestoneIds: ids('milestone'), collectionIds: ids('collection') };
  }, [progression.data]);
}

/** Décalage de l'heure locale par rapport à UTC, envoyé au serveur (évolutions jour / nuit). */
export const utcOffsetMinutes = () => -new Date().getTimezoneOffset();

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

export const useCandies = () =>
  useQuery({ queryKey: keys.candies, queryFn: () => api<CandyDto[]>('/api/candies') });

/** Décalage entre l'horloge du serveur et celle du navigateur (comptes à rebours justes). */
export function serverOffset(data: { serverTime: string } | undefined, updatedAt: number) {
  return data ? Date.parse(data.serverTime) - updatedAt : 0;
}
