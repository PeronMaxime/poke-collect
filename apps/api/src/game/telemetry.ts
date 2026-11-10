import {
  and,
  count,
  countDistinct,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  max,
  min,
  sql,
  sum,
} from 'drizzle-orm';
import {
  dungeonProgress,
  dungeonRuns,
  expeditions,
  inventory,
  playerProfiles,
  pokedex,
  pokemon,
  questProgress,
  rewardClaims,
  shopPurchases,
  trainerRuns,
  trainerProgress,
} from '@poke/db';
import type { Db } from '@poke/db';
import { dexSpeciesIds, dungeonDifficulty } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type {
  DurationStats,
  TelemetryDungeon,
  TelemetryMegaStone,
  TelemetryQuest,
  TelemetryResponse,
  TelemetryStep,
  TelemetryTrainer,
  TelemetryZone,
} from '@poke/shared';

/**
 * Télémétrie d'équilibrage (docs/plans/PLAN.md, phase 8) : temps de complétion des étapes du parcours et
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

function durationStats(hours: readonly number[]): DurationStats {
  const sorted = [...hours].sort((a, b) => a - b);
  const round = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);
  return {
    players: sorted.length,
    medianHours: round(quantile(sorted, 0.5)),
    p90Hours: round(quantile(sorted, 0.9)),
  };
}

// --- Lectures : une fonction par groupe de tables, toutes lancées en parallèle par `telemetry`.

/** Profils, Pokédex et achats : qui joue, où en est chacun, ce qui a été dépensé. */
async function loadPlayers(db: Db, since: Date) {
  const [profiles, shopActivity, dexCounts, spent, claims, quests] = await Promise.all([
    db
      .select({
        userId: playerProfiles.userId,
        createdAt: playerProfiles.createdAt,
        starter: playerProfiles.starterSpeciesId,
        currency: playerProfiles.currency,
      })
      .from(playerProfiles),
    db
      .select({ ownerId: shopPurchases.ownerId, at: max(shopPurchases.purchasedAt) })
      .from(shopPurchases)
      .groupBy(shopPurchases.ownerId),
    db
      .select({ ownerId: pokedex.ownerId, caught: count() })
      .from(pokedex)
      .where(eq(pokedex.caught, true))
      .groupBy(pokedex.ownerId),
    db
      .select({ total: sum(shopPurchases.totalPrice).mapWith(Number) })
      .from(shopPurchases)
      .where(gt(shopPurchases.purchasedAt, since)),
    db.select().from(rewardClaims),
    db.select().from(questProgress),
  ]);
  return { profiles, shopActivity, dexCounts, spent, claims, quests };
}

/** Expéditions : dernière activité, premières fois, statistiques par zone depuis `since`. */
async function loadExpeditions(db: Db, since: Date) {
  const [expeditionActivity, firstClaims, zoneFirsts, zoneStats] = await Promise.all([
    db
      .select({
        ownerId: expeditions.ownerId,
        at: sql<Date>`max(coalesce(${expeditions.claimedAt}, ${expeditions.startedAt}))`.mapWith(
          expeditions.startedAt,
        ),
      })
      .from(expeditions)
      .groupBy(expeditions.ownerId),
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
      .where(
        and(
          isNotNull(expeditions.claimedAt),
          gt(expeditions.claimedAt, since),
          isNull(expeditions.questId), // expéditions légendaires : hors statistiques de zone
        ),
      )
      .groupBy(expeditions.zoneId),
  ]);
  return { expeditionActivity, firstClaims, zoneFirsts, zoneStats };
}

/** Combats de dresseurs : dernière activité, premières victoires, bilan par dresseur depuis `since`. */
async function loadBattles(db: Db, since: Date) {
  const [battleActivity, trainerWins, battleStats, stuck] = await Promise.all([
    db
      .select({ ownerId: trainerRuns.ownerId, at: max(trainerRuns.startedAt) })
      .from(trainerRuns)
      .groupBy(trainerRuns.ownerId),
    db
      .select({
        ownerId: trainerProgress.ownerId,
        trainerId: trainerProgress.trainerId,
        at: trainerProgress.firstWinAt,
      })
      .from(trainerProgress)
      .where(isNotNull(trainerProgress.firstWinAt)),
    db
      .select({
        trainerId: trainerRuns.trainerId,
        battles: count(),
        wins: sql<number>`count(*) filter (where ${trainerRuns.outcome} = 'win')`.mapWith(Number),
        losses:
          sql<number>`count(*) filter (where ${trainerRuns.outcome} in ('loss', 'timeout'))`.mapWith(
            Number,
          ),
        fled: sql<number>`count(*) filter (where ${trainerRuns.outcome} = 'fled')`.mapWith(Number),
        earned: sql<number>`coalesce(sum((${trainerRuns.result} ->> 'money')::bigint), 0)`.mapWith(
          Number,
        ),
      })
      .from(trainerRuns)
      .where(and(isNotNull(trainerRuns.claimedAt), gt(trainerRuns.claimedAt, since)))
      .groupBy(trainerRuns.trainerId),
    db
      .select({ trainerId: trainerProgress.trainerId, players: count() })
      .from(trainerProgress)
      .where(and(gt(trainerProgress.losses, 0), eq(trainerProgress.wins, 0)))
      .groupBy(trainerProgress.trainerId),
  ]);
  return { battleActivity, trainerWins, battleStats, stuck };
}

/** Donjons : dernière activité, premières victoires, bilan par donjon depuis `since`, gemmes obtenues. */
async function loadDungeons(db: Db, since: Date) {
  const [dungeonActivity, dungeonStats, dungeonStuck, dungeonFirstWins, gemDrops] =
    await Promise.all([
      db
        .select({ ownerId: dungeonRuns.ownerId, at: max(dungeonRuns.startedAt) })
        .from(dungeonRuns)
        .groupBy(dungeonRuns.ownerId),
      db
        .select({
          dungeonId: dungeonRuns.dungeonId,
          runs: count(),
          players: countDistinct(dungeonRuns.ownerId),
          wins: sql<number>`count(*) filter (where ${dungeonRuns.outcome} = 'win')`.mapWith(Number),
          losses:
            sql<number>`count(*) filter (where ${dungeonRuns.outcome} in ('loss', 'timeout'))`.mapWith(
              Number,
            ),
          fled: sql<number>`count(*) filter (where ${dungeonRuns.outcome} = 'fled')`.mapWith(
            Number,
          ),
          gems: sql<number>`count(*) filter (where ${dungeonRuns.result} ->> 'gemItemId' is not null)`.mapWith(
            Number,
          ),
          earned:
            sql<number>`coalesce(sum((${dungeonRuns.result} ->> 'money')::bigint), 0)`.mapWith(
              Number,
            ),
        })
        .from(dungeonRuns)
        .where(and(isNotNull(dungeonRuns.claimedAt), gt(dungeonRuns.claimedAt, since)))
        .groupBy(dungeonRuns.dungeonId),
      db
        .select({ dungeonId: dungeonProgress.dungeonId, players: count() })
        .from(dungeonProgress)
        .where(and(gt(dungeonProgress.losses, 0), eq(dungeonProgress.wins, 0)))
        .groupBy(dungeonProgress.dungeonId),
      db
        .select({ ownerId: dungeonProgress.ownerId, at: min(dungeonProgress.firstWinAt) })
        .from(dungeonProgress)
        .where(isNotNull(dungeonProgress.firstWinAt))
        .groupBy(dungeonProgress.ownerId),
      db
        .select({
          dungeonId: dungeonProgress.dungeonId,
          gems: sum(dungeonProgress.gems).mapWith(Number),
        })
        .from(dungeonProgress)
        .groupBy(dungeonProgress.dungeonId),
    ]);
  return { dungeonActivity, dungeonStats, dungeonStuck, dungeonFirstWins, gemDrops };
}

/** Méga-Gemmes possédées : dans les Sacs, et tenues par des Pokémon Méga-Évolués. */
async function loadMegaStones(db: Db, ctx: GameContext) {
  const gemIds = ctx.content.items.filter((i) => i.category === 'megaStone').map((i) => i.id);
  const [bagGems, heldGems] = await Promise.all([
    gemIds.length
      ? db
          .select({
            ownerId: inventory.ownerId,
            itemId: inventory.itemId,
            quantity: inventory.quantity,
          })
          .from(inventory)
          .where(and(inArray(inventory.itemId, gemIds), gt(inventory.quantity, 0)))
      : [],
    db
      .select({ ownerId: pokemon.ownerId, itemId: pokemon.megaStone })
      .from(pokemon)
      .where(isNotNull(pokemon.megaStone)),
  ]);
  return { bagGems, heldGems };
}

type PlayerRows = Awaited<ReturnType<typeof loadPlayers>>;
type ExpeditionRows = Awaited<ReturnType<typeof loadExpeditions>>;
type BattleRows = Awaited<ReturnType<typeof loadBattles>>;
type DungeonRows = Awaited<ReturnType<typeof loadDungeons>>;
type MegaStoneRows = Awaited<ReturnType<typeof loadMegaStones>>;
/** Tout ce que la télémétrie lit en base. */
type Rows = PlayerRows & ExpeditionRows & BattleRows & DungeonRows & MegaStoneRows;

// --- Calculs : une fonction pure par bloc de l'écran de télémétrie.

/** Joueurs inscrits, lancés (starter choisi), nouveaux et actifs. */
function playerStats(rows: Rows, now: Date): TelemetryResponse['players'] {
  const { profiles } = rows;
  const lastAction = new Map<string, number>();
  for (const row of [
    ...rows.expeditionActivity,
    ...rows.battleActivity,
    ...rows.dungeonActivity,
    ...rows.shopActivity,
  ]) {
    if (!row.at) continue;
    lastAction.set(row.ownerId, Math.max(lastAction.get(row.ownerId) ?? 0, row.at.getTime()));
  }
  const activeSince = (ms: number) =>
    [...lastAction.values()].filter((t) => t > now.getTime() - ms).length;
  return {
    total: profiles.length,
    withStarter: profiles.filter((p) => p.starter !== null).length,
    new7d: profiles.filter((p) => p.createdAt.getTime() > now.getTime() - 7 * DAY).length,
    active1d: activeSince(DAY),
    active7d: activeSince(7 * DAY),
  };
}

/**
 * Parcours : pour chaque étape (première expédition, régions, dresseurs à badge ou uniques, premier
 * donjon, collections, quêtes), les heures écoulées entre l'inscription et l'étape, et la part des
 * joueurs lancés (`withStarter`) qui l'ont atteinte.
 */
function journeySteps(ctx: GameContext, rows: Rows, withStarter: number): TelemetryStep[] {
  const created = new Map(rows.profiles.map((p) => [p.userId, p.createdAt.getTime()]));
  const hoursSinceSignup = (ownerId: string, at: Date | null) => {
    const start = created.get(ownerId);
    return start === undefined || !at ? null : Math.max(0, (at.getTime() - start) / HOUR);
  };
  const step = (
    kind: TelemetryStep['kind'],
    id: string,
    label: string,
    reached: readonly { ownerId: string; at: Date | null }[],
  ): TelemetryStep => {
    const hours = reached.flatMap((r) => {
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
  for (const row of rows.zoneFirsts) {
    const regionId = row.zoneId ? regionOfZone.get(row.zoneId) : undefined;
    if (!regionId || !row.at) continue;
    const byOwner = regionFirsts.get(regionId) ?? new Map<string, Date>();
    const current = byOwner.get(row.ownerId);
    if (!current || row.at < current) byOwner.set(row.ownerId, row.at);
    regionFirsts.set(regionId, byOwner);
  }
  const rowsOf = (map: ReadonlyMap<string, Date> | undefined) =>
    [...(map ?? new Map<string, Date>())].map(([ownerId, at]) => ({ ownerId, at }));

  return [
    step('expedition', 'first-expedition', 'Première expédition récupérée', rows.firstClaims),
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
          rows.trainerWins.filter((w) => w.trainerId === t.id),
        ),
      ),
    step('dungeon', 'first-dungeon', 'Premier donjon réussi', rows.dungeonFirstWins),
    ...[...ctx.content.collections]
      .sort((a, b) => a.order - b.order)
      .map((c) =>
        step(
          'reward',
          `collection:${c.id}`,
          `Collection : ${c.name}`,
          rows.claims
            .filter((r) => r.kind === 'collection' && r.rewardId === c.id)
            .map((r) => ({ ownerId: r.ownerId, at: r.claimedAt })),
        ),
      ),
    ...ctx.quests.map((q) =>
      step(
        'quest',
        q.id,
        `Quête : ${q.name}`,
        rows.quests
          .filter((p) => p.questId === q.id && p.completedAt)
          .map((p) => ({ ownerId: p.ownerId, at: p.completedAt })),
      ),
    ),
  ];
}

/** Bilan de chaque dresseur sur la période, et joueurs qui n'ont fait qu'y perdre. */
function trainerStats(ctx: GameContext, rows: Rows): TelemetryTrainer[] {
  const battleById = new Map(rows.battleStats.map((b) => [b.trainerId, b]));
  const stuckById = new Map(rows.stuck.map((s) => [s.trainerId, s.players]));
  return ctx.trainers.map((t) => {
    const b = battleById.get(t.id);
    return {
      trainerId: t.id,
      label: `${t.trainerClass} ${t.name}`,
      battles: b?.battles ?? 0,
      wins: b?.wins ?? 0,
      losses: b?.losses ?? 0,
      fled: b?.fled ?? 0,
      stuckPlayers: stuckById.get(t.id) ?? 0,
    };
  });
}

/** Fréquentation de chaque zone sur la période (expéditions légendaires exclues). */
function zoneStats(ctx: GameContext, rows: Rows): TelemetryZone[] {
  const zoneById = new Map(rows.zoneStats.map((z) => [z.zoneId, z]));
  return ctx.zones.map((z) => {
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
}

/** Bilan de chaque donjon sur la période, et joueurs qui n'ont fait qu'y perdre. */
function dungeonStats(ctx: GameContext, rows: Rows): TelemetryDungeon[] {
  const dungeonById = new Map(rows.dungeonStats.map((d) => [d.dungeonId, d]));
  const stuckById = new Map(rows.dungeonStuck.map((s) => [s.dungeonId, s.players]));
  return ctx.dungeons.map((d) => {
    const s = dungeonById.get(d.id);
    return {
      dungeonId: d.id,
      label: d.name,
      difficulty: dungeonDifficulty(ctx, d).name,
      runs: s?.runs ?? 0,
      players: s?.players ?? 0,
      wins: s?.wins ?? 0,
      losses: s?.losses ?? 0,
      fled: s?.fled ?? 0,
      gems: s?.gems ?? 0,
      stuckPlayers: stuckById.get(d.id) ?? 0,
    };
  });
}

/** Méga-Gemmes : dans les Sacs, tenues (Pokémon Méga-Évolués), obtenues en donjon. */
function megaStoneStats(ctx: GameContext, rows: Rows): TelemetryMegaStone[] {
  const gemOfDungeon = new Map(ctx.content.dungeons.map((d) => [d.id, d.gemItemId]));
  const dropped = new Map<string, number>();
  for (const row of rows.gemDrops) {
    const gemId = gemOfDungeon.get(row.dungeonId);
    if (gemId) dropped.set(gemId, (dropped.get(gemId) ?? 0) + row.gems);
  }
  return ctx.content.items
    .filter((i) => i.category === 'megaStone')
    .map((i) => {
      const bags = rows.bagGems.filter((b) => b.itemId === i.id);
      const held = rows.heldGems.filter((h) => h.itemId === i.id);
      return {
        itemId: i.id,
        label: i.name,
        owners: new Set([...bags, ...held].map((r) => r.ownerId)).size,
        inBags: bags.reduce((s, b) => s + b.quantity, 0),
        held: held.length,
        dropped: dropped.get(i.id) ?? 0,
      };
    });
}

/**
 * Avancement de chaque quête, et pour chaque étape les joueurs qui y sont en ce moment, avec le
 * temps qu'ils y ont déjà passé (une étape où l'on reste longtemps est un goulet).
 */
function questStats(ctx: GameContext, rows: Rows, now: Date): TelemetryQuest[] {
  const nowMs = now.getTime();
  return ctx.quests.map((q) => {
    const progress = rows.quests.filter((p) => p.questId === q.id);
    return {
      questId: q.id,
      label: q.name,
      started: progress.length,
      completed: progress.filter((p) => p.completedAt).length,
      steps: q.steps.map((s, index) => ({
        index,
        name: s.name,
        ...durationStats(
          progress
            .filter((p) => !p.completedAt && p.step === index)
            .map((p) => (nowMs - p.stepStartedAt.getTime()) / HOUR),
        ),
      })),
    };
  });
}

/** Répartition des joueurs lancés selon la part du Pokédex national qu'ils ont capturée. */
function dexDistribution(ctx: GameContext, rows: Rows): TelemetryResponse['dexDistribution'] {
  const nationalTotal = dexSpeciesIds(ctx, null).length;
  const caughtByOwner = new Map(rows.dexCounts.map((d) => [d.ownerId, d.caught]));
  const buckets = [
    { label: '< 10 %', max: 10 },
    { label: '10 à 25 %', max: 25 },
    { label: '25 à 50 %', max: 50 },
    { label: '50 à 75 %', max: 75 },
    { label: '75 à 99 %', max: 100 },
    { label: '100 %', max: Infinity },
  ].map((b) => ({ ...b, players: 0 }));
  for (const p of rows.profiles) {
    if (p.starter === null) continue;
    const percent = nationalTotal ? ((caughtByOwner.get(p.userId) ?? 0) / nationalTotal) * 100 : 0;
    buckets.find((b) => percent < b.max || b.max === Infinity)!.players++;
  }
  return buckets.map(({ label, players }) => ({ label, players }));
}

/** Argent gagné (combats, donjons) et dépensé (boutique) sur la période, solde médian des joueurs. */
function economyStats(rows: Rows): TelemetryResponse['economy'] {
  const balances = rows.profiles.map((p) => p.currency).sort((a, b) => a - b);
  return {
    earned:
      rows.battleStats.reduce((s, b) => s + b.earned, 0) +
      rows.dungeonStats.reduce((s, d) => s + d.earned, 0),
    spent: rows.spent[0]?.total ?? 0,
    medianBalance: quantile(balances, 0.5),
  };
}

/**
 * Le tableau de télémétrie de l'admin. Les statistiques d'activité (dresseurs, zones, donjons,
 * économie) portent sur les `days` derniers jours ; le parcours, les quêtes et le Pokédex sur
 * tous les joueurs depuis toujours.
 */
export async function telemetry(
  db: Db,
  ctx: GameContext,
  days: number,
  now: Date,
): Promise<TelemetryResponse> {
  const since = new Date(now.getTime() - days * DAY);
  const [playerRows, expeditionRows, battleRows, dungeonRows, megaStoneRows] = await Promise.all([
    loadPlayers(db, since),
    loadExpeditions(db, since),
    loadBattles(db, since),
    loadDungeons(db, since),
    loadMegaStones(db, ctx),
  ]);
  const rows: Rows = {
    ...playerRows,
    ...expeditionRows,
    ...battleRows,
    ...dungeonRows,
    ...megaStoneRows,
  };
  const players = playerStats(rows, now);
  return {
    generatedAt: now.toISOString(),
    days,
    players,
    steps: journeySteps(ctx, rows, players.withStarter),
    trainers: trainerStats(ctx, rows),
    zones: zoneStats(ctx, rows),
    dungeons: dungeonStats(ctx, rows),
    megaStones: megaStoneStats(ctx, rows),
    quests: questStats(ctx, rows, now),
    dexDistribution: dexDistribution(ctx, rows),
    economy: economyStats(rows),
  };
}
