/**
 * Onglet « Ferme à baies » : champs de 9 parcelles, leurs assistants (arrosage, récolte), plantation,
 * arrachage et récolte.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FARM_PLOTS, assistantSlotOf, berryPlantEffect } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { BerryPlotDto, HarvestBerriesResponse, PlantBerryInput } from '@poke/shared';
import { HoverBubble, Modal, ProgressBar, useNow } from '../../components/ui';
import {
  assistantPlaces,
  harvestBerries,
  keys,
  plantBerry,
  refresh,
  serverOffset,
  shownPlaces,
  uprootBerry,
  useAssistants,
  useFarm,
  useInventory,
} from '../../lib/queries';
import {
  errorText,
  formatCountdown,
  formatDuration,
  itemIcon,
  itemName,
  yieldRange,
} from '../../lib/labels';
import { AssistantCard } from '../buildings/AssistantCard';
import {
  BuildingSection,
  EMPTY_PLACE,
  Notice,
  SMALL_BUTTON,
  StateTag,
} from '../buildings/BuildingParts';
import { SECTION_TITLE, SELECTED_CELL } from '../common/dialogParts';

/** Nom de la baie suivi de sa description (bulle native des parcelles). */
const berryTitle = (ctx: GameContext, itemId: string) => {
  const description = ctx.item(itemId)?.description;
  return description ? `${itemName(ctx, itemId)} : ${description}` : itemName(ctx, itemId);
};

/** Pousse restante d'une parcelle (0 = mûre), à l'heure du serveur. */
const remainingOf = (plot: BerryPlotDto, serverNow: number) =>
  plot.readyAt ? Math.max(0, Date.parse(plot.readyAt) - serverNow) : plot.remainingMs;

/** État de l'onglet de la ferme : champs, baies du sac, plantation, arrachage et récolte. */
function useFarmPage({ ctx }: { ctx: GameContext }) {
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

  // Plantation, arrachage et récolte : baies du sac et parcelles.
  const refreshFarm = () => refresh(queryClient, keys.farm, keys.inventory);
  const plant = useMutation({
    mutationFn: async (inputs: PlantBerryInput[]) => {
      for (const json of inputs) await plantBerry(json);
    },
    onSettled: refreshFarm,
  });
  const uproot = useMutation({
    mutationFn: (plot: number) => uprootBerry(plot),
    onSuccess: refreshFarm,
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
  const ripe = planted.filter((p) => remainingOf(p, serverNow) === 0).length;
  const fields = Math.ceil(Math.max(shown, FARM_PLOTS) / FARM_PLOTS);
  const seeds = (inventory.data ?? []).filter(
    (s) => s.quantity > 0 && berryPlantEffect(ctx, s.itemId),
  );
  const pending = plant.isPending || uproot.isPending || harvest.isPending;
  const error = plant.error ?? uproot.error ?? harvest.error;

  return {
    ctx,
    queryClient,
    farm,
    inventory,
    assistants,
    now,
    chosen,
    setChosen,
    picking,
    setPicking,
    harvested,
    setHarvested,
    refreshFarm,
    plant,
    uproot,
    harvest,
    data,
    serverNow,
    planted,
    plots,
    shown,
    ripe,
    fields,
    seeds,
    pending,
    error,
  };
}

/** Ce qu'affichent les pièces de `FarmPage`. */
type FarmPageModel = ReturnType<typeof useFarmPage>;

/**
 * Ferme à baies : des champs de 3 × 3 parcelles, chacun avec ses assistants (deux champs par ligne
 * sur grand écran). Une baie plantée ne pousse que tant qu'un assistant de type Eau arrose son
 * champ ; mûre, elle donne quelques baies de la même espèce.
 */
export function FarmPage({ ctx }: { ctx: GameContext }) {
  const m = useFarmPage({ ctx });
  const { harvested, setHarvested, harvest, planted, plots, ripe, fields, seeds, pending, error } =
    m;
  return (
    <div className="space-y-5">
      <BuildingSection
        id="farm.fields"
        title="Ferme à baies"
        label="la ferme à baies"
        count={`${planted.filter((p) => p.plotIndex < plots).length}/${plots}`}
        countTitle="Parcelles plantées / débloquées"
        actions={
          <button
            className="btn-primary"
            disabled={ripe === 0 || pending}
            onClick={() => harvest.mutate(undefined)}
          >
            Tout récolter{ripe ? ` (${ripe})` : ''}
          </button>
        }
        intro={
          <>
            Clique sur une parcelle pour y planter une baie : une fois mûre, clique dessus pour la
            récolter ; elle en donne plusieurs de la même espèce. Les baies ne poussent que si leur
            champ est arrosé : confie-le à un Pokémon de type Eau. Un assistant de récolte, au
            talent adapté, en ajoute à chaque parcelle récoltée de son champ. Chaque champ compte{' '}
            {FARM_PLOTS} parcelles et a ses propres assistants.
            {seeds.length === 0 && ' On trouve des baies, rarement, en expédition.'}
          </>
        }
      >
        {harvested && (
          <Notice tone="ok" onClose={() => setHarvested(null)}>
            Récolte :{' '}
            {harvested.harvested
              .map((h) => `${h.quantity} × ${itemName(ctx, h.itemId)}`)
              .join(', ')}
            .
          </Notice>
        )}
        {error && <Notice tone="bad">{errorText(error)}</Notice>}
        {/*
          Deux champs côte à côte sur grand écran ; les suivants en dessous. Chaque champ occupe
          deux rangées partagées avec son voisin (sous-grille) : assistants, puis sélecteur et
          parcelles, alignés quelle que soit la hauteur des assistants (talent).
        */}
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
          {Array.from({ length: fields }, (_, field) => (
            <FieldCard key={field} m={m} field={field} />
          ))}
        </div>
      </BuildingSection>

      <PlantDialog m={m} />
    </div>
  );
}

/** Choix de la baie à planter dans une parcelle vide. */
function PlantDialog({ m }: { m: FarmPageModel }) {
  const { ctx, picking, setPicking, plant, seeds, pending } = m;
  return (
    <Modal open={picking !== null} onClose={() => setPicking(null)}>
      <h2 className="text-xl font-bold">Planter une baie</h2>
      {seeds.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Aucune baie à planter dans ton sac.</p>
      ) : (
        <ul className="-mx-1 mt-3 grid max-h-[60vh] gap-2 overflow-y-auto p-1">
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
                    className="tile flex w-full items-center gap-3 p-2.5 text-left transition enabled:hover:border-brand-500 enabled:hover:bg-selected"
                  >
                    <span className="sprite-well size-12 shrink-0">
                      <img
                        src={itemIcon(ctx, s.itemId)}
                        alt=""
                        className="size-10 [image-rendering:pixelated]"
                      />
                    </span>
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="font-medium">{itemName(ctx, s.itemId)}</span>
                        <span className="font-mono text-slate-500">× {s.quantity}</span>
                      </span>
                      <span className="block text-xs text-slate-500">
                        Pousse en {formatDuration(effect.minutes)} · donne {yieldRange(effect)} baie
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
        className="flex aspect-square flex-col items-center gap-1 rounded-md border-2 border-amber-600 bg-done p-1.5 transition enabled:hover:border-brand-500 disabled:cursor-default"
      >
        <span className="grid flex-1 place-items-center">{berry}</span>
        <span className="pixel-label text-[8px] text-amber-800 dark:text-[#f8d878]">
          Récolter !
        </span>
      </button>
    );
  }
  return (
    <div
      className="sprite-well relative flex! aspect-square flex-col items-center gap-1 p-1.5"
      title={berryTitle(ctx, plot.itemId)}
    >
      <button
        className="absolute top-0.5 right-1 text-xs text-slate-400 hover:text-red-600 disabled:opacity-50"
        disabled={busy}
        onClick={onUproot}
        title="Arracher : la baie revient dans ton sac."
        aria-label="Arracher"
      >
        ✕
      </button>
      <span className="grid flex-1 place-items-center">{berry}</span>
      <span className="w-full space-y-0.5 text-center">
        <ProgressBar value={progress} className="h-2.5" />
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
      className={`grid size-12 shrink-0 place-items-center rounded-full border-2 ${
        watered ? 'border-[#2e1c0f] bg-[#4a2f1b]' : 'border-[#6b4529] bg-[#8b5e3c]'
      }`}
    >
      {children}
    </span>
  );
}

/** Carte d'un champ : ses parcelles, la baie à planter, ses assistants et ses actions. */
function FieldCard({ m, field }: { m: FarmPageModel; field: number }) {
  const {
    ctx,
    assistants,
    chosen,
    setPicking,
    uproot,
    harvest,
    serverNow,
    planted,
    plots,
    seeds,
    pending,
  } = m;
  const first = field * FARM_PLOTS;
  const indexes = Array.from({ length: FARM_PLOTS }, (_, k) => first + k);
  const watered = !!assistants.data?.some((a) => a.post === 'farm' && a.slot === field);
  const growing = planted.some((p) => assistantSlotOf('farm', p.plotIndex) === field);
  const seed = seeds.find((s) => s.itemId === chosen[field]) ?? seeds[0];
  const free = indexes.filter((i) => i < plots && !planted.some((p) => p.plotIndex === i));
  const closed = first >= plots;
  return (
    <div
      key={field}
      className="tile flex flex-col gap-3 p-3 lg:row-span-2 lg:grid lg:grid-rows-subgrid"
    >
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className={SECTION_TITLE}>Champ {field + 1}</h3>
          <StateTag tone={watered ? 'water' : 'idle'}>
            {watered ? '💧 Arrosé' : 'Pas arrosé'}
          </StateTag>
        </div>
        <AssistantCard
          ctx={ctx}
          post="farm"
          slot={field}
          frame="none"
          label="Arrosage"
          closed={closed}
        />
        {!watered && growing && (
          <Notice tone="warn">Le champ n’est pas arrosé : ses baies ne poussent pas.</Notice>
        )}
        <div className="border-t-2 border-dashed border-well-line pt-2.5">
          <AssistantCard
            ctx={ctx}
            post="harvest"
            slot={field}
            frame="none"
            label="Récolte"
            closed={closed}
          />
        </div>
      </div>
      <div className="flex flex-col items-center gap-3 border-t-2 border-dashed border-well-line pt-3">
        {seeds.length > 0 && <SeedPicker m={m} field={field} seed={seed} free={free} />}
        <div className="grid w-full max-w-80 grid-cols-3 gap-2">
          {indexes.map((i) => {
            const plot = planted.find((p) => p.plotIndex === i);
            if (!plot && i >= plots) {
              return (
                <div
                  key={i}
                  title="Parcelle à débloquer"
                  className={`grid aspect-square place-items-center text-lg opacity-50 ${EMPTY_PLACE}`}
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
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-well-line bg-well/50 text-slate-500 transition enabled:hover:border-brand-500 enabled:hover:text-brand-500 disabled:cursor-default dark:text-slate-400"
              >
                <Mound watered={watered} />
                <span className="pixel-label text-[8px]">{seeds.length ? 'Planter' : 'Vide'}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Baies du sac à choisir pour un champ, et « Tout planter » dans ses parcelles libres. */
function SeedPicker({
  m,
  field,
  seed,
  free,
}: {
  m: FarmPageModel;
  field: number;
  seed: FarmPageModel['seeds'][number] | undefined;
  free: number[];
}) {
  const { ctx, chosen, setChosen, plant, seeds, pending } = m;
  return (
    <div className="flex w-full flex-wrap items-center justify-center gap-2">
      <div className="flex flex-wrap justify-center gap-1.5">
        {seeds.map((s) => {
          const selected = s.itemId === seed?.itemId;
          return (
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
                aria-pressed={selected}
                aria-label={itemName(ctx, s.itemId)}
                className={`sprite-well relative size-11 transition hover:border-brand-500 ${
                  selected ? SELECTED_CELL : ''
                }`}
              >
                <img
                  src={itemIcon(ctx, s.itemId)}
                  alt=""
                  className="size-8 [image-rendering:pixelated]"
                />
                <span className="absolute -right-1.5 -bottom-1.5 rounded border-2 border-ink bg-white px-0.5 font-mono text-[10px] leading-tight dark:bg-slate-900">
                  {s.quantity}
                </span>
              </button>
            </HoverBubble>
          );
        })}
      </div>
      <button
        className={`btn-ghost ${SMALL_BUTTON}`}
        disabled={!seed || free.length === 0 || pending}
        onClick={() =>
          seed &&
          plant.mutate(
            free.slice(0, seed.quantity).map((plotIndex) => ({ plotIndex, itemId: seed.itemId })),
          )
        }
      >
        Tout planter
      </button>
    </div>
  );
}
