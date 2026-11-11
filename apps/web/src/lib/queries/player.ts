import { useMemo } from 'react';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { createGameContext } from '@poke/game-core';
import type { ClaimedRewards, GameContext, PlayerProgress, RewardKind } from '@poke/game-core';
import type {
  ClaimRewardResponse,
  MeResponse,
  PlayerProfileDto,
  PokemonDto,
  ProgressionResponse,
  PublicContentDto,
} from '@poke/shared';
import { ApiError, api } from '../api';
import { useDaycare } from './buildings';
import { useBattles } from './combat';
import { keys } from './keys';
import { usePokedex } from './pokedex';
import { useQuests } from './quests';

/**
 * Le joueur : son compte et son profil, le contenu publié du jeu, son avancement (ce qui
 * débloque onglets, places et régions) et les récompenses déjà réclamées.
 */

/**
 * Profil du joueur (`null` : non connecté). Tous les `useQuery` de `keys.me` partent de ces
 * options : une invalidation relance la requête avec les options du dernier abonné, qui doit
 * donc toujours savoir la charger (un abonné en `skipToken` la faisait échouer).
 */
export const meQuery = queryOptions({
  queryKey: keys.me,
  queryFn: async (): Promise<MeResponse | null> => {
    try {
      return await api<MeResponse>('/api/me');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return null;
      throw err;
    }
  },
});

/** Contenu publié, transformé en contexte `game-core` (affichage uniquement : le serveur décide). */
export function useGameContext(): GameContext | undefined {
  const content = useQuery({
    queryKey: keys.content,
    queryFn: () => api<PublicContentDto>('/api/content'),
    // Le contenu publié ne change qu'à une nouvelle version : `App` le recharge quand le numéro
    // de version renvoyé par `/api/me` ne correspond plus (voir `useContentVersionWatch`).
    staleTime: Infinity,
  });
  return useMemo(
    () => (content.data ? createGameContext(content.data) : undefined),
    [content.data],
  );
}

/**
 * Avancement du joueur pour les déblocages (Pokédex, dresseurs battus, œufs éclos, étapes de
 * quête validées).
 */
export function usePlayerProgress(): PlayerProgress {
  const pokedex = usePokedex();
  const battles = useBattles();
  const daycare = useDaycare();
  const quests = useQuests();
  // Profil du joueur, déjà chargé par l'application : pas de nouvelle requête à l'affichage.
  const me = useQuery({ ...meQuery, refetchOnMount: false });
  const opened = me.data?.profile?.openedRegions;
  return useMemo(
    () => ({
      caughtSpeciesIds: new Set(pokedex.data?.filter((d) => d.caught).map((d) => d.speciesId)),
      defeatedTrainerIds: new Set(
        battles.data?.records.filter((r) => r.wins > 0).map((r) => r.trainerId),
      ),
      eggsHatched: daycare.data?.eggsHatched ?? 0,
      questSteps: new Map(quests.data?.quests.map((q) => [q.questId, q.step])),
      openedRegionIds: new Set(opened),
    }),
    [pokedex.data, battles.data, daycare.data, quests.data, opened],
  );
}

const useProgression = () =>
  useQuery({
    queryKey: keys.progression,
    queryFn: () => api<ProgressionResponse>('/api/progression'),
  });

/** Bonus permanent de chance shiny (récompenses réclamées : complétions…), 1 = aucun. */
export function useShinyBonus(): number {
  return useProgression().data?.bonuses.shiny ?? 1;
}

/** Récompenses de progression déjà réclamées (collections, complétions d'expédition). */
export function useClaimedRewards(): ClaimedRewards {
  const progression = useProgression();
  return useMemo(() => {
    const claims = progression.data?.claims ?? [];
    const ids = (kind: string) =>
      new Set(claims.filter((c) => c.kind === kind).map((c) => c.rewardId));
    return {
      collectionIds: ids('collection'),
      completionIds: ids('completion'),
    };
  }, [progression.data]);
}

// --- Requêtes d'action ---------------------------------------------------------------------

/** Ce que le serveur propose pour se connecter (page de connexion, sans session). */
export const fetchAuthConfig = () =>
  api<{ oauthProviders: string[]; passwordReset: boolean }>('/api/config');

/** Crée le profil du dresseur. */
export const createProfile = (trainerName: string) =>
  api<PlayerProfileDto>('/api/profile', { method: 'POST', json: { trainerName } });

/** Choisit le starter du début de l'aventure. */
export const chooseStarter = (speciesId: number) =>
  api<PokemonDto>('/api/starter', { method: 'POST', json: { speciesId } });

/** Choisit le starter offert à l'arrivée dans une région. */
export const chooseRegionStarter = (regionId: string, speciesId: number) =>
  api<PokemonDto>(`/api/regions/${regionId}/starter`, { method: 'POST', json: { speciesId } });

/** Réclame une récompense de collection ou de complétion. */
export const claimReward = (input: { kind: RewardKind; rewardId: string; targetId?: string }) =>
  api<ClaimRewardResponse>('/api/progression/claim', { method: 'POST', json: input });
