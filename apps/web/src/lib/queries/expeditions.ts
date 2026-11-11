import { utcOffsetMinutes } from './clock';
import { useQuery } from '@tanstack/react-query';
import type {
  ClaimExpeditionResponse,
  ExpeditionDto,
  ExpeditionsResponse,
  StartExpeditionInput,
} from '@poke/shared';
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

// --- Requêtes d'action ---------------------------------------------------------------------

/** Lance une expédition. */
export const startExpedition = (input: StartExpeditionInput) =>
  api<ExpeditionDto>('/api/expeditions', {
    method: 'POST',
    json: { ...input, utcOffsetMinutes: utcOffsetMinutes() },
  });

/** Arrête une expédition et récupère ses captures et son butin. */
export const claimExpedition = (id: string) =>
  api<ClaimExpeditionResponse>(`/api/expeditions/${id}/claim`, { method: 'POST' });

/** Annule une expédition : l'équipe revient sans rien. */
export const cancelExpedition = (id: string) =>
  api<void>(`/api/expeditions/${id}/cancel`, { method: 'POST' });

/** Met une zone en favori, ou l'en retire. */
export const setFavoriteZone = (zoneId: string, favorite: boolean) =>
  api<{ favoriteZoneIds: string[] }>(`/api/expeditions/favorites/${zoneId}`, {
    method: 'PUT',
    json: { favorite },
  });
