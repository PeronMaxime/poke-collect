import { and, count, countDistinct, eq, gt, isNotNull, max, min, sql, sum } from 'drizzle-orm';
import {
  expeditions,
  playerProfiles,
  pokedex,
  questProgress,
  rewardClaims,
  shopPurchases,
  trainerBattles,
  trainerProgress,
} from '@poke/db';
import type { Db } from '@poke/db';
import { dexSpeciesIds } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type {
  DurationStats,
  TelemetryQuest,
  TelemetryResponse,
  TelemetryStep,
  TelemetryTrainer,
  TelemetryZone,
} from '@poke/shared';

/**
 * Télémétrie d'équilibrage (PLAN.md, phase 8) : temps de complétion des étapes du parcours et
 * goulets (dresseurs trop durs, étapes de quête où les joueurs restent bloqués, zones délaissées).
 * Tout est déduit des tables de jeu existantes : aucun événement supplémentaire n'est enregistré.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Quantile (interpolation linéaire) d'une liste triée. */
function quantile(sorted: readonly number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

export function durationStats(hours: readonly number[]): DurationStats {
  const sorted = [...hours].sort((a, b) => a - b);
  const round = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);
  return {
    players: sorted.length,
    medianHours: round(quantile(sorted, 0.5)),
    p90Hours: round(quantile(sorted, 0.9)),
  };
}

export async function telemetry(
  db: Db,
  ctx: GameContext,
  days: number,
  now: Date,
): Promise<TelemetryResponse> {
  const since = new Date(now.getTime() - days * DAY);
  const [
    profiles,
    expeditionActivity,
    battleActivity,
    shopActivity,
    firstClaims,
    zoneFirsts,
    trainerWins,
    claims,
    quests,
    battleStats,
    stuck,
    zoneStats,
    dexCounts,
    spent,
  ] = await Promise.all([
    db
      .select({
        userId: playerProfiles.userId,
        createdAt: playerProfiles.createdAt,
        starter: playerProfiles.starterSpeciesId,
        currency: playerProfiles.currency,
      })
      .from(playerProfiles),
    db
      .select({ ownerId: expeditions.ownerId, at: max(expeditions.startedAt) })
      .from(expeditions)
      .groupBy(expeditions.ownerId),
    db
      .select({ ownerId: trainerBattles.ownerId, at: max(trainerBattles.startedAt) })
      .from(trainerBattles)
      .groupBy(trainerBattles.ownerId),
    db
      .select({ ownerId: shopPurchases.ownerId, at: max(shopPurchases.purchasedAt) })
      .from(shopPurchases)
      .groupBy(shopPurchases.ownerId),
    db
      .select({ ownerId: expeditions.ownerId, at: min(expeditions.claimedAt) })
      .from(expeditions)
      .where(isNotNull(expeditions.claimedAt))
      .groupBy(expeditions.ownerId),
    db
      .select({
        ownerId: expeditions.ownerId,
        zoneId: expeditions.zoneId,
        at: min(expeditions.startedAt),
      })
      .from(expeditions)
      .groupBy(expeditions.ownerId, expeditions.zoneId),
    db
      .select({
        ownerId: trainerProgress.ownerId,
        trainerId: trainerProgress.trainerId,
        at: trainerProgress.firstWinAt,
      })
      .from(trainerProgress)
      .where(isNotNull(trainerProgress.firstWinAt)),
    db.select().from(rewardClaims),
    db.select().from(questProgress),
    db
      .select({
        trainerId: trainerBattles.trainerId,
        battles: count(),
        wins: sql<number>`count(*) filter (where ${trainerBattles.outcome} = 'win')`.mapWith(
          Number,
        ),
        avgWinChance: sql<
          number | null
        >`avg((${trainerBattles.result} -> 'estimate' ->> 'winProbability')::float)`.mapWith(
          (v: unknown) => (v === null ? null : Number(v)),
        ),
        earned:
          sql<number>`coalesce(sum((${trainerBattles.result} ->> 'money')::bigint), 0)`.mapWith(
            Number,
          ),
      })
      .from(trainerBattles)
      .where(and(isNotNull(trainerBattles.claimedAt), gt(trainerBattles.claimedAt, since)))
      .groupBy(trainerBattles.trainerId),
    db
      .select({ trainerId: trainerProgress.trainerId, players: count() })
      .from(trainerProgress)
      .where(and(gt(trainerProgress.losses, 0), eq(trainerProgress.wins, 0)))
      .groupBy(trainerProgress.trainerId),
    db
      .select({
        zoneId: expeditions.zoneId,
        expeditions: count(),
        players: countDistinct(expeditions.ownerId),
        avgDuration: sql<number>`avg(${expeditions.durationMinutes})`.mapWith(Number),
        encounters:
          sql<number>`coalesce(sum(jsonb_array_length(${expeditions.result} -> 'encounters')), 0)`.mapWith(
            Number,
          ),
        captures:
          sql<number>`coalesce(sum((select count(*) from jsonb_array_elements(${expeditions.result} -> 'encounters') e where e ->> 'outcome' = 'captured')), 0)`.mapWith(
            Number,
          ),
      })
      .from(expeditions)
      .where(and(isNotNull(expeditions.claimedAt), gt(expeditions.claimedAt, since)))
      .groupBy(expeditions.zoneId),
    db
      .select({ ownerId: pokedex.ownerId, caught: count() })
      .from(pokedex)
      .where(eq(pokedex.caught, true))
      .groupBy(pokedex.ownerId),
    db
      .select({ total: sum(shopPurchases.totalPrice).mapWith(Number) })
      .from(shopPurchases)
      .where(gt(shopPurchases.purchasedAt, since)),
  ]);

  // --- Joueurs et activité
  const created = new Map(profiles.map((p) => [p.userId, p.createdAt.getTime()]));
  const lastAction = new Map<string, number>();
  for (const row of [...expeditionActivity, ...battleActivity, ...shopActivity]) {
    if (!row.at) continue;
    lastAction.set(row.ownerId, Math.max(lastAction.get(row.ownerId) ?? 0, row.at.getTime()));
  }
  const activeSince = (ms: number) =>
    [...lastAction.values()].filter((t) => t > now.getTime() - ms).length;
  const withStarter = profiles.filter((p) => p.starter !== null).length;

  // --- Parcours : heures entre l'inscription et chaque étape
  const hoursSinceSignup = (ownerId: string, at: Date | null) => {
    const start = created.get(ownerId);
    return start === undefined || !at ? null : Math.max(0, (at.getTime() - start) / HOUR);
  };
  const step = (
    kind: TelemetryStep['kind'],
    id: string,
    label: string,
    rows: readonly { ownerId: string; at: Date | null }[],
  ): TelemetryStep => {
    const hours = rows.flatMap((r) => {
      const h = hoursSinceSignup(r.ownerId, r.at);
      return h === null ? [] : [h];
    });
    const stats = durationStats(hours);
    return {
      kind,
      id,
      label,
      ...stats,
      reachedPercent: withStarter ? Math.round((stats.players / withStarter) * 1000) / 10 : 0,
    };
  };

  const regionOfZone = new Map(ctx.zones.map((z) => [z.id, z.regionId]));
  const regionFirsts = new Map<string, Map<string, Date>>();
  for (const row of zoneFirsts) {
    const regionId = regionOfZone.get(row.zoneId);
    if (!regionId || !row.at) continue;
    const byOwner = regionFirsts.get(regionId) ?? new Map<string, Date>();
    const current = byOwner.get(row.ownerId);
    if (!current || row.at < current) byOwner.set(row.ownerId, row.at);
    regionFirsts.set(regionId, byOwner);
  }
  const rowsOf = (map: ReadonlyMap<string, Date> | undefined) =>
    [...(map ?? new Map<string, Date>())].map(([ownerId, at]) => ({ ownerId, at }));

  const steps: TelemetryStep[] = [
    step('expedition', 'first-expedition', 'Première expédition récupérée', firstClaims),
    ...ctx.regions.map((r) =>
      step('region', r.id, `Première expédition : ${r.name}`, rowsOf(regionFirsts.get(r.id))),
    ),
    ...ctx.trainers
      .filter((t) => t.badge || !t.repeatable)
      .map((t) =>
        step(
          'trainer',
          t.id,
          t.badge ? `${t.badge.name} (${t.name})` : `${t.trainerClass} ${t.name}`,
          trainerWins.filter((w) => w.trainerId === t.id),
        ),
      ),
    ...[...ctx.content.dexMilestones]
      .sort((a, b) => Number(a.shiny) - Number(b.shiny) || a.order - b.order)
      .map((m) =>
        step(
          'reward',
          `milestone:${m.id}`,
          `Palier : ${m.name}`,
          claims
            .filter((c) => c.kind === 'milestone' && c.rewardId === m.id)
            .map((c) => ({ ownerId: c.ownerId, at: c.claimedAt })),
        ),
      ),
    ...[...ctx.content.collections]
      .sort((a, b) => a.order - b.order)
      .map((c) =>
        step(
          'reward',
          `collection:${c.id}`,
          `Collection : ${c.name}`,
          claims
            .filter((r) => r.kind === 'collection' && r.rewardId === c.id)
            .map((r) => ({ ownerId: r.ownerId, at: r.claimedAt })),
        ),
      ),
    ...ctx.quests.map((q) =>
      step(
        'quest',
        q.id,
        `Quête : ${q.name}`,
        quests
          .filter((p) => p.questId === q.id && p.completedAt)
          .map((p) => ({ ownerId: p.ownerId, at: p.completedAt })),
      ),
    ),
  ];

  // --- Goulets : dresseurs, zones, étapes de quête
  const battleById = new Map(battleStats.map((b) => [b.trainerId, b]));
  const stuckById = new Map(stuck.map((s) => [s.trainerId, s.players]));
  const trainers: TelemetryTrainer[] = ctx.trainers.map((t) => {
    const b = battleById.get(t.id);
    return {
      trainerId: t.id,
      label: `${t.trainerClass} ${t.name}`,
      battles: b?.battles ?? 0,
      wins: b?.wins ?? 0,
      avgWinChance: b?.avgWinChance ?? null,
      stuckPlayers: stuckById.get(t.id) ?? 0,
    };
  });

  const zoneById = new Map(zoneStats.map((z) => [z.zoneId, z]));
  const zones: TelemetryZone[] = ctx.zones.map((z) => {
    const s = zoneById.get(z.id);
    return {
      zoneId: z.id,
      label: z.name,
      expeditions: s?.expeditions ?? 0,
      players: s?.players ?? 0,
      avgDurationMinutes: s ? Math.round(s.avgDuration) : null,
      encounters: s?.encounters ?? 0,
      captures: s?.captures ?? 0,
    };
  });

  const nowMs = now.getTime();
  const questStats: TelemetryQuest[] = ctx.quests.map((q) => {
    const rows = quests.filter((p) => p.questId === q.id);
    return {
      questId: q.id,
      label: q.name,
      started: rows.length,
      completed: rows.filter((p) => p.completedAt).length,
      steps: q.steps.map((s, index) => ({
        index,
        name: s.name,
        ...durationStats(
          rows
            .filter((p) => !p.completedAt && p.step === index)
            .map((p) => (nowMs - p.stepStartedAt.getTime()) / HOUR),
        ),
      })),
    };
  });

  // --- Pokédex et économie
  const nationalTotal = dexSpeciesIds(ctx, null).length;
  const caughtByOwner = new Map(dexCounts.map((d) => [d.ownerId, d.caught]));
  const buckets = [
    { label: '< 10 %', max: 10 },
    { label: '10 à 25 %', max: 25 },
    { label: '25 à 50 %', max: 50 },
    { label: '50 à 75 %', max: 75 },
    { label: '75 à 99 %', max: 100 },
    { label: '100 %', max: Infinity },
  ].map((b) => ({ ...b, players: 0 }));
  for (const p of profiles) {
    if (p.starter === null) continue;
    const percent = nationalTotal ? ((caughtByOwner.get(p.userId) ?? 0) / nationalTotal) * 100 : 0;
    buckets.find((b) => percent < b.max || b.max === Infinity)!.players++;
  }
  const balances = profiles.map((p) => p.currency).sort((a, b) => a - b);

  return {
    generatedAt: now.toISOString(),
    days,
    players: {
      total: profiles.length,
      withStarter,
      new7d: profiles.filter((p) => p.createdAt.getTime() > nowMs - 7 * DAY).length,
      active1d: activeSince(DAY),
      active7d: activeSince(7 * DAY),
    },
    steps,
    trainers,
    zones,
    quests: questStats,
    dexDistribution: buckets.map(({ label, players }) => ({ label, players })),
    economy: {
      earned: battleStats.reduce((s, b) => s + b.earned, 0),
      spent: spent[0]?.total ?? 0,
      medianBalance: quantile(balances, 0.5),
    },
  };
}
