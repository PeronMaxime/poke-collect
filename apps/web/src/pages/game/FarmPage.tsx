import { useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FARM_PLOTS, assistantSlotOf, berryPlantEffect } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { BerryPlotDto, HarvestBerriesResponse, PlantBerryInput } from '@poke/shared';
import { HoverBubble, Modal, ProgressBar, useNow } from '../../components/ui';
import { api } from '../../lib/api';
import {
  PLAYER_STATE_KEYS,
  assistantPlaces,
  serverOffset,
  shownPlaces,
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
 * Ferme à baies : des champs de 3 × 3 parcelles, chacun avec ses assistants (deux champs par ligne
 * sur grand écran). Une baie plantée ne pousse que tant qu'un assistant de type Eau arrose son
 * champ ; mûre, elle donne quelques baies de la même espèce.
 */
export function FarmPage({ ctx }: { ctx: GameContext }) {
  const queryClient = useQueryClient();
  const farm = useFarm();
  const inventory = useInventory();
  const assistants = useAssistants();
  const now = useNow();
  // Baie choisie au-dessus de chaque champ (la première du sac par défaut).
  const [chosen, setChosen] = useState<Record<number, string>>({});
  // Parcelle vide cliquée : choix de la baie à y planter.
  const [picking, setPicking] = useState<number | null>(null);
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
  const shown = shownPlaces(plots, [
    ...planted.map((p) => p.plotIndex),
    ...assistantPlaces(assistants.data, 'farm'),
    ...assistantPlaces(assistants.data, 'harvest'),
  ]);
  const ripe = planted.filter((p) => remainingOf(p, serverNow) === 0).length;
  const fields = Math.ceil(Math.max(shown, FARM_PLOTS) / FARM_PLOTS);
  const seeds = (inventory.data ?? []).filter(
    (s) => s.quantity > 0 && berryPlantEffect(ctx, s.itemId),
  );
  const pending = plant.isPending || uproot.isPending || harvest.isPending;
  const error = plant.error ?? uproot.error ?? harvest.error;

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">
            Ferme à baies{' '}
            <span className="text-sm font-normal text-slate-500">
              {planted.length} / {plots}
            </span>
          </h2>
          <button
            className="btn-primary"
            disabled={ripe === 0 || pending}
            onClick={() => harvest.mutate(undefined)}
          >
            Tout récolter{ripe ? ` (${ripe})` : ''}
          </button>
        </div>
        <p className="mb-3 text-sm text-slate-500">
          Clique sur une parcelle pour y planter une baie : une fois mûre, clique dessus pour la
          récolter ; elle en donne plusieurs de la même espèce. Les baies ne poussent que si leur
          champ est arrosé : confie-le à un Pokémon de type Eau. Un assistant de récolte, au talent
          adapté, en ajoute à chaque parcelle récoltée de son champ. Chaque champ compte{' '}
          {FARM_PLOTS} parcelles et a ses propres assistants.
          {seeds.length === 0 && ' On trouve des baies, rarement, en expédition.'}
        </p>
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
        {/*
          Deux champs côte à côte sur grand écran, séparés d'un trait ; les suivants en dessous.
          Chaque champ occupe deux rangées partagées avec son voisin (sous-grille) : assistants,
          puis sélecteur et parcelles, alignés quelle que soit la hauteur des assistants (talent).
        */}
        <div className="grid gap-y-8 lg:grid-cols-2">
          {Array.from({ length: fields }, (_, field) => {
            const first = field * FARM_PLOTS;
            const indexes = Array.from({ length: FARM_PLOTS }, (_, k) => first + k);
            const watered = !!assistants.data?.some((a) => a.post === 'farm' && a.slot === field);
            const growing = planted.some((p) => assistantSlotOf('farm', p.plotIndex) === field);
            const seed = seeds.find((s) => s.itemId === chosen[field]) ?? seeds[0];
            const free = indexes.filter(
              (i) => i < plots && !planted.some((p) => p.plotIndex === i),
            );
            return (
              <div
                key={field}
                className="flex flex-col items-center gap-3 lg:row-span-2 lg:grid lg:grid-rows-subgrid lg:gap-y-3 lg:odd:pr-6 lg:even:border-l lg:even:border-slate-200 lg:even:pl-6 dark:lg:even:border-slate-800"
              >
                <div className="flex w-full flex-col items-center gap-3">
                  {fields > 1 && (
                    <h3 className="self-start text-sm font-semibold">Champ {field + 1}</h3>
                  )}
                  <div className="w-full max-w-sm space-y-3">
                    <div>
                      <p className="mb-1 text-xs font-semibold tracking-wide text-slate-400 uppercase">
                        Arrosage
                      </p>
                      <AssistantCard
                        ctx={ctx}
                        post="farm"
                        slot={field}
                        standalone
                        closed={first >= plots}
                      />
                      {!watered && growing && (
                        <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
                          Le champ n’est pas arrosé : ses baies ne poussent pas.
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-semibold tracking-wide text-slate-400 uppercase">
                        Récolte
                      </p>
                      <AssistantCard
                        ctx={ctx}
                        post="harvest"
                        slot={field}
                        standalone
                        closed={first >= plots}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-center gap-3">
                  {seeds.length > 0 && (
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <div className="flex flex-wrap justify-center gap-1">
                        {seeds.map((s) => (
                          <HoverBubble
                            key={s.itemId}
                            width={240}
                            height={80}
                            focusable={false}
                            content={<BerryInfo ctx={ctx} itemId={s.itemId} />}
                          >
                            <button
                              type="button"
                              onClick={() => setChosen({ ...chosen, [field]: s.itemId })}
                              aria-pressed={s.itemId === seed?.itemId}
                              aria-label={itemName(ctx, s.itemId)}
                              className={`relative grid size-10 place-items-center rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 ${
                                s.itemId === seed?.itemId ? 'ring-2 ring-brand-500' : ''
                              }`}
                            >
                              <img
                                src={itemIcon(ctx, s.itemId)}
                                alt=""
                                className="size-8 [image-rendering:pixelated]"
                              />
                              <span className="absolute -right-1 -bottom-1 rounded-full bg-slate-700 px-1 font-mono text-[10px] text-white">
                                {s.quantity}
                              </span>
                            </button>
                          </HoverBubble>
                        ))}
                      </div>
                      <button
                        className="btn-ghost px-2 py-1 text-xs"
                        disabled={!seed || free.length === 0 || pending}
                        onClick={() =>
                          seed &&
                          plant.mutate(
                            free
                              .slice(0, seed.quantity)
                              .map((plotIndex) => ({ plotIndex, itemId: seed.itemId })),
                          )
                        }
                      >
                        Tout planter
                      </button>
                    </div>
                  )}
                  <div className="card p-3">
                    <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold tracking-wide text-slate-400 uppercase">
                        Champ{fields > 1 ? ` ${field + 1}` : ''}
                      </span>
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
                      {indexes.map((i) => {
                        const plot = planted.find((p) => p.plotIndex === i);
                        if (!plot && i >= plots) {
                          return (
                            <div
                              key={i}
                              title="Parcelle à débloquer"
                              className="grid size-24 place-items-center rounded-xl border-2 border-dashed border-slate-200 text-lg opacity-60 dark:border-slate-800"
                            >
                              🔒
                            </div>
                          );
                        }
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
                            disabled={seeds.length === 0 || pending}
                            onClick={() => setPicking(i)}
                            title={seeds.length ? 'Planter une baie' : 'Aucune baie à planter.'}
                            className="flex size-24 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 text-xs text-slate-500 transition enabled:hover:border-brand-500 enabled:hover:text-brand-500 disabled:cursor-default dark:border-slate-700"
                          >
                            <Mound watered={watered} />
                            <span>{seeds.length ? 'Planter' : 'Vide'}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {error && <p className="text-sm text-red-600">{errorText(error)}</p>}

      <Modal open={picking !== null} onClose={() => setPicking(null)}>
        <h2 className="text-xl font-bold">Planter une baie</h2>
        {seeds.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Aucune baie à planter dans ton sac.</p>
        ) : (
          <ul className="-mx-1 mt-2 grid max-h-[60vh] gap-2 overflow-y-auto p-1">
            {seeds.map((s) => {
              const effect = berryPlantEffect(ctx, s.itemId)!;
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
                      disabled={pending}
                      onClick={() => {
                        if (picking !== null) {
                          plant.mutate([{ plotIndex: picking, itemId: s.itemId }]);
                        }
                        setPicking(null);
                      }}
                      className="card flex w-full items-center gap-3 p-3 text-left transition enabled:hover:ring-2 enabled:hover:ring-brand-500"
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
      </Modal>
    </div>
  );
}

/** Bulle d'une baie du sélecteur : nom, description, pousse et rendement. */
function BerryInfo({ ctx, itemId }: { ctx: GameContext; itemId: string }) {
  const effect = berryPlantEffect(ctx, itemId)!;
  const description = ctx.item(itemId)?.description;
  return (
    <span className="block space-y-0.5">
      <span className="block font-medium">{itemName(ctx, itemId)}</span>
      {description && <span className="block">{description}</span>}
      <span className="block opacity-80">
        Pousse en {formatDuration(effect.minutes)} · donne {yieldRange(effect)} baie
        {effect.maxYield > 1 ? 's' : ''}
      </span>
    </span>
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
