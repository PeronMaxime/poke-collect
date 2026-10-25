import { useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'motion/react';
import type { GameContext } from '@poke/game-core';
import type { OpenChestResponse } from '@poke/shared';
import { Modal } from '../../components/ui';
import { api } from '../../lib/api';
import { keys } from '../../lib/game';
import { errorText, itemIcon, itemName } from '../../lib/labels';

/** Ouverture de coffres de guilde : la demande part à l'ouverture, puis les lots s'affichent. */
export function ChestOpenDialog({
  ctx,
  itemId,
  count,
  onClose,
}: {
  ctx: GameContext;
  itemId: string;
  count: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  const open = useMutation({
    mutationFn: () =>
      api<OpenChestResponse>('/api/items/open-chest', { method: 'POST', json: { itemId, count } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.inventory }),
  });
  const { mutate } = open;
  // Une seule demande, même quand le mode strict de React rejoue l'effet.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    mutate();
  }, [mutate]);

  return (
    <Modal open onClose={onClose}>
      <div className="space-y-4 text-center">
        <h2 className="text-lg font-semibold">
          {count > 1 ? `${count} × ${itemName(ctx, itemId)}` : itemName(ctx, itemId)}
        </h2>
        <motion.img
          src={itemIcon(ctx, itemId)}
          alt=""
          className="mx-auto h-16 w-16 [image-rendering:pixelated]"
          animate={open.isPending && !reduceMotion ? { rotate: [0, -8, 8, -8, 0] } : undefined}
          transition={{ duration: 0.5, repeat: Infinity }}
        />
        {open.isPending && <p className="text-sm text-slate-500">Ouverture…</p>}
        {open.error && <p className="text-sm text-red-600">{errorText(open.error)}</p>}
        {open.data && (
          <ul className="grid gap-2 sm:grid-cols-2">
            {open.data.loot.map((s, i) => (
              <motion.li
                key={s.itemId}
                className="card flex items-center gap-3 p-3 text-left"
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.12 }}
              >
                <img
                  src={itemIcon(ctx, s.itemId)}
                  alt=""
                  className="h-10 w-10 shrink-0 [image-rendering:pixelated]"
                />
                <span className="flex-1 font-medium">{itemName(ctx, s.itemId)}</span>
                <span className="font-mono text-sm">× {s.quantity}</span>
              </motion.li>
            ))}
          </ul>
        )}
        <button className="btn-primary" onClick={onClose} disabled={open.isPending}>
          {open.data ? 'Super !' : 'Fermer'}
        </button>
      </div>
    </Modal>
  );
}
