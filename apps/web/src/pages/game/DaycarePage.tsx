import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ASSISTANT_POST_PLACES,
  assistantSlotCount,
  daycareXp,
  eggShinyProbability,
  eggsLaid,
  hatchMinutes,
  inheritanceRules,
  isMasudaPair,
} from '@poke/game-core';
import type { AbilityHolder, GameContext } from '@poke/game-core';
import type {
  BagEggDto,
  CollectEggsInput,
  CollectEggsResponse,
  DaycareDto,
  EggDto,
  HatchEggsResponse,
  IncubateEggsResponse,
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
  PROGRESS_KEYS,
  keys,
  refresh,
  assistantPlaces,
  serverOffset,
  shownPlaces,
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
import { HatchReveal } from './HatchReveal';
import { formatXp, usePlayerBonuses } from './XpPreview';

const eggCount = (n: number) => `${n} œuf${n > 1 ? 's' : ''}`;

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

  const pokemonById = new Map(pokemon.data?.map((p) => [p.id, p]));
  // Ramassage et retrait : œufs, parents libérés (et leur XP) et objets tenus rendus.
  const refreshDaycare = () => refresh(queryClient, keys.daycare, keys.pokemon, keys.inventory);
  const collected = (res: CollectEggsResponse) => {
    const n = res.incubated.length;
    const xp = (res.parents ?? [])
      .filter((p) => p.xpGained > 0)
      .map((p) => {
        const parent = pokemonById.get(p.pokemonId);
        const name = parent ? speciesName(ctx, parent.speciesId, parent.formId) : 'Un parent';
        const level = p.levelAfter > p.levelBefore ? ` et passe au N.${p.levelAfter}` : '';
        return `${name} gagne ${formatXp(p.xpGained)}${level}.`;
      });
    setNotice(
      [
        n > 0 && `${eggCount(n)} placé${n > 1 ? 's' : ''} dans la couveuse.`,
        res.bagged > 0 && `${eggCount(res.bagged)} rangé${res.bagged > 1 ? 's' : ''} dans le sac.`,
        ...xp,
      ]
        .filter(Boolean)
        .join(' ') || null,
    );
    return refreshDaycare();
  };

  const collect = useMutation({
    mutationFn: ({ slot, to }: { slot: number; to: CollectEggsInput['to'] }) =>
      api<CollectEggsResponse>(`/api/daycare/${slot}/collect`, { method: 'POST', json: { to } }),
    onSuccess: collected,
  });
  const withdraw = useMutation({
    mutationFn: (slot: number) =>
      api<CollectEggsResponse>(`/api/daycare/${slot}`, { method: 'DELETE' }),
    onSuccess: collected,
  });
  const incubate = useMutation({
    mutationFn: (ids: string[]) =>
      api<IncubateEggsResponse>('/api/eggs/incubate', { method: 'POST', json: { ids } }),
    onSuccess: (res) => {
      const n = res.incubated.length;
      setNotice(`${eggCount(n)} placé${n > 1 ? 's' : ''} dans la couveuse.`);
      return refresh(queryClient, keys.daycare);
    },
  });
  const hatch = useMutation({
    mutationFn: () => api<HatchEggsResponse>('/api/eggs/hatch', { method: 'POST' }),
    onSuccess: (data) => {
      setHatched(data);
      // Éclosion : nouveaux Pokémon, Pokédex, quêtes et activité de guilde.
      return refresh(queryClient, keys.daycare, keys.pokemon, ...PROGRESS_KEYS, keys.guild);
    },
  });

  const data = daycare.data;
  const serverNow = now + serverOffset(data, daycare.dataUpdatedAt);
  const openSlots = data?.slots ?? 0;
  const shownSlots = shownPlaces(openSlots, [
    ...(data?.pensions ?? []).map((p) => p.slotIndex),
    ...assistantPlaces(assistants.data, 'daycare'),
  ]);
  // Assistant d'une pension : son talent est figé dans ses œufs au ramassage.
  const helperOf = (slot: number) => {
    const id = assistants.data?.find((a) => a.post === 'daycare' && a.slot === slot)?.pokemonId;
    return id ? pokemonById.get(id) : undefined;
  };
  const incubated = data?.eggs ?? [];
  const bagEggs = data?.bagEggs ?? [];
  const maxEggs = data?.maxEggs ?? 0;
  const shownEggs = shownPlaces(maxEggs, [
    ...incubated.map((e) => e.slotIndex),
    ...assistantPlaces(assistants.data, 'incubator'),
  ]);
  const takenPlaces = new Set(incubated.map((e) => e.slotIndex));
  const freePlaces = Array.from({ length: maxEggs }, (_, i) => i).filter(
    (i) => !takenPlaces.has(i),
  ).length;
  const readyEggs = incubated.filter((e) => Date.parse(e.hatchAt) <= serverNow).length;
  const busy = collect.isPending || withdraw.isPending || incubate.isPending;
  const error = collect.error ?? withdraw.error ?? incubate.error ?? hatch.error;

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
          moins vite selon leurs talents et celui de l’assistant de la pension), jusqu’à{' '}
          {ctx.balance.breeding.pensionMaxEggs} œufs en attente. Pendant leur séjour, ils gagnent{' '}
          {formatXp(ctx.balance.breeding.parentXpPerHour)} par heure, reçus quand tu les retires.
          Deux Pokémon qui ne peuvent pas s’accoupler peuvent aussi y séjourner, juste pour l’XP.
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
                closed={slot >= openSlots}
                serverNow={serverNow}
                busy={busy}
                onCollect={(to) => collect.mutate({ slot, to })}
                onWithdraw={() => withdraw.mutate(slot)}
              />
            ) : slot >= openSlots ? (
              <div
                key={slot}
                className="flex min-h-40 flex-col gap-2 rounded-2xl border-2 border-dashed border-slate-300 p-3 dark:border-slate-700"
              >
                <span className="grid flex-1 place-items-center text-center text-sm text-slate-500">
                  Pension fermée
                </span>
                <AssistantCard ctx={ctx} post="daycare" slot={slot} closed />
              </div>
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
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">
            Couveuse{' '}
            <span className="text-sm font-normal text-slate-500">
              {incubated.length} / {maxEggs}
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
          L’assistant d’une couveuse agit sur la durée d’éclosion des œufs qu’on y pose.
        </p>
        <div className="space-y-4">
          {Array.from({ length: assistantSlotCount('incubator', shownEggs) }, (_, incubator) => {
            const size = ASSISTANT_POST_PLACES.incubator;
            const first = incubator * size;
            return (
              <div key={incubator} className="space-y-2">
                {shownEggs > size && (
                  <h3 className="text-sm font-semibold">Couveuse {incubator + 1}</h3>
                )}
                <AssistantCard
                  ctx={ctx}
                  post="incubator"
                  slot={incubator}
                  standalone
                  closed={first >= maxEggs}
                />
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {Array.from({ length: Math.min(size, shownEggs - first) }, (_, i) => {
                    const egg = incubated.find((e) => e.slotIndex === first + i);
                    return egg ? (
                      <div key={i} className="card flex flex-col items-center p-3 text-xs">
                        <EggCard ctx={ctx} egg={egg} serverNow={serverNow} />
                      </div>
                    ) : (
                      <div
                        key={i}
                        className="grid min-h-28 place-items-center rounded-2xl border-2 border-dashed border-slate-300 p-3 text-center text-xs text-slate-500 dark:border-slate-700"
                      >
                        {first + i < maxEggs ? 'Place libre' : 'Place fermée'}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <BagEggsSection
        ctx={ctx}
        eggs={bagEggs}
        freePlaces={freePlaces}
        busy={busy}
        onIncubate={(ids) => incubate.mutate(ids)}
      />

      {notice && <p className="text-sm text-emerald-600">{notice}</p>}
      {error && <p className="text-sm text-red-600">{errorText(error)}</p>}

      {depositSlot !== null && (
        <DepositDialog ctx={ctx} slotIndex={depositSlot} onClose={() => setDepositSlot(null)} />
      )}
      <HatchReveal ctx={ctx} data={hatched} onClose={() => setHatched(null)} />
    </div>
  );
}

/** Œufs du sac regroupés par espèce (et forme), du groupe le plus ancien au plus récent. */
export function groupBagEggs(eggs: readonly BagEggDto[]) {
  const groups = new Map<string, { speciesId: number; formId: number | null; ids: string[] }>();
  for (const egg of eggs) {
    const key = `${egg.speciesId}:${egg.formId ?? ''}`;
    const group = groups.get(key) ?? { speciesId: egg.speciesId, formId: egg.formId, ids: [] };
    group.ids.push(egg.id);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** Œufs rangés dans le sac, à mettre en couveuse dès qu'une place se libère. */
function BagEggsSection({
  ctx,
  eggs: bagEggs,
  freePlaces,
  busy,
  onIncubate,
}: {
  ctx: GameContext;
  eggs: readonly BagEggDto[];
  freePlaces: number;
  busy: boolean;
  onIncubate: (ids: string[]) => void;
}) {
  const full = freePlaces === 0;
  const fullTitle = full ? 'Toutes les places de la couveuse sont occupées.' : undefined;
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">
          Œufs du sac <span className="text-sm font-normal text-slate-500">{bagEggs.length}</span>
        </h2>
        {bagEggs.length > 1 && (
          <button
            className="btn-primary"
            disabled={full || busy}
            title={fullTitle}
            onClick={() => onIncubate(bagEggs.slice(0, freePlaces).map((e) => e.id))}
          >
            {full || freePlaces >= bagEggs.length
              ? 'Tout couver'
              : `Couver les ${freePlaces} plus anciens`}
          </button>
        )}
      </div>
      {bagEggs.length === 0 ? (
        <p className="text-sm text-slate-500">
          Aucun œuf dans le sac. « Ramasser » y range les œufs d’une pension, et « Couver » y met
          ceux qui ne tiennent pas dans la couveuse.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {groupBagEggs(bagEggs).map((g) => (
            <li key={`${g.speciesId}:${g.formId}`} className="card flex items-center gap-3 p-3">
              <Egg size={40} />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">
                  {speciesName(ctx, g.speciesId, g.formId)} ?{' '}
                  <span className="font-mono text-slate-500">× {g.ids.length}</span>
                </p>
                <p className="text-xs text-slate-500">
                  Éclosion en {formatDuration(hatchMinutes(ctx, g.speciesId))} (sans assistant)
                </p>
              </div>
              <span className="flex shrink-0 flex-col gap-1">
                <button
                  className="btn-primary"
                  disabled={full || busy}
                  title={fullTitle}
                  onClick={() => onIncubate(g.ids.slice(0, 1))}
                >
                  Couver
                </button>
                {g.ids.length > 1 && freePlaces > 1 && (
                  <button
                    className="btn-ghost px-2 py-1 text-xs"
                    disabled={busy}
                    onClick={() => onIncubate(g.ids.slice(0, freePlaces))}
                  >
                    {freePlaces >= g.ids.length ? 'Tout couver' : `En couver ${freePlaces}`}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PensionCard({
  ctx,
  pension,
  parents,
  charm,
  helper,
  closed,
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
  closed: boolean;
  serverNow: number;
  busy: boolean;
  onCollect: (to: CollectEggsInput['to']) => void;
  onWithdraw: () => void;
}) {
  const shinyBonus = useShinyBonus();
  const bonuses = usePlayerBonuses(ctx);
  const { pensionMaxEggs } = ctx.balance.breeding;
  const start = Date.parse(pension.startedAt);
  // Couple qui ne peut pas s'accoupler : la pension ne pond pas, les parents gagnent de l'XP.
  const laid = pension.breeds
    ? eggsLaid(ctx, new Date(start), new Date(serverNow), pension.eggMinutes)
    : 0;
  const waiting = Math.min(laid, pensionMaxEggs);
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
  const deposited = new Date(pension.depositedAt);

  return (
    <div className={`card p-4 ${waiting > 0 ? 'ring-2 ring-brand-500/50' : ''}`}>
      <div className="flex items-center justify-around gap-2">
        {parents.map((p, i) => {
          const gain = p ? daycareXp(ctx, p, deposited, new Date(serverNow), bonuses) : null;
          return (
            <div key={i} className="flex flex-col items-center text-xs">
              {p && gain ? (
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
                  <span
                    className="text-center"
                    title="XP gagnée depuis le dépôt, reçue en retirant le Pokémon de la pension."
                  >
                    {gain.xpGained > 0 ? (
                      <>
                        <span className="text-emerald-600">+{formatXp(gain.xpGained)}</span>
                        {' · '}
                        {gain.levelAfter > gain.levelBefore ? (
                          <strong className="text-emerald-600">N.{gain.levelAfter}</strong>
                        ) : (
                          <span className="text-slate-500">N.{gain.levelAfter}</span>
                        )}
                        <span className="text-slate-500"> au retrait</span>
                      </>
                    ) : p.level >= 100 ? (
                      <span className="text-slate-500">Niveau maximal</span>
                    ) : (
                      <span className="text-slate-500">Pas encore d’XP</span>
                    )}
                  </span>
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
          );
        })}
        <span
          className={`text-2xl ${pension.breeds ? 'text-rose-400' : 'text-slate-300 dark:text-slate-600'}`}
          title={pension.breeds ? undefined : 'Ces deux Pokémon ne peuvent pas s’accoupler.'}
          aria-label={pension.breeds ? undefined : 'Ne peuvent pas s’accoupler'}
          aria-hidden={pension.breeds}
        >
          ♥
        </span>
      </div>
      {pension.breeds ? (
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
              value={waiting >= pensionMaxEggs ? 1 : (serverNow - (nextAt - cycle)) / cycle}
            />
            <p className="mt-1">
              {waiting >= pensionMaxEggs
                ? 'Pension pleine : la ponte est en pause, ramasse les œufs !'
                : `Prochain œuf dans ${formatCountdown(nextAt - serverNow)}`}
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-500">
          Ces deux Pokémon ne peuvent pas s’accoupler : pas d’œuf, mais ils gagnent{' '}
          {formatXp(ctx.balance.breeding.parentXpPerHour)} par heure.
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {pension.breeds &&
            `${waiting} / ${pensionMaxEggs} œuf${waiting > 1 ? 's' : ''} prêt${waiting > 1 ? 's' : ''}`}
        </span>
        <div className="flex gap-2">
          <button
            className="btn-ghost"
            disabled={busy}
            onClick={onWithdraw}
            title={
              pension.breeds
                ? 'Les parents reçoivent leur XP ; les œufs prêts sont couvés, ceux qui ne tiennent pas dans la couveuse vont dans le sac.'
                : 'Les Pokémon reçoivent leur XP.'
            }
          >
            Retirer
          </button>
          {pension.breeds && (
            <>
              <button
                className="btn-ghost"
                disabled={waiting === 0 || busy}
                onClick={() => onCollect('bag')}
                title="Range les œufs prêts dans le sac."
              >
                Ramasser
              </button>
              <button
                className="btn-primary"
                disabled={waiting === 0 || busy}
                onClick={() => onCollect('incubator')}
                title="Place les œufs prêts dans la couveuse ; ceux qui n’y tiennent pas vont dans le sac."
              >
                Couver
              </button>
            </>
          )}
        </div>
      </div>
      <div className="mt-3">
        <AssistantCard ctx={ctx} post="daycare" slot={pension.slotIndex} closed={closed} />
      </div>
    </div>
  );
}

function EggCard({ ctx, egg, serverNow }: { ctx: GameContext; egg: EggDto; serverNow: number }) {
  const start = Date.parse(egg.incubatedAt);
  const end = Date.parse(egg.hatchAt);
  const ready = serverNow >= end;
  return (
    <div className="flex w-full flex-col items-center gap-1">
      <Egg ready={ready} />
      <span className="font-medium">{speciesName(ctx, egg.speciesId, egg.formId)} ?</span>
      <ProgressBar className="w-full" value={(serverNow - start) / (end - start)} />
      <span className="font-mono text-slate-500">
        {ready ? 'Prêt !' : formatCountdown(end - serverNow)}
      </span>
    </div>
  );
}
