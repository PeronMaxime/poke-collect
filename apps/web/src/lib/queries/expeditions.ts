import { useQuery } from '@tanstack/react-query';
import type { ExpeditionsResponse } from '@poke/shared';
import { api } from '../api';
import { keys } from './keys';

/**
 * Les expéditions du joueur.
 */

export const useExpeditions = () =>
  useQuery({
    queryKey: keys.expeditions,
    queryFn: () => api<ExpeditionsResponse>('/api/expeditions'),
    refetchInterval: 60_000,
  });
