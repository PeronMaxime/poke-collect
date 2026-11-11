import { Fragment, useState } from 'react';
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
  PokemonDto,
} from '@poke/shared';
import {
  Egg,
  EggTimer,
  GenderSymbol,
  IvHover,
  PokemonSprite,
  ProgressBar,
  ShinyStar,
  useNow,
} from '../../components/ui';
import {
  PROGRESS_KEYS,
  assistantPlaces,
  collectEggs,
  hatchEggs,
  incubateEggs,
  keys,
  refresh,
  serverOffset,
  shownPlaces,
  useAssistants,
  useDaycare,
  usePokemon,
  useShinyBonus,
  useShinyCharm,
  withdrawDaycareParent,
  withdrawEgg,
} from '../../lib/queries';
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
import { AbilityLine, AssistantCard } from '../buildings/AssistantCard';
import {
  BuildingSection,
  EMPTY_PLACE,
  Notice,
  SMALL_BUTTON,
  StateTag,
} from '../buildings/BuildingParts';
import { SECTION_TITLE } from '../common/dialogParts';
import { DepositDialog } from './DepositDialog';
import { HatchReveal } from './HatchReveal';
import { formatXp, usePlayerBonuses } from '../common/XpPreview';

const eggCount = (n: number) => `${n} œuf${n > 1 ? 's' : ''}`;

/** État de l'onglet de la pension : pensions, couveuses, œufs du sac, et leurs actions. */
function useDaycarePage({ ctx }: { ctx: GameContext }) {
  const queryClient = useQueryClient();
  const daycare = useDaycare();
  const pokemon = usePokemon();
  const assistants = useAssistants();
  const charm = useShinyCharm(ctx);
  const now = useNow();
  // Place de pension où déposer (ou changer) un Pokémon (null = fenêtre fermée).
  const [depositAt, setDepositAt] = useState<{ slot: number; side: 0 | 1 } | null>(null);
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
      collectEggs(slot, to),
    onSuccess: collected,
  });
  const withdraw = useMutation({
    mutationFn: ({ slot, side }: { slot: number; side: 0 | 1 }) =>
      withdrawDaycareParent(slot, side),
    onSuccess: collected,
  });
  const incubate = useMutation({
    mutationFn: (ids: string[]) => incubateEggs(ids),
    onSuccess: (res) => {
      const n = res.incubated.length;
      setNotice(`${eggCount(n)} placé${n > 1 ? 's' : ''} dans la couveuse.`);
      return refresh(queryClient, keys.daycare);
    },
  });
  const storeEgg = useMutation({
    mutationFn: (id: string) => withdrawEgg(id),
    onSuccess: (egg) => {
      setNotice(`Œuf de ${speciesName(ctx, egg.speciesId, egg.formId)} rangé dans le sac.`);
      return refresh(queryClient, keys.daycare);
    },
  });
  const hatch = useMutation({
    mutationFn: () => hatchEggs(),
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
  const busy = collect.isPending || withdraw.isPending || incubate.isPending || storeEgg.isPending;
  const error = collect.error ?? withdraw.error ?? incubate.error ?? storeEgg.error ?? hatch.error;

  const incubators = assistantSlotCount('incubator', shownEggs);
  const occupiedPensions = (data?.pensions ?? []).filter((p) => p.slotIndex < openSlots).length;

  return {
    ctx,
    queryClient,
    daycare,
    pokemon,
    assistants,
    charm,
    now,
    depositAt,
    setDepositAt,
    hatched,
    setHatched,
    notice,
    setNotice,
    pokemonById,
    refreshDaycare,
    collected,
    collect,
    withdraw,
    incubate,
    storeEgg,
    hatch,
    data,
    serverNow,
    openSlots,
    shownSlots,
    helperOf,
    incubated,
    bagEggs,
    maxEggs,
    shownEggs,
    takenPlaces,
    freePlaces,
    readyEggs,
    busy,
    error,
    incubators,
    occupiedPensions,
  };
}

/** Ce qu'affichent les pièces de `DaycarePage`. */
type DaycarePageModel = ReturnType<typeof useDaycarePage>;

export function DaycarePage({ ctx }: { ctx: GameContext }) {
  const m = useDaycarePage({ ctx });
  const {
    depositAt,
    setDepositAt,
    hatched,
    setHatched,
    notice,
    setNotice,
    collected,
    incubate,
    data,
    bagEggs,
    freePlaces,
    busy,
    error,
  } = m;
  return (
    <div className="space-y-5">
      {notice && (
        <Notice tone="ok" onClose={() => setNotice(null)}>
          {notice}
        </Notice>
      )}
      {error && <Notice tone="bad">{errorText(error)}</Notice>}

      <PensionsSection m={m} />

      <IncubatorsSection m={m} />

      <BagEggsSection
        ctx={ctx}
        eggs={bagEggs}
        freePlaces={freePlaces}
        busy={busy}
        onIncubate={(ids) => incubate.mutate(ids)}
      />

      {depositAt !== null && (
        <DepositDialog
          ctx={ctx}
          slotIndex={depositAt.slot}
          side={depositAt.side}
          pension={data?.pensions.find((p) => p.slotIndex === depositAt.slot)}
          onDeposited={collected}
          onClose={() => setDepositAt(null)}
        />
      )}
      <HatchReveal ctx={ctx} data={hatched} onClose={() => setHatched(null)} />
    </div>
  );
}

/** Section des pensions : une carte par pension ouverte. */
function PensionsSection({ m }: { m: DaycarePageModel }) {
  const {
    ctx,
    charm,
    setDepositAt,
    pokemonById,
    collect,
    withdraw,
    data,
    serverNow,
    openSlots,
    shownSlots,
    helperOf,
    busy,
    occupiedPensions,
  } = m;
  return (
    <BuildingSection
      id="daycare.pensions"
      title="Pension"
      label="les pensions"
      count={`${occupiedPensions}/${openSlots}`}
      countTitle="Pensions occupées / ouvertes"
      intro={
        <>
          Chaque pension accueille deux Pokémon, déposés et retirés un par un. Deux Pokémon
          compatibles (même groupe d’œufs et sexes opposés, ou un Métamorph) pondent un œuf toutes
          les {formatDuration(ctx.balance.breeding.eggMinutes)} (plus ou moins vite selon leurs
          talents et celui de l’assistant de la pension), jusqu’à{' '}
          {ctx.balance.breeding.pensionMaxEggs} œufs en attente. Pendant leur séjour, ils gagnent{' '}
          {formatXp(ctx.balance.breeding.parentXpPerHour)} par heure, reçus quand tu les retires. Un
          Pokémon seul, ou deux qui ne peuvent pas s’accoupler, y séjournent juste pour l’XP.
        </>
      }
    >
      {data?.slots === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Aucune pension débloquée pour l’instant.
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))] gap-3.5">
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
                onDeposit={(side) => setDepositAt({ slot, side })}
                onWithdraw={(side) => withdraw.mutate({ slot, side })}
              />
            ) : (
              <div key={slot} className={`flex min-h-56 flex-col gap-2.5 p-2.5 ${EMPTY_PLACE}`}>
                {slot >= openSlots ? (
                  <span className="grid flex-1 place-items-center text-center text-sm">
                    Pension fermée
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setDepositAt({ slot, side: 0 })}
                    className="pixel-label grid flex-1 place-items-center rounded-md text-center transition hover:bg-well hover:text-brand-600 dark:hover:text-brand-500"
                  >
                    + Déposer un Pokémon
                  </button>
                )}
                <AssistantCard ctx={ctx} post="daycare" slot={slot} closed={slot >= openSlots} />
              </div>
            );
          })}
        </div>
      )}
    </BuildingSection>
  );
}

/** Section des couveuses : une par assistant, avec ses œufs. */
function IncubatorsSection({ m }: { m: DaycarePageModel }) {
  const {
    ctx,
    storeEgg,
    hatch,
    serverNow,
    incubated,
    maxEggs,
    shownEggs,
    readyEggs,
    busy,
    incubators,
  } = m;
  return (
    <BuildingSection
      id="daycare.incubator"
      title="Couveuse"
      label="la couveuse"
      count={`${incubated.length}/${maxEggs}`}
      countTitle="Œufs en couveuse / places"
      actions={
        <button
          className="btn-primary"
          disabled={readyEggs === 0 || hatch.isPending}
          onClick={() => hatch.mutate()}
        >
          {hatch.isPending ? 'Éclosion…' : `Faire éclore${readyEggs ? ` (${readyEggs})` : ''}`}
        </button>
      }
      intro="L’assistant d’une couveuse agit sur la durée d’éclosion des œufs qu’on y pose."
      className="space-y-5"
    >
      {Array.from({ length: incubators }, (_, incubator) => {
        const size = ASSISTANT_POST_PLACES.incubator;
        const first = incubator * size;
        return (
          <div key={incubator} className="space-y-3">
            {incubators > 1 && <h3 className={SECTION_TITLE}>Couveuse {incubator + 1}</h3>}
            <AssistantCard
              ctx={ctx}
              post="incubator"
              slot={incubator}
              frame="tile"
              closed={first >= maxEggs}
            />
            <div className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">
              {Array.from({ length: Math.min(size, shownEggs - first) }, (_, i) => {
                const egg = incubated.find((e) => e.slotIndex === first + i);
                return egg ? (
                  <EggCard
                    key={i}
                    ctx={ctx}
                    egg={egg}
                    serverNow={serverNow}
                    busy={busy}
                    onWithdraw={() => storeEgg.mutate(egg.id)}
                  />
                ) : (
                  <div
                    key={i}
                    title={first + i < maxEggs ? 'Place libre' : 'Place fermée'}
                    className={`grid aspect-square place-items-center p-2 ${EMPTY_PLACE} ${
                      first + i < maxEggs ? '' : 'opacity-50'
                    }`}
                  >
                    <span className="pixel-label text-center text-[8px]">
                      {first + i < maxEggs ? 'Libre' : 'Fermée'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </BuildingSection>
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
    <BuildingSection
      id="daycare.bag-eggs"
      title="Œufs du sac"
      label="les œufs du sac"
      count={bagEggs.length}
      countTitle="Œufs rangés dans le sac"
      actions={
        bagEggs.length > 1 && (
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
        )
      }
    >
      {bagEggs.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Aucun œuf dans le sac. « Ramasser » y range les œufs d’une pension, et « Couver » y met
          ceux qui ne tiennent pas dans la couveuse.
        </p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-2.5">
          {groupBagEggs(bagEggs).map((g) => (
            <li key={`${g.speciesId}:${g.formId}`} className="tile flex items-center gap-3 p-2.5">
              <span className="sprite-well size-12 shrink-0">
                <Egg size={34} />
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <p className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium">
                    {speciesName(ctx, g.speciesId, g.formId)} ?
                  </span>
                  <span className="shrink-0 font-mono text-slate-500">× {g.ids.length}</span>
                </p>
                <p className="text-xs text-slate-500">
                  Éclosion en {formatDuration(hatchMinutes(ctx, g.speciesId))} (sans assistant)
                </p>
              </div>
              <span className="flex shrink-0 flex-col gap-1">
                <button
                  className="btn-primary px-3 py-2"
                  disabled={full || busy}
                  title={fullTitle}
                  onClick={() => onIncubate(g.ids.slice(0, 1))}
                >
                  Couver
                </button>
                {g.ids.length > 1 && freePlaces > 1 && (
                  <button
                    className={`btn-ghost ${SMALL_BUTTON}`}
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
    </BuildingSection>
  );
}

/** Œufs pondus, prochain œuf, règles d'héritage et chance chromatique d'une pension. */
function usePensionCard({
  ctx,
  pension,
  parents,
  charm,
  helper,
  closed,
  serverNow,
  busy,
  onCollect,
  onDeposit,
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
  /** Dépôt d'un Pokémon à cette place (à la place de celui qui y est). */
  onDeposit: (side: 0 | 1) => void;
  onWithdraw: (side: 0 | 1) => void;
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

  const full = waiting >= pensionMaxEggs;

  return {
    ctx,
    pension,
    parents,
    charm,
    helper,
    closed,
    serverNow,
    busy,
    onCollect,
    onDeposit,
    onWithdraw,
    shinyBonus,
    bonuses,
    pensionMaxEggs,
    start,
    laid,
    waiting,
    cycle,
    nextAt,
    held,
    rules,
    pa,
    pb,
    shinyRate,
    shinyBonuses,
    full,
  };
}

/** Ce qu'affichent les pièces de `PensionCard`. */
type PensionCardModel = ReturnType<typeof usePensionCard>;

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
  onDeposit,
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
  /** Dépôt d'un Pokémon à cette place (à la place de celui qui y est). */
  onDeposit: (side: 0 | 1) => void;
  onWithdraw: (side: 0 | 1) => void;
}) {
  const m = usePensionCard({
    ctx,
    pension,
    parents,
    charm,
    helper,
    closed,
    serverNow,
    busy,
    onCollect,
    onDeposit,
    onWithdraw,
  });
  const { pensionMaxEggs, waiting, full } = m;
  return (
    <div
      className={`tile flex flex-col gap-3 p-3 ${waiting > 0 ? 'border-amber-600 bg-done' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className={SECTION_TITLE}>Pension {pension.slotIndex + 1}</h3>
        {pension.breeds ? (
          <StateTag tone={waiting > 0 ? 'ready' : 'idle'}>
            {full ? 'Pleine' : `${waiting}/${pensionMaxEggs} œuf${waiting > 1 ? 's' : ''}`}
          </StateTag>
        ) : (
          <StateTag tone="idle">XP seule</StateTag>
        )}
      </div>
      <PensionParents m={m} />
      <PensionEggs m={m} />
      {pension.breeds && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            className="btn-ghost px-3 py-2"
            disabled={waiting === 0 || busy}
            onClick={() => onCollect('bag')}
            title="Range les œufs prêts dans le sac."
          >
            Ramasser
          </button>
          <button
            className="btn-primary px-3 py-2"
            disabled={waiting === 0 || busy}
            onClick={() => onCollect('incubator')}
            title="Place les œufs prêts dans la couveuse ; ceux qui n’y tiennent pas vont dans le sac."
          >
            Couver{waiting > 0 ? ` (${waiting})` : ''}
          </button>
        </div>
      )}
      <AssistantCard ctx={ctx} post="daycare" slot={pension.slotIndex} closed={closed} />
    </div>
  );
}

/** Les deux parents de la pension (ou leur place libre) et ce qu'ils transmettent. */
function PensionParents({ m }: { m: PensionCardModel }) {
  const { ctx, pension, parents, closed, serverNow, busy, onDeposit, onWithdraw, bonuses, held } =
    m;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2">
      {([0, 1] as const).map((side) => {
        const p = parents[side];
        const since = side === 0 ? pension.parentADepositedAt : pension.parentBDepositedAt;
        const gain =
          p && since ? daycareXp(ctx, p, new Date(since), new Date(serverNow), bonuses) : null;
        const parent = (
          <div key={side} className="flex min-w-0 flex-col items-center gap-1 text-center text-xs">
            {p && gain ? (
              <>
                <span
                  className={`sprite-well h-20 w-full overflow-hidden ${p.isShiny ? 'shiny-well' : ''}`}
                >
                  <IvHover ivs={p.ivs}>
                    <PokemonSprite
                      speciesId={p.speciesId}
                      formId={p.formId}
                      shiny={p.isShiny}
                      size={64}
                    />
                  </IvHover>
                </span>
                <span className="w-full truncate text-sm font-medium">
                  {speciesName(ctx, p.speciesId, p.formId)} <GenderSymbol gender={p.gender} />{' '}
                  {p.isShiny && <ShinyStar />}
                </span>
                <span title="XP gagnée depuis le dépôt, reçue en retirant le Pokémon de la pension.">
                  <span className="text-slate-500">N.{p.level}</span>
                  {gain.xpGained > 0 ? (
                    <>
                      {' · '}
                      <span className="text-emerald-600 dark:text-emerald-400">
                        +{formatXp(gain.xpGained)}
                      </span>
                      {gain.levelAfter > gain.levelBefore && (
                        <strong className="text-emerald-600 dark:text-emerald-400">
                          {' '}
                          ▶ N.{gain.levelAfter}
                        </strong>
                      )}
                    </>
                  ) : (
                    <span className="text-slate-500">
                      {' · '}
                      {p.level >= 100 ? 'Niveau maximal' : 'Pas encore d’XP'}
                    </span>
                  )}
                </span>
                <AbilityLine ctx={ctx} p={p} activities={['breeding']} />
                <span className="mt-1 flex flex-wrap justify-center gap-1">
                  <button
                    className={`btn-ghost ${SMALL_BUTTON}`}
                    disabled={busy}
                    onClick={() => onDeposit(side)}
                    title="Le remplace par un autre Pokémon ; il reçoit son XP."
                  >
                    Changer
                  </button>
                  <button
                    className={`btn-ghost ${SMALL_BUTTON}`}
                    disabled={busy}
                    onClick={() => onWithdraw(side)}
                    title={
                      pension.breeds
                        ? 'Il reçoit son XP ; les œufs prêts sont couvés, ceux qui ne tiennent pas dans la couveuse vont dans le sac.'
                        : 'Il reçoit son XP.'
                    }
                  >
                    Retirer
                  </button>
                </span>
              </>
            ) : (
              <button
                type="button"
                disabled={busy || closed}
                onClick={() => onDeposit(side)}
                className={`grid h-20 w-full place-items-center font-pixel text-base transition enabled:hover:border-brand-500 enabled:hover:text-brand-500 ${EMPTY_PLACE}`}
                title={closed ? 'Pension fermée' : 'Déposer un Pokémon'}
                aria-label={closed ? 'Pension fermée' : 'Déposer un Pokémon'}
              >
                +
              </button>
            )}
            {held[side] && (
              <span className="flex items-center gap-1 text-slate-500">
                <img
                  src={itemIcon(ctx, held[side])}
                  alt=""
                  className="size-5 [image-rendering:pixelated]"
                />
                {itemName(ctx, held[side])}
              </span>
            )}
          </div>
        );
        return side === 0 ? (
          parent
        ) : (
          <Fragment key={side}>
            <span
              className={`mt-7 font-pixel text-base ${pension.breeds ? 'text-rose-500' : 'text-slate-300 dark:text-slate-600'}`}
              title={pension.breeds ? undefined : 'Ces deux Pokémon ne peuvent pas s’accoupler.'}
              aria-label={pension.breeds ? undefined : 'Ne peuvent pas s’accoupler'}
              aria-hidden={pension.breeds}
            >
              ♥
            </span>
            {parent}
          </Fragment>
        );
      })}
    </div>
  );
}

/** Œufs de la pension : ceux qui attendent d'être ramassés, puis le suivant. */
function PensionEggs({ m }: { m: PensionCardModel }) {
  const { ctx, pension, serverNow, cycle, nextAt, rules, shinyRate, shinyBonuses, full } = m;
  return (
    <>
      {pension.breeds ? (
        <div className="flex items-center gap-3 rounded-md border-2 border-well-line p-2.5">
          <span className="sprite-well size-12 shrink-0 overflow-hidden">
            {pension.eggSpeciesId ? (
              <PokemonSprite speciesId={pension.eggSpeciesId} size={40} />
            ) : (
              <Egg size={34} />
            )}
          </span>
          <div className="min-w-0 flex-1 text-xs text-slate-500">
            <p>
              <span className="font-medium text-slate-700 dark:text-slate-200">
                Œufs de {pension.eggSpeciesId ? speciesName(ctx, pension.eggSpeciesId) : '?'}
              </span>{' '}
              · {rules.ivCount} IV hérités
              {rules.natureChance.some((c) => c > 0) && ' · nature transmise'}
            </p>
            {shinyRate !== null && (
              <p title="Le Charme Chroma compte s’il est dans le sac à l’éclosion ; l’assistant, s’il est en poste au ramassage.">
                <ShinyStar /> Chance chromatique : {formatShinyRate(shinyRate)}
                {shinyBonuses.length > 0 && ` (${shinyBonuses.join(', ')})`}
              </p>
            )}
            <ProgressBar
              className="mt-1.5"
              value={full ? 1 : (serverNow - (nextAt - cycle)) / cycle}
            />
            <p className="mt-1">
              {full ? (
                'Pension pleine : la ponte est en pause, ramasse les œufs !'
              ) : (
                <>
                  Prochain œuf dans{' '}
                  <span className="font-mono">{formatCountdown(nextAt - serverNow)}</span>
                </>
              )}
            </p>
          </div>
        </div>
      ) : (
        <p className="rounded-md border-2 border-well-line p-2.5 text-xs text-slate-500">
          {pension.parentAId && pension.parentBId
            ? 'Ces deux Pokémon ne peuvent pas s’accoupler : pas d’œuf, mais ils gagnent'
            : 'Un seul Pokémon : pas d’œuf tant qu’il n’a pas de partenaire, mais il gagne'}{' '}
          {formatXp(ctx.balance.breeding.parentXpPerHour)} par heure.
        </p>
      )}
    </>
  );
}

function EggCard({
  ctx,
  egg,
  serverNow,
  busy,
  onWithdraw,
}: {
  ctx: GameContext;
  egg: EggDto;
  serverNow: number;
  busy: boolean;
  onWithdraw: () => void;
}) {
  const start = Date.parse(egg.incubatedAt);
  const end = Date.parse(egg.hatchAt);
  const ready = serverNow >= end;
  return (
    <div
      className={`tile flex flex-col items-center gap-1 p-1.5 ${ready ? 'border-amber-600 bg-done' : ''}`}
    >
      <EggTimer
        size={64}
        progress={(serverNow - start) / (end - start)}
        ready={ready}
        title={`${speciesName(ctx, egg.speciesId, egg.formId)} ? ${
          ready ? 'Prêt à éclore' : `Éclosion dans ${formatCountdown(end - serverNow)}`
        }`}
      />
      <span
        className={
          ready
            ? 'pixel-label text-[8px] text-amber-800 dark:text-[#f8d878]'
            : 'font-mono text-[11px] text-slate-500'
        }
      >
        {ready ? 'Prêt !' : formatCountdown(end - serverNow)}
      </span>
      {!ready && (
        <button
          className="btn-ghost w-full px-1 py-1 text-[8px]!"
          disabled={busy}
          onClick={onWithdraw}
          title="L’œuf revient dans le sac ; son incubation repartira de zéro."
        >
          Retirer
        </button>
      )}
    </div>
  );
}
