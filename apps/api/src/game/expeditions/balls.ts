import { and, asc, eq, isNull, lte, sql } from 'drizzle-orm';
import { expeditions } from '@poke/db';
import type { Db } from '@poke/db';
import {
  BALL_CATEGORIES,
  planBall,
  MISSED_THROW,
  NO_THROW,
  THROW_CODES,
  createExpeditionRun,
  planHasBall,
  planThrows,
  playerBonuses,
  zoneWeather,
} from '@poke/game-core';
import type { BallPlan, ExpeditionInput, ExpeditionRun, GameContext } from '@poke/game-core';
import type { ContentCache } from '../../content-cache';
import { GameError } from '../errors';
import { playerTransaction } from '../tx';
import { claimedRewards, itemQuantities, shinyCharm, takeItems } from '../store';
import type { ExpeditionRow } from './views';
import { expeditionRoamers, expeditionTeam } from './common';

/**
 * Balls lancées au fil de l'expédition (plan de Balls).
 *
 * Avec un plan de Balls, rien n'est réservé au départ : à chaque rattrapage (`settleExpeditionBalls`, appelé
 * avant les requêtes du joueur), le serveur rejoue chaque expédition jusqu'à maintenant, retire
 * du Sac les Balls des rencontres passées et note dans le journal de l'expédition ce qui a été
 * lancé, ou manqué faute de Balls. La réclamation relit ce journal : le résultat ne dépend donc
 * pas de ce que le Sac contient à ce moment-là.
 */

/**
 * Données de rejeu d'une expédition à plan de Balls : de quoi retrouver ses rencontres à
 * l'identique, au fil des retraits de Balls comme à la réclamation.
 */
export async function planRunInput(
  db: Db,
  ctx: GameContext,
  row: ExpeditionRow,
  zone: NonNullable<ReturnType<GameContext['zone']>>,
  userId: string,
): Promise<Omit<ExpeditionInput, 'elapsedMinutes'>> {
  const bonuses = playerBonuses(ctx, await claimedRewards(db, userId));
  const charm = await shinyCharm(db, ctx, userId);
  const snapshot = row.captureSnapshot ?? { speciesIds: [], formIds: [], pity: {} };
  return {
    zone,
    seed: row.seed,
    team: await expeditionTeam(db, userId, row.team),
    ballPlan: row.ballPlan,
    throws: row.throws,
    berries: row.berryItemId ? { itemId: row.berryItemId, quantity: row.berries } : null,
    encounterBerries: row.encounterBerryItemId
      ? { itemId: row.encounterBerryItemId, quantity: row.encounterBerries }
      : null,
    intervalGrowthMinutes: row.encounterIntervalGrowthMinutes,
    pity: snapshot.pity,
    bonuses,
    // Chaîne figée au départ ; Charme Chroma possédé maintenant.
    shiny: { chain: row.shinyChain, charm, bonus: bonuses.shiny },
    caught: { speciesIds: new Set(snapshot.speciesIds), formIds: new Set(snapshot.formIds) },
    hour: row.localHour,
    weather: zoneWeather(zone, row.startedAt),
    roamers: await expeditionRoamers(db, ctx, userId, row.roamers),
  };
}

/**
 * Retire du sac les Balls lancées depuis le dernier passage par les expéditions en cours du
 * joueur : une à chaque rencontre, selon la catégorie du Pokémon (nouveau, chromatique, déjà
 * capturé). Les rencontres de toutes les expéditions sont prises dans l'ordre où elles ont eu
 * lieu, comme si le jeu était resté ouvert : quand la Ball voulue manque à ce moment-là, la
 * rencontre se fait sans lancer. Le résultat des captures reste secret jusqu'à la réclamation.
 * Appelée avant chaque requête du joueur, et dans la réclamation.
 */
export async function settleExpeditionBalls(
  db: Db,
  content: ContentCache,
  userId: string,
  now: Date,
): Promise<void> {
  const [due] = await db
    .select({ id: expeditions.id })
    .from(expeditions)
    .where(
      and(
        eq(expeditions.ownerId, userId),
        isNull(expeditions.claimedAt),
        lte(expeditions.nextThrowAt, now),
      ),
    )
    .limit(1);
  if (!due) return;
  await preloadExpeditionContent(db, content, userId);
  await playerTransaction(db, userId, (tx) => settleBallsIn(tx, content, userId, now));
}

/** Prochaine rencontre à régler parmi les expéditions en cours du joueur, ou `null`. */
export async function nextExpeditionThrow(db: Db, userId: string): Promise<Date | null> {
  const [row] = await db
    .select({ at: sql<Date | null>`min(${expeditions.nextThrowAt})` })
    .from(expeditions)
    .where(and(eq(expeditions.ownerId, userId), isNull(expeditions.claimedAt)));
  return row?.at ? new Date(row.at) : null;
}

/**
 * Charge, hors transaction, le contenu des versions de départ des expéditions en cours du joueur.
 * `ContentCache` lit la base par sa propre connexion : appelé pour la première fois dans une
 * transaction, il attendrait sa fin (PGlite n'a qu'une connexion) et la bloquerait pour de bon.
 */
export async function preloadExpeditionContent(db: Db, content: ContentCache, userId: string) {
  const rows = await db
    .selectDistinct({ versionId: expeditions.contentVersionId })
    .from(expeditions)
    .where(and(eq(expeditions.ownerId, userId), isNull(expeditions.claimedAt)));
  await Promise.all(rows.map((r) => content.version(r.versionId)));
}

export async function settleBallsIn(db: Db, content: ContentCache, userId: string, now: Date) {
  const rows = await db
    .select()
    .from(expeditions)
    .where(
      and(
        eq(expeditions.ownerId, userId),
        isNull(expeditions.claimedAt),
        lte(expeditions.nextThrowAt, now),
      ),
    )
    .orderBy(asc(expeditions.startedAt))
    .for('update');
  interface PendingRun {
    row: ExpeditionRow;
    run: ExpeditionRun;
    plan: BallPlan;
    throws: string;
    used: Record<string, number>;
    /** Quêtes des fuyards déjà croisés. */
    roamersMet: string[];
    /** Rencontres survenues à ce jour. */
    limit: number;
    done: boolean;
  }
  const runs: PendingRun[] = [];
  for (const row of rows) {
    const ctx = await content.version(row.contentVersionId);
    const zone = row.zoneId ? ctx.zone(row.zoneId) : undefined;
    const plan = row.ballPlan;
    if (!zone || !plan) {
      await db.update(expeditions).set({ nextThrowAt: null }).where(eq(expeditions.id, row.id));
      continue;
    }
    const run = createExpeditionRun(ctx, await planRunInput(db, ctx, row, zone, userId));
    // Rencontres déjà décidées : rejouées telles quelles.
    const replay = planThrows(plan, row.throws);
    let done = false;
    while (!done && run.played < row.throws.length) done = !run.next(replay);
    const elapsed =
      (Math.min(now.getTime(), row.endsAt.getTime()) - row.startedAt.getTime()) / 60_000;
    runs.push({
      row,
      run,
      plan,
      throws: row.throws,
      used: { ...row.ballsUsed },
      roamersMet: [...row.roamersMet],
      limit: run.encountersAfter(elapsed),
      done,
    });
  }

  const ballIds = new Set(runs.flatMap((r) => BALL_CATEGORIES.flatMap((c) => r.plan[c] ?? [])));
  const stock = await itemQuantities(db, userId, [...ballIds]);
  const taken = new Map<string, number>();
  const nextAt = (r: PendingRun) =>
    r.row.startedAt.getTime() + r.run.encounterMinutes(r.run.played + 1) * 60_000;
  for (;;) {
    // Prochaine rencontre, toutes expéditions confondues.
    let next: PendingRun | undefined;
    for (const r of runs) {
      if (!r.done && r.run.played < r.limit && (!next || nextAt(r) < nextAt(next))) next = r;
    }
    if (!next) break;
    const current = next;
    let code = NO_THROW;
    const met = current.run.next(({ category }) => {
      const ballItemId = planBall(current.plan, category);
      if (!ballItemId) return { outcome: 'ignored' };
      if ((stock.get(ballItemId) ?? 0) <= 0) {
        code = MISSED_THROW;
        return { outcome: 'noBall' };
      }
      stock.set(ballItemId, stock.get(ballItemId)! - 1);
      taken.set(ballItemId, (taken.get(ballItemId) ?? 0) + 1);
      current.used[ballItemId] = (current.used[ballItemId] ?? 0) + 1;
      code = THROW_CODES[category];
      return { ballItemId };
    });
    if (!met) {
      current.done = true;
      continue;
    }
    current.throws += code;
    // Le joueur apprend qu'il a croisé le fuyard, pas l'issue du lancer.
    if (met.questId && !current.roamersMet.includes(met.questId)) {
      current.roamersMet.push(met.questId);
    }
  }

  for (const [itemId, quantity] of taken) {
    if (!(await takeItems(db, userId, itemId, quantity))) throw new GameError(409, 'STOCK_CHANGED');
  }
  for (const r of runs) {
    const at = new Date(nextAt(r));
    // Plus de Ball à lancer ni de fuyard à croiser : inutile de la rejouer avant la réclamation.
    const pending =
      planHasBall(r.plan) || r.row.roamers.some((x) => !r.roamersMet.includes(x.questId));
    await db
      .update(expeditions)
      .set({
        throws: r.throws,
        ballsUsed: r.used,
        roamersMet: r.roamersMet,
        nextThrowAt: pending && !r.done && at <= r.row.endsAt ? at : null,
      })
      .where(eq(expeditions.id, r.row.id));
  }
}
