import { useQuery } from '@tanstack/react-query';
import type { ShopResponse } from '@poke/shared';
import { api } from '../api';
import { keys } from './keys';

/**
 * La boutique.
 */

export const useShop = () =>
  useQuery({ queryKey: keys.shop, queryFn: () => api<ShopResponse>('/api/shop') });
