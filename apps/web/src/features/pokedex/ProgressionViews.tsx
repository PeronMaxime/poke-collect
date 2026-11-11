import { useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import type { Collection, ExpeditionCompletion, ProgressReward } from '@poke/content';
import { getForm } from '@poke/data';
import {
  collectionProgress,
  collectionState,
  completableZones,
  completionState,
  completionTargetRegionId,
  completionTargets,
  expeditionCompletions,
  regionCompletion,
  sortedCollections,
  zoneCompletion,
} from '@poke/game-core';
import type {
  CompletionTarget,
  DexCatches,
  GameContext,
  RewardKind,
  RewardState,
} from '@poke/game-core';
import type { ClaimRewardResponse } from '@poke/shared';
import { PokemonSprite, ProgressBar, ShinyStar } from '../../components/ui';
import {
  claimReward,
  refreshAfterReward,
  useClaimedRewards,
  usePlayerProgress,
} from '../../lib/queries';
import {
  errorText,
  formatPercentBonus,
  itemIcon,
  itemName,
  regionBonusText,
  rewardLines,
} from '../../lib/labels';
import {
  RegionTabs,
  currentRegionTab,
  useSavedRegionTab,
  visibleRegions,
} from '../common/RegionTabs';
import { usePlayerBonuses } from '../common/XpPreview';

type Progress = DexCatches;

type ClaimInput = { kind: RewardKind; rewardId: string; targetId?: string };

const postClaim = (input: ClaimInput) => claimReward(input);

/**
 * Réclamation d'une récompense (collection ou complétion d'expédition), ou de plusieurs à la
 * suite (« Tout réclamer »), avec le détail de ce qui a été reçu.
 */
function useClaim() {
  const queryClient = useQueryClient();
  const [last, setLast] = useState<ClaimRewardResponse[] | null>(null);
  const claim = useMutation({
    mutationFn: postClaim,
    onSuccess: (data) => {
      setLast([data]);
      return refreshAfterReward(queryClient);
    },
  });
  // Une à une : chacune est vérifiée par le serveur ; celles déjà reçues restent affichées si
  // une suivante échoue.
  const claimAll = useMutation({
    mutationFn: async (inputs: readonly ClaimInput[]) => {
      const done: ClaimRewardResponse[] = [];
      try {
        for (const input of inputs) done.push(await postClaim(input));
      } finally {
        if (done.length > 0) setLast(done);
      }
      return done;
    },
    onSettled: () => refreshAfterReward(queryClient),
  });
  return { claim, claimAll, last };
}

/** Récompenses additionnées (bandeau de « Tout réclamer »). */
function mergeRewards(list: readonly ProgressReward[]): ProgressReward {
  const items = new Map<string, number>();
  const bonuses = new Map<ProgressReward['bonuses'][number]['type'], number>();
  for (const r of list) {
    for (const s of r.items) items.set(s.itemId, (items.get(s.itemId) ?? 0) + s.quantity);
    for (const b of r.bonuses) bonuses.set(b.type, (bonuses.get(b.type) ?? 0) + b.percent);
  }
  const sum = (key: 'currency' | 'expeditionSlots' | 'daycareSlots' | 'incubators') =>
    list.reduce((n, r) => n + r[key], 0);
  return {
    currency: sum('currency'),
    items: [...items].map(([itemId, quantity]) => ({ itemId, quantity })),
    expeditionSlots: sum('expeditionSlots'),
    daycareSlots: sum('daycareSlots'),
    incubators: sum('incubators'),
    bonuses: [...bonuses].map(([type, percent]) => ({ type, percent })),
  };
}

/**
 * Contenu d'une récompense : objets (avec icône), argent, emplacements, bonus (et bonus de
 * région des complétions, dans `extraLines`).
 */
export function RewardList({
  ctx,
  rewards,
  extraLines = [],
}: {
  ctx: GameContext;
  rewards: ProgressReward;
  extraLines?: readonly string[];
}) {
  const lines = [...rewardLines(rewards), ...extraLines];
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
  // Verrouillé : rouge (et peu estompé) pour ne pas ressembler à un bouton bleu indisponible.
  if (state === 'locked') {
    return (
      <button
        className="btn bg-brand-500 py-1 text-white disabled:opacity-80"
        disabled
        aria-label="Verrouillé"
      >
        🔒
      </button>
    );
  }
  return (
    <button className="btn-primary py-1" disabled={pending} onClick={onClaim}>
      Réclamer
    </button>
  );
}

/** Bonus de région d'une complétion qui vient d'être réclamée. */
function claimedRegionLines(ctx: GameContext, data: ClaimRewardResponse): string[] {
  if (data.kind !== 'completion' || !data.targetId) return [];
  const completion = expeditionCompletions(ctx).find((c) => c.id === data.rewardId);
  if (!completion) return [];
  const regionId = completionTargetRegionId(ctx, completion, data.targetId);
  return completionRegionLines(ctx, completion, regionId);
}

/** Bandeau de confirmation après une réclamation (ou plusieurs, additionnées). */
function ClaimedToast({ ctx, data }: { ctx: GameContext; data: ClaimRewardResponse[] | null }) {
  const regionLines = new Map<string, number>();
  for (const d of data ?? []) {
    for (const line of claimedRegionLines(ctx, d)) {
      regionLines.set(line, (regionLines.get(line) ?? 0) + 1);
    }
  }
  return (
    <AnimatePresence>
      {data && data.length > 0 && (
        <motion.div
          key={data.map((d) => `${d.kind}:${d.rewardId}:${d.targetId ?? ''}`).join(',')}
          initial={{ opacity: 0, y: -8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="card border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40"
        >
          <p className="mb-2 font-semibold">
            🎉 {data.length > 1 ? `${data.length} récompenses obtenues !` : 'Récompense obtenue !'}
          </p>
          <RewardList
            ctx={ctx}
            rewards={mergeRewards(data.map((d) => d.rewards))}
            extraLines={[...regionLines].map(([line, n]) => (n > 1 ? `${line} (×${n})` : line))}
          />
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
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
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

/** Ce qu'il faut compléter pour une récompense de complétion (dans la région de l'onglet). */
function completionGoal(ctx: GameContext, c: ExpeditionCompletion, regionId: string): string {
  const id = c.regionId ?? regionId;
  const where = ` de ${ctx.region(id)?.name ?? id}`;
  const shiny = c.shiny ? ' en chromatique' : '';
  if (c.scope === 'region') return `Toutes les expéditions${where} complétées${shiny}`;
  if (c.zoneId) return `Expédition « ${ctx.zone(c.zoneId)?.name ?? c.zoneId} » complétée${shiny}`;
  return `Chaque expédition${where} complétée${shiny}`;
}

/** Bonus de région d'une complétion, pour `regionId` (région de l'expédition ou complétée). */
function completionRegionLines(
  ctx: GameContext,
  c: ExpeditionCompletion,
  regionId: string | null,
): string[] {
  const where = regionId
    ? `de ${ctx.region(regionId)?.name ?? regionId}`
    : c.scope === 'zone'
      ? 'de la région de l’expédition'
      : 'de la région complétée';
  return c.regionBonuses.map((b) => regionBonusText(b, where));
}

/** Bonus d'XP déjà gagné dans la région de l'onglet, s'il y en a un. */
function RegionXpSummary({ ctx, regionId }: { ctx: GameContext; regionId: string }) {
  const bonus = usePlayerBonuses(ctx).regionXp?.[regionId] ?? 0;
  if (bonus <= 0) return null;
  return (
    <p className="card p-3 text-sm">
      <span className="font-semibold">
        Bonus d’XP de {ctx.region(regionId)?.name ?? regionId} : +{formatPercentBonus(1 + bonus)}
      </span>
      <span className="block text-xs text-slate-500">
        Pour les Pokémon du Pokédex de la région, quelle que soit la source d’XP (expéditions,
        combats, donjons, pensions, Bonbons).
      </span>
    </p>
  );
}

/**
 * Section de complétion : titre, avancement et récompenses, puis les cartes. `aside` s'affiche en
 * haut à droite (sous l'en-tête sur petit écran).
 */
function CompletionSection({
  title,
  subtitle,
  rewards,
  aside,
  children,
}: {
  title: ReactNode;
  subtitle: ReactNode;
  rewards: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card space-y-3 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-3">
          <div>
            <p className="flex items-center gap-2 font-semibold">{title}</p>
            <p className="text-xs text-slate-500">{subtitle}</p>
          </div>
          {rewards}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Avancement d'une règle de complétion pour une expédition ou une région, avec son bouton. */
function CompletionProgress({
  ctx,
  completion: c,
  target: t,
  progress,
  state,
  pending,
  onClaim,
}: {
  ctx: GameContext;
  completion: ExpeditionCompletion;
  target: CompletionTarget;
  progress: Progress;
  state: RewardState;
  pending: boolean;
  onClaim: () => void;
}) {
  const p =
    t.kind === 'zone'
      ? zoneCompletion(ctx, t.zone, progress, c.shiny)
      : regionCompletion(ctx, t.id, progress, c.shiny);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-xs text-slate-500">
          {c.shiny && <ShinyStar />}
          {p.caught} / {p.total} {t.kind === 'zone' ? 'capturés' : 'expéditions complétées'}
          {c.shiny && ' en chromatique'}
        </span>
        <ClaimButton state={state} pending={pending} onClaim={onClaim} />
      </div>
      <ProgressBar
        value={p.total ? p.caught / p.total : 0}
        barClassName={c.shiny ? 'bg-amber-400' : 'bg-[#48c048]'}
      />
    </div>
  );
}

/** Récompenses de chaque règle d'une section, précédées de leur nom s'il y en a plusieurs. */
function SectionRewards({
  ctx,
  completions,
  regionId,
}: {
  ctx: GameContext;
  completions: readonly ExpeditionCompletion[];
  regionId: string;
}) {
  return (
    <div className="space-y-1">
      {completions.map((c) => (
        <div key={c.id} className="flex flex-wrap items-center gap-2">
          {completions.length > 1 && (
            <span className="flex items-center gap-1 text-xs font-medium">
              {c.name} {c.shiny && <ShinyStar />}
            </span>
          )}
          <RewardList
            ctx={ctx}
            rewards={c.rewards}
            extraLines={completionRegionLines(ctx, c, regionId)}
          />
        </div>
      ))}
    </div>
  );
}

/** Carte à réclamer : contour doré dessiné à l'intérieur de la carte, sans déborder. */
const cardStyle = (states: readonly RewardState[]) =>
  states.includes('claimable')
    ? 'ring-2 ring-inset ring-amber-400'
    : states.length > 0 && states.every((s) => s === 'claimed')
      ? STATE_STYLES.claimed
      : '';

/**
 * Récompenses de complétion des expéditions, région par région (onglets, comme ailleurs) : une
 * expédition est complétée quand chacun de ses Pokémon est capturé (en chromatique pour les
 * complétions chromatiques). Une seule section : une carte par expédition (normale au-dessus de
 * chromatique) et la complétion de la région en haut à droite.
 */
export function CompletionsView({ ctx, progress }: { ctx: GameContext; progress: Progress }) {
  const claimed = useClaimedRewards();
  const { claim, claimAll, last } = useClaim();
  const pending = claim.isPending || claimAll.isPending;
  const playerProgress = usePlayerProgress();
  const [selectedRegion, setSelectedRegion] = useSavedRegionTab('completions');
  const regionId = currentRegionTab(ctx, playerProgress, selectedRegion);
  const completions = expeditionCompletions(ctx);
  const targetRegion = (t: CompletionTarget) => (t.kind === 'zone' ? t.zone.regionId : t.id);
  const targetsIn = (c: ExpeditionCompletion, rid: string) =>
    completionTargets(ctx, c).filter((t) => targetRegion(t) === rid);
  const targetsOf = (c: ExpeditionCompletion) => targetsIn(c, regionId);
  const stateOf = (c: ExpeditionCompletion, t: CompletionTarget) =>
    completionState(ctx, c, t.id, progress, claimed);
  const claimOf = (c: ExpeditionCompletion, t: CompletionTarget) => () =>
    claim.mutate({ kind: 'completion', rewardId: c.id, targetId: t.id });

  // Une seule section : une carte par expédition (règles par expédition) et, en haut à droite,
  // la complétion de la région. Les règles normales avant les chromatiques.
  const byShiny = (a: ExpeditionCompletion, b: ExpeditionCompletion) =>
    Number(a.shiny) - Number(b.shiny);
  const zoneRules = completions.filter((c) => c.scope === 'zone').sort(byShiny);
  const regionRules = completions.filter((c) => c.scope === 'region').sort(byShiny);
  const hasContent = completions.some((c) => targetsOf(c).length > 0);
  // Pastille sur les onglets des régions qui ont une récompense à réclamer.
  const claimableIn = (rid: string) =>
    completions.some((c) => targetsIn(c, rid).some((t) => stateOf(c, t) === 'claimable'));
  // « Tout réclamer » : chaque récompense prête, toutes régions confondues.
  const allClaimable: ClaimInput[] = completions.flatMap((c) =>
    completionTargets(ctx, c)
      .filter((t) => stateOf(c, t) === 'claimable')
      .map((t) => ({ kind: 'completion' as const, rewardId: c.id, targetId: t.id })),
  );

  /** Complétion de la région de l'onglet : avancement, bouton et récompenses de chaque règle. */
  function regionAside() {
    const entries = regionRules.flatMap((c) =>
      targetsOf(c).map((t) => ({ c, t, state: stateOf(c, t) })),
    );
    if (entries.length === 0) return null;
    return (
      <div
        className={`w-full shrink-0 space-y-2 rounded-xl border border-slate-200 p-2 sm:w-[27rem] sm:max-w-[50%] dark:border-slate-800 ${cardStyle(entries.map((e) => e.state))}`}
      >
        {entries.map(({ c, t, state }) => (
          <div key={c.id} className="space-y-1">
            <span
              className="flex items-center gap-1 text-sm font-medium"
              title={completionGoal(ctx, c, regionId)}
            >
              {c.name} {c.shiny && <ShinyStar />}
            </span>
            <CompletionProgress
              ctx={ctx}
              completion={c}
              target={t}
              progress={progress}
              state={state}
              pending={pending}
              onClaim={claimOf(c, t)}
            />
            <RewardList
              ctx={ctx}
              rewards={c.rewards}
              extraLines={completionRegionLines(ctx, c, regionId)}
            />
          </div>
        ))}
      </div>
    );
  }

  function zoneSection() {
    const rules = zoneRules.map((c) => ({ c, targets: targetsOf(c) }));
    // Expéditions dans l'ordre du contenu, chacune avec les règles qui la concernent.
    const zones = completableZones(ctx, regionId)
      .map((zone) => ({
        zone,
        entries: rules.flatMap(({ c, targets }) => {
          const t = targets.find((x) => x.id === zone.id);
          return t ? [{ c, t, state: stateOf(c, t) }] : [];
        }),
      }))
      .filter((z) => z.entries.length > 0);
    const all = zones.flatMap((z) => z.entries);
    const counts = zoneRules.map((c) => {
      const mine = all.filter((e) => e.c === c);
      const done = mine.filter((e) => e.state !== 'locked').length;
      return `${done} / ${mine.length}${c.shiny ? ' en chromatique' : ''}`;
    });
    return (
      <CompletionSection
        title="Expéditions complétées"
        subtitle={
          zones.length > 0
            ? `Chaque Pokémon de l’expédition capturé · ${counts.join(' · ')}`
            : 'Aucune expédition à compléter dans cette région.'
        }
        rewards={
          zones.length > 0 && (
            <SectionRewards ctx={ctx} completions={zoneRules} regionId={regionId} />
          )
        }
        aside={regionAside()}
      >
        {zones.length > 0 && (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {zones.map(({ zone, entries }) => (
              <li
                key={zone.id}
                className={`space-y-2 rounded-xl border border-slate-200 p-2 dark:border-slate-800 ${cardStyle(entries.map((e) => e.state))}`}
              >
                <span className="block truncate text-sm font-medium">{zone.name}</span>
                {entries.map(({ c, t, state }) => (
                  <CompletionProgress
                    key={c.id}
                    ctx={ctx}
                    completion={c}
                    target={t}
                    progress={progress}
                    state={state}
                    pending={pending}
                    onClaim={claimOf(c, t)}
                  />
                ))}
              </li>
            ))}
          </ul>
        )}
      </CompletionSection>
    );
  }

  return (
    <div className="space-y-4">
      <RegionTabs
        ctx={ctx}
        progress={playerProgress}
        selected={regionId}
        onSelect={setSelectedRegion}
        marker={(id) => (claimableIn(id) ? 'Récompense à réclamer' : null)}
      />
      {allClaimable.length > 0 && (
        <div className="flex justify-end">
          <button
            className="btn-primary py-1"
            disabled={pending}
            onClick={() => claimAll.mutate(allClaimable)}
            title="Réclame chaque récompense prête, dans toutes les régions"
          >
            {claimAll.isPending ? 'Réclamation…' : `Tout réclamer (${allClaimable.length})`}
          </button>
        </div>
      )}
      <ClaimedToast ctx={ctx} data={last} />
      <RegionXpSummary ctx={ctx} regionId={regionId} />
      {(claim.error ?? claimAll.error) && (
        <p className="text-sm text-red-600">{errorText(claim.error ?? claimAll.error)}</p>
      )}
      {hasContent ? (
        zoneSection()
      ) : (
        <p className="text-slate-500">Aucune récompense de complétion dans cette région.</p>
      )}
    </div>
  );
}
