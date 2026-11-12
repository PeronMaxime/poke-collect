/**
 * Fenêtre du retour d'une expédition, dans le jeu : le résultat (`ExpeditionRevealView`), les
 * actions sur les captures et la relance à l'identique.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { GameContext } from '@poke/game-core';
import type { ClaimExpeditionResponse, ExpeditionDto, StartExpeditionInput } from '@poke/shared';
import { Modal } from '../../components/ui';
import { ApiError } from '../../lib/api';
import {
  refreshAfterExpeditionStart,
  startExpedition,
  useInventory,
  usePokemon,
} from '../../lib/queries';
import { errorMessage, itemName } from '../../lib/labels';
import { LAUNCH_DIALOG_CLASS } from '../common/dialogParts';
import { NewbornActions } from '../daycare/HatchReveal';
import { ExpeditionRevealView } from './ExpeditionRevealView';

/** Ouverture animée du résultat d'une expédition : rencontres une à une, puis butin et XP. */
export function LootReveal({
  ctx,
  data,
  onClose,
}: {
  ctx: GameContext;
  data: ClaimExpeditionResponse | null;
  onClose: () => void;
}) {
  return (
    <Modal open={!!data} onClose={onClose} wide className={`${LAUNCH_DIALOG_CLASS} max-w-[56rem]!`}>
      {data && <RevealContent key={data.expedition.id} ctx={ctx} data={data} onClose={onClose} />}
    </Modal>
  );
}
/** Résultat d'une expédition récupérée, avec la relance dans la même zone. */
function RevealContent({
  ctx,
  data,
  onClose,
}: {
  ctx: GameContext;
  data: ClaimExpeditionResponse;
  onClose: () => void;
}) {
  const pokemon = usePokemon();
  const pokemonById = new Map(pokemon.data?.map((p) => [p.id, p]));
  const capturedById = new Map(data.captured.map((p) => [p.id, p]));
  const queryClient = useQueryClient();
  const { berryItemId, berries, encounterBerryItemId, encounterBerries, zoneId } = data.expedition;
  // Pas de relance d'une expédition qui a emporté un fuyard : il faut le traquer à nouveau.
  const canRelaunch = !!zoneId && data.expedition.roamerQuestIds.length === 0;
  // Relance : repartir dans la même zone avec les mêmes réglages (équipe, Balls, baies), pour
  // enchaîner les maillons. Le serveur plafonne les baies au stock restant.
  const relaunch = useMutation({
    mutationFn: (e: ExpeditionDto) => {
      const input: StartExpeditionInput = {
        zoneId: e.zoneId!,
        team: e.team,
        // Ancienne expédition : sa Ball pour toutes les catégories.
        balls: e.ballPlan ?? { new: e.ballItemId, shiny: e.ballItemId, caught: e.ballItemId },
        berryItemId: e.berryItemId,
        ...(e.berryItemId ? { berryCount: e.berries } : {}),
        encounterBerryItemId: e.encounterBerryItemId,
        ...(e.encounterBerryItemId ? { encounterBerryCount: e.encounterBerries } : {}),
        autoTransfer: e.autoTransfer,
      };
      return startExpedition(input);
    },
    onSuccess: () => {
      onClose();
      return refreshAfterExpeditionStart(queryClient);
    },
  });
  // Stock rafraîchi après la récupération (baies non utilisées rendues) : on attend la fin du
  // rechargement pour ne pas avertir à tort. Les Balls ne sont pas réservées au départ.
  const inventory = useInventory();
  const shortage = (itemId: string | null, needed: number) => {
    if (!itemId || needed === 0 || !inventory.data || inventory.isFetching) return null;
    const owned = inventory.data.find((i) => i.itemId === itemId)?.quantity ?? 0;
    return owned < needed ? { itemId, owned, needed } : null;
  };
  const shortages = [
    shortage(berryItemId, berries),
    shortage(encounterBerryItemId, encounterBerries),
  ].flatMap((s) => s ?? []);

  return (
    <ExpeditionRevealView
      ctx={ctx}
      expedition={data.expedition}
      pokemon={(id) => pokemonById.get(id) ?? capturedById.get(id)}
      renderNewborn={(id) => {
        const p = pokemonById.get(id) ?? capturedById.get(id);
        return capturedById.has(id) && p && <NewbornActions ctx={ctx} pokemon={p} />;
      }}
      onClose={onClose}
      note={
        (relaunch.error || (canRelaunch && shortages.length > 0)) && (
          <div className="space-y-1">
            {canRelaunch &&
              shortages.map(({ itemId, owned, needed }) => (
                <p key={itemId} className="text-amber-700 dark:text-[#f8d878]">
                  Stock de {itemName(ctx, itemId)} insuffisant pour relancer à l’identique :{' '}
                  {owned === 0
                    ? 'il n’en reste aucune, l’expédition partirait sans.'
                    : `${owned} / ${needed} seraient emportées.`}
                </p>
              ))}
            {relaunch.error && (
              <p className="text-red-600 dark:text-red-400">
                Relance impossible :{' '}
                {relaunch.error instanceof ApiError
                  ? errorMessage(relaunch.error.code)
                  : 'erreur inconnue'}
              </p>
            )}
          </div>
        )
      }
      footer={
        <>
          {canRelaunch && (
            <button
              className="btn-ghost"
              disabled={relaunch.isPending}
              onClick={() => relaunch.mutate(data.expedition)}
              title="Repartir avec la même équipe, les mêmes Balls, baies et le même transfert automatique"
            >
              {relaunch.isPending
                ? 'Relance…'
                : shortages.length > 0
                  ? '↻ Relancer quand même'
                  : '↻ Relancer'}
            </button>
          )}
          <button className="btn-primary px-6 py-3" onClick={onClose}>
            Continuer
          </button>
        </>
      }
    />
  );
}
