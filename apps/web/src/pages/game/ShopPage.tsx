import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import type { ShopEntry } from '@poke/content';
import { maxPurchasableLots } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { PurchaseResponse, ShopEntryStatusDto } from '@poke/shared';
import { Modal, useNow } from '../../components/ui';
import { api } from '../../lib/api';
import { keys, serverOffset, useShop } from '../../lib/game';
import {
  RARITY_LABELS,
  RARITY_STYLES,
  effectText,
  errorText,
  formatMoney,
  itemIcon,
  itemName,
  unlockConditionText,
} from '../../lib/labels';

const PERIOD_LABELS = { total: 'au total', day: 'par jour', week: 'par semaine' } as const;

/** Attente lisible : « 6 j 23 h », « 3 h 12 min », « 4 min ». */
function formatWait(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  if (d > 0) return h ? `${d} j ${h} h` : `${d} j`;
  if (h > 0) return m ? `${h} h ${m} min` : `${h} h`;
  return `${m} min`;
}

const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

export function ShopPage({ ctx }: { ctx: GameContext }) {
  const queryClient = useQueryClient();
  const shop = useShop();
  const now = useNow(30_000);
  const [category, setCategory] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<PurchaseResponse | null>(null);

  // Les nouveautés restent mises en avant pendant la visite, mais sont marquées comme vues.
  const fresh = useMemo(
    () => shop.data?.entries.filter((e) => e.isNew).map((e) => e.entryId) ?? [],
    [shop.data],
  );
  const [highlight, setHighlight] = useState<ReadonlySet<string>>(() => new Set(fresh));
  const [highlighted, setHighlighted] = useState(fresh);
  if (highlighted !== fresh) {
    setHighlighted(fresh);
    if (fresh.length > 0) setHighlight(new Set([...highlight, ...fresh]));
  }
  const { mutate: markSeen } = useMutation({
    mutationFn: (entryIds: string[]) =>
      api('/api/shop/seen', { method: 'POST', json: { entryIds } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.shop }),
  });
  useEffect(() => {
    if (fresh.length > 0) markSeen(fresh);
  }, [fresh, markSeen]);

  const buy = useMutation({
    mutationFn: (input: { entryId: string; lots: number }) =>
      api<PurchaseResponse>('/api/shop/purchase', { method: 'POST', json: input }),
    onSuccess: (data) => {
      setReceipt(data);
      return Promise.all(
        [keys.shop, keys.inventory, keys.me].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
  });

  if (shop.isPending) return <p className="text-sm text-slate-500">Chargement…</p>;
  if (!shop.data) return <p className="text-sm text-red-600">{errorText(shop.error)}</p>;

  const serverNow = now + serverOffset(shop.data, shop.dataUpdatedAt);
  const statuses = shop.data.entries.flatMap((status) => {
    const entry = ctx.shopEntry(status.entryId);
    return entry ? [{ entry, status }] : [];
  });
  const categories = ctx.shopCategories.filter((c) =>
    statuses.some((s) => s.entry.categoryId === c.id),
  );
  const current = categories.find((c) => c.id === category) ?? categories[0];
  const shown = statuses.filter((s) => s.entry.categoryId === current?.id);

  if (!current) {
    return <p className="text-sm text-slate-500">La boutique n’a encore rien à te proposer.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {categories.map((c) => {
            const fresh = statuses.some(
              (s) => s.entry.categoryId === c.id && highlight.has(s.entry.id),
            );
            const firstEntry = statuses.find((s) => s.entry.categoryId === c.id)?.entry;
            return (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  c.id === current.id
                    ? 'bg-brand-500 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                <img
                  src={c.icon ?? (firstEntry ? itemIcon(ctx, firstEntry.itemId) : '')}
                  alt=""
                  className="h-5 w-5 [image-rendering:pixelated]"
                />
                {c.name}
                {fresh && <span className="h-2 w-2 rounded-full bg-amber-400" title="Nouveau" />}
              </button>
            );
          })}
        </div>
        <p className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          Solde : {formatMoney(shop.data.currency)}
        </p>
      </div>

      {buy.error && <p className="text-sm text-red-600">{errorText(buy.error)}</p>}

      <ul className="grid gap-3 sm:grid-cols-2">
        {shown.map(({ entry, status }) => (
          <ShopEntryCard
            key={entry.id}
            ctx={ctx}
            entry={entry}
            status={status}
            isNew={highlight.has(entry.id)}
            currency={shop.data.currency}
            serverNow={serverNow}
            buying={buy.isPending && buy.variables?.entryId === entry.id}
            onBuy={(lots) => buy.mutate({ entryId: entry.id, lots })}
          />
        ))}
      </ul>

      <PurchaseReceipt ctx={ctx} receipt={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}

function ShopEntryCard({
  ctx,
  entry,
  status,
  isNew,
  currency,
  serverNow,
  buying,
  onBuy,
}: {
  ctx: GameContext;
  entry: ShopEntry;
  status: ShopEntryStatusDto;
  isNew: boolean;
  currency: number;
  serverNow: number;
  buying: boolean;
  onBuy: (lots: number) => void;
}) {
  const [lots, setLots] = useState(1);
  const item = ctx.item(entry.itemId);
  const locked = status.state === 'locked';
  const max = maxPurchasableLots(entry, status, currency);
  const chosen = Math.min(Math.max(1, lots), Math.max(1, max));
  const limit = entry.purchaseLimit;

  return (
    <li
      className={`card relative flex flex-col gap-3 p-4 ${locked ? 'opacity-60' : ''} ${
        isNew ? 'ring-2 ring-amber-400' : ''
      }`}
    >
      {isNew && (
        <motion.span
          className="absolute -top-2 right-3 rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-amber-950 shadow"
          initial={{ scale: 0, rotate: -12 }}
          animate={{ scale: 1, rotate: -6 }}
          transition={{ type: 'spring', stiffness: 400, damping: 12 }}
        >
          Nouveau !
        </motion.span>
      )}
      <div className="flex items-start gap-3">
        <img
          src={itemIcon(ctx, entry.itemId)}
          alt=""
          className={`h-12 w-12 shrink-0 [image-rendering:pixelated] ${locked ? 'grayscale' : ''}`}
        />
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline justify-between gap-2">
            <span className="font-semibold">
              {item?.name ?? entry.itemId}
              {entry.lotSize > 1 && (
                <span className="ml-1 text-sm font-normal text-slate-500">× {entry.lotSize}</span>
              )}
            </span>
            <span className="shrink-0 font-semibold">{formatMoney(entry.price)}</span>
          </p>
          {item && (
            <p className={`text-xs ${RARITY_STYLES[item.rarity]}`}>
              {RARITY_LABELS[item.rarity]}
              {item.effects.map((e) => ` · ${effectText(e)}`).join('')}
            </p>
          )}
          {entry.lotSize > 1 && (
            <p className="text-xs text-slate-500">
              soit {formatMoney(Math.round(entry.price / entry.lotSize))} l’unité
            </p>
          )}
          {item?.description && <p className="mt-1 text-xs text-slate-500">{item.description}</p>}
        </div>
      </div>

      {(limit || entry.availableUntil) && (
        <p className="flex flex-wrap gap-x-3 text-xs text-slate-500">
          {limit && (
            <span>
              Limite : {limit.lots} lot{limit.lots > 1 ? 's' : ''} {PERIOD_LABELS[limit.period]}
              {status.remainingLots !== null && status.state === 'available' && (
                <> (reste {status.remainingLots})</>
              )}
            </span>
          )}
          {entry.availableUntil && <span>Jusqu’au {formatDay(entry.availableUntil)}</span>}
        </p>
      )}

      <div className="mt-auto">
        {locked ? (
          <p className="text-center text-sm text-slate-500">
            🔒 {unlockConditionText(ctx, entry.unlock) ?? 'Verrouillé'}
          </p>
        ) : status.state === 'soldOut' ? (
          <p className="text-center text-sm text-slate-500">
            Limite atteinte
            {status.nextLotsAt &&
              ` — de nouveau dans ${formatWait(Date.parse(status.nextLotsAt) - serverNow)}`}
          </p>
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-700">
              <button
                className="px-2.5 py-1.5 text-slate-500 disabled:opacity-30"
                disabled={chosen <= 1}
                onClick={() => setLots(chosen - 1)}
                aria-label="Un lot de moins"
              >
                −
              </button>
              <input
                type="number"
                className="w-12 bg-transparent text-center text-sm [appearance:textfield]"
                value={chosen}
                min={1}
                max={Math.max(1, max)}
                aria-label="Nombre de lots"
                onChange={(e) => setLots(e.target.valueAsNumber || 1)}
              />
              <button
                className="px-2.5 py-1.5 text-slate-500 disabled:opacity-30"
                disabled={chosen >= max}
                onClick={() => setLots(chosen + 1)}
                aria-label="Un lot de plus"
              >
                +
              </button>
            </div>
            <button
              className="btn-primary flex-1"
              disabled={max === 0 || buying}
              onClick={() => onBuy(chosen)}
            >
              {max === 0
                ? 'Pas assez de ₽'
                : buying
                  ? 'Achat…'
                  : `Acheter · ${formatMoney(entry.price * chosen)}`}
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

/** Animation d'achat : l'objet tombe dans le sac. */
function PurchaseReceipt({
  ctx,
  receipt,
  onClose,
}: {
  ctx: GameContext;
  receipt: PurchaseResponse | null;
  onClose: () => void;
}) {
  return (
    <Modal open={!!receipt} onClose={onClose}>
      {receipt && (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <motion.img
            src={itemIcon(ctx, receipt.itemId)}
            alt=""
            className="h-20 w-20 [image-rendering:pixelated]"
            initial={{ y: -60, scale: 0.4, opacity: 0, rotate: -30 }}
            animate={{ y: 0, scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 14 }}
          />
          <motion.p
            className="text-xl font-bold"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
          >
            + {receipt.quantity} {itemName(ctx, receipt.itemId)}
          </motion.p>
          <motion.p
            className="text-sm text-slate-500"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.45 }}
          >
            − {formatMoney(receipt.totalPrice)} · solde {formatMoney(receipt.currency)} · tu en as{' '}
            {receipt.inventoryQuantity} dans ton sac
          </motion.p>
          <button className="btn-primary mt-2" onClick={onClose}>
            Merci !
          </button>
        </div>
      )}
    </Modal>
  );
}
