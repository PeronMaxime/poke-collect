import { useQuery } from '@tanstack/react-query';
import type { PurchaseResponse, SellResponse, ShopResponse } from '@poke/shared';
import { api } from '../api';
import { keys } from './keys';

/**
 * La boutique.
 */

export const useShop = () =>
  useQuery({ queryKey: keys.shop, queryFn: () => api<ShopResponse>('/api/shop') });

// --- Requêtes d'action ---------------------------------------------------------------------

/** Marque des articles nouvellement débloqués comme vus. */
export const markShopSeen = (entryIds: string[]) =>
  api('/api/shop/seen', { method: 'POST', json: { entryIds } });

/** Achète `lots` lots d'un article. */
export const purchase = (input: { entryId: string; lots: number }) =>
  api<PurchaseResponse>('/api/shop/purchase', { method: 'POST', json: input });

/** Revend des objets du sac. */
export const sellItem = (input: { itemId: string; quantity: number }) =>
  api<SellResponse>('/api/shop/sell', { method: 'POST', json: input });
