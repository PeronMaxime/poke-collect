import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'motion/react';
import type { Quest } from '@poke/content';
import { STAT_NAMES } from '@poke/data';
import { MAX_IV, isActionCondition, isUnlocked } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { ClaimQuestResponse, QuestProgressDto } from '@poke/shared';
import { Modal, PokemonSprite, ProgressBar, ShinySparkles, ShinyStar } from '../../components/ui';
import { api } from '../../lib/api';
import { PLAYER_STATE_KEYS, usePlayerProgress, useQuests } from '../../lib/game';
import {
  errorText,
  natureLabel,
  questConditionText,
  speciesName,
  unlockConditionText,
} from '../../lib/labels';
import { RewardList } from './ProgressionViews';

/** Quêtes (légendaires) : étapes à valider dans l'ordre, puis récompense à réclamer. */
export function QuestsPage({ ctx }: { ctx: GameContext }) {
  const queryClient = useQueryClient();
  const quests = useQuests();
  const progress = usePlayerProgress();
  const [reveal, setReveal] = useState<ClaimQuestResponse | null>(null);
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
  // Quêtes à réclamer d'abord, puis en cours, verrouillées, et terminées en dernier.
  const rank = (q: Quest) =>
    ({ completed: 0, active: 1, locked: 2, claimed: 3 })[byId.get(q.id)?.status ?? 'locked'];
  const sorted = [...ctx.quests].sort((a, b) => rank(a) - rank(b) || a.order - b.order);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Les légendaires ne se rencontrent pas en expédition : chaque quête les met à ta portée. Les
        étapes se valident dans l’ordre ; captures et expéditions ne comptent qu’à partir du début
        de l’étape.
      </p>
      {claim.error && <p className="text-sm text-red-600">{errorText(claim.error)}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {sorted.map((quest) => (
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
          />
        ))}
      </div>
      <QuestReveal ctx={ctx} data={reveal} onClose={() => setReveal(null)} />
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
}: {
  ctx: GameContext;
  quest: Quest;
  state: QuestProgressDto | undefined;
  unlockText: string | null;
  claiming: boolean;
  onClaim: () => void;
}) {
  const status = state?.status ?? 'locked';
  const featured = quest.rewards.pokemon[0];
  const done = state?.step ?? 0;

  return (
    <div
      className={`card flex flex-col gap-3 p-4 ${status === 'locked' ? 'opacity-60' : ''} ${
        status === 'completed' ? 'ring-2 ring-amber-400' : ''
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
                silhouette={status !== 'claimed'}
              />
            )
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">{quest.name}</h3>
          <p className="text-xs text-slate-500">{quest.description}</p>
          {status === 'claimed' && <p className="mt-1 text-xs text-emerald-600">✓ Terminée</p>}
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
      </div>
    </div>
  );
}

/** Révélation du Pokémon offert : silhouette, éclair, puis le légendaire et ses IV. */
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
          <div className="mt-4 flex flex-wrap justify-center gap-6">
            {data.pokemon.map((p, i) => {
              const perfect = STAT_NAMES.filter((s) => p.ivs[s] === MAX_IV).length;
              const delay = reduced ? 0 : 0.4 + i * 0.8;
              return (
                <div key={p.id} className="flex flex-col items-center">
                  <div className="relative grid size-48 place-items-center">
                    {!reduced && (
                      <motion.div
                        className="absolute inset-0 rounded-full bg-amber-300/60 blur-2xl"
                        initial={{ opacity: 0, scale: 0.2 }}
                        animate={{ opacity: [0, 1, 0.3], scale: [0.2, 1.3, 1] }}
                        transition={{ delay, duration: 1.2 }}
                      />
                    )}
                    {!reduced && (
                      <motion.div
                        className="absolute"
                        initial={{ opacity: 1 }}
                        animate={{ opacity: 0 }}
                        transition={{ delay: delay + 0.4, duration: 0.4 }}
                      >
                        <PokemonSprite
                          speciesId={p.speciesId}
                          formId={p.formId}
                          kind="artwork"
                          size={170}
                          silhouette
                        />
                      </motion.div>
                    )}
                    <motion.div
                      className="relative"
                      initial={reduced ? false : { opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{
                        delay: delay + 0.5,
                        type: 'spring',
                        stiffness: 200,
                        damping: 14,
                      }}
                    >
                      {p.isShiny && <ShinySparkles delay={delay + 0.5} loop radius={110} />}
                      <PokemonSprite
                        speciesId={p.speciesId}
                        formId={p.formId}
                        shiny={p.isShiny}
                        kind="artwork"
                        size={170}
                      />
                    </motion.div>
                  </div>
                  <motion.div
                    initial={reduced ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: delay + 0.9 }}
                    className="text-sm"
                  >
                    <p className="text-lg font-semibold">
                      {speciesName(ctx, p.speciesId, p.formId)} {p.isShiny && <ShinyStar />}
                    </p>
                    <p className="text-slate-500">
                      Niveau {p.level} · {natureLabel(p.nature)}
                    </p>
                    <p className="font-semibold text-amber-600">{perfect} IV parfaits</p>
                    {data.newSpeciesIds.includes(p.speciesId) && (
                      <span className="mt-1 inline-block rounded-full bg-brand-500 px-2 text-xs font-bold text-white">
                        Nouveau au Pokédex !
                      </span>
                    )}
                  </motion.div>
                </div>
              );
            })}
          </div>
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
