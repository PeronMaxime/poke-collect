/**
 * Les guildes : la sienne, la fiche des autres et leur classement.
 */
import { useQuery } from '@tanstack/react-query';
import type {
  CreateGuildInput,
  GuildJoinMode,
  GuildLeaderboardResponse,
  GuildMessagesResponse,
  GuildProfileResponse,
  GuildRole,
  GuildSearchResponse,
  GuildStateResponse,
} from '@poke/shared';
import { api } from '../api';
import { keys } from './keys';

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

// --- Requêtes d'action ---------------------------------------------------------------------

/** Guildes dont le nom contient la recherche. */
export const searchGuilds = (query: string) =>
  api<GuildSearchResponse>(`/api/guilds?q=${encodeURIComponent(query)}`);

/** Crée une guilde, dont le joueur devient le chef. */
export const createGuild = (input: CreateGuildInput) =>
  api<GuildStateResponse>('/api/guilds', { method: 'POST', json: input });

/** Rejoint une guilde ouverte, ou y candidate (`joined` faux). */
export const joinGuild = (id: string) =>
  api<{ joined: boolean }>(`/api/guilds/${id}/join`, { method: 'POST' });

/** Retire sa candidature à une guilde. */
export const cancelGuildRequest = (id: string) =>
  api(`/api/guilds/${id}/request`, { method: 'DELETE' });

/** Chef ou officier : accepte ou refuse la candidature d'un dresseur. */
export const answerGuildRequest = (trainerName: string, accept: boolean) =>
  api(`/api/guild/requests/${encodeURIComponent(trainerName)}/${accept ? 'accept' : 'decline'}`, {
    method: 'POST',
  });

/** Exclut un membre de sa guilde. */
export const kickGuildMember = (trainerName: string) =>
  api(`/api/guild/members/${encodeURIComponent(trainerName)}/kick`, { method: 'POST' });

/** Change le rôle d'un membre (le nommer chef cède la guilde). */
export const setGuildMemberRole = (trainerName: string, role: GuildRole) =>
  api(`/api/guild/members/${encodeURIComponent(trainerName)}/role`, {
    method: 'POST',
    json: { role },
  });

/** Modifie la description ou le mode d'entrée de sa guilde. */
export const updateGuild = (input: { description?: string; joinMode?: GuildJoinMode }) =>
  api('/api/guild', { method: 'PATCH', json: input });

/** Quitte sa guilde. */
export const leaveGuild = () => api('/api/guild/leave', { method: 'POST' });

/** Derniers messages de la discussion de sa guilde. */
export const fetchGuildMessages = () => api<GuildMessagesResponse>('/api/guild/messages');

/** Écrit dans la discussion de sa guilde. */
export const postGuildMessage = (body: string) =>
  api('/api/guild/messages', { method: 'POST', json: { body } });

/** Supprime un message de la discussion. */
export const deleteGuildMessage = (id: string) =>
  api(`/api/guild/messages/${id}`, { method: 'DELETE' });
