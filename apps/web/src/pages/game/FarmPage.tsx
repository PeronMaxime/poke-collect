import { useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { berryPlantEffect } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { BerryPlotDto, HarvestBerriesResponse, PlantBerryInput } from '@poke/shared';
import { HoverBubble, ProgressBar, useNow } from '../../components/ui';
import { api } from '../../lib/api';
import {
  PLAYER_STATE_KEYS,
  serverOffset,
  useAssistants,
  useFarm,
  useInventory,
} from '../../lib/game';
import {
  errorText,
  formatCountdown,
  formatDuration,
  itemIcon,
  itemName,
  yieldRange,
} from '../../lib/labels';
import { AssistantCard } from './AssistantCard';

/** Nom de la baie suivi de sa description (bulle native des parcelles). */
const berryTitle = (ctx: GameContext, itemId: string) => {
  const description = ctx.item(itemId)?.description;
  return description ? `${itemName(ctx, itemId)} : ${description}` : itemName(ctx, itemId);
};

/** Pousse restante d'une parcelle (0 = mûre), à l'heure du serveur. */
const remainingOf = (plot: BerryPlotDto, serverNow: number) =>
  plot.readyAt ? Math.max(0, Date.parse(plot.readyAt) - serverNow) : plot.remainingMs;

/**
 * Ferme à baies : un champ de 3 × 3 parcelles. Une baie plantée ne pousse que tant qu'un assistant
 * de type Eau arrose le champ ; mûre, elle donne quelques baies de la même espèce.
 */
export function FarmPage({ ctx }: { ctx: GameContext }) {
  const queryClient = useQueryClient();
  const farm = useFarm();
  const inventory = useInventory();
  const assistants = useAssistants();
  const now = useNow();
  const [chosen, setChosen] = useState<string | null>(null);
  const [harvested, setHarvested] = useState<HarvestBerriesResponse | null>(null);

  const refresh = () =>
    Promise.all(PLAYER_STATE_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  const plant = useMutation({
    mutationFn: async (inputs: PlantBerryInput[]) => {
      for (const json of inputs) await api<BerryPlotDto>('/api/farm', { method: 'POST', json });
    },
    onSettled: refresh,
  });
  const uproot = useMutation({
    mutationFn: (plot: number) => api<BerryPlotDto>(`/api/farm/${plot}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
  const harvest = useMutation({
    // Sans parcelle : toutes les baies mûres.
    mutationFn: (plot?: number) =>
      api<HarvestBerriesResponse>(
        plot === undefined ? '/api/farm/harvest' : `/api/farm/${plot}/harvest`,
        { method: 'POST' },
      ),
    onSuccess: (data) => {
      setHarvested(data);
      return refresh();
    },
  });

  const data = farm.data;
  const serverNow = now + serverOffset(data, farm.dataUpdatedAt);
  const planted = data?.planted ?? [];
  const plots = data?.plots ?? 0;
  const ripe = planted.filter((p) => remainingOf(p, serverNow) === 0).length;
  const watered = !!assistants.data?.some((a) => a.post === 'farm');
  const seeds = (inventory.data ?? []).filter(
    (s) => s.quantity > 0 && berryPlantEffect(ctx, s.itemId),
  );
  // Baie choisie pour planter (la première du sac par défaut).
  const seed = seeds.find((s) => s.itemId === chosen) ?? seeds[0];
  const freePlots = Array.from({ length: plots }, (_, i) => i).filter(
    (i) => !planted.some((p) => p.plotIndex === i),
  );
  const pending = plant.isPending || uproot.isPending || harvest.isPending;
  const error = plant.error ?? uproot.error ?? harvest.error;

  const plantIn = (plotIndexes: number[]) =>
    seed &&
    plant.mutate(
      plotIndexes.slice(0, seed.quantity).map((plotIndex) => ({ plotIndex, itemId: seed.itemId })),
    );

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Ferme à baies{' '}
          <span className="text-sm font-normal text-slate-500">
            {planted.length} / {plots}
          </span>
        </h2>
        <p className="mb-3 text-sm text-slate-500">
          Plante tes baies dans le champ : une fois mûres, clique dessus pour les récolter ; chacune
          en donne plusieurs de la même espèce. Elles ne poussent que si le champ est arrosé :
          confie-le à un Pokémon de type Eau. Un assistant de récolte, au talent adapté, en ajoute à
          chaque parcelle récoltée.
        </p>
        <div className="mb-4 grid max-w-3xl gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-semibold tracking-wide text-slate-400 uppercase">
              Arrosage
            </p>
            <AssistantCard ctx={ctx} post="farm" slot={0} standalone />
            {!watered && planted.length > 0 && (
              <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
                Le champ n’est pas arrosé : les baies ne poussent pas.
              </p>
            )}
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold tracking-wide text-slate-400 uppercase">
              Récolte
            </p>
            <AssistantCard ctx={ctx} post="harvest" slot={0} standalone />
          </div>
        </div>
        {harvested && (
          <p className="mb-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
            Récolte :{' '}
            {harvested.harvested
              .map((h) => `${h.quantity} × ${itemName(ctx, h.itemId)}`)
              .join(', ')}
            .{' '}
            <button className="underline" onClick={() => setHarvested(null)}>
              OK
            </button>
          </p>
        )}
        <div className="card inline-block p-3">
          <div className="mb-2 flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold tracking-wide text-slate-400 uppercase">Champ</span>
            <button
              className="btn-primary px-2 py-0.5 text-xs"
              disabled={ripe === 0 || pending}
              onClick={() => harvest.mutate(undefined)}
            >
              Tout récolter{ripe ? ` (${ripe})` : ''}
            </button>
            <span
              className={`rounded-full px-2 py-0.5 font-medium ${
                watered
                  ? 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
              }`}
            >
              {watered ? 'Arrosé' : 'Pas arrosé'}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: plots }, (_, i) => {
              const plot = planted.find((p) => p.plotIndex === i);
              return plot ? (
                <PlotCard
                  key={i}
                  ctx={ctx}
                  plot={plot}
                  watered={watered}
                  serverNow={serverNow}
                  busy={pending}
                  onUproot={() => uproot.mutate(i)}
                  onHarvest={() => harvest.mutate(i)}
                />
              ) : (
                <button
                  key={i}
                  type="button"
                  disabled={!seed || pending}
                  onClick={() => plantIn([i])}
                  title={
                    seed ? `Planter : ${itemName(ctx, seed.itemId)}` : 'Aucune baie à planter.'
                  }
                  className="flex size-24 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 text-xs text-slate-500 transition enabled:hover:border-brand-500 enabled:hover:text-brand-500 disabled:cursor-default dark:border-slate-700"
                >
                  <Mound watered={watered} />
                  <span>{seed ? 'Planter' : 'Vide'}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Baies à planter</h2>
          {seed && freePlots.length > 1 && (
            <button className="btn-ghost" disabled={pending} onClick={() => plantIn(freePlots)}>
              Remplir le champ
            </button>
          )}
        </div>
        {seeds.length === 0 ? (
          <p className="text-sm text-slate-500">
            Aucune baie à planter dans ton sac. On en trouve, rarement, en expédition.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {seeds.map((s) => {
              const effect = berryPlantEffect(ctx, s.itemId)!;
              const selected = s.itemId === seed?.itemId;
              return (
                <li key={s.itemId}>
                  <HoverBubble
                    width={240}
                    height={60}
                    className="block"
                    focusable={false}
                    content={ctx.item(s.itemId)?.description || itemName(ctx, s.itemId)}
                  >
                    <button
                      type="button"
                      onClick={() => setChosen(s.itemId)}
                      aria-pressed={selected}
                      className={`card flex w-full items-center gap-3 p-3 text-left ${
                        selected ? 'ring-2 ring-brand-500' : ''
                      }`}
                    >
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
                          Pousse en {formatDuration(effect.minutes)} · donne {yieldRange(effect)}{' '}
                          baie
                          {effect.maxYield > 1 ? 's' : ''}
                        </span>
                      </span>
                    </button>
                  </HoverBubble>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {error && <p className="text-sm text-red-600">{errorText(error)}</p>}
    </div>
  );
}

function PlotCard({
  ctx,
  plot,
  watered,
  serverNow,
  busy,
  onUproot,
  onHarvest,
}: {
  ctx: GameContext;
  plot: BerryPlotDto;
  watered: boolean;
  serverNow: number;
  busy: boolean;
  onUproot: () => void;
  onHarvest: () => void;
}) {
  const remaining = remainingOf(plot, serverNow);
  const ripe = remaining === 0;
  const progress = 1 - remaining / plot.growMs;
  const paused = !plot.readyAt;
  const size = 24 + 20 * Math.min(1, progress);
  const berry = (
    <Mound watered={watered}>
      <img
        src={itemIcon(ctx, plot.itemId)}
        alt={itemName(ctx, plot.itemId)}
        className="[image-rendering:pixelated]"
        // La baie grossit en poussant.
        style={{ width: size, height: size }}
      />
    </Mound>
  );
  if (ripe) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={onHarvest}
        title={`Récolter : ${berryTitle(ctx, plot.itemId)}`}
        className="flex size-24 flex-col items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1.5 ring-2 ring-brand-500/50 transition enabled:hover:ring-brand-500 disabled:cursor-default dark:border-slate-800 dark:bg-slate-800/50"
      >
        <span className="grid flex-1 place-items-center">{berry}</span>
        <span className="text-xs font-medium text-brand-500">Récolter !</span>
      </button>
    );
  }
  return (
    <div
      className="relative flex size-24 flex-col items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1.5 dark:border-slate-800 dark:bg-slate-800/50"
      title={berryTitle(ctx, plot.itemId)}
    >
      <button
        className="absolute top-0.5 right-1.5 text-xs text-slate-400 hover:text-red-600 disabled:opacity-50"
        disabled={busy}
        onClick={onUproot}
        title="Arracher : la baie revient dans ton sac."
        aria-label="Arracher"
      >
        ✕
      </button>
      <span className="grid flex-1 place-items-center">{berry}</span>
      <span className="w-full space-y-0.5 text-center">
        <ProgressBar value={progress} className="h-1.5" />
        <span
          className="block font-mono text-[10px] text-slate-500"
          title={paused ? 'Pousse en pause : le champ n’est pas arrosé.' : undefined}
        >
          {paused ? 'En pause' : formatCountdown(remaining)}
        </span>
      </span>
    </div>
  );
}

/** Butte de terre au centre d'une parcelle : plus foncée quand le champ est arrosé. */
function Mound({ watered, children }: { watered: boolean; children?: ReactNode }) {
  return (
    <span
      className={`grid size-13 shrink-0 place-items-center rounded-full ${
        watered ? 'bg-[#4a2f1b]' : 'bg-[#8b5e3c]'
      }`}
    >
      {children}
    </span>
  );
}
