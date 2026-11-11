/**
 * Fenêtre réduite du Musée : places de restauration des fossiles.
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fossilEffect } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { FossilRevivalDto, ReviveFossilsResponse } from '@poke/shared';
import { Modal, PokemonSprite, ProgressBar, useNow } from '../../components/ui';
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
import { errorText, formatDuration, itemIcon, itemName, speciesName } from '../../lib/labels';
import { AssistantCircle } from './AssistantCard';
import { HatchReveal } from '../daycare/HatchReveal';
import { WithdrawDialog } from './IncubatorTile';
import { MuseumIcon } from './tileIcons';
import {
  Badge,
  CLOSED_PLACE,
  FREE_PLACE,
  HOVER_PRIMARY,
  Pager,
  SMALL_BTN,
  Tile,
  TileFooter,
  shortCountdown,
  usePage,
} from './tileParts';

/** Places du Musée affichées ensemble. */
const MUSEUM_PAGE = 2;

/** État de la fenêtre du Musée : places affichées, fossiles prêts, dépôt, restauration et retrait. */
function useMuseumTile({ ctx }: { ctx: GameContext }) {
  const queryClient = useQueryClient();
  const museum = useMuseum();
  const assistants = useAssistants();
  const now = useNow(5000);
  const inventory = useInventory();
  const [revived, setRevived] = useState<ReviveFossilsResponse | null>(null);
  // Place libre cliquée : choix du fossile à déposer.
  const [picking, setPicking] = useState(false);
  // Fossile cliqué (fenêtre Retirer).
  const [focusId, setFocusId] = useState<string | null>(null);
  const withdraw = useMutation({
    mutationFn: (id: string) => withdrawFossil(id),
    onSuccess: () => {
      setFocusId(null);
      return refresh(queryClient, keys.museum, keys.inventory);
    },
  });
  const deposit = useMutation({
    mutationFn: (itemId: string) => depositFossil(itemId),
    onSuccess: () => refresh(queryClient, keys.museum, keys.inventory),
  });
  const revive = useMutation({
    mutationFn: () => reviveFossils(),
    onSuccess: (data) => {
      setRevived(data);
      return refresh(queryClient, keys.museum, keys.inventory, keys.pokemon, ...PROGRESS_KEYS);
    },
  });

  const data = museum.data;
  const serverNow = now + serverOffset(data, museum.dataUpdatedAt);
  const revivals = data?.revivals ?? [];
  const focused = revivals.find((r) => r.id === focusId);
  const slots = data?.slots ?? 0;
  const shown = shownPlaces(slots, [
    ...revivals.map((r) => r.slotIndex),
    ...assistantPlaces(assistants.data, 'museum'),
  ]);
  // Places affichées deux par deux.
  const pages = Math.ceil(shown / MUSEUM_PAGE);
  const [page, setPage] = usePage(pages);
  const placesOf = (p: number) =>
    Array.from(
      { length: Math.min(MUSEUM_PAGE, shown - p * MUSEUM_PAGE) },
      (_, k) => p * MUSEUM_PAGE + k,
    );
  const isReady = (i: number) =>
    revivals.some((r) => r.slotIndex === i && Date.parse(r.readyAt) <= serverNow);
  const ready = revivals.filter((r) => Date.parse(r.readyAt) <= serverNow).length;
  const fossils = (inventory.data ?? []).filter(
    (s) => s.quantity > 0 && fossilEffect(ctx, s.itemId),
  );
  const busy = deposit.isPending || revive.isPending;
  const error = deposit.error ?? revive.error;
  const pageName = (p: number) => {
    const places = placesOf(p).map((i) => i + 1);
    return places.length > 1 ? `Places ${places.join(' et ')}` : `Place ${places[0]}`;
  };

  return {
    ctx,
    queryClient,
    museum,
    assistants,
    now,
    inventory,
    revived,
    setRevived,
    picking,
    setPicking,
    focusId,
    setFocusId,
    withdraw,
    deposit,
    revive,
    data,
    serverNow,
    revivals,
    focused,
    slots,
    shown,
    pages,
    page,
    setPage,
    placesOf,
    isReady,
    ready,
    fossils,
    busy,
    error,
    pageName,
  };
}

/** Ce qu'affichent les pièces de `MuseumTile`. */
type MuseumTileModel = ReturnType<typeof useMuseumTile>;

export function MuseumTile({ ctx }: { ctx: GameContext }) {
  const m = useMuseumTile({ ctx });
  const {
    revived,
    setRevived,
    setPicking,
    setFocusId,
    withdraw,
    revive,
    serverNow,
    revivals,
    focused,
    slots,
    pages,
    page,
    setPage,
    placesOf,
    isReady,
    ready,
    fossils,
    busy,
    error,
    pageName,
  } = m;
  return (
    <>
      <Tile tab="museum" title="Musée" icon={<MuseumIcon />} badge={<Badge count={ready} />}>
        <Pager
          label="Places"
          count={pages}
          index={page}
          onChange={setPage}
          name={pageName}
          waiting={Array.from({ length: pages }, (_, p) => placesOf(p).some(isReady))}
        />
        {placesOf(page).map((i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <MuseumPlace
                ctx={ctx}
                revival={revivals.find((r) => r.slotIndex === i)}
                closed={i >= slots}
                serverNow={serverNow}
                noFossil={fossils.length === 0}
                busy={busy}
                onDeposit={() => setPicking(true)}
                onOpen={(id) => {
                  withdraw.reset();
                  setFocusId(id);
                }}
              />
            </div>
            <AssistantCircle ctx={ctx} post="museum" slot={i} closed={i >= slots} />
          </div>
        ))}
        {ready > 0 && (
          <TileFooter>
            <button
              className={`btn-primary ${SMALL_BTN} ${HOVER_PRIMARY} ml-auto`}
              disabled={busy}
              onClick={() => revive.mutate()}
            >
              {revive.isPending ? 'Restauration…' : `Récupérer (${ready})`}
            </button>
          </TileFooter>
        )}
        {error && <p className="text-xs text-red-600">{errorText(error)}</p>}
      </Tile>

      <FossilPicker m={m} />
      {focused && (
        <WithdrawDialog
          title={`Musée · place ${focused.slotIndex + 1}`}
          icon={
            <img
              src={itemIcon(ctx, focused.itemId)}
              alt=""
              className="size-10 [image-rendering:pixelated]"
            />
          }
          name={`${itemName(ctx, focused.itemId)} → ${speciesName(ctx, focused.speciesId, focused.formId)}`}
          detail={`Restauré dans ${shortCountdown(Date.parse(focused.readyAt) - serverNow)}`}
          explanation="Le fossile revient dans ton sac et sa place se libère. Redéposé, sa restauration repartira de zéro."
          busy={withdraw.isPending}
          error={withdraw.error}
          onWithdraw={() => withdraw.mutate(focused.id)}
          onClose={() => setFocusId(null)}
        />
      )}
      <HatchReveal
        ctx={ctx}
        data={revived && { ...revived, hatched: revived.revived }}
        onClose={() => setRevived(null)}
        kind="fossil"
      />
    </>
  );
}

/** Choix du fossile à déposer dans une place libre. */
function FossilPicker({ m }: { m: MuseumTileModel }) {
  const { ctx, picking, setPicking, deposit, fossils, busy } = m;
  return (
    <Modal open={picking} onClose={() => setPicking(false)}>
      <h2 className="text-xl font-bold">Déposer un fossile</h2>
      {fossils.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Aucun fossile dans ton sac.</p>
      ) : (
        <ul className="-mx-1 mt-2 grid max-h-[60vh] gap-2 overflow-y-auto p-1">
          {fossils.map((s) => {
            const effect = fossilEffect(ctx, s.itemId)!;
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
                    {speciesName(ctx, effect.speciesId, effect.formId)} · N.{effect.level} ·{' '}
                    {formatDuration(effect.minutes)}
                  </span>
                </span>
                <button
                  className={`btn-primary ${SMALL_BTN}`}
                  disabled={busy}
                  onClick={() => {
                    deposit.mutate(s.itemId);
                    setPicking(false);
                  }}
                >
                  Déposer
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

/** Une place du Musée : fossile en cours (ou restauré), place libre ou fermée. */
function MuseumPlace({
  ctx,
  revival: r,
  closed,
  serverNow,
  noFossil,
  busy,
  onDeposit,
  onOpen,
}: {
  ctx: GameContext;
  revival: FossilRevivalDto | undefined;
  closed: boolean;
  serverNow: number;
  noFossil: boolean;
  busy: boolean;
  onDeposit: () => void;
  /** Clic sur un fossile en cours : le retirer. */
  onOpen: (id: string) => void;
}) {
  if (!r && closed) {
    return (
      <div className={`grid h-12 place-items-center rounded-md text-sm ${CLOSED_PLACE}`}>
        Place fermée
      </div>
    );
  }
  if (!r) {
    // Le serveur pose le fossile dans la première place libre.
    return (
      <button
        type="button"
        disabled={noFossil || busy}
        onClick={onDeposit}
        title={noFossil ? 'Aucun fossile dans ton sac.' : 'Déposer un fossile'}
        className={`grid h-12 w-full place-items-center rounded-md text-sm transition enabled:hover:border-brand-500 enabled:hover:text-brand-500 disabled:cursor-default ${FREE_PLACE}`}
      >
        {noFossil ? 'Place libre' : '+ Déposer un fossile'}
      </button>
    );
  }
  const start = Date.parse(r.startedAt);
  const end = Date.parse(r.readyAt);
  const done = serverNow >= end;
  const label = `${itemName(ctx, r.itemId)} → ${speciesName(ctx, r.speciesId, r.formId)}`;
  const body = (
    <>
      <img
        src={itemIcon(ctx, r.itemId)}
        alt=""
        className="size-8 shrink-0 [image-rendering:pixelated]"
      />
      <span className={`shrink-0 ${done ? '' : 'opacity-40 brightness-0 dark:invert'}`}>
        <PokemonSprite speciesId={r.speciesId} formId={r.formId} size={36} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex justify-between gap-1 text-xs">
          <span className="truncate font-medium">{speciesName(ctx, r.speciesId, r.formId)}</span>
          <span className="shrink-0 font-mono text-slate-500">
            {done ? 'Prêt !' : shortCountdown(end - serverNow)}
          </span>
        </span>
        <ProgressBar
          className="mt-1 h-2"
          value={(serverNow - start) / (end - start)}
          barClassName="bg-[#48a8e8]"
        />
      </span>
    </>
  );
  const frame = 'flex w-full items-center gap-2 rounded-md border-2 border-ink p-1.5 text-left';
  return done ? (
    <div className={`${frame} bg-done`} title={label}>
      {body}
    </div>
  ) : (
    <button
      type="button"
      onClick={() => onOpen(r.id)}
      className={`${frame} bg-tile transition hover:border-brand-500`}
      title={`${label}. Cliquer pour le retirer.`}
    >
      {body}
    </button>
  );
}
