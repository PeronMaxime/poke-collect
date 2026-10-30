import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import type { Collection, ExpeditionCompletion, ProgressReward } from '@poke/content';
import { getForm } from '@poke/data';
import {
  collectionProgress,
  collectionState,
  completionState,
  completionTargets,
  expeditionCompletions,
  regionCompletion,
  sortedCollections,
  zoneCompletion,
} from '@poke/game-core';
import type { DexCatches, GameContext, RewardKind, RewardState } from '@poke/game-core';
import type { ClaimRewardResponse } from '@poke/shared';
import { PokemonSprite, ProgressBar, ShinyStar } from '../../components/ui';
import { api } from '../../lib/api';
import { PLAYER_STATE_KEYS, useClaimedRewards, usePlayerProgress } from '../../lib/game';
import { errorText, itemIcon, itemName, rewardLines } from '../../lib/labels';
import { visibleRegions } from './RegionTabs';

type Progress = DexCatches;

/**
 * Réclamation d'une récompense (collection ou complétion d'expédition), avec le détail de
 * ce qui a été reçu.
 */
function useClaim() {
  const queryClient = useQueryClient();
  const [last, setLast] = useState<ClaimRewardResponse | null>(null);
  const claim = useMutation({
    mutationFn: (input: { kind: RewardKind; rewardId: string; targetId?: string }) =>
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
          key={`${data.kind}:${data.rewardId}:${data.targetId ?? ''}`}
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

/** Collections des régions débloquées (et celles sans région), triées. */
export function useVisibleCollections(ctx: GameContext): Collection[] {
  const playerProgress = usePlayerProgress();
  const unlocked = new Set(visibleRegions(ctx, playerProgress).unlocked.map((r) => r.id));
  return sortedCollections(ctx).filter((c) => c.regionId === null || unlocked.has(c.regionId));
}

export function CollectionsView({ ctx, progress }: { ctx: GameContext; progress: Progress }) {
  const claimed = useClaimedRewards();
  const { claim, last } = useClaim();
  const collections = useVisibleCollections(ctx);
  // Une section par région, dans l'ordre des régions ; les collections sans région d'abord.
  const groups = [
    { id: '', name: null, list: collections.filter((c) => c.regionId === null) },
    ...ctx.regions.map((r) => ({
      id: r.id,
      name: r.name,
      list: collections.filter((c) => c.regionId === r.id),
    })),
  ].filter((g) => g.list.length > 0);

  return (
    <div className="space-y-3">
      <ClaimedToast ctx={ctx} data={last} />
      {claim.error && <p className="text-sm text-red-600">{errorText(claim.error)}</p>}
      {collections.length === 0 && (
        <p className="text-slate-500">Aucune collection pour le moment.</p>
      )}
      {groups.map((g) => (
        <section key={g.id} className="space-y-2">
          {g.name && <h2 className="font-semibold text-slate-600 dark:text-slate-300">{g.name}</h2>}
          <ul className="grid gap-2 md:grid-cols-2">
            {g.list.map((c) => (
              <CollectionCard
                key={c.id}
                ctx={ctx}
                collection={c}
                progress={progress}
                state={collectionState(c, progress, claimed)}
                pending={claim.isPending}
                onClaim={() => claim.mutate({ kind: 'collection', rewardId: c.id })}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Espèces (forme par défaut) puis formes d'une collection, en silhouette tant qu'elles manquent. */
function CollectionCard({
  ctx,
  collection: c,
  progress,
  state,
  pending,
  onClaim,
}: {
  ctx: GameContext;
  collection: Collection;
  progress: Progress;
  state: RewardState;
  pending: boolean;
  onClaim: () => void;
}) {
  const { caught, total } = collectionProgress(c, progress);
  const slots = [
    ...[...new Set(c.speciesIds)].map((id) => ({
      key: `s${id}`,
      speciesId: id,
      formId: null as number | null,
      name: ctx.species(id)?.nameFr ?? '',
      has: progress.caughtSpeciesIds.has(id),
    })),
    ...[...new Set(c.formIds)].flatMap((id) => {
      const form = getForm(id);
      return form
        ? [
            {
              key: `f${id}`,
              speciesId: form.speciesId,
              formId: id,
              name: form.nameFr,
              has: progress.caughtFormIds?.has(id) ?? false,
            },
          ]
        : [];
    }),
  ];
  return (
    <li className={`card space-y-2 p-3 ${STATE_STYLES[state]}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{c.name}</p>
          {c.description && <p className="text-xs text-slate-500">{c.description}</p>}
        </div>
        <ClaimButton state={state} pending={pending} onClaim={onClaim} />
      </div>
      <div className="flex flex-wrap gap-0.5">
        {slots.map((s) => (
          <PokemonSprite
            key={s.key}
            speciesId={s.speciesId}
            formId={s.formId}
            size={40}
            silhouette={!s.has}
            alt={s.has ? s.name : '???'}
          />
        ))}
      </div>
      <p className="text-xs text-slate-500">
        {caught} / {total} capturés
      </p>
      <RewardList ctx={ctx} rewards={c.rewards} />
    </li>
  );
}

// --- Complétion des expéditions ---------------------------------------------------------------

/** Ce qu'il faut compléter pour une récompense de complétion. */
function completionGoal(ctx: GameContext, c: ExpeditionCompletion): string {
  const where = c.regionId ? ` de ${ctx.region(c.regionId)?.name ?? c.regionId}` : '';
  const shiny = c.shiny ? ' en chromatique' : '';
  if (c.scope === 'region') {
    return c.regionId
      ? `Toutes les expéditions${where} complétées${shiny}`
      : `Toutes les expéditions d’une région complétées${shiny}, pour chaque région`;
  }
  if (c.zoneId) return `Expédition « ${ctx.zone(c.zoneId)?.name ?? c.zoneId} » complétée${shiny}`;
  return `Chaque expédition${where} complétée${shiny}`;
}

/**
 * Récompenses de complétion des expéditions des régions débloquées : une expédition est
 * complétée quand chacun de ses Pokémon est capturé (en chromatique pour les complétions
 * chromatiques).
 */
export function CompletionsView({ ctx, progress }: { ctx: GameContext; progress: Progress }) {
  const claimed = useClaimedRewards();
  const { claim, last } = useClaim();
  const playerProgress = usePlayerProgress();
  const unlocked = new Set(visibleRegions(ctx, playerProgress).unlocked.map((r) => r.id));
  const completions = expeditionCompletions(ctx);

  return (
    <div className="space-y-4">
      <ClaimedToast ctx={ctx} data={last} />
      {claim.error && <p className="text-sm text-red-600">{errorText(claim.error)}</p>}
      {completions.length === 0 && (
        <p className="text-slate-500">Aucune récompense de complétion pour le moment.</p>
      )}
      {completions.map((c) => {
        const targets = completionTargets(ctx, c).filter((t) =>
          unlocked.has(t.kind === 'zone' ? t.zone.regionId : t.id),
        );
        const states = targets.map((t) => completionState(ctx, c, t.id, progress, claimed));
        const done = states.filter((s) => s !== 'locked').length;
        return (
          <section key={c.id} className="card space-y-3 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">
                  {c.name} {c.shiny && <ShinyStar />}
                </p>
                <p className="text-xs text-slate-500">
                  {completionGoal(ctx, c)} · {done} / {targets.length}
                </p>
              </div>
              <RewardList ctx={ctx} rewards={c.rewards} />
            </div>
            {targets.length === 0 && (
              <p className="text-sm text-slate-500">
                Aucune expédition dans les régions débloquées.
              </p>
            )}
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {targets.map((t, i) => {
                const state = states[i]!;
                const p =
                  t.kind === 'zone'
                    ? zoneCompletion(ctx, t.zone, progress, c.shiny)
                    : regionCompletion(ctx, t.id, progress, c.shiny);
                return (
                  <li
                    key={t.id}
                    className={`space-y-1 rounded-xl border border-slate-200 p-2 dark:border-slate-800 ${STATE_STYLES[state]}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {t.kind === 'zone' ? t.zone.name : t.region.name}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {p.caught} / {p.total}{' '}
                          {t.kind === 'zone' ? 'capturés' : 'expéditions complétées'}
                          {c.shiny && ' en chromatique'}
                        </span>
                      </span>
                      <ClaimButton
                        state={state}
                        pending={claim.isPending}
                        onClaim={() =>
                          claim.mutate({ kind: 'completion', rewardId: c.id, targetId: t.id })
                        }
                      />
                    </div>
                    <ProgressBar
                      value={p.total ? p.caught / p.total : 0}
                      barClassName={c.shiny ? 'bg-amber-400' : 'bg-brand-500'}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
