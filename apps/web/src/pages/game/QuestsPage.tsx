import { useCallback, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'motion/react';
import { unlockParts } from '@poke/content';
import type { Quest, QuestCondition, QuestPokemon } from '@poke/content';
import { isActionCondition, isUnlocked, legendaryTarget } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type {
  ClaimLegendaryBattleResponse,
  ClaimQuestResponse,
  LegendaryBattleDto,
  LegendaryQuestStateDto,
  QuestProgressDto,
} from '@poke/shared';
import { Modal, PokemonSprite, ProgressBar, useNow } from '../../components/ui';
import { api } from '../../lib/api';
import {
  keys,
  refresh,
  refreshAfterReward,
  useExpeditions,
  useLegendaryBattles,
  usePlayerProgress,
  useQuests,
} from '../../lib/queries';
import {
  errorText,
  formatCountdown,
  itemIcon,
  itemName,
  questConditionText,
  speciesName,
  trainerName,
  unlockConditionText,
} from '../../lib/labels';
import { trainerBattleLink } from './BattlesPage';
import { CombatWindow, OngoingCombatBanner, useCombatWindow } from './CombatWindow';
import { DungeonCombat } from './DungeonCombat';
import { zoneLink } from './ExpeditionsPage';
import {
  LaunchLegendaryDialog,
  LegendaryCaptureDialog,
  LegendaryDefeatDialog,
  formatCaptureChance,
} from './LegendaryViews';
import { RewardList } from './ProgressionViews';
import { RegionTabs, currentRegionTab, useSavedRegionTab } from './RegionTabs';

/** Onglet des quêtes rattachées à aucune région. */
const OTHER_TAB = { id: '__autres', label: 'Autres' };

/**
 * Grilles selon la largeur réellement disponible (elle dépend de la colonne des widgets, d'où une
 * requête de conteneur) : deux quêtes en cours par ligne au plus, trois quêtes terminées.
 */
const QUEST_GRID = 'grid grid-cols-1 gap-3 @3xl:grid-cols-2';
const DONE_GRID = 'grid grid-cols-1 gap-3 @xl:grid-cols-2 @4xl:grid-cols-3';

/** Ancre de la carte d'une quête, pour y descendre depuis la vitrine des légendaires. */
const questAnchor = (questId: string) => `quest-${questId}`;

/** Légendaire d'une quête réclamée, pas encore capturé. */
interface Hunt {
  target: QuestPokemon;
  /** Pokémon fuyard : pas de combat, il se cache dans les zones de la région. */
  roaming: Roaming | null;
  /** Légendaire à combattre (non fuyard). */
  battle: HuntBattle | null;
}

interface HuntBattle {
  state: LegendaryQuestStateDto | undefined;
  /** Combat en cours contre ce légendaire. */
  fighting: boolean;
  /** Un autre combat légendaire est en cours. */
  busy: boolean;
  /** Temps restant avant de retenter (ms) ; null = possible tout de suite. */
  retryIn: number | null;
  onLaunch: () => void;
  onCapture: () => void;
}

interface Roaming {
  /** Zone où il se cache ; null = parti avec une expédition, ou aucune zone débloquée. */
  zoneId: string | null;
  /** Temps restant avant qu'il change de zone (ms). */
  movesIn: number;
  /** Parti avec une expédition pas encore récupérée. */
  engaged: boolean;
}

/**
 * Quêtes (légendaires) : étapes à valider dans l'ordre, puis récompense à réclamer ; le légendaire
 * s'affronte ensuite en combat depuis cette page (les fuyards, eux, en expédition).
 */
export function QuestsPage({ ctx }: { ctx: GameContext }) {
  const queryClient = useQueryClient();
  const quests = useQuests();
  const progress = usePlayerProgress();
  const [reveal, setReveal] = useState<ClaimQuestResponse | null>(null);
  const [selectedRegion, setSelectedRegion] = useSavedRegionTab('quests');
  const expeditions = useExpeditions();
  const legendary = useLegendaryBattles();
  const now = useNow();
  const [launchQuest, setLaunchQuest] = useState<Quest | null>(null);
  const [capture, setCapture] = useState<{
    battleId: string;
    questId: string;
    isShiny: boolean;
  } | null>(null);
  const [defeat, setDefeat] = useState<LegendaryBattleDto | null>(null);
  const [overBattle, setOverBattle] = useState<string | null>(null);
  const [claimBattle, setClaimBattle] = useState<string | null>(null);
  const claim = useMutation({
    mutationFn: (questId: string) =>
      api<ClaimQuestResponse>(`/api/quests/${questId}/claim`, { method: 'POST' }),
    onSuccess: (data) => {
      setReveal(data);
      return Promise.all([
        refreshAfterReward(queryClient),
        refresh(queryClient, keys.legendaryBattles),
      ]);
    },
  });

  const active = legendary.data?.active ?? null;
  const activeId = active?.id ?? null;
  const { open: combatOpen, show: showCombat } = useCombatWindow(
    'legendary-combat-hidden',
    activeId,
  );
  const markOver = useCallback(() => setOverBattle(activeId), [activeId]);

  if (ctx.quests.length === 0) {
    return <p className="text-slate-500">Aucune quête pour le moment.</p>;
  }
  const byId = new Map(quests.data?.quests.map((q) => [q.questId, q]));
  // Décalages entre l'horloge du serveur et celle du navigateur, pour les comptes à rebours.
  const expeditionOffset = expeditions.data
    ? Date.parse(expeditions.data.serverTime) - expeditions.dataUpdatedAt
    : 0;
  const legendaryOffset = legendary.data
    ? Date.parse(legendary.data.serverTime) - legendary.dataUpdatedAt
    : 0;
  const running = expeditions.data?.active ?? [];
  const states = new Map(legendary.data?.quests.map((s) => [s.questId, s]));
  /** Pokémon à capturer : récompense réclamée, pas encore capturé. */
  const targetOf = (q: Quest) => {
    const state = byId.get(q.id);
    return state?.status === 'claimed' ? q.rewards.pokemon[state.pokemonCaught] : undefined;
  };
  const huntOf = (q: Quest): Hunt | null => {
    const target = targetOf(q);
    if (!target) return null;
    if (target.roaming != null) {
      const roamer = expeditions.data?.roamers.find((r) => r.questId === q.id);
      return {
        target,
        battle: null,
        roaming: {
          zoneId: roamer?.zoneId ?? null,
          movesIn: roamer ? Date.parse(roamer.movesAt) - (now + expeditionOffset) : 0,
          engaged: running.some((e) => e.roamerQuestIds.includes(q.id)),
        },
      };
    }
    const state = states.get(q.id);
    const retryIn = state?.retryAt ? Date.parse(state.retryAt) - (now + legendaryOffset) : null;
    return {
      target,
      roaming: null,
      battle: {
        state,
        fighting: active?.questId === q.id,
        busy: !!active && active.questId !== q.id,
        retryIn: retryIn !== null && retryIn > 0 ? retryIn : null,
        onLaunch: () => setLaunchQuest(q),
        onCapture: () =>
          state?.pendingCapture &&
          setCapture({ battleId: state.pendingCapture.id, questId: q.id, ...state.pendingCapture }),
      },
    };
  };
  // Prêt à agir : récompense à réclamer, Ball à lancer, combat à livrer.
  const actionable = (q: Quest) => {
    if (byId.get(q.id)?.status === 'completed') return true;
    const hunt = huntOf(q);
    if (!hunt) return false;
    if (hunt.roaming) return !hunt.roaming.engaged;
    const b = hunt.battle!;
    return !!b.state?.pendingCapture || (!b.fighting && !b.busy && b.retryIn === null);
  };
  // Quêtes à réclamer d'abord, légendaires à capturer, en cours, verrouillées, terminées.
  const rank = (q: Quest) =>
    targetOf(q)
      ? 1
      : { completed: 0, active: 2, locked: 3, claimed: 4 }[byId.get(q.id)?.status ?? 'locked'];
  const sorted = [...ctx.quests].sort((a, b) => rank(a) - rank(b) || a.order - b.order);
  const tabOf = (q: Quest) => q.regionId ?? OTHER_TAB.id;
  const extra = ctx.quests.some((q) => q.regionId === null) ? [OTHER_TAB] : [];
  const tab = currentRegionTab(ctx, progress, selectedRegion, extra);
  const shown = sorted.filter((q) => tabOf(q) === tab);
  const regionName = ctx.regions.find((r) => r.id === tab)?.name;
  // Terminées : récompense réclamée et tous ses Pokémon capturés ; rangées à part, en bas.
  const isFinished = (q: Quest) => byId.get(q.id)?.status === 'claimed' && !targetOf(q);
  const ongoing = shown.filter((q) => !isFinished(q));
  const done = shown.filter(isFinished).sort((a, b) => a.order - b.order);
  const toClaim = (id: string) =>
    ctx.quests.some((q) => tabOf(q) === id && byId.get(q.id)?.status === 'completed')
      ? 'Récompense à réclamer'
      : ctx.quests.some((q) => tabOf(q) === id && targetOf(q) && actionable(q))
        ? 'Légendaire à capturer'
        : null;
  const launchTarget = launchQuest && targetOf(launchQuest);
  const activeQuest = active ? ctx.quest(active.questId) : undefined;
  const activeTarget = active && activeQuest?.rewards.pokemon[active.pokemonIndex];
  const activeTitle = activeTarget
    ? `Combat légendaire : ${speciesName(ctx, activeTarget.speciesId, activeTarget.formId)}`
    : 'Combat légendaire';
  const captureTarget = capture && ctx.quest(capture.questId);

  function finished(data: ClaimLegendaryBattleResponse) {
    setClaimBattle(null);
    const { battle } = data;
    if (battle.outcome === 'win') {
      setCapture({ battleId: battle.id, questId: battle.questId, isShiny: battle.isShiny });
    } else {
      setDefeat(battle);
    }
  }

  return (
    <div className="space-y-4">
      {active && !combatOpen && (
        <OngoingCombatBanner
          title={activeTitle}
          portrait={
            activeTarget && (
              <PokemonSprite
                speciesId={activeTarget.speciesId}
                formId={activeTarget.formId}
                shiny={active.isShiny}
                size={72}
              />
            )
          }
          over={overBattle === active.id}
          claiming={claimBattle === active.id}
          onShow={() => {
            if (overBattle === active.id) setClaimBattle(active.id);
            else showCombat(true);
          }}
        />
      )}
      <section className="@container">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Quêtes{regionName ? ` de ${regionName}` : ''}</h2>
          <RegionTabs
            ctx={ctx}
            progress={progress}
            selected={tab}
            onSelect={setSelectedRegion}
            marker={toClaim}
            extra={extra}
          />
        </div>
        {shown.length > 0 && (
          <LegendaryCase
            ctx={ctx}
            quests={[...shown].sort((a, b) => a.order - b.order)}
            stateOf={(q) => byId.get(q.id)}
          />
        )}
        {claim.error && <p className="mb-3 text-sm text-red-600">{errorText(claim.error)}</p>}
        {shown.length === 0 && (
          <p className="text-sm text-slate-500">Aucune quête dans cette région pour le moment.</p>
        )}
        <div className={QUEST_GRID}>
          {ongoing.map((quest) => (
            <QuestCard
              key={quest.id}
              ctx={ctx}
              quest={quest}
              state={byId.get(quest.id)}
              unlockText={
                isUnlocked(ctx, quest.unlock, progress)
                  ? null
                  : (unlockConditionText(ctx, quest.unlock) ?? 'Verrouillée')
              }
              claiming={claim.isPending && claim.variables === quest.id}
              onClaim={() => claim.mutate(quest.id)}
              hunt={huntOf(quest)}
              highlight={actionable(quest)}
            />
          ))}
        </div>
      </section>

      {done.length > 0 && (
        <section className="@container">
          <h2 className="mb-3 text-lg font-semibold">Quêtes terminées</h2>
          <div className={DONE_GRID}>
            {done.map((quest) => (
              <FinishedQuestCard key={quest.id} ctx={ctx} quest={quest} />
            ))}
          </div>
        </section>
      )}
      <QuestReveal ctx={ctx} data={reveal} onClose={() => setReveal(null)} />

      {active && (
        <CombatWindow open={combatOpen} onClose={() => showCombat(false)}>
          <DungeonCombat<LegendaryBattleDto, ClaimLegendaryBattleResponse>
            key={active.id}
            ctx={ctx}
            title={activeTitle}
            apiBase="/api/legendary-battles"
            queryKey={keys.legendaryBattles}
            bossLast
            run={active}
            offsetMs={legendaryOffset}
            visible={combatOpen}
            onHide={() => showCombat(false)}
            claimRequested={claimBattle === active.id}
            onOver={markOver}
            onClaimError={() => {
              setClaimBattle(null);
              showCombat(true);
            }}
            onFinished={finished}
          />
        </CombatWindow>
      )}
      {launchQuest && launchTarget && (
        <LaunchLegendaryDialog
          ctx={ctx}
          quest={launchQuest}
          target={launchTarget}
          attempts={states.get(launchQuest.id)?.attempts ?? 0}
          onClose={() => setLaunchQuest(null)}
        />
      )}
      {capture && captureTarget && (
        <CaptureForQuest
          ctx={ctx}
          quest={captureTarget}
          battleId={capture.battleId}
          isShiny={capture.isShiny}
          onClose={() => setCapture(null)}
        />
      )}
      <LegendaryDefeatDialog ctx={ctx} battle={defeat} onClose={() => setDefeat(null)} />
    </div>
  );
}

/** Fenêtre de capture du légendaire en attente de la Ball d'une quête. */
function CaptureForQuest({
  ctx,
  quest,
  battleId,
  isShiny,
  onClose,
}: {
  ctx: GameContext;
  quest: Quest;
  battleId: string;
  isShiny: boolean;
  onClose: () => void;
}) {
  const quests = useQuests();
  // Pokémon visé figé à l'ouverture : la capture fait passer la quête au suivant.
  const [target] = useState(() => {
    const caught = quests.data?.quests.find((q) => q.questId === quest.id)?.pokemonCaught ?? 0;
    return legendaryTarget(quest, caught);
  });
  if (!target) return null;
  return (
    <LegendaryCaptureDialog
      ctx={ctx}
      battleId={battleId}
      target={target}
      isShiny={isShiny}
      onClose={onClose}
    />
  );
}

/**
 * Vitrine des légendaires de la région, comme la boîte à badges des Combats : capturés en couleur,
 * les autres en silhouette. Un clic descend jusqu'à leur quête.
 */
function LegendaryCase({
  ctx,
  quests,
  stateOf,
}: {
  ctx: GameContext;
  quests: Quest[];
  stateOf: (quest: Quest) => QuestProgressDto | undefined;
}) {
  const entries = quests.flatMap((quest) =>
    quest.rewards.pokemon.map((pokemon, index) => {
      const state = stateOf(quest);
      const caught = state?.status === 'claimed' && index < state.pokemonCaught;
      return { quest, pokemon, index, caught, locked: !state };
    }),
  );
  if (entries.length === 0) return null;
  const count = entries.filter((e) => e.caught).length;
  return (
    <div className="card mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
      <p className="pixel-label shrink-0">
        Légendaires {count} / {entries.length}
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {entries.map(({ quest, pokemon, index, caught, locked }) => {
          const name = caught ? speciesName(ctx, pokemon.speciesId, pokemon.formId) : quest.name;
          return (
            <li key={`${quest.id}:${index}`}>
              <button
                type="button"
                title={caught ? `${name} (capturé)` : name}
                aria-label={name}
                className="sprite-well size-10 transition hover:border-brand-500"
                onClick={() =>
                  document
                    .getElementById(questAnchor(quest.id))
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
              >
                <PokemonSprite
                  speciesId={pokemon.speciesId}
                  formId={pokemon.formId}
                  size={36}
                  silhouette={!caught}
                  className={locked ? 'opacity-40' : ''}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Portrait d'une quête : image dédiée, sinon le légendaire (en silhouette tant qu'il n'est pas à soi). */
function QuestPortrait({
  quest,
  silhouette,
  size = 'size-18',
  spriteSize = 64,
}: {
  quest: Quest;
  silhouette: boolean;
  /** Taille de la case (classe) et du sprite qu'elle contient (px). */
  size?: string;
  spriteSize?: number;
}) {
  const featured = quest.rewards.pokemon[0];
  return (
    <div className={`sprite-well shrink-0 overflow-hidden ${size}`}>
      {quest.image ? (
        <img src={quest.image} alt="" className="size-full object-cover" />
      ) : (
        featured && (
          <PokemonSprite
            speciesId={featured.speciesId}
            formId={featured.formId}
            size={spriteSize}
            silhouette={silhouette}
          />
        )
      )}
    </div>
  );
}

/** Avancement en cases : validées en vert, celle en cours en jaune, les suivantes vides. */
function StepTrack({ total, done, active }: { total: number; done: number; active: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="pixel-label shrink-0 text-slate-500">
        {active ? `Étape ${done + 1} / ${total}` : `${total} / ${total} étapes`}
      </span>
      <ol className="flex flex-1 gap-1" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <li
            key={i}
            className={`h-3 flex-1 rounded-sm border-2 border-ink ${
              i < done ? 'bg-[#48c048]' : i === done && active ? 'bg-[#f8d030]' : 'bg-track'
            }`}
          />
        ))}
      </ol>
    </div>
  );
}

/** Étapes validées et leur dénouement (la suite de l'histoire), repliées par défaut. */
function QuestJournal({ steps }: { steps: Quest['steps'] }) {
  if (steps.length === 0) return null;
  return (
    <details className="group text-xs">
      <summary className="pixel-label flex cursor-pointer list-none items-center gap-1.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
        {/* Même chevron pixel art que les sections repliables : à droite fermé, en bas ouvert. */}
        <svg
          viewBox="0 0 7 4"
          width="11"
          height="7"
          shapeRendering="crispEdges"
          aria-hidden
          className="-rotate-90 transition-transform group-open:rotate-0"
        >
          <path d="M0 0h7v1h-1v1h-1v1h-1v1h-1v-1h-1v-1h-1v-1h-1z" fill="currentColor" />
        </svg>
        Journal ({steps.length})
      </summary>
      <ol className="mt-2 space-y-2 border-l-2 border-amber-300 pl-2.5 dark:border-amber-700">
        {steps.map((step, i) => (
          <li key={i}>
            <p className="font-medium text-slate-600 dark:text-slate-300">
              <span className="text-emerald-600">✓</span> {step.name}
            </p>
            {step.outcome && <p className="mt-0.5 text-slate-500 italic">{step.outcome}</p>}
          </li>
        ))}
      </ol>
    </details>
  );
}

/** Étape en cours : ce qu'il faut faire, mise en avant comme l'onglet choisi du menu. */
function CurrentStep({
  ctx,
  quest,
  step,
  count,
}: {
  ctx: GameContext;
  quest: Quest;
  step: Quest['steps'][number];
  count: number;
}) {
  const { condition } = step;
  const target = isActionCondition(condition) ? condition.count : null;
  return (
    <div className="rounded-md bg-selected px-2.5 py-2 text-sm">
      <p className="flex items-center gap-1.5 font-semibold">
        <span className="text-[10px] text-brand-500">▶</span>
        {step.name}
      </p>
      <p className="text-xs text-slate-600 dark:text-slate-300">
        {step.description || questConditionText(ctx, condition)}
      </p>
      {step.description && condition.type !== 'allOf' && (
        <p className="text-[11px] text-slate-500">{questConditionText(ctx, condition)}</p>
      )}
      {condition.type === 'questItem' && (
        <p className="mt-0.5 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
          <img src={itemIcon(ctx, condition.itemId)} alt="" className="h-5 w-5" />
          {itemName(ctx, condition.itemId)} : {condition.chance} % de chances par tirage de butin
        </p>
      )}
      {condition.type === 'catchPokemon' && !condition.zoneId && quest.regionId && (
        <p className="text-[11px] text-slate-500">
          Captures comptées uniquement à {ctx.region(quest.regionId)?.name ?? quest.regionId}.
        </p>
      )}
      {target !== null && target > 1 && (
        <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-500">
          <ProgressBar className="flex-1" value={count / target} />
          <span>
            {count} / {target}
          </span>
        </div>
      )}
      <StepTrainerLinks ctx={ctx} condition={condition} />
    </div>
  );
}

/** Récompense : le légendaire (caché tant que la quête n'est pas accomplie), puis le reste. */
function QuestRewards({
  ctx,
  quest,
  revealed,
}: {
  ctx: GameContext;
  quest: Quest;
  revealed: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      {quest.rewards.pokemon.map((p, i) => (
        <span
          key={i}
          className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-300"
        >
          {revealed
            ? `${speciesName(ctx, p.speciesId, p.formId)} N.${p.level}`
            : `??? N.${p.level}`}
        </span>
      ))}
      <RewardList ctx={ctx} rewards={quest.rewards} />
    </div>
  );
}

function QuestCard({
  ctx,
  quest,
  state,
  unlockText,
  claiming,
  onClaim,
  hunt,
  highlight,
}: {
  ctx: GameContext;
  quest: Quest;
  state: QuestProgressDto | undefined;
  unlockText: string | null;
  claiming: boolean;
  onClaim: () => void;
  hunt: Hunt | null;
  highlight: boolean;
}) {
  const status = state?.status ?? 'locked';
  const total = quest.steps.length;
  // Étapes validées : toutes une fois la quête accomplie.
  const done = status === 'active' ? (state?.step ?? 0) : status === 'locked' ? 0 : total;
  const current = status === 'active' ? quest.steps[done] : undefined;

  return (
    <div
      id={questAnchor(quest.id)}
      className={`card flex scroll-mt-4 flex-col gap-3 p-3 ${status === 'locked' ? 'opacity-60' : ''} ${
        highlight ? 'ring-2 ring-amber-400' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <QuestPortrait quest={quest} silhouette={status !== 'claimed' || !!hunt} />
        <div className="min-w-0 flex-1">
          <h3 className="leading-tight font-semibold">{quest.name}</h3>
          <p className="mt-0.5 text-xs text-slate-500">{quest.description}</p>
          {hunt && (
            <p className="mt-1 text-xs font-medium text-amber-600">
              ✦ {hunt.roaming ? 'Fuyard à capturer' : 'Légendaire à affronter'}
            </p>
          )}
        </div>
      </div>

      {status === 'locked' ? (
        <p className="text-xs text-slate-500">🔒 {unlockText ?? 'Verrouillée'}</p>
      ) : (
        <StepTrack total={total} done={done} active={status === 'active'} />
      )}
      {current && <CurrentStep ctx={ctx} quest={quest} step={current} count={state?.count ?? 0} />}
      <QuestJournal steps={quest.steps.slice(0, done)} />

      <div className="mt-auto space-y-2 border-t border-slate-200 pt-2 dark:border-slate-700">
        <QuestRewards
          ctx={ctx}
          quest={quest}
          revealed={status === 'claimed' || status === 'completed'}
        />
        {status === 'completed' && (
          <button className="btn-primary w-full" disabled={claiming} onClick={onClaim}>
            {claiming ? '…' : 'Réclamer la récompense'}
          </button>
        )}
        {hunt?.roaming && <RoamingStatus ctx={ctx} roaming={hunt.roaming} />}
        {hunt?.battle && <BattleStatus ctx={ctx} target={hunt.target} battle={hunt.battle} />}
      </div>
    </div>
  );
}

/** Quête terminée, légendaire capturé : carte réduite, le journal reste à relire. */
function FinishedQuestCard({ ctx, quest }: { ctx: GameContext; quest: Quest }) {
  const names = quest.rewards.pokemon.map((p) => speciesName(ctx, p.speciesId, p.formId));
  return (
    <div id={questAnchor(quest.id)} className="card flex scroll-mt-4 flex-col gap-2 p-3">
      <div className="flex items-center gap-3">
        <QuestPortrait quest={quest} silhouette={false} size="size-14" spriteSize={52} />
        <div className="min-w-0 flex-1">
          <h3 className="leading-tight font-semibold">{quest.name}</h3>
          {names.length > 0 && (
            <p className="mt-0.5 text-xs text-emerald-600">✓ {names.join(', ')}</p>
          )}
        </div>
      </div>
      <QuestJournal steps={quest.steps} />
    </div>
  );
}

/** Où en est le combat contre le légendaire d'une quête : combat, Ball ou délai. */
function BattleStatus({
  ctx,
  target,
  battle,
}: {
  ctx: GameContext;
  target: QuestPokemon;
  battle: HuntBattle;
}) {
  const name = speciesName(ctx, target.speciesId, target.formId);
  if (battle.state?.pendingCapture) {
    return (
      <button className="btn-primary w-full" onClick={battle.onCapture}>
        {name} est vaincu : lancer une Ball ({formatCaptureChance(target)})
      </button>
    );
  }
  if (battle.fighting) {
    return (
      <p className="rounded-lg bg-brand-500/10 px-2 py-1.5 text-center text-sm">
        Combat en cours contre {name}
      </p>
    );
  }
  if (battle.retryIn !== null) {
    return (
      <p className="rounded-lg bg-slate-100 px-2 py-1.5 text-center text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        {name} reprend des forces : nouveau combat dans {formatCountdown(battle.retryIn)}
      </p>
    );
  }
  return (
    <button className="btn-primary w-full" disabled={battle.busy} onClick={battle.onLaunch}>
      {battle.busy ? 'Un autre combat légendaire est en cours' : `Affronter ${name}`}
    </button>
  );
}

/** Dresseurs que l'étape en cours demande de battre (pas encore battus) : un lien vers leur combat. */
function StepTrainerLinks({ ctx, condition }: { ctx: GameContext; condition: QuestCondition }) {
  const progress = usePlayerProgress();
  const trainers = unlockParts(condition).flatMap((part) =>
    part.type === 'trainerDefeated' && !progress.defeatedTrainerIds.has(part.trainerId)
      ? (ctx.trainer(part.trainerId) ?? [])
      : [],
  );
  if (trainers.length === 0) return null;
  return (
    <div className="mt-1.5 space-y-1">
      {trainers.map((trainer) => (
        <a
          key={trainer.id}
          href={trainerBattleLink(trainer.id)}
          className="btn-primary block w-full text-center"
        >
          Affronter {trainer.trainerClass} {trainerName(trainer)}
        </a>
      ))}
    </div>
  );
}

/** Où se cache le fuyard d'une quête : lien vers sa zone (qui ouvre le départ d'expédition). */
function RoamingStatus({ ctx, roaming }: { ctx: GameContext; roaming: Roaming }) {
  const zone = roaming.zoneId ? ctx.zone(roaming.zoneId) : undefined;
  if (roaming.engaged) {
    return (
      <p className="rounded-lg bg-brand-500/10 px-2 py-1.5 text-center text-sm">
        Une de tes expéditions est sur sa piste : récupère-la pour savoir si tu l’as croisé.
      </p>
    );
  }
  if (!zone) {
    return (
      <p className="rounded-lg bg-slate-100 px-2 py-1.5 text-center text-sm text-slate-500 dark:bg-slate-800">
        Il rôde dans la région, mais dans aucune zone que tu as débloquée.
      </p>
    );
  }
  return (
    <a href={zoneLink(zone.id)} className="btn-primary block w-full text-center">
      Le traquer : {zone.name} (encore {formatCountdown(Math.max(0, roaming.movesIn))})
    </a>
  );
}

/** Récompense réclamée : les légendaires attendent leur combat (ou fuient). */
function QuestReveal({
  ctx,
  data,
  onClose,
}: {
  ctx: GameContext;
  data: ClaimQuestResponse | null;
  onClose: () => void;
}) {
  const reduced = useReducedMotion();
  const quest = data ? ctx.quest(data.questId) : undefined;
  const ending = quest?.steps.at(-1)?.outcome;
  return (
    <Modal open={!!data} onClose={onClose}>
      {data && (
        <div className="text-center">
          <h2 className="text-xl font-bold">Quête terminée !</h2>
          {ending && (
            <p className="mt-2 text-sm text-slate-600 italic dark:text-slate-300">{ending}</p>
          )}
          {data.rewards.pokemon.length > 0 && (
            <>
              <div className="mt-4 flex flex-wrap justify-center gap-4">
                {data.rewards.pokemon.map((p, i) => (
                  <motion.div
                    key={i}
                    initial={reduced ? false : { opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: reduced ? 0 : 0.3 + i * 0.3, type: 'spring' }}
                  >
                    <PokemonSprite
                      speciesId={p.speciesId}
                      formId={p.formId}
                      kind="artwork"
                      size={140}
                      silhouette
                    />
                  </motion.div>
                ))}
              </div>
              <p className="mt-3 text-sm text-slate-500">
                {data.rewards.pokemon
                  .map((p) => speciesName(ctx, p.speciesId, p.formId))
                  .join(', ')}{' '}
                {data.rewards.pokemon.some((p) => p.roaming != null)
                  ? 's’est enfui ! C’est un fuyard : il change de zone à chaque heure. Repère son logo sur les zones d’expédition et envoie une équipe avec des Balls à sa poursuite.'
                  : 't’attend : affronte-le depuis cette quête avec ton équipe. Vaincu, il se capture d’une seule Ball, prépare-toi bien !'}
              </p>
            </>
          )}
          <div className="mt-4 flex justify-center">
            <RewardList ctx={ctx} rewards={data.rewards} />
          </div>
          <button className="btn-primary mt-6" onClick={onClose}>
            Continuer
          </button>
        </div>
      )}
    </Modal>
  );
}
