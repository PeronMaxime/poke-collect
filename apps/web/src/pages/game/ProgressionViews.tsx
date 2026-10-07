import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import type { ProgressReward } from '@poke/content';
import {
  collectionProgress,
  collectionState,
  dexProgress,
  milestoneState,
  sortedCollections,
  sortedMilestones,
} from '@poke/game-core';
import type { DexCatches, GameContext, RewardKind, RewardState } from '@poke/game-core';
import type { ClaimRewardResponse } from '@poke/shared';
import { PokemonSprite, ProgressBar, ShinyStar } from '../../components/ui';
import { api } from '../../lib/api';
import { PLAYER_STATE_KEYS, useClaimedRewards, useProgression } from '../../lib/game';
import { bonusText, errorText, itemIcon, itemName, rewardLines } from '../../lib/labels';

type Progress = DexCatches;

/** Réclamation d'une récompense (palier ou collection), avec le détail de ce qui a été reçu. */
function useClaim() {
  const queryClient = useQueryClient();
  const [last, setLast] = useState<ClaimRewardResponse | null>(null);
  const claim = useMutation({
    mutationFn: (input: { kind: RewardKind; rewardId: string }) =>
      api<ClaimRewardResponse>('/api/progression/claim', { method: 'POST', json: input }),
    onSuccess: (data) => {
      setLast(data);
      return Promise.all(
        PLAYER_STATE_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
  });
  return { claim, last };
}

/** Contenu d'une récompense : objets (avec icône), argent, emplacements, bonus. */
export function RewardList({ ctx, rewards }: { ctx: GameContext; rewards: ProgressReward }) {
  const lines = rewardLines(rewards);
  return (
    <ul className="flex flex-wrap gap-1.5 text-xs">
      {rewards.items.map((s) => (
        <li
          key={s.itemId}
          className="flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pr-2 pl-1 dark:bg-slate-800"
        >
          <img src={itemIcon(ctx, s.itemId)} alt="" width={18} height={18} />
          {s.quantity} × {itemName(ctx, s.itemId)}
        </li>
      ))}
      {lines.map((line) => (
        <li key={line} className="rounded-full bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
          {line}
        </li>
      ))}
    </ul>
  );
}

const STATE_STYLES: Record<RewardState, string> = {
  locked: '',
  claimable: 'ring-2 ring-amber-400',
  claimed: 'opacity-70',
};

function ClaimButton({
  state,
  pending,
  onClaim,
}: {
  state: RewardState;
  pending: boolean;
  onClaim: () => void;
}) {
  if (state === 'claimed') return <span className="text-xs text-emerald-600">✓ Réclamé</span>;
  return (
    <button className="btn-primary py-1" disabled={state === 'locked' || pending} onClick={onClaim}>
      {state === 'locked' ? '🔒' : 'Réclamer'}
    </button>
  );
}

/** Bandeau de confirmation après une réclamation. */
function ClaimedToast({ ctx, data }: { ctx: GameContext; data: ClaimRewardResponse | null }) {
  return (
    <AnimatePresence>
      {data && (
        <motion.div
          key={`${data.kind}:${data.rewardId}`}
          initial={{ opacity: 0, y: -8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="card border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40"
        >
          <p className="mb-2 font-semibold">🎉 Récompense obtenue !</p>
          <RewardList ctx={ctx} rewards={data.rewards} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Emplacements et bonus permanents débloqués jusqu'ici. */
function ProgressionSummary() {
  const progression = useProgression();
  const data = progression.data;
  if (!data) return null;
  const bonuses = (['capture', 'xp', 'money'] as const)
    .filter((type) => data.bonuses[type] > 1)
    .map((type) => bonusText({ type, percent: Math.round((data.bonuses[type] - 1) * 100) }));
  return (
    <div className="card flex flex-wrap gap-x-6 gap-y-1 p-3 text-sm">
      <span>
        Expéditions : <strong>{data.slots.expeditions}</strong> emplacement(s)
      </span>
      <span>
        Combats : <strong>{data.slots.battles}</strong>
      </span>
      <span>
        Pensions : <strong>{data.slots.daycare}</strong>
      </span>
      {bonuses.length > 0 && <span className="text-emerald-600">{bonuses.join(' · ')}</span>}
    </div>
  );
}

export function MilestonesView({ ctx, progress }: { ctx: GameContext; progress: Progress }) {
  const claimed = useClaimedRewards();
  const { claim, last } = useClaim();
  const milestones = sortedMilestones(ctx);

  return (
    <div className="space-y-3">
      <ProgressionSummary />
      <ClaimedToast ctx={ctx} data={last} />
      {claim.error && <p className="text-sm text-red-600">{errorText(claim.error)}</p>}
      {milestones.length === 0 && <p className="text-slate-500">Aucun palier pour le moment.</p>}
      <ul className="space-y-2">
        {milestones.map((m) => {
          const state = milestoneState(ctx, m, progress, claimed);
          const dex = dexProgress(ctx, m.regionId, progress, m.shiny);
          const dexName = `${m.regionId ? `Pokédex de ${ctx.region(m.regionId)?.name ?? m.regionId}` : 'Pokédex national'}${m.shiny ? ' shiny' : ''}`;
          return (
            <li key={m.id} className={`card space-y-2 p-3 ${STATE_STYLES[state]}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {m.name} {m.shiny && <ShinyStar />}
                  </p>
                  <p className="text-xs text-slate-500">
                    {m.percent} % du {dexName} · {dex.percent.toFixed(1)} % (
                    {Math.ceil((m.percent / 100) * dex.total)} espèces requises, {dex.caught}{' '}
                    capturées{m.shiny ? ' en shiny' : ''})
                  </p>
                </div>
                <ClaimButton
                  state={state}
                  pending={claim.isPending}
                  onClaim={() => claim.mutate({ kind: 'milestone', rewardId: m.id })}
                />
              </div>
              <ProgressBar value={Math.min(1, dex.percent / m.percent)} />
              <RewardList ctx={ctx} rewards={m.rewards} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function CollectionsView({ ctx, progress }: { ctx: GameContext; progress: Progress }) {
  const claimed = useClaimedRewards();
  const { claim, last } = useClaim();
  const collections = sortedCollections(ctx);

  return (
    <div className="space-y-3">
      <ClaimedToast ctx={ctx} data={last} />
      {claim.error && <p className="text-sm text-red-600">{errorText(claim.error)}</p>}
      {collections.length === 0 && (
        <p className="text-slate-500">Aucune collection pour le moment.</p>
      )}
      <ul className="grid gap-2 md:grid-cols-2">
        {collections.map((c) => {
          const state = collectionState(c, progress, claimed);
          const { caught, total } = collectionProgress(c, progress);
          return (
            <li key={c.id} className={`card space-y-2 p-3 ${STATE_STYLES[state]}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{c.name}</p>
                  {c.description && <p className="text-xs text-slate-500">{c.description}</p>}
                </div>
                <ClaimButton
                  state={state}
                  pending={claim.isPending}
                  onClaim={() => claim.mutate({ kind: 'collection', rewardId: c.id })}
                />
              </div>
              <div className="flex flex-wrap gap-0.5">
                {[...new Set(c.speciesIds)].map((id) => {
                  const has = progress.caughtSpeciesIds.has(id);
                  return (
                    <PokemonSprite
                      key={id}
                      speciesId={id}
                      size={40}
                      silhouette={!has}
                      alt={has ? (ctx.species(id)?.nameFr ?? '') : '???'}
                    />
                  );
                })}
              </div>
              <p className="text-xs text-slate-500">
                {caught} / {total} capturés
              </p>
              <RewardList ctx={ctx} rewards={c.rewards} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
