import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'motion/react';
import type { Quest } from '@poke/content';
import { chainMultiplier, isActionCondition, isUnlocked } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type {
  ClaimQuestResponse,
  ExpeditionDto,
  QuestChainDto,
  QuestProgressDto,
} from '@poke/shared';
import { Modal, PokemonSprite, ProgressBar, useNow } from '../../components/ui';
import { api } from '../../lib/api';
import { PLAYER_STATE_KEYS, useExpeditions, usePlayerProgress, useQuests } from '../../lib/game';
import {
  errorText,
  formatCountdown,
  formatDuration,
  formatMultiplier,
  questConditionText,
  speciesName,
  unlockConditionText,
} from '../../lib/labels';
import { RewardList } from './ProgressionViews';
import { QuestExpeditionDialog } from './QuestExpeditionDialog';
import { RegionTabs, currentRegionTab, useSavedRegionTab } from './RegionTabs';

/** Onglet des quêtes rattachées à aucune région. */
const OTHER_TAB = { id: '__autres', label: 'Autres' };

/** Expédition légendaire d'une quête dont le Pokémon reste à capturer. */
interface Hunt {
  /** Expédition en cours (une seule à la fois par quête). */
  running: ExpeditionDto | undefined;
  /** Temps restant de l'expédition en cours (ms). */
  endsIn: number;
  durationMinutes: number;
  /** Chaîne shiny de la quête (expéditions légendaires relancées de suite). */
  chain: QuestChainDto | undefined;
  /** Temps restant pour relancer avant que la chaîne retombe à 0 (ms) ; null = sans délai. */
  chainExpiresIn: number | null;
  canLaunch: boolean;
  onLaunch: () => void;
}

/**
 * Quêtes (légendaires) : étapes à valider dans l'ordre, puis récompense à réclamer ; le légendaire
 * se capture ensuite en expédition légendaire, lancée d'ici uniquement.
 */
export function QuestsPage({ ctx }: { ctx: GameContext }) {
  const queryClient = useQueryClient();
  const quests = useQuests();
  const progress = usePlayerProgress();
  const [reveal, setReveal] = useState<ClaimQuestResponse | null>(null);
  const [selectedRegion, setSelectedRegion] = useSavedRegionTab('quests');
  const expeditions = useExpeditions();
  const now = useNow();
  const [huntQuest, setHuntQuest] = useState<Quest | null>(null);
  const claim = useMutation({
    mutationFn: (questId: string) =>
      api<ClaimQuestResponse>(`/api/quests/${questId}/claim`, { method: 'POST' }),
    onSuccess: (data) => {
      setReveal(data);
      return Promise.all(
        PLAYER_STATE_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
  });

  if (ctx.quests.length === 0) {
    return <p className="text-slate-500">Aucune quête pour le moment.</p>;
  }
  const byId = new Map(quests.data?.quests.map((q) => [q.questId, q]));
  // Décalage entre l'horloge du serveur et celle du navigateur, pour les comptes à rebours.
  const offset = expeditions.data
    ? Date.parse(expeditions.data.serverTime) - expeditions.dataUpdatedAt
    : 0;
  const active = expeditions.data?.active ?? [];
  const freeSlot = active.length < (expeditions.data?.slots ?? 0);
  /** Pokémon à capturer en expédition légendaire : récompense réclamée, pas encore capturé. */
  const targetOf = (q: Quest) => {
    const state = byId.get(q.id);
    return state?.status === 'claimed' ? q.rewards.pokemon[state.pokemonCaught] : undefined;
  };
  const huntOf = (q: Quest): Hunt | null => {
    const target = targetOf(q);
    if (!target) return null;
    const running = active.find((e) => e.questId === q.id);
    const chain = expeditions.data?.questChains.find((c) => c.questId === q.id);
    return {
      running,
      endsIn: running ? Date.parse(running.endsAt) - (now + offset) : 0,
      durationMinutes: target.expedition.durationMinutes,
      chain,
      chainExpiresIn: chain?.expiresAt ? Date.parse(chain.expiresAt) - (now + offset) : null,
      canLaunch: freeSlot,
      onLaunch: () => setHuntQuest(q),
    };
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
  const toClaim = (id: string) =>
    ctx.quests.some((q) => tabOf(q) === id && byId.get(q.id)?.status === 'completed')
      ? 'Récompense à réclamer'
      : ctx.quests.some(
            (q) => tabOf(q) === id && targetOf(q) && !active.some((e) => e.questId === q.id),
          )
        ? 'Légendaire à capturer'
        : null;
  const huntTarget = huntQuest && targetOf(huntQuest);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Les légendaires ne se rencontrent pas en expédition : chaque quête les met à ta portée. Les
        étapes se valident dans l’ordre ; captures et expéditions ne comptent qu’à partir du début
        de l’étape. Une fois la récompense réclamée, pars à la recherche du légendaire lors d’une
        expédition légendaire : au retour, tu vois s’il est shiny avant de lancer ta Ball (une
        seule) ou de fuir. Relancer de suite allonge la chaîne shiny.
      </p>
      <RegionTabs
        ctx={ctx}
        progress={progress}
        selected={tab}
        onSelect={setSelectedRegion}
        marker={toClaim}
        extra={extra}
      />
      {claim.error && <p className="text-sm text-red-600">{errorText(claim.error)}</p>}
      {shown.length === 0 && (
        <p className="text-sm text-slate-500">Aucune quête dans cette région pour le moment.</p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {shown.map((quest) => (
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
          />
        ))}
      </div>
      <QuestReveal ctx={ctx} data={reveal} onClose={() => setReveal(null)} />
      {huntQuest && huntTarget && (
        <QuestExpeditionDialog
          ctx={ctx}
          quest={huntQuest}
          target={huntTarget}
          chain={expeditions.data?.questChains.find((c) => c.questId === huntQuest.id)?.chain ?? 0}
          onClose={() => setHuntQuest(null)}
        />
      )}
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
}: {
  ctx: GameContext;
  quest: Quest;
  state: QuestProgressDto | undefined;
  unlockText: string | null;
  claiming: boolean;
  onClaim: () => void;
  hunt: Hunt | null;
}) {
  const status = state?.status ?? 'locked';
  const featured = quest.rewards.pokemon[0];
  const done = state?.step ?? 0;

  return (
    <div
      className={`card flex flex-col gap-3 p-4 ${status === 'locked' ? 'opacity-60' : ''} ${
        status === 'completed' || (hunt && !hunt.running) ? 'ring-2 ring-amber-400' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="grid size-20 shrink-0 place-items-center rounded-xl bg-slate-100 dark:bg-slate-800">
          {quest.image ? (
            <img src={quest.image} alt="" className="size-20 rounded-xl object-cover" />
          ) : (
            featured && (
              <PokemonSprite
                speciesId={featured.speciesId}
                formId={featured.formId}
                kind="artwork"
                size={72}
                silhouette={status !== 'claimed' || !!hunt}
              />
            )
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">{quest.name}</h3>
          <p className="text-xs text-slate-500">{quest.description}</p>
          {status === 'claimed' &&
            (hunt ? (
              <p className="mt-1 text-xs font-medium text-amber-600">✦ Légendaire à capturer</p>
            ) : (
              <p className="mt-1 text-xs text-emerald-600">✓ Terminée</p>
            ))}
          {status === 'locked' && <p className="mt-1 text-xs">🔒 {unlockText ?? 'Verrouillée'}</p>}
        </div>
      </div>

      {status !== 'locked' && (
        <ol className="space-y-1.5 text-sm">
          {quest.steps.map((step, i) => {
            const isDone = i < done || status !== 'active';
            const current = status === 'active' && i === done;
            const { condition } = step;
            const target = isActionCondition(condition) ? condition.count : null;
            return (
              <li
                key={i}
                className={`rounded-lg px-2 py-1 ${
                  current ? 'bg-brand-500/10' : isDone ? 'text-slate-500' : 'text-slate-400'
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="w-4 shrink-0">{isDone ? '✓' : current ? '▶' : '·'}</span>
                  <div className="min-w-0 flex-1">
                    <p className={current ? 'font-medium' : ''}>
                      {current || isDone ? step.name : `Étape ${i + 1}`}
                    </p>
                    {current && (
                      <p className="text-xs text-slate-500">
                        {step.description || questConditionText(ctx, condition)}
                      </p>
                    )}
                    {current && target !== null && target > 1 && (
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                        <ProgressBar className="flex-1" value={(state?.count ?? 0) / target} />
                        <span>
                          {state?.count ?? 0} / {target}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="mt-auto space-y-2 border-t border-slate-100 pt-2 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-500">Récompense :</span>
          {quest.rewards.pokemon.map((p, i) => (
            <span
              key={i}
              className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-300"
            >
              {status === 'claimed' || status === 'completed'
                ? `${speciesName(ctx, p.speciesId, p.formId)} N.${p.level}`
                : `??? N.${p.level}`}
            </span>
          ))}
        </div>
        <RewardList ctx={ctx} rewards={quest.rewards} />
        {status === 'completed' && (
          <button className="btn-primary w-full" disabled={claiming} onClick={onClaim}>
            {claiming ? '…' : 'Réclamer la récompense'}
          </button>
        )}
        {hunt &&
          (hunt.running ? (
            <p className="rounded-lg bg-brand-500/10 px-2 py-1.5 text-center text-sm">
              Expédition légendaire{' '}
              {hunt.endsIn > 0
                ? `en cours · ${formatCountdown(hunt.endsIn)}`
                : 'terminée : découvre le légendaire dans l’onglet Expéditions'}
            </p>
          ) : (
            <button
              className="btn-primary w-full"
              disabled={!hunt.canLaunch}
              onClick={hunt.onLaunch}
            >
              {hunt.canLaunch
                ? `Partir à sa recherche (${formatDuration(hunt.durationMinutes)})`
                : 'Aucun emplacement d’expédition libre'}
            </button>
          ))}
        {hunt?.chain && (hunt.chainExpiresIn === null || hunt.chainExpiresIn > 0) && (
          <p
            className="rounded-lg bg-amber-50 px-2 py-1 text-center text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
            title="Relance l’expédition légendaire avant la fin du délai pour allonger la chaîne."
          >
            ✦ Chaîne {hunt.chain.chain} : shiny{' '}
            {formatMultiplier(chainMultiplier(ctx, hunt.chain.chain))}
            {hunt.chainExpiresIn !== null &&
              ` · à relancer sous ${formatCountdown(hunt.chainExpiresIn)}`}
          </p>
        )}
      </div>
    </div>
  );
}

/** Récompense réclamée : les légendaires attendent leur expédition légendaire. */
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
  return (
    <Modal open={!!data} onClose={onClose}>
      {data && (
        <div className="text-center">
          <h2 className="text-xl font-bold">Quête terminée !</h2>
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
                t’attend : pars à sa recherche avec une expédition légendaire. Une seule Ball sera
                lancée, prépare bien ton équipe !
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
