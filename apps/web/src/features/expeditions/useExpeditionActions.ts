/**
 * Actions de la page des expéditions (récupérer, annuler, mettre une zone en favori) et
 * rechargement de la page quand les Pokémon fuyards changent de zone.
 */
import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ClaimExpeditionResponse, ExpeditionsResponse, RoamerDto } from '@poke/shared';
import {
  cancelExpedition,
  claimExpedition,
  keys,
  refreshAfterExpeditionClaim,
  refreshAfterExpeditionStart,
  setFavoriteZone,
} from '../../lib/queries';

/**
 * Actions sur les expéditions et les zones, chacune ne rechargeant que ce qu'elle change.
 * `onClaimed` reçoit le retour d'une expédition récupérée (captures, butin) pour le révéler.
 */
export function useExpeditionActions(onClaimed: (data: ClaimExpeditionResponse) => void) {
  const queryClient = useQueryClient();
  const claim = useMutation({
    mutationFn: (id: string) => claimExpedition(id),
    onSuccess: (data) => {
      onClaimed(data);
      return refreshAfterExpeditionClaim(queryClient);
    },
  });

  const favorite = useMutation({
    mutationFn: ({ zoneId, on }: { zoneId: string; on: boolean }) => setFavoriteZone(zoneId, on),
    onSuccess: ({ favoriteZoneIds }) =>
      queryClient.setQueryData<ExpeditionsResponse>(
        keys.expeditions,
        (data) => data && { ...data, favoriteZoneIds },
      ),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelExpedition(id),
    onSuccess: () => refreshAfterExpeditionStart(queryClient),
  });
  return { claim, favorite, cancel };
}

/** Les trois actions de la page, avec leur état (en cours, erreur). */
export type ExpeditionActions = ReturnType<typeof useExpeditionActions>;

/**
 * Recharge les expéditions quand un fuyard change de zone (à l'heure pleine). `serverNow` est
 * l'heure du serveur, en millisecondes.
 */
export function useRoamerRefresh(roamers: readonly RoamerDto[], serverNow: number) {
  const queryClient = useQueryClient();
  const nextMove = Math.min(...roamers.map((r) => Date.parse(r.movesAt)));
  useEffect(() => {
    if (!Number.isFinite(nextMove)) return;
    const timer = setTimeout(
      () => void queryClient.invalidateQueries({ queryKey: keys.expeditions }),
      Math.max(0, nextMove - serverNow) + 1000,
    );
    return () => clearTimeout(timer);
    // serverNow avance chaque seconde : seule l'échéance compte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextMove, queryClient]);
}
