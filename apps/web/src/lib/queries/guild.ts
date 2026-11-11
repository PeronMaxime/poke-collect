import { useQuery } from '@tanstack/react-query';
import type {
  GuildLeaderboardResponse,
  GuildProfileResponse,
  GuildStateResponse,
} from '@poke/shared';
import { api } from '../api';
import { keys } from './keys';

/**
 * Les guildes : la sienne, la fiche des autres et leur classement.
 */

/** Guilde du joueur (membres, quêtes du jour et de la semaine), ou ses candidatures s'il n'en a pas. */
export const useGuild = () =>
  useQuery({
    queryKey: keys.guild,
    queryFn: () => api<GuildStateResponse>('/api/guild'),
    // Garde à jour la présence des membres.
    refetchInterval: 60_000,
  });

/** Fiche publique d'une guilde. */
export const useGuildProfile = (id: string) =>
  useQuery({
    queryKey: [...keys.guild, 'profile', id],
    queryFn: () => api<GuildProfileResponse>(`/api/guilds/${encodeURIComponent(id)}`),
  });

/** Classement des guildes (rafraîchi au plus toutes les minutes). */
export const useGuildLeaderboard = (enabled: boolean) =>
  useQuery({
    queryKey: ['leaderboard', 'guilds'],
    queryFn: () => api<GuildLeaderboardResponse>('/api/guilds/leaderboard'),
    staleTime: 60_000,
    enabled,
  });
