import { useQuery } from '@tanstack/react-query';
import type { ClaimQuestResponse, QuestsResponse } from '@poke/shared';
import { api } from '../api';
import { keys } from './keys';

/**
 * Les quêtes.
 */

/** Quêtes visibles et leur avancement (calculé et enregistré par le serveur). */
export const useQuests = () =>
  useQuery({ queryKey: keys.quests, queryFn: () => api<QuestsResponse>('/api/quests') });

// --- Requêtes d'action ---------------------------------------------------------------------

/** Réclame la récompense d'une quête terminée. */
export const claimQuest = (questId: string) =>
  api<ClaimQuestResponse>(`/api/quests/${questId}/claim`, { method: 'POST' });
