/**
 * Fenêtre réduite de la ferme à baies : un champ à la fois, ses parcelles, récolte et plantation.
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FARM_PLOTS, berryPlantEffect } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { BerryPlotDto, HarvestBerriesResponse, PlantBerryInput } from '@poke/shared';
import { Modal, useNow } from '../../components/ui';
import {
  assistantPlaces,
  harvestBerries,
  keys,
  plantBerry,
  refresh,
  serverOffset,
  shownPlaces,
  useAssistants,
  useFarm,
  useInventory,
} from '../../lib/queries';
import { errorText, formatDuration, itemIcon, itemName, yieldRange } from '../../lib/labels';
import { AssistantCircle } from './AssistantCard';
import { LockIcon, SproutIcon } from './tileIcons';
import {
  Badge,
  CLOSED_PLACE,
  FREE_PLACE,
  HOVER_PRIMARY,
  Pager,
  SMALL_BTN,
  Tile,
  TileFooter,
  plural,
  shortCountdown,
  usePage,
} from './tileParts';

/** Pousse restante d'une parcelle (0 = mûre), à l'heure du serveur. */
const remainingOf = (plot: BerryPlotDto, serverNow: number) =>
  plot.readyAt ? Math.max(0, Date.parse(plot.readyAt) - serverNow) : plot.remainingMs;

export function FarmTile({ ctx }: { ctx: GameContext }) {
  const queryClient = useQueryClient();
  const farm = useFarm();
  const inventory = useInventory();
  const assistants = useAssistants();
  const now = useNow(5000);
  const [harvested, setHarvested] = useState<HarvestBerriesResponse | null>(null);
  // Parcelle vide cliquée : choix de la baie à y planter.
  const [picking, setPicking] = useState<number | null>(null);

  const refreshFarm = () => refresh(queryClient, keys.farm, keys.inventory);
  const plant = useMutation({
    mutationFn: async (inputs: PlantBerryInput[]) => {
      for (const json of inputs) await plantBerry(json);
    },
    onSettled: refreshFarm,
  });
  const harvest = useMutation({
    // Sans parcelle : toutes les baies mûres.
    mutationFn: (plot?: number) => harvestBerries(plot),
    onSuccess: (data) => {
      setHarvested(data);
      return refreshFarm();
    },
  });

  const data = farm.data;
  const serverNow = now + serverOffset(data, farm.dataUpdatedAt);
  const planted = data?.planted ?? [];
  const plots = data?.plots ?? 0;
  const shown = shownPlaces(plots, [
    ...planted.map((p) => p.plotIndex),
    ...assistantPlaces(assistants.data, 'farm'),
    ...assistantPlaces(assistants.data, 'harvest'),
  ]);
  const fields = Math.ceil(Math.max(shown, FARM_PLOTS) / FARM_PLOTS);
  const [field, setField] = usePage(fields);
  const isRipe = (p: BerryPlotDto) => remainingOf(p, serverNow) === 0;
  const ripe = planted.filter(isRipe).length;
  const seeds = (inventory.data ?? []).filter(
    (s) => s.quantity > 0 && berryPlantEffect(ctx, s.itemId),
  );
  const first = field * FARM_PLOTS;
  const indexes = Array.from({ length: FARM_PLOTS }, (_, k) => first + k);
  const watered = !!assistants.data?.some((a) => a.post === 'farm' && a.slot === field);
  const freeInField = indexes.filter((i) => i < plots && !planted.some((p) => p.plotIndex === i));
  const busy = plant.isPending || harvest.isPending;
  const error = plant.error ?? harvest.error;

  return (
    <>
      <Tile tab="farm" title="Ferme à baies" icon={<SproutIcon />} badge={<Badge count={ripe} />}>
        <Pager
          label="Champ"
          count={fields}
          index={field}
          onChange={setField}
          waiting={Array.from({ length: fields }, (_, f) =>
            planted.some((p) => Math.floor(p.plotIndex / FARM_PLOTS) === f && isRipe(p)),
          )}
        />
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="mb-1 flex items-center justify-between gap-1 text-xs">
              <span className="font-semibold">{fields > 1 ? '' : 'Champ 1'}</span>
              <span
                className={watered ? 'text-sky-700 dark:text-sky-300' : 'text-slate-400'}
                title={watered ? 'Arrosé' : 'Pas arrosé : les baies ne poussent pas.'}
              >
                {watered ? 'Arrosé' : 'Pas arrosé'}
              </span>
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {indexes.map((i) => {
                const plot = planted.find((p) => p.plotIndex === i);
                if (!plot) {
                  return i < plots ? (
                    <button
                      key={i}
                      type="button"
                      disabled={seeds.length === 0 || busy}
                      onClick={() => setPicking(i)}
                      title={seeds.length ? 'Planter une baie' : 'Aucune baie à planter.'}
                      className={`grid aspect-square place-items-center rounded-md text-[11px] transition enabled:hover:border-brand-500 enabled:hover:text-brand-500 disabled:cursor-default ${FREE_PLACE}`}
                    >
                      {seeds.length ? 'Planter' : ''}
                    </button>
                  ) : (
                    <div
                      key={i}
                      title="Parcelle à débloquer"
                      className={`grid aspect-square place-items-center rounded-md ${CLOSED_PLACE}`}
                    >
                      <LockIcon />
                    </div>
                  );
                }
                const remaining = remainingOf(plot, serverNow);
                const done = remaining === 0;
                const progress = 1 - remaining / plot.growMs;
                const size = 18 + 18 * Math.min(1, progress);
                const berry = (
                  <img
                    src={itemIcon(ctx, plot.itemId)}
                    alt=""
                    className={`[image-rendering:pixelated] ${plot.readyAt || done ? '' : 'opacity-60'}`}
                    style={{ width: size, height: size }}
                  />
                );
                return done ? (
                  <button
                    key={i}
                    type="button"
                    disabled={busy}
                    onClick={() => harvest.mutate(i)}
                    title={`Récolter : ${itemName(ctx, plot.itemId)}`}
                    className="grid aspect-square place-items-center rounded-md border-2 border-[#b07a10] bg-done transition enabled:hover:ring-2 enabled:hover:ring-brand-500 disabled:cursor-default"
                  >
                    {berry}
                  </button>
                ) : (
                  <div
                    key={i}
                    title={`${itemName(ctx, plot.itemId)} : ${
                      plot.readyAt ? shortCountdown(remaining) : 'en pause, champ pas arrosé'
                    }`}
                    className={`grid aspect-square place-items-center rounded-md border-2 ${
                      watered ? 'border-[#4a2f1b] bg-[#6b4528]' : 'border-[#8b5e3c] bg-[#a87a52]'
                    }`}
                  >
                    {berry}
                  </div>
                );
              })}
            </div>
          </div>
          {/* Assistants du champ : arrosage (fait pousser) et récolte. */}
          <div className="flex shrink-0 flex-col gap-3">
            {(
              [
                ['farm', 'Arrosage'],
                ['harvest', 'Récolte'],
              ] as const
            ).map(([post, label]) => (
              <div key={post} className="flex flex-col items-center gap-0.5">
                <AssistantCircle ctx={ctx} post={post} slot={field} closed={first >= plots} />
                <span className="text-[10px] text-slate-500">{label}</span>
              </div>
            ))}
          </div>
        </div>
        <TileFooter
          text={
            ripe > 0
              ? `${plural(ripe, 'baie')} mûre${ripe > 1 ? 's' : ''}`
              : seeds.length === 0 && freeInField.length > 0
                ? 'Aucune baie à planter'
                : 'Rien à récolter'
          }
        >
          {ripe > 0 && (
            <button
              className={`btn-primary ${SMALL_BTN} ${HOVER_PRIMARY}`}
              disabled={busy}
              onClick={() => harvest.mutate(undefined)}
            >
              Tout récolter
            </button>
          )}
        </TileFooter>
        {harvested && (
          <p className="text-xs text-emerald-700 dark:text-emerald-400">
            Récolte :{' '}
            {harvested.harvested
              .map((h) => `${h.quantity} × ${itemName(ctx, h.itemId)}`)
              .join(', ')}
            .
          </p>
        )}
        {error && <p className="text-xs text-red-600">{errorText(error)}</p>}
      </Tile>

      <Modal open={picking !== null} onClose={() => setPicking(null)}>
        <h2 className="text-xl font-bold">Planter une baie</h2>
        {seeds.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Aucune baie à planter dans ton sac.</p>
        ) : (
          <ul className="-mx-1 mt-2 grid max-h-[60vh] gap-2 overflow-y-auto p-1">
            {seeds.map((s) => {
              const effect = berryPlantEffect(ctx, s.itemId)!;
              const fill = freeInField.slice(0, s.quantity);
              return (
                <li key={s.itemId} className="card flex items-center gap-3 p-3">
                  <img
                    src={itemIcon(ctx, s.itemId)}
                    alt=""
                    className="h-10 w-10 shrink-0 [image-rendering:pixelated]"
                  />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{itemName(ctx, s.itemId)}</span>
                      <span className="font-mono">× {s.quantity}</span>
                    </span>
                    <span className="block text-xs text-slate-500">
                      Pousse en {formatDuration(effect.minutes)} · donne {yieldRange(effect)} baie
                      {effect.maxYield > 1 ? 's' : ''}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col gap-1">
                    <button
                      className={`btn-primary ${SMALL_BTN}`}
                      disabled={busy}
                      onClick={() => {
                        if (picking !== null)
                          plant.mutate([{ plotIndex: picking, itemId: s.itemId }]);
                        setPicking(null);
                      }}
                    >
                      Planter
                    </button>
                    {fill.length > 1 && (
                      <button
                        className={`btn-ghost ${SMALL_BTN}`}
                        disabled={busy}
                        title={`Plante ${plural(fill.length, 'baie')} dans les parcelles vides de ce champ.`}
                        onClick={() => {
                          plant.mutate(fill.map((plotIndex) => ({ plotIndex, itemId: s.itemId })));
                          setPicking(null);
                        }}
                      >
                        Tout le champ ({fill.length})
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Modal>
    </>
  );
}
