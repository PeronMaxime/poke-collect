/**
 * Modération dans l'admin (routes `/api/admin/moderation/*`) : suspension et renommage d'un
 * joueur, guildes et leur discussion. Chaque action recharge ce qu'elle change et le journal.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AccountSuspensionDto,
  ModerateGuildInput,
  ModerationGuildDetailResponse,
  ModerationGuildDto,
  SuspendAccountInput,
} from '@poke/shared';
import { ApiError, api } from './api';
import { errorMessage } from './content';

const MODERATION_ERRORS: Record<string, string> = {
  CANNOT_SUSPEND_ADMIN: 'Un compte administrateur ne peut pas être suspendu.',
  NOT_FOUND: 'Ce compte n’existe plus.',
  PROFILE_NOT_FOUND: 'Ce joueur n’a pas encore de profil de dresseur.',
  TRAINER_NAME_TAKEN: 'Ce nom de dresseur est déjà pris.',
  GUILD_NAME_TAKEN: 'Ce nom de guilde est déjà pris.',
  GUILD_NOT_FOUND: 'Cette guilde n’existe plus.',
  MESSAGE_NOT_FOUND: 'Ce message a déjà été supprimé.',
};

/** Message lisible d'un refus de la modération (première règle non respectée pour un nom). */
export function moderationError(err: unknown): string {
  if (err instanceof ApiError) {
    const known = MODERATION_ERRORS[err.code];
    if (known) return known;
    const issues = (err.body as { issues?: { message?: string }[] } | null)?.issues;
    if (err.code === 'VALIDATION' && issues?.[0]?.message) return issues[0].message;
  }
  return errorMessage(err);
}

const playerUrl = (userId: string) => `/api/admin/moderation/players/${encodeURIComponent(userId)}`;

/** Recharge la fiche et la liste des joueurs, et le journal, après une action sur un joueur. */
function useRefreshPlayer(userId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [['admin-player', userId], ['admin-players'], ['audit-log']].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
}

/** Suspendre un compte, lever sa suspension, renommer son dresseur. */
export function usePlayerModeration(userId: string) {
  const refresh = useRefreshPlayer(userId);
  const suspend = useMutation({
    mutationFn: (input: SuspendAccountInput) =>
      api<AccountSuspensionDto>(`${playerUrl(userId)}/suspension`, {
        method: 'POST',
        json: input,
      }),
    onSuccess: refresh,
  });
  const lift = useMutation({
    mutationFn: () => api<void>(`${playerUrl(userId)}/suspension`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
  const rename = useMutation({
    mutationFn: (trainerName: string) =>
      api<{ trainerName: string }>(`${playerUrl(userId)}/trainer-name`, {
        method: 'PUT',
        json: { trainerName },
      }),
    onSuccess: refresh,
  });
  return { suspend, lift, rename };
}

/** Guildes dont le nom contient `query` (toutes si vide), les plus récemment actives d'abord. */
export const useModerationGuilds = (query: string) =>
  useQuery({
    queryKey: ['moderation-guilds', query],
    queryFn: () =>
      api<ModerationGuildDto[]>(`/api/admin/moderation/guilds?q=${encodeURIComponent(query)}`),
  });

const guildUrl = (guildId: string) => `/api/admin/moderation/guilds/${guildId}`;

/** Fiche d'une guilde (membres, discussion), ses corrections et la suppression d'un message. */
export function useModerationGuild(guildId: string) {
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ['moderation-guild', guildId],
    queryFn: () => api<ModerationGuildDetailResponse>(guildUrl(guildId)),
  });
  const refresh = () =>
    Promise.all(
      [['moderation-guild', guildId], ['moderation-guilds'], ['audit-log']].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
  const update = useMutation({
    mutationFn: (input: ModerateGuildInput) =>
      api<void>(guildUrl(guildId), { method: 'PATCH', json: input }),
    onSuccess: refresh,
  });
  const deleteMessage = useMutation({
    mutationFn: (messageId: string) =>
      api<void>(`${guildUrl(guildId)}/messages/${messageId}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
  return { detail, update, deleteMessage };
}
