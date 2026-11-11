/**
 * Fenêtre réduite de la pension : une pension à la fois, ses parents, l'XP et les œufs pondus.
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { daycareXp, eggsLaid } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { CollectEggsInput, CollectEggsResponse, DaycareDto, PokemonDto } from '@poke/shared';
import { Modal, PokemonSprite, ProgressBar, useNow } from '../../components/ui';
import {
  assistantPlaces,
  collectEggs,
  keys,
  refresh,
  serverOffset,
  shownPlaces,
  useAssistants,
  useDaycare,
  usePokemon,
  withdrawDaycareParent,
} from '../../lib/queries';
import { errorText, itemIcon, itemName, speciesName } from '../../lib/labels';
import { AbilityLine, AssistantCircle } from './AssistantCard';
import { DepositDialog } from '../daycare/DepositDialog';
import { formatXp, usePlayerBonuses } from '../common/XpPreview';
import { HouseIcon } from './tileIcons';
import {
  Badge,
  CLOSED_PLACE,
  FREE_PLACE,
  HOVER_GHOST,
  HOVER_PRIMARY,
  Pager,
  SMALL_BTN,
  Tile,
  plural,
  usePage,
} from './tileParts';

/** Fenêtre de la pension dans la colonne des bâtiments. */
export function DaycareTile({ ctx }: { ctx: GameContext }) {
  const queryClient = useQueryClient();
  const daycare = useDaycare();
  const pokemon = usePokemon();
  const assistants = useAssistants();
  const now = useNow(5000);
  const [notice, setNotice] = useState<string | null>(null);
  // Pokémon cliqué (fenêtre Retirer / Changer), puis place où en déposer un.
  const [focus, setFocus] = useState<Place | null>(null);
  const [depositAt, setDepositAt] = useState<Place | null>(null);

  const refreshDaycare = () => refresh(queryClient, keys.daycare, keys.pokemon, keys.inventory);
  // XP reçue par les Pokémon qui quittent la pension.
  const xpNotice = (res: CollectEggsResponse) => {
    const xp = (res.parents ?? [])
      .filter((x) => x.xpGained > 0)
      .map((x) => {
        const parent = pokemonById.get(x.pokemonId);
        const name = parent ? speciesName(ctx, parent.speciesId, parent.formId) : 'Un Pokémon';
        const level = x.levelAfter > x.levelBefore ? ` et passe au N.${x.levelAfter}` : '';
        return `${name} gagne ${formatXp(x.xpGained)}${level}.`;
      });
    setNotice(xp.join(' ') || null);
  };
  const collect = useMutation({
    mutationFn: ({ slot, to }: { slot: number; to: CollectEggsInput['to'] }) =>
      collectEggs(slot, to),
    onSuccess: (res) => {
      setNotice(res.bagged > 0 ? `${plural(res.bagged, 'œuf')} dans le sac.` : null);
      return refreshDaycare();
    },
  });
  const withdraw = useMutation({
    mutationFn: ({ slot, side }: Place) => withdrawDaycareParent(slot, side),
    onSuccess: (res) => {
      xpNotice(res);
      setFocus(null);
      return refreshDaycare();
    },
  });

  const data = daycare.data;
  const serverNow = now + serverOffset(data, daycare.dataUpdatedAt);
  const pokemonById = new Map(pokemon.data?.map((p) => [p.id, p]));
  const openSlots = data?.slots ?? 0;
  const pensions = data?.pensions ?? [];
  const shownSlots = shownPlaces(openSlots, [
    ...pensions.map((p) => p.slotIndex),
    ...assistantPlaces(assistants.data, 'daycare'),
  ]);
  const [slot, setSlot] = usePage(shownSlots);
  const laidOf = (p: DaycareDto | undefined) =>
    p?.breeds
      ? Math.min(
          eggsLaid(ctx, new Date(p.startedAt), new Date(serverNow), p.eggMinutes),
          ctx.balance.breeding.pensionMaxEggs,
        )
      : 0;
  const pensionAt = (i: number) => pensions.find((p) => p.slotIndex === i);
  // Pensions dont des œufs attendent (la couveuse a sa propre pastille).
  const badge = pensions.filter((p) => laidOf(p) > 0).length;
  const pension = pensionAt(slot);
  const closed = slot >= openSlots;
  const parentsOf = (p: DaycareDto | undefined) =>
    [p?.parentAId, p?.parentBId].map((id) => (id ? pokemonById.get(id) : undefined));
  const focused = focus ? pensionAt(focus.slot) : undefined;
  const busy = collect.isPending || withdraw.isPending;

  return (
    <>
      <Tile tab="daycare" title="Pension" icon={<HouseIcon />} badge={<Badge count={badge} />}>
        {shownSlots === 0 && (
          <p className="text-sm text-slate-500">Aucune pension débloquée pour l’instant.</p>
        )}
        <Pager
          label="Pension"
          count={shownSlots}
          index={slot}
          onChange={setSlot}
          waiting={Array.from({ length: shownSlots }, (_, i) => laidOf(pensionAt(i)) > 0)}
        />
        {shownSlots > 0 && (
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              {pension || !closed ? (
                <PensionRow
                  ctx={ctx}
                  pension={pension}
                  parents={parentsOf(pension)}
                  waiting={laidOf(pension)}
                  serverNow={serverNow}
                  busy={busy}
                  closed={closed}
                  onCollect={(to) => collect.mutate({ slot, to })}
                  onParent={(side) => {
                    withdraw.reset();
                    setFocus({ slot, side });
                  }}
                  onAdd={(side) => setDepositAt({ slot, side })}
                />
              ) : (
                <div className={`grid h-14 place-items-center rounded-md text-sm ${CLOSED_PLACE}`}>
                  Pension fermée
                </div>
              )}
            </div>
            <AssistantCircle ctx={ctx} post="daycare" slot={slot} closed={closed} />
          </div>
        )}
        {notice && <p className="text-xs text-emerald-700 dark:text-emerald-400">{notice}</p>}
        {collect.error && <p className="text-xs text-red-600">{errorText(collect.error)}</p>}
      </Tile>
      {focus && focused && (
        <PensionParentDialog
          ctx={ctx}
          pension={focused}
          side={focus.side}
          p={parentsOf(focused)[focus.side]}
          serverNow={serverNow}
          busy={withdraw.isPending}
          error={withdraw.error}
          onWithdraw={() => withdraw.mutate(focus)}
          onChange={() => {
            setFocus(null);
            setDepositAt(focus);
          }}
          onClose={() => setFocus(null)}
        />
      )}
      {depositAt && (
        <DepositDialog
          ctx={ctx}
          slotIndex={depositAt.slot}
          side={depositAt.side}
          pension={pensionAt(depositAt.slot)}
          onDeposited={xpNotice}
          onClose={() => setDepositAt(null)}
        />
      )}
    </>
  );
}

/** Place d'un Pokémon : pension et côté (0 : parent A, 1 : parent B). */
export type Place = { slot: number; side: 0 | 1 };

/** Pokémon d'une pension cliqué dans la colonne : son séjour, et le retirer ou le changer. */
function PensionParentDialog({
  ctx,
  pension,
  side,
  p,
  serverNow,
  busy,
  error,
  onWithdraw,
  onChange,
  onClose,
}: {
  ctx: GameContext;
  pension: DaycareDto;
  side: 0 | 1;
  p: PokemonDto | undefined;
  serverNow: number;
  busy: boolean;
  error: unknown;
  onWithdraw: () => void;
  onChange: () => void;
  onClose: () => void;
}) {
  const bonuses = usePlayerBonuses(ctx);
  const since = side === 0 ? pension.parentADepositedAt : pension.parentBDepositedAt;
  const gain = p && since ? daycareXp(ctx, p, new Date(since), new Date(serverNow), bonuses) : null;
  const held = side === 0 ? pension.heldItemAId : pension.heldItemBId;
  const hasPartner = !!(side === 0 ? pension.parentBId : pension.parentAId);
  return (
    <Modal open onClose={onClose}>
      <h2 className="text-lg font-bold">Pension {pension.slotIndex + 1}</h2>
      {p && gain ? (
        <div className="mt-3 flex items-center gap-3 rounded-xl border-2 border-ink bg-tile p-3">
          <span className="sprite-well size-16 shrink-0">
            <PokemonSprite speciesId={p.speciesId} formId={p.formId} shiny={p.isShiny} size={64} />
          </span>
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">
              {speciesName(ctx, p.speciesId, p.formId)}{' '}
              <span className="text-xs text-slate-500">N.{p.level}</span>
            </p>
            <p className="text-xs text-slate-500">
              {gain.xpGained > 0 ? (
                <>
                  <span className="text-emerald-600">+{formatXp(gain.xpGained)}</span> au retrait
                  {gain.levelAfter > gain.levelBefore && ` (N.${gain.levelAfter})`}
                </>
              ) : p.level >= 100 ? (
                'Niveau maximal'
              ) : (
                'Pas encore d’XP'
              )}
            </p>
            {held && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                <img src={itemIcon(ctx, held)} alt="" className="h-4 w-4" />
                {itemName(ctx, held)}
              </p>
            )}
            <AbilityLine ctx={ctx} p={p} activities={['breeding']} />
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500">Ce Pokémon n’est plus dans le PC.</p>
      )}
      <p className="mt-3 text-sm text-slate-500">
        En quittant la pension, il reçoit son XP
        {pension.breeds && ' et les œufs prêts vont dans la couveuse (le surplus dans le sac)'}.
        {hasPartner && ' Son partenaire reste en pension.'}
      </p>
      {error ? <p className="mt-2 text-sm text-red-600">{errorText(error)}</p> : null}
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>
          Annuler
        </button>
        <button className="btn-ghost" disabled={busy} onClick={onWithdraw}>
          {busy ? 'Retrait…' : 'Retirer'}
        </button>
        <button className="btn-primary" disabled={busy} onClick={onChange}>
          Changer
        </button>
      </div>
    </Modal>
  );
}

function PensionRow({
  ctx,
  pension,
  parents,
  waiting,
  serverNow,
  busy,
  closed,
  onCollect,
  onParent,
  onAdd,
}: {
  ctx: GameContext;
  /** Pension vide : ses deux places sont libres. */
  pension: DaycareDto | undefined;
  parents: (PokemonDto | undefined)[];
  waiting: number;
  serverNow: number;
  busy: boolean;
  /** Pension fermée : on ne peut plus y déposer de Pokémon. */
  closed: boolean;
  onCollect: (to: CollectEggsInput['to']) => void;
  /** Clic sur un Pokémon : le retirer ou le changer. */
  onParent: (side: 0 | 1) => void;
  /** Clic sur une place libre : y déposer un Pokémon. */
  onAdd: (side: 0 | 1) => void;
}) {
  const max = ctx.balance.breeding.pensionMaxEggs;
  const breeds = pension?.breeds ?? false;
  const start = pension ? Date.parse(pension.startedAt) : 0;
  const cycle = (pension?.eggMinutes ?? 0) * 60_000;
  const laid =
    pension && breeds ? eggsLaid(ctx, new Date(start), new Date(serverNow), pension.eggMinutes) : 0;
  const nextAt = start + (laid + 1) * cycle;
  const [a, b] = parents;
  const sprite = (p: PokemonDto | undefined, side: 0 | 1) => (
    <ParentSprite
      ctx={ctx}
      p={p}
      onOpen={() => onParent(side)}
      onAdd={closed || busy ? undefined : () => onAdd(side)}
    />
  );
  return (
    <div
      className={`space-y-1.5 rounded-md border-2 p-2 ${
        pension ? `border-ink ${waiting > 0 ? 'bg-done' : 'bg-tile'}` : FREE_PLACE
      }`}
    >
      <div className="flex items-center gap-1">
        {sprite(a, 0)}
        <span
          className={breeds ? 'text-rose-400' : 'text-slate-300 dark:text-slate-600'}
          title={breeds || !a || !b ? undefined : 'Ces deux Pokémon ne peuvent pas s’accoupler.'}
          aria-hidden
        >
          ♥
        </span>
        {sprite(b, 1)}
        <span className="ml-auto text-right text-sm leading-tight">
          {!pension ? (
            <span className="text-xs text-slate-500">Pension libre</span>
          ) : breeds ? (
            <>
              <strong>
                {waiting} / {max}
              </strong>{' '}
              <span className="text-slate-500">{waiting > 1 ? 'œufs' : 'œuf'}</span>
            </>
          ) : (
            <span className="text-xs text-slate-500">XP seulement</span>
          )}
        </span>
      </div>
      {breeds && waiting < max && (
        <ProgressBar
          className="h-2"
          value={(serverNow - (nextAt - cycle)) / cycle}
          barClassName="bg-[#f8d030]"
        />
      )}
      {waiting > 0 && (
        <div className="flex justify-end gap-1.5">
          <button
            className={`btn-ghost ${SMALL_BTN} ${HOVER_GHOST}`}
            disabled={busy}
            onClick={() => onCollect('bag')}
            title="Range les œufs prêts dans le sac."
          >
            Ramasser
          </button>
          <button
            className={`btn-primary ${SMALL_BTN} ${HOVER_PRIMARY}`}
            disabled={busy}
            onClick={() => onCollect('incubator')}
            title="Place les œufs prêts dans la couveuse ; ceux qui n’y tiennent pas vont dans le sac."
          >
            Couver
          </button>
        </div>
      )}
    </div>
  );
}

function ParentSprite({
  ctx,
  p,
  onOpen,
  onAdd,
}: {
  ctx: GameContext;
  p: PokemonDto | undefined;
  onOpen: () => void;
  /** Place libre : y déposer un Pokémon (absent si la pension est fermée). */
  onAdd?: () => void;
}) {
  return p ? (
    <button
      type="button"
      onClick={onOpen}
      className="sprite-well size-10 shrink-0 transition hover:border-brand-500"
      title={`${speciesName(ctx, p.speciesId, p.formId)} · N.${p.level}. Retirer ou changer ce Pokémon.`}
    >
      <PokemonSprite speciesId={p.speciesId} formId={p.formId} shiny={p.isShiny} size={40} />
    </button>
  ) : (
    <button
      type="button"
      disabled={!onAdd}
      onClick={onAdd}
      className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-dashed border-slate-300 text-slate-400 transition enabled:hover:border-brand-500 enabled:hover:text-brand-500 disabled:cursor-default dark:border-slate-700"
      title={onAdd ? 'Déposer un Pokémon' : undefined}
      aria-label="Déposer un Pokémon"
    >
      +
    </button>
  );
}
