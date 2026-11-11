import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { charmMultiplier } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { InventoryEntryDto } from '@poke/shared';
import { api } from '../api';
import { keys } from './keys';

/**
 * Le Sac du joueur.
 */

// Les Balls des expéditions en cours sont retirées du sac au fil des rencontres : sac et
// expéditions se rechargent régulièrement pour suivre le stock.
export const useInventory = () =>
  useQuery({
    queryKey: keys.inventory,
    queryFn: () => api<InventoryEntryDto[]>('/api/inventory'),
    refetchInterval: 60_000,
  });

/** Quantité possédée de chaque objet du sac (0 si absent). */
export function useItemQuantities(): (itemId: string) => number {
  const inventory = useInventory();
  return useMemo(() => {
    const stock = new Map((inventory.data ?? []).map((i) => [i.itemId, i.quantity]));
    return (itemId: string) => stock.get(itemId) ?? 0;
  }, [inventory.data]);
}

/** Multiplicateur du Charme Chroma possédé (1 = aucun). */
export function useShinyCharm(ctx: GameContext | undefined): number {
  const inventory = useInventory();
  return useMemo(
    () =>
      ctx
        ? charmMultiplier(
            ctx,
            (inventory.data ?? []).filter((i) => i.quantity > 0).map((i) => i.itemId),
          )
        : 1,
    [ctx, inventory.data],
  );
}
