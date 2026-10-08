import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fossilEffect } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { FossilRevivalDto, ReviveFossilsResponse } from '@poke/shared';
import { PokemonSprite, ProgressBar, useNow } from '../../components/ui';
import { api } from '../../lib/api';
import { PLAYER_STATE_KEYS, serverOffset, useInventory, useMuseum } from '../../lib/game';
import {
  errorText,
  formatCountdown,
  formatDuration,
  itemIcon,
  itemName,
  speciesName,
} from '../../lib/labels';
import { HatchReveal } from './HatchReveal';

/** Musée : les fossiles trouvés en expédition y redeviennent des Pokémon, après un délai. */
export function MuseumPage({ ctx }: { ctx: GameContext }) {
  const queryClient = useQueryClient();
  const museum = useMuseum();
  const inventory = useInventory();
  const now = useNow();
  const [revived, setRevived] = useState<ReviveFossilsResponse | null>(null);

  const refresh = () =>
    Promise.all(PLAYER_STATE_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  const deposit = useMutation({
    mutationFn: (itemId: string) =>
      api<FossilRevivalDto>('/api/museum', { method: 'POST', json: { itemId } }),
    onSuccess: refresh,
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api<FossilRevivalDto>(`/api/museum/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
  const revive = useMutation({
    mutationFn: () => api<ReviveFossilsResponse>('/api/museum/revive', { method: 'POST' }),
    onSuccess: (data) => {
      setRevived(data);
      return refresh();
    },
  });

  const data = museum.data;
  const serverNow = now + serverOffset(data, museum.dataUpdatedAt);
  const revivals = data?.revivals ?? [];
  const slots = data?.slots ?? 0;
  const full = revivals.length >= slots;
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

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">
            Musée{' '}
            <span className="text-sm font-normal text-slate-500">
              {revivals.length} / {slots}
            </span>
          </h2>
          <button
            className="btn-primary"
            disabled={ready === 0 || pending}
            onClick={() => revive.mutate()}
          >
            {revive.isPending ? 'Restauration…' : `Récupérer${ready ? ` (${ready})` : ''}`}
          </button>
        </div>
        <p className="mb-3 text-sm text-slate-500">
          Confie un fossile aux scientifiques du Musée : après quelques heures, il redevient un
          Pokémon.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          {Array.from({ length: slots }, (_, i) => {
            const revival = revivals[i];
            return revival ? (
              <RevivalCard
                key={revival.id}
                ctx={ctx}
                revival={revival}
                serverNow={serverNow}
                busy={pending}
                onCancel={() => cancel.mutate(revival.id)}
              />
            ) : (
              <div
                key={`empty-${i}`}
                className="grid min-h-36 place-items-center rounded-2xl border-2 border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-700"
              >
                Place libre
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Tes fossiles</h2>
        {fossils.length === 0 ? (
          <p className="text-sm text-slate-500">
            Aucun fossile dans ton sac.
            {digSites.length > 0 &&
              ` On en trouve parfois en expédition : ${digSites.map((z) => z.name).join(', ')}.`}
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {fossils.map((s) => {
              const effect = fossilEffect(ctx, s.itemId)!;
              return (
                <li key={s.itemId} className="card flex items-center gap-3 p-3">
                  <img
                    src={itemIcon(ctx, s.itemId)}
                    alt=""
                    className="h-10 w-10 shrink-0 [image-rendering:pixelated]"
                  />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{itemName(ctx, s.itemId)}</span>
                      <span className="font-mono">× {s.quantity}</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      {speciesName(ctx, effect.speciesId, effect.formId)} · N.{effect.level} ·{' '}
                      {formatDuration(effect.minutes)}
                    </p>
                  </div>
                  <button
                    className="btn-primary"
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
      </section>

      {error && <p className="text-sm text-red-600">{errorText(error)}</p>}

      <HatchReveal
        ctx={ctx}
        data={revived && { hatched: revived.revived, newSpeciesIds: revived.newSpeciesIds }}
        onClose={() => setRevived(null)}
        title={(n) => `${n} fossile${n > 1 ? 's' : ''} restauré${n > 1 ? 's' : ''} !`}
        cover={<FossilStone />}
      />
    </div>
  );
}

function RevivalCard({
  ctx,
  revival,
  serverNow,
  busy,
  onCancel,
}: {
  ctx: GameContext;
  revival: FossilRevivalDto;
  serverNow: number;
  busy: boolean;
  onCancel: () => void;
}) {
  const start = Date.parse(revival.startedAt);
  const end = Date.parse(revival.readyAt);
  const ready = serverNow >= end;
  return (
    <div className={`card flex flex-col gap-2 p-4 ${ready ? 'ring-2 ring-brand-500/50' : ''}`}>
      <div className="flex items-center gap-3">
        <img
          src={itemIcon(ctx, revival.itemId)}
          alt=""
          className="h-10 w-10 shrink-0 [image-rendering:pixelated]"
        />
        <span className="text-slate-400" aria-hidden>
          →
        </span>
        <span className={ready ? '' : 'opacity-40 brightness-0 dark:invert'}>
          <PokemonSprite speciesId={revival.speciesId} formId={revival.formId} size={56} />
        </span>
      </div>
      <p className="text-sm font-medium">
        {itemName(ctx, revival.itemId)} → {speciesName(ctx, revival.speciesId, revival.formId)}
      </p>
      <ProgressBar value={(serverNow - start) / (end - start)} />
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-mono text-slate-500">
          {ready ? 'Restauré !' : formatCountdown(end - serverNow)}
        </span>
        {!ready && (
          <button
            className="text-slate-500 hover:underline disabled:opacity-50"
            disabled={busy}
            onClick={onCancel}
            title="Le fossile revient dans ton sac."
          >
            Reprendre
          </button>
        )}
      </div>
    </div>
  );
}

/** Pierre fossile (animation de restauration). */
function FossilStone({ size = 64 }: { size?: number }) {
  return (
    <div
      aria-hidden
      className="relative rounded-[45%_55%_50%_50%/55%_50%_50%_45%] border border-stone-400 bg-gradient-to-br from-stone-200 to-stone-400 shadow-inner dark:border-stone-600 dark:from-stone-400 dark:to-stone-600"
      style={{ width: size, height: size * 0.82 }}
    >
      <span className="absolute inset-[22%] rounded-full border-4 border-dotted border-stone-500/60" />
    </div>
  );
}
