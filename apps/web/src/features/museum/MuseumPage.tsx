import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fossilEffect } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { FossilRevivalDto, ReviveFossilsResponse } from '@poke/shared';
import { PokemonSprite, ProgressBar, useNow } from '../../components/ui';
import {
  PROGRESS_KEYS,
  assistantPlaces,
  depositFossil,
  keys,
  refresh,
  reviveFossils,
  serverOffset,
  shownPlaces,
  useAssistants,
  useInventory,
  useMuseum,
  withdrawFossil,
} from '../../lib/queries';
import {
  errorText,
  formatCountdown,
  formatDuration,
  itemIcon,
  itemName,
  speciesName,
} from '../../lib/labels';
import { AssistantCard } from '../buildings/AssistantCard';
import {
  BuildingSection,
  EMPTY_PLACE,
  Notice,
  SMALL_BUTTON,
  StateTag,
} from '../buildings/BuildingParts';
import { HatchReveal } from '../daycare/HatchReveal';

/** État de l'onglet du Musée : places, fossiles du sac, sites de fouille et actions. */
function useMuseumPage({ ctx }: { ctx: GameContext }) {
  const queryClient = useQueryClient();
  const museum = useMuseum();
  const inventory = useInventory();
  const assistants = useAssistants();
  const now = useNow();
  const [revived, setRevived] = useState<ReviveFossilsResponse | null>(null);

  // Dépôt et annulation : fossile du sac. Réanimation : nouveaux Pokémon, donc Pokédex et quêtes.
  const refreshMuseum = () => refresh(queryClient, keys.museum, keys.inventory);
  const deposit = useMutation({
    mutationFn: (itemId: string) => depositFossil(itemId),
    onSuccess: refreshMuseum,
  });
  const cancel = useMutation({
    mutationFn: (id: string) => withdrawFossil(id),
    onSuccess: refreshMuseum,
  });
  const revive = useMutation({
    mutationFn: () => reviveFossils(),
    onSuccess: (data) => {
      setRevived(data);
      return Promise.all([refreshMuseum(), refresh(queryClient, keys.pokemon, ...PROGRESS_KEYS)]);
    },
  });

  const data = museum.data;
  const serverNow = now + serverOffset(data, museum.dataUpdatedAt);
  const revivals = data?.revivals ?? [];
  const slots = data?.slots ?? 0;
  const shown = shownPlaces(slots, [
    ...revivals.map((r) => r.slotIndex),
    ...assistantPlaces(assistants.data, 'museum'),
  ]);
  const full = revivals.filter((r) => r.slotIndex < slots).length >= slots;
  const ready = revivals.filter((r) => Date.parse(r.readyAt) <= serverNow).length;
  const fossils = (inventory.data ?? []).filter(
    (s) => s.quantity > 0 && fossilEffect(ctx, s.itemId),
  );
  // Zones jouables dont le butin contient un fossile (aide pour en trouver).
  const digSites = ctx.zones.filter((z) =>
    ctx
      .lootTable(z.lootTableId ?? '')
      ?.entries.some((e) => fossilEffect(ctx, e.itemId) !== undefined),
  );
  const pending = deposit.isPending || cancel.isPending || revive.isPending;
  const error = deposit.error ?? cancel.error ?? revive.error;

  return {
    ctx,
    queryClient,
    museum,
    inventory,
    assistants,
    now,
    revived,
    setRevived,
    refreshMuseum,
    deposit,
    cancel,
    revive,
    data,
    serverNow,
    revivals,
    slots,
    shown,
    full,
    ready,
    fossils,
    digSites,
    pending,
    error,
  };
}

/** Ce qu'affichent les pièces de `MuseumPage`. */
type MuseumPageModel = ReturnType<typeof useMuseumPage>;

/** Musée : les fossiles trouvés en expédition y redeviennent des Pokémon, après un délai. */
export function MuseumPage({ ctx }: { ctx: GameContext }) {
  const m = useMuseumPage({ ctx });
  const {
    revived,
    setRevived,
    cancel,
    revive,
    serverNow,
    revivals,
    slots,
    shown,
    ready,
    pending,
    error,
  } = m;
  return (
    <div className="space-y-5">
      <BuildingSection
        id="museum.places"
        title="Musée"
        label="le Musée"
        count={`${revivals.filter((r) => r.slotIndex < slots).length}/${slots}`}
        countTitle="Fossiles en restauration / places"
        actions={
          <button
            className="btn-primary"
            disabled={ready === 0 || pending}
            onClick={() => revive.mutate()}
          >
            {revive.isPending ? 'Restauration…' : `Récupérer${ready ? ` (${ready})` : ''}`}
          </button>
        }
        intro={
          <>
            Confie un fossile aux scientifiques du Musée : après quelques heures, il redevient un
            Pokémon. Chaque place a son assistant : son talent agit sur le fossile qu’on y dépose
            (la première place libre).
          </>
        }
      >
        {error && <Notice tone="bad">{errorText(error)}</Notice>}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,19rem),1fr))] gap-3.5">
          {Array.from({ length: shown }, (_, i) => {
            const revival = revivals.find((r) => r.slotIndex === i);
            return revival ? (
              <RevivalCard
                key={revival.id}
                ctx={ctx}
                revival={revival}
                closed={i >= slots}
                serverNow={serverNow}
                busy={pending}
                onCancel={() => cancel.mutate(revival.id)}
              />
            ) : (
              <div
                key={`empty-${i}`}
                className={`flex min-h-44 flex-col gap-2.5 p-2.5 ${EMPTY_PLACE}`}
              >
                <span className="grid flex-1 place-items-center text-center text-sm">
                  {i < slots ? 'Place libre' : 'Place fermée'}
                </span>
                <AssistantCard ctx={ctx} post="museum" slot={i} closed={i >= slots} />
              </div>
            );
          })}
        </div>
      </BuildingSection>

      <FossilsSection m={m} />

      <HatchReveal
        ctx={ctx}
        data={revived && { ...revived, hatched: revived.revived }}
        onClose={() => setRevived(null)}
        kind="fossil"
      />
    </div>
  );
}

/** Fossiles du sac à déposer, et où en trouver. */
function FossilsSection({ m }: { m: MuseumPageModel }) {
  const { ctx, deposit, full, fossils, digSites, pending } = m;
  return (
    <BuildingSection
      id="museum.fossils"
      title="Tes fossiles"
      label="tes fossiles"
      count={fossils.reduce((n, s) => n + s.quantity, 0)}
      countTitle="Fossiles dans le sac"
    >
      {fossils.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Aucun fossile dans ton sac.
          {digSites.length > 0 &&
            ` On en trouve parfois en expédition : ${digSites.map((z) => z.name).join(', ')}.`}
        </p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-2.5">
          {fossils.map((s) => {
            const effect = fossilEffect(ctx, s.itemId)!;
            return (
              <li key={s.itemId} className="tile flex items-center gap-3 p-2.5">
                <span className="sprite-well size-12 shrink-0">
                  <img
                    src={itemIcon(ctx, s.itemId)}
                    alt=""
                    className="size-10 [image-rendering:pixelated]"
                  />
                </span>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium">{itemName(ctx, s.itemId)}</span>
                    <span className="shrink-0 font-mono text-slate-500">× {s.quantity}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {speciesName(ctx, effect.speciesId, effect.formId)} · N.{effect.level} ·{' '}
                    {formatDuration(effect.minutes)}
                  </p>
                </div>
                <button
                  className="btn-primary px-3 py-2"
                  disabled={full || pending}
                  title={full ? 'Toutes les places du Musée sont occupées.' : undefined}
                  onClick={() => deposit.mutate(s.itemId)}
                >
                  Déposer
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </BuildingSection>
  );
}

function RevivalCard({
  ctx,
  revival,
  closed,
  serverNow,
  busy,
  onCancel,
}: {
  ctx: GameContext;
  revival: FossilRevivalDto;
  closed: boolean;
  serverNow: number;
  busy: boolean;
  onCancel: () => void;
}) {
  const start = Date.parse(revival.startedAt);
  const end = Date.parse(revival.readyAt);
  const ready = serverNow >= end;
  return (
    <div className={`tile flex flex-col gap-2.5 p-2.5 ${ready ? 'border-amber-600 bg-done' : ''}`}>
      <div className="flex items-center gap-2">
        <span className="sprite-well size-14 shrink-0">
          <img
            src={itemIcon(ctx, revival.itemId)}
            alt=""
            className="size-10 [image-rendering:pixelated]"
          />
        </span>
        <span className="font-pixel text-[10px] text-slate-400" aria-hidden>
          ▶
        </span>
        <span className="sprite-well relative h-14 flex-1 overflow-hidden">
          <span className={ready ? '' : 'opacity-40 brightness-0 dark:invert'}>
            <PokemonSprite speciesId={revival.speciesId} formId={revival.formId} size={56} />
          </span>
          {ready && (
            <span className="absolute top-1 right-1">
              <StateTag tone="ready">Prêt</StateTag>
            </span>
          )}
        </span>
      </div>
      <p className="text-sm leading-tight font-medium">
        {speciesName(ctx, revival.speciesId, revival.formId)}
        <span className="block text-xs font-normal text-slate-500">
          {itemName(ctx, revival.itemId)}
        </span>
      </p>
      <ProgressBar value={(serverNow - start) / (end - start)} />
      <div className="flex min-h-8 items-center justify-between gap-2 text-xs">
        <span
          className={
            ready ? 'font-bold text-amber-800 dark:text-[#f8d878]' : 'font-mono text-slate-500'
          }
        >
          {ready ? 'Restauré !' : formatCountdown(end - serverNow)}
        </span>
        {!ready && (
          <button
            className={`btn-ghost ${SMALL_BUTTON}`}
            disabled={busy}
            onClick={onCancel}
            title="Le fossile revient dans ton sac ; sa restauration repartira de zéro."
          >
            Retirer
          </button>
        )}
      </div>
      <AssistantCard ctx={ctx} post="museum" slot={revival.slotIndex} closed={closed} />
    </div>
  );
}
