import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { eggsLaid, inheritanceRules } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type {
  CollectEggsResponse,
  DaycareDto,
  EggDto,
  HatchEggsResponse,
  PokemonDto,
} from '@poke/shared';
import { Egg, PokemonSprite, ProgressBar, ShinyStar, useNow } from '../../components/ui';
import { api } from '../../lib/api';
import { PLAYER_STATE_KEYS, serverOffset, useDaycare, usePokemon } from '../../lib/game';
import {
  errorText,
  formatCountdown,
  formatDuration,
  itemIcon,
  itemName,
  speciesName,
} from '../../lib/labels';
import { DepositDialog } from './DepositDialog';
import { HatchReveal } from './HatchReveal';

export function DaycarePage({ ctx }: { ctx: GameContext }) {
  const queryClient = useQueryClient();
  const daycare = useDaycare();
  const pokemon = usePokemon();
  const now = useNow();
  const [depositOpen, setDepositOpen] = useState(false);
  const [hatched, setHatched] = useState<HatchEggsResponse | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = () =>
    Promise.all(PLAYER_STATE_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  const collected = (res: CollectEggsResponse) => {
    const n = res.eggs.length;
    setNotice(
      [
        n > 0 && `${n} œuf${n > 1 ? 's' : ''} placé${n > 1 ? 's' : ''} dans la couveuse.`,
        res.lost > 0 &&
          `${res.lost} œuf${res.lost > 1 ? 's' : ''} perdu${res.lost > 1 ? 's' : ''} faute de place.`,
      ]
        .filter(Boolean)
        .join(' ') || null,
    );
    return refresh();
  };

  const collect = useMutation({
    mutationFn: (slot: number) =>
      api<CollectEggsResponse>(`/api/daycare/${slot}/collect`, { method: 'POST' }),
    onSuccess: collected,
  });
  const withdraw = useMutation({
    mutationFn: (slot: number) =>
      api<CollectEggsResponse>(`/api/daycare/${slot}`, { method: 'DELETE' }),
    onSuccess: collected,
  });
  const hatch = useMutation({
    mutationFn: () => api<HatchEggsResponse>('/api/eggs/hatch', { method: 'POST' }),
    onSuccess: (data) => {
      setHatched(data);
      return refresh();
    },
  });

  const data = daycare.data;
  const serverNow = now + serverOffset(data, daycare.dataUpdatedAt);
  const pokemonById = new Map(pokemon.data?.map((p) => [p.id, p]));
  const eggs = data?.eggs ?? [];
  const readyEggs = eggs.filter((e) => Date.parse(e.hatchAt) <= serverNow).length;
  const error = collect.error ?? withdraw.error ?? hatch.error;

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Pension</h2>
          <span className="text-sm text-slate-500">
            {data?.pensions.length ?? 0} / {data?.slots ?? 0} occupée(s)
          </span>
        </div>
        <p className="mb-3 text-sm text-slate-500">
          Dépose deux Pokémon compatibles (même groupe d’œufs et sexes opposés, ou un Métamorph) :
          ils pondent un œuf toutes les {formatDuration(ctx.balance.breeding.eggMinutes)}.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: data?.slots ?? 0 }, (_, slot) => {
            const pension = data?.pensions.find((p) => p.slotIndex === slot);
            return pension ? (
              <PensionCard
                key={slot}
                ctx={ctx}
                pension={pension}
                parents={[pension.parentAId, pension.parentBId].map((id) =>
                  id ? pokemonById.get(id) : undefined,
                )}
                serverNow={serverNow}
                busy={collect.isPending || withdraw.isPending}
                onCollect={() => collect.mutate(slot)}
                onWithdraw={() => withdraw.mutate(slot)}
              />
            ) : (
              <button
                key={slot}
                type="button"
                onClick={() => setDepositOpen(true)}
                className="grid min-h-40 place-items-center rounded-2xl border-2 border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 transition hover:border-brand-500 hover:text-brand-600 dark:border-slate-700"
              >
                + Déposer un couple
              </button>
            );
          })}
          {data?.slots === 0 && (
            <p className="text-sm text-slate-500">Aucune pension débloquée pour l’instant.</p>
          )}
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">
            Couveuse{' '}
            <span className="text-sm font-normal text-slate-500">
              {eggs.length} / {data?.maxEggs ?? 0}
            </span>
          </h2>
          <button
            className="btn-primary"
            disabled={readyEggs === 0 || hatch.isPending}
            onClick={() => hatch.mutate()}
          >
            {hatch.isPending ? 'Éclosion…' : `Faire éclore${readyEggs ? ` (${readyEggs})` : ''}`}
          </button>
        </div>
        {eggs.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun œuf pour l’instant.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {eggs.map((egg) => (
              <EggCard key={egg.id} ctx={ctx} egg={egg} serverNow={serverNow} />
            ))}
          </div>
        )}
      </section>

      {notice && <p className="text-sm text-emerald-600">{notice}</p>}
      {error && <p className="text-sm text-red-600">{errorText(error)}</p>}

      {depositOpen && <DepositDialog ctx={ctx} onClose={() => setDepositOpen(false)} />}
      <HatchReveal ctx={ctx} data={hatched} onClose={() => setHatched(null)} />
    </div>
  );
}

function PensionCard({
  ctx,
  pension,
  parents,
  serverNow,
  busy,
  onCollect,
  onWithdraw,
}: {
  ctx: GameContext;
  pension: DaycareDto;
  parents: (PokemonDto | undefined)[];
  serverNow: number;
  busy: boolean;
  onCollect: () => void;
  onWithdraw: () => void;
}) {
  const { eggMinutes, maxEggs } = ctx.balance.breeding;
  const start = Date.parse(pension.startedAt);
  const laid = eggsLaid(ctx, new Date(start), new Date(serverNow));
  const waiting = Math.min(laid, maxEggs);
  const cycle = eggMinutes * 60_000;
  const nextAt = start + (laid + 1) * cycle;
  const held = [pension.heldItemAId, pension.heldItemBId];
  const rules = inheritanceRules(ctx, [pension.heldItemAId, pension.heldItemBId]);

  return (
    <div className={`card p-4 ${waiting > 0 ? 'ring-2 ring-brand-500/50' : ''}`}>
      <div className="flex items-center justify-around gap-2">
        {parents.map((p, i) => (
          <div key={i} className="flex flex-col items-center text-xs">
            {p ? (
              <>
                <PokemonSprite
                  speciesId={p.speciesId}
                  formId={p.formId}
                  shiny={p.isShiny}
                  size={64}
                />
                <span className="font-medium">
                  {speciesName(ctx, p.speciesId, p.formId)} {p.isShiny && <ShinyStar />}
                </span>
                <span className="text-slate-500">N.{p.level}</span>
              </>
            ) : (
              <span className="text-slate-400">?</span>
            )}
            {held[i] && (
              <span className="mt-1 flex items-center gap-1 text-slate-500">
                <img src={itemIcon(ctx, held[i])} alt="" className="h-5 w-5" />
                {itemName(ctx, held[i])}
              </span>
            )}
          </div>
        ))}
        <span className="text-2xl text-rose-400" aria-hidden>
          ♥
        </span>
      </div>
      <div className="mt-3 flex items-center gap-3">
        {pension.eggSpeciesId && <PokemonSprite speciesId={pension.eggSpeciesId} size={40} />}
        <div className="flex-1 text-xs text-slate-500">
          <p>
            Œufs de {pension.eggSpeciesId ? speciesName(ctx, pension.eggSpeciesId) : '?'} ·{' '}
            {rules.ivCount} IV hérités
            {rules.natureChance.some((c) => c > 0) && ' · nature transmise'}
          </p>
          <ProgressBar
            className="mt-1"
            value={waiting >= maxEggs ? 1 : (serverNow - (nextAt - cycle)) / cycle}
          />
          <p className="mt-1">
            {waiting >= maxEggs
              ? 'Pension pleine : ramasse les œufs !'
              : `Prochain œuf dans ${formatCountdown(nextAt - serverNow)}`}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {waiting} œuf{waiting > 1 ? 's' : ''} prêt{waiting > 1 ? 's' : ''}
        </span>
        <div className="flex gap-2">
          <button
            className="btn-ghost"
            disabled={busy}
            onClick={onWithdraw}
            title="Les œufs prêts sont ramassés s’il reste de la place dans la couveuse."
          >
            Retirer
          </button>
          <button className="btn-primary" disabled={waiting === 0 || busy} onClick={onCollect}>
            Ramasser
          </button>
        </div>
      </div>
    </div>
  );
}

function EggCard({ ctx, egg, serverNow }: { ctx: GameContext; egg: EggDto; serverNow: number }) {
  const laid = Date.parse(egg.laidAt);
  const end = Date.parse(egg.hatchAt);
  const ready = serverNow >= end;
  return (
    <div className="card flex flex-col items-center gap-1 p-3 text-xs">
      <Egg ready={ready} />
      <span className="font-medium">{speciesName(ctx, egg.speciesId, egg.formId)} ?</span>
      <ProgressBar className="w-full" value={(serverNow - laid) / (end - laid)} />
      <span className="font-mono text-slate-500">
        {ready ? 'Prêt !' : formatCountdown(end - serverNow)}
      </span>
    </div>
  );
}
