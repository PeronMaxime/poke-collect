import { useQuery } from '@tanstack/react-query';
import type { QuestsResponse } from '@poke/shared';
import { api } from '../api';
import { keys } from './keys';

/**
 * Les quêtes.
 */

/** Quêtes visibles et leur avancement (calculé et enregistré par le serveur). */
export const useQuests = () =>
  useQuery({ queryKey: keys.quests, queryFn: () => api<QuestsResponse>('/api/quests') });
