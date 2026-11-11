/**
 * Fenêtre réduite de la couveuse : œufs en cours, éclosions, œufs du sac à couver.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ASSISTANT_POST_PLACES, assistantSlotCount, hatchMinutes } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { BagEggDto, EggDto, HatchEggsResponse } from '@poke/shared';
import { Egg, EggTimer, Modal, useNow } from '../../components/ui';
import {
  PROGRESS_KEYS,
  assistantPlaces,
  hatchEggs,
  incubateEggs,
  keys,
  refresh,
  serverOffset,
  shownPlaces,
  useAssistants,
  useDaycare,
  withdrawEgg,
} from '../../lib/queries';
import { errorText, formatDuration, speciesName } from '../../lib/labels';
import { AssistantCircle } from './AssistantCard';
import { groupBagEggs } from '../daycare/DaycarePage';
import { HatchReveal } from '../daycare/HatchReveal';
import { EggIcon, LockIcon } from './tileIcons';
import {
  Badge,
  CLOSED_PLACE,
  FREE_PLACE,
  HOVER_GHOST,
  HOVER_PRIMARY,
  Pager,
  SMALL_BTN,
  Tile,
  TileFooter,
  plural,
  shortCountdown,
  usePage,
} from './tileParts';

/** État de la fenêtre de la couveuse : couveuse affichée, œufs prêts, éclosion, couvaison et retrait. */
function useIncubatorTile({ ctx }: { ctx: GameContext }) {
  const queryClient = useQueryClient();
  const daycare = useDaycare();
  const assistants = useAssistants();
  const now = useNow(5000);
  const [hatched, setHatched] = useState<HatchEggsResponse | null>(null);
  // « Couver » : choix des œufs du sac à mettre en couveuse.
  const [picking, setPicking] = useState(false);
  // Œuf cliqué (fenêtre Retirer).
  const [focusId, setFocusId] = useState<string | null>(null);

  const hatch = useMutation({
    mutationFn: () => hatchEggs(),
    onSuccess: (data) => {
      setHatched(data);
      // Éclosion : nouveaux Pokémon, Pokédex, quêtes et activité de guilde.
      return refresh(queryClient, keys.daycare, keys.pokemon, ...PROGRESS_KEYS, keys.guild);
    },
  });
  const incubate = useMutation({
    mutationFn: (ids: string[]) => incubateEggs(ids),
    onSuccess: () => refresh(queryClient, keys.daycare),
  });
  const withdraw = useMutation({
    mutationFn: (id: string) => withdrawEgg(id),
    onSuccess: () => {
      setFocusId(null);
      return refresh(queryClient, keys.daycare);
    },
  });

  const data = daycare.data;
  const serverNow = now + serverOffset(data, daycare.dataUpdatedAt);
  const incubated = data?.eggs ?? [];
  const focused = incubated.find((e) => e.id === focusId);
  const maxEggs = data?.maxEggs ?? 0;
  const bagEggs = data?.bagEggs ?? [];
  const shownEggs = shownPlaces(maxEggs, [
    ...incubated.map((e) => e.slotIndex),
    ...assistantPlaces(assistants.data, 'incubator'),
  ]);
  const size = ASSISTANT_POST_PLACES.incubator;
  const incubators = assistantSlotCount('incubator', shownEggs);
  const [incubator, setIncubator] = usePage(incubators);
  const first = incubator * size;
  const isReady = (e: EggDto) => Date.parse(e.hatchAt) <= serverNow;
  const readyEggs = incubated.filter(isReady).length;
  const taken = new Set(incubated.map((e) => e.slotIndex));
  const freePlaces = Array.from({ length: maxEggs }, (_, i) => i).filter(
    (i) => !taken.has(i),
  ).length;
  const toIncubate = Math.min(bagEggs.length, freePlaces);
  const busy = hatch.isPending || incubate.isPending;
  const error = hatch.error ?? incubate.error;

  return {
    ctx,
    queryClient,
    daycare,
    assistants,
    now,
    hatched,
    setHatched,
    picking,
    setPicking,
    focusId,
    setFocusId,
    hatch,
    incubate,
    withdraw,
    data,
    serverNow,
    incubated,
    focused,
    maxEggs,
    bagEggs,
    shownEggs,
    size,
    incubators,
    incubator,
    setIncubator,
    first,
    isReady,
    readyEggs,
    taken,
    freePlaces,
    toIncubate,
    busy,
    error,
  };
}

/** Ce qu'affichent les pièces de `IncubatorTile`. */
type IncubatorTileModel = ReturnType<typeof useIncubatorTile>;

/** Fenêtre de la couveuse dans la colonne des bâtiments. */
export function IncubatorTile({ ctx }: { ctx: GameContext }) {
  const m = useIncubatorTile({ ctx });
  const {
    hatched,
    setHatched,
    picking,
    setPicking,
    setFocusId,
    incubate,
    withdraw,
    serverNow,
    incubated,
    focused,
    bagEggs,
    size,
    incubators,
    incubator,
    setIncubator,
    isReady,
    readyEggs,
    freePlaces,
    toIncubate,
    busy,
    error,
  } = m;
  return (
    <>
      <Tile
        tab="daycare"
        title="Couveuse"
        icon={<EggIcon />}
        badge={<Badge count={readyEggs + toIncubate} />}
      >
        {incubators === 0 && (
          <p className="text-sm text-slate-500">Aucune couveuse débloquée pour l’instant.</p>
        )}
        <Pager
          label="Couveuse"
          count={incubators}
          index={incubator}
          onChange={setIncubator}
          waiting={Array.from({ length: incubators }, (_, k) =>
            incubated.some((e) => Math.floor(e.slotIndex / size) === k && isReady(e)),
          )}
        />
        <IncubatorEggs m={m} />
        <IncubatorActions m={m} />
        {error && <p className="text-xs text-red-600">{errorText(error)}</p>}
      </Tile>
      {picking && (
        <BagEggsDialog
          ctx={ctx}
          eggs={bagEggs}
          freePlaces={freePlaces}
          busy={busy}
          onIncubate={(ids) => {
            incubate.mutate(ids);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
      {focused && (
        <WithdrawDialog
          title={`Couveuse ${Math.floor(focused.slotIndex / size) + 1}`}
          icon={<Egg size={40} />}
          name={`${speciesName(ctx, focused.speciesId, focused.formId)} ?`}
          detail={`Éclosion dans ${shortCountdown(Date.parse(focused.hatchAt) - serverNow)}`}
          explanation="L’œuf revient dans le sac et sa place se libère. Remis en couveuse, son incubation repartira de zéro."
          busy={withdraw.isPending}
          error={withdraw.error}
          onWithdraw={() => withdraw.mutate(focused.id)}
          onClose={() => setFocusId(null)}
        />
      )}
      <HatchReveal ctx={ctx} data={hatched} onClose={() => setHatched(null)} />
    </>
  );
}

/** Œufs de la couveuse affichée : un par place, prêts à éclore ou en cours. */
function IncubatorEggs({ m }: { m: IncubatorTileModel }) {
  const {
    ctx,
    setFocusId,
    withdraw,
    serverNow,
    incubated,
    maxEggs,
    shownEggs,
    size,
    incubators,
    incubator,
    first,
    isReady,
  } = m;
  return (
    <>
      {incubators > 0 && (
        <div className="flex items-center gap-2">
          <div className="grid min-w-0 flex-1 grid-cols-3 gap-1">
            {Array.from({ length: Math.min(size, shownEggs - first) }, (_, i) => {
              const place = first + i;
              const egg = incubated.find((e) => e.slotIndex === place);
              if (egg) {
                const ready = isReady(egg);
                const start = Date.parse(egg.incubatedAt);
                const end = Date.parse(egg.hatchAt);
                const timer = (
                  <EggTimer
                    progress={(serverNow - start) / (end - start)}
                    ready={ready}
                    title={`${speciesName(ctx, egg.speciesId, egg.formId)} ? ${
                      ready
                        ? 'Prêt à éclore'
                        : `Éclosion dans ${shortCountdown(end - serverNow)}. Cliquer pour le retirer.`
                    }`}
                  />
                );
                return (
                  <div key={place} className="flex justify-center">
                    {ready ? (
                      timer
                    ) : (
                      <button
                        type="button"
                        className="rounded-full outline-offset-1 outline-brand-500 transition hover:outline-2 focus-visible:outline-2"
                        onClick={() => {
                          withdraw.reset();
                          setFocusId(egg.id);
                        }}
                      >
                        {timer}
                      </button>
                    )}
                  </div>
                );
              }
              return place < maxEggs ? (
                <div
                  key={place}
                  title="Place libre"
                  className={`mx-auto size-12 rounded-full ${FREE_PLACE}`}
                />
              ) : (
                <div
                  key={place}
                  title="Place fermée"
                  className={`mx-auto grid size-12 place-items-center rounded-full ${CLOSED_PLACE}`}
                >
                  <LockIcon />
                </div>
              );
            })}
          </div>
          <AssistantCircle ctx={ctx} post="incubator" slot={incubator} closed={first >= maxEggs} />
        </div>
      )}
    </>
  );
}

/** Barre d'actions : faire éclore les œufs prêts, couver ceux du sac. */
function IncubatorActions({ m }: { m: IncubatorTileModel }) {
  const { setPicking, hatch, bagEggs, incubators, readyEggs, toIncubate, busy } = m;
  return (
    <>
      {incubators > 0 && (readyEggs > 0 || bagEggs.length > 0) && (
        <TileFooter
          text={
            <>
              {readyEggs > 0 && `${plural(readyEggs, 'œuf')} prêt${readyEggs > 1 ? 's' : ''}`}
              {bagEggs.length > 0 && (
                <span className="block text-xs text-slate-500">
                  {plural(bagEggs.length, 'œuf')} dans le sac
                </span>
              )}
            </>
          }
        >
          <span className="flex shrink-0 gap-1.5">
            {toIncubate > 0 && (
              <button
                className={`btn-ghost ${SMALL_BTN} ${HOVER_GHOST}`}
                disabled={busy}
                onClick={() => setPicking(true)}
                title="Choisis les œufs du sac à placer dans les places libres de la couveuse."
              >
                Couver
              </button>
            )}
            {readyEggs > 0 && (
              <button
                className={`btn-primary ${SMALL_BTN} ${HOVER_PRIMARY}`}
                disabled={busy}
                onClick={() => hatch.mutate()}
              >
                {hatch.isPending ? 'Éclosion…' : `Éclore (${readyEggs})`}
              </button>
            )}
          </span>
        </TileFooter>
      )}
    </>
  );
}

/** Œuf ou fossile cliqué dans la colonne : le retirer (il revient dans le sac). */
export function WithdrawDialog({
  title,
  icon,
  name,
  detail,
  explanation,
  busy,
  error,
  onWithdraw,
  onClose,
}: {
  title: string;
  icon: ReactNode;
  name: string;
  detail: ReactNode;
  explanation: string;
  busy: boolean;
  error: unknown;
  onWithdraw: () => void;
  onClose: () => void;
}) {
  return (
    <Modal open onClose={onClose}>
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="mt-3 flex items-center gap-3 rounded-xl border-2 border-ink bg-tile p-3">
        <span className="sprite-well size-16 shrink-0">{icon}</span>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-medium">{name}</p>
          <p className="text-xs text-slate-500">{detail}</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-500">{explanation}</p>
      {error ? <p className="mt-2 text-sm text-red-600">{errorText(error)}</p> : null}
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>
          Annuler
        </button>
        <button className="btn-primary" disabled={busy} onClick={onWithdraw}>
          {busy ? 'Retrait…' : 'Retirer'}
        </button>
      </div>
    </Modal>
  );
}

/** Choix des œufs du sac à couver, par espèce, dans la limite des places libres. */
function BagEggsDialog({
  ctx,
  eggs,
  freePlaces,
  busy,
  onIncubate,
  onClose,
}: {
  ctx: GameContext;
  eggs: readonly BagEggDto[];
  freePlaces: number;
  busy: boolean;
  onIncubate: (ids: string[]) => void;
  onClose: () => void;
}) {
  const groups = groupBagEggs(eggs);
  const keyOf = (g: (typeof groups)[number]) => `${g.speciesId}:${g.formId ?? ''}`;
  // Nombre d'œufs choisis par espèce (les plus anciens de chaque groupe partent en premier).
  const [counts, setCounts] = useState<Record<string, number>>({});
  const countOf = (g: (typeof groups)[number]) => Math.min(counts[keyOf(g)] ?? 0, g.ids.length);
  const total = groups.reduce((sum, g) => sum + countOf(g), 0);
  const left = freePlaces - total;
  const set = (g: (typeof groups)[number], n: number) =>
    setCounts((c) => ({ ...c, [keyOf(g)]: Math.max(0, Math.min(n, g.ids.length)) }));
  const chosen = groups.flatMap((g) => g.ids.slice(0, countOf(g))).slice(0, freePlaces);

  return (
    <Modal open onClose={onClose}>
      <h2 className="text-xl font-bold">Couver des œufs</h2>
      <p className="mt-1 text-sm text-slate-500">
        {left > 0
          ? `${plural(left, 'place')} libre${left > 1 ? 's' : ''} dans la couveuse.`
          : 'Toutes les places libres de la couveuse sont choisies.'}
      </p>
      <ul className="-mx-1 mt-2 grid max-h-[60vh] gap-2 overflow-y-auto p-1">
        {groups.map((g) => {
          const n = countOf(g);
          return (
            <li key={keyOf(g)} className="card flex items-center gap-3 p-3">
              <Egg size={32} />
              <span className="min-w-0 flex-1 text-sm">
                <span className="block font-medium">
                  {speciesName(ctx, g.speciesId, g.formId)} ?{' '}
                  <span className="font-mono text-slate-500">× {g.ids.length}</span>
                </span>
                <span className="block text-xs text-slate-500">
                  Éclosion en {formatDuration(hatchMinutes(ctx, g.speciesId))} (sans assistant)
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <button
                  className={`btn-ghost ${SMALL_BTN}`}
                  disabled={n === 0}
                  onClick={() => set(g, n - 1)}
                  aria-label="Un œuf de moins"
                >
                  −
                </button>
                <span className="w-6 text-center font-mono text-sm">{n}</span>
                <button
                  className={`btn-ghost ${SMALL_BTN}`}
                  disabled={left <= 0 || n >= g.ids.length}
                  onClick={() => set(g, n + 1)}
                  aria-label="Un œuf de plus"
                >
                  +
                </button>
                {g.ids.length > 1 && (
                  <button
                    className={`btn-ghost ${SMALL_BTN}`}
                    disabled={left <= 0 || n >= g.ids.length}
                    onClick={() => set(g, n + left)}
                    title="Autant d’œufs de cette espèce que possible"
                  >
                    Max
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>
          Annuler
        </button>
        <button
          className="btn-primary"
          disabled={busy || chosen.length === 0}
          onClick={() => onIncubate(chosen)}
        >
          {chosen.length > 0 ? `Couver (${chosen.length})` : 'Couver'}
        </button>
      </div>
    </Modal>
  );
}
