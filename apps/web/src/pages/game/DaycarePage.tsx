import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ASSISTANT_POST_PLACES,
  assistantSlotCount,
  eggShinyProbability,
  eggsLaid,
  inheritanceRules,
  isMasudaPair,
} from '@poke/game-core';
import type { AbilityHolder, GameContext } from '@poke/game-core';
import type {
  CollectEggsResponse,
  DaycareDto,
  EggDto,
  HatchEggsResponse,
  PokemonDto,
} from '@poke/shared';
import {
  Egg,
  GenderSymbol,
  IvHover,
  PokemonSprite,
  ProgressBar,
  ShinyStar,
  useNow,
} from '../../components/ui';
import { api } from '../../lib/api';
import {
  PLAYER_STATE_KEYS,
  serverOffset,
  useAssistants,
  useDaycare,
  usePokemon,
  useShinyBonus,
  useShinyCharm,
} from '../../lib/game';
import {
  errorText,
  formatCountdown,
  formatDuration,
  formatPercentBonus,
  formatShinyRate,
  itemIcon,
  itemName,
  speciesName,
} from '../../lib/labels';
import { AbilityLine, AssistantCard } from './AssistantCard';
import { DepositDialog } from './DepositDialog';
import { FacilityLocks } from './FacilityLocks';
import { HatchReveal } from './HatchReveal';

export function DaycarePage({ ctx }: { ctx: GameContext }) {
  const queryClient = useQueryClient();
  const daycare = useDaycare();
  const pokemon = usePokemon();
  const assistants = useAssistants();
  const charm = useShinyCharm(ctx);
  const now = useNow();
  // Pension où déposer un couple (null = fenêtre fermée).
  const [depositSlot, setDepositSlot] = useState<number | null>(null);
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
  // Pensions affichées : ouvertes, plus celles encore occupées au-delà (réglage baissé).
  const shownSlots = Math.max(
    data?.slots ?? 0,
    ...(data?.pensions ?? []).map((p) => p.slotIndex + 1),
  );
  // Assistant d'une pension : son talent est figé dans ses œufs au ramassage.
  const helperOf = (slot: number) => {
    const id = assistants.data?.find((a) => a.post === 'daycare' && a.slot === slot)?.pokemonId;
    return id ? pokemonById.get(id) : undefined;
  };
  const eggs = data?.eggs ?? [];
  const maxEggs = data?.maxEggs ?? 0;
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
          ils pondent un œuf toutes les {formatDuration(ctx.balance.breeding.eggMinutes)} (plus ou
          moins vite selon leurs talents et celui de l’assistant de la pension).
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: shownSlots }, (_, slot) => {
            const pension = data?.pensions.find((p) => p.slotIndex === slot);
            return pension ? (
              <PensionCard
                key={slot}
                ctx={ctx}
                pension={pension}
                parents={[pension.parentAId, pension.parentBId].map((id) =>
                  id ? pokemonById.get(id) : undefined,
                )}
                charm={charm}
                helper={helperOf(slot)}
                serverNow={serverNow}
                busy={collect.isPending || withdraw.isPending}
                onCollect={() => collect.mutate(slot)}
                onWithdraw={() => withdraw.mutate(slot)}
              />
            ) : (
              <div
                key={slot}
                className="flex min-h-40 flex-col gap-2 rounded-2xl border-2 border-dashed border-slate-300 p-3 dark:border-slate-700"
              >
                <button
                  type="button"
                  onClick={() => setDepositSlot(slot)}
                  className="grid flex-1 place-items-center rounded-xl text-center text-sm text-slate-500 transition hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-slate-800"
                >
                  + Déposer un couple
                </button>
                <AssistantCard ctx={ctx} post="daycare" slot={slot} />
              </div>
            );
          })}
          {data?.slots === 0 && (
            <p className="text-sm text-slate-500">Aucune pension débloquée pour l’instant.</p>
          )}
        </div>
        <FacilityLocks ctx={ctx} facility="daycare" />
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
        <p className="mb-3 text-sm text-slate-500">
          L’assistant d’une couveuse agit sur la durée d’éclosion des œufs qu’on y pose au
          ramassage.
        </p>
        <div className="space-y-4">
          {Array.from({ length: assistantSlotCount('incubator', maxEggs) }, (_, incubator) => {
            const size = ASSISTANT_POST_PLACES.incubator;
            const first = incubator * size;
            return (
              <div key={incubator} className="space-y-2">
                {maxEggs > size && (
                  <h3 className="text-sm font-semibold">Couveuse {incubator + 1}</h3>
                )}
                <AssistantCard ctx={ctx} post="incubator" slot={incubator} standalone />
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {Array.from({ length: Math.min(size, maxEggs - first) }, (_, i) => {
                    const egg = eggs.find((e) => e.slotIndex === first + i);
                    return egg ? (
                      <div key={i} className="card flex flex-col items-center p-3 text-xs">
                        <EggCard ctx={ctx} egg={egg} serverNow={serverNow} />
                      </div>
                    ) : (
                      <div
                        key={i}
                        className="grid min-h-28 place-items-center rounded-2xl border-2 border-dashed border-slate-300 p-3 text-center text-xs text-slate-500 dark:border-slate-700"
                      >
                        Place libre
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <FacilityLocks ctx={ctx} facility="incubator" />
      </section>

      {notice && <p className="text-sm text-emerald-600">{notice}</p>}
      {error && <p className="text-sm text-red-600">{errorText(error)}</p>}

      {depositSlot !== null && (
        <DepositDialog ctx={ctx} slotIndex={depositSlot} onClose={() => setDepositSlot(null)} />
      )}
      <HatchReveal ctx={ctx} data={hatched} onClose={() => setHatched(null)} />
    </div>
  );
}

function PensionCard({
  ctx,
  pension,
  parents,
  charm,
  helper,
  serverNow,
  busy,
  onCollect,
  onWithdraw,
}: {
  ctx: GameContext;
  pension: DaycareDto;
  parents: (PokemonDto | undefined)[];
  charm: number;
  helper: AbilityHolder | undefined;
  serverNow: number;
  busy: boolean;
  onCollect: () => void;
  onWithdraw: () => void;
}) {
  const shinyBonus = useShinyBonus();
  const { maxEggs } = ctx.balance.breeding;
  const start = Date.parse(pension.startedAt);
  const laid = eggsLaid(ctx, new Date(start), new Date(serverNow), pension.eggMinutes);
  const waiting = Math.min(laid, maxEggs);
  const cycle = pension.eggMinutes * 60_000;
  const nextAt = start + (laid + 1) * cycle;
  const held = [pension.heldItemAId, pension.heldItemBId];
  const rules = inheritanceRules(ctx, [pension.heldItemAId, pension.heldItemBId]);
  const [pa, pb] = parents;
  const shinyRate =
    pa && pb ? eggShinyProbability(ctx, [pa, pb], charm * shinyBonus, helper) : null;
  const shinyBonuses = [
    pa && pb && isMasudaPair(pa, pb) && 'Masuda',
    charm > 1 && 'Charme Chroma',
    shinyBonus > 1 && `bonus +${formatPercentBonus(shinyBonus)}`,
  ].filter(Boolean);

  return (
    <div className={`card p-4 ${waiting > 0 ? 'ring-2 ring-brand-500/50' : ''}`}>
      <div className="flex items-center justify-around gap-2">
        {parents.map((p, i) => (
          <div key={i} className="flex flex-col items-center text-xs">
            {p ? (
              <>
                <IvHover ivs={p.ivs}>
                  <PokemonSprite
                    speciesId={p.speciesId}
                    formId={p.formId}
                    shiny={p.isShiny}
                    size={64}
                  />
                </IvHover>
                <span className="font-medium">
                  {speciesName(ctx, p.speciesId, p.formId)} <GenderSymbol gender={p.gender} />{' '}
                  {p.isShiny && <ShinyStar />}
                </span>
                <span className="text-slate-500">N.{p.level}</span>
                <span className="max-w-48 text-center">
                  <AbilityLine ctx={ctx} p={p} activities={['breeding']} />
                </span>
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
          {shinyRate !== null && (
            <p title="Le Charme Chroma compte s’il est dans le sac à l’éclosion ; l’assistant, s’il est en poste au ramassage.">
              <ShinyStar /> Chance chromatique : {formatShinyRate(shinyRate)}
              {shinyBonuses.length > 0 && ` (${shinyBonuses.join(', ')})`}
            </p>
          )}
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
      <div className="mt-3">
        <AssistantCard ctx={ctx} post="daycare" slot={pension.slotIndex} />
      </div>
    </div>
  );
}

function EggCard({ ctx, egg, serverNow }: { ctx: GameContext; egg: EggDto; serverNow: number }) {
  const laid = Date.parse(egg.laidAt);
  const end = Date.parse(egg.hatchAt);
  const ready = serverNow >= end;
  return (
    <div className="flex w-full flex-col items-center gap-1">
      <Egg ready={ready} />
      <span className="font-medium">{speciesName(ctx, egg.speciesId, egg.formId)} ?</span>
      <ProgressBar className="w-full" value={(serverNow - laid) / (end - laid)} />
      <span className="font-mono text-slate-500">
        {ready ? 'Prêt !' : formatCountdown(end - serverNow)}
      </span>
    </div>
  );
}
