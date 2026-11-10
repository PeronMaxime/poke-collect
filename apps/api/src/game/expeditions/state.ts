import { and, eq, gte, isNotNull, isNull, or } from 'drizzle-orm';
import { expeditions, questProgress } from '@poke/db';
import type { Db } from '@poke/db';
import {
  expeditionEnv,
  expeditionPace,
  roamerPositions,
  roamingTarget,
  zoneChainStatus,
  zoneWeather,
} from '@poke/game-core';
import type {
  ExpeditionPace,
  GameContext,
  PlayerProgress,
  RoamerPosition,
  ZoneChainStatus,
} from '@poke/game-core';
import type { ContentCache } from '../../content-cache';
import { playerProgress } from '../store';
import type { ExpeditionRow } from './views';
import { expeditionTeams } from './common';

/**
 * L'état des expéditions d'un joueur, recalculé à la demande : chaînes chromatiques par zone,
 * position des Pokémon fuyards, rythme des expéditions en cours.
 */

/**
 * Chaînes de zone du joueur (bonus shiny) : expéditions en cours, ou récupérées depuis moins que
 * le délai de relance ; une chaîne absente repart de 0.
 */
export async function shinyChains(
  db: Db,
  ctx: GameContext,
  userId: string,
  now: Date,
  only?: { zoneId: string },
): Promise<Map<string, ZoneChainStatus>> {
  const since = new Date(now.getTime() - ctx.balance.shiny.chainWindowMinutes * 60_000);
  const rows = await db
    .select({
      zoneId: expeditions.zoneId,
      chain: expeditions.shinyChain,
      claimedAt: expeditions.claimedAt,
    })
    .from(expeditions)
    .where(
      and(
        eq(expeditions.ownerId, userId),
        only ? eq(expeditions.zoneId, only.zoneId) : undefined,
        // Anciennes expéditions légendaires (sans zone) : hors chaînes.
        isNull(expeditions.questId),
        or(isNull(expeditions.claimedAt), gte(expeditions.claimedAt, since)),
      ),
    );
  const byZone = new Map<string, typeof rows>();
  for (const r of rows) {
    if (r.zoneId) byZone.set(r.zoneId, [...(byZone.get(r.zoneId) ?? []), r]);
  }
  const chains = new Map<string, ZoneChainStatus>();
  for (const [id, runs] of byZone) {
    const status = zoneChainStatus(ctx, runs, now);
    if (status.chain > 0) chains.set(id, status);
  }
  return chains;
}

/**
 * Pokémon fuyards du joueur et leur zone à l'instant `now` : ceux des quêtes réclamées, sauf ceux
 * partis avec une expédition pas encore réclamée.
 */
export async function playerRoamers(
  db: Db,
  ctx: GameContext,
  userId: string,
  now: Date,
  progress?: PlayerProgress,
): Promise<RoamerPosition[]> {
  const claimedQuests = await db
    .select({
      questId: questProgress.questId,
      pokemonCaught: questProgress.pokemonCaught,
      roamerHideout: questProgress.roamerHideout,
    })
    .from(questProgress)
    .where(and(eq(questProgress.ownerId, userId), isNotNull(questProgress.claimedAt)));
  const roaming = claimedQuests.filter(({ questId, pokemonCaught }) => {
    const quest = ctx.quest(questId);
    return quest && roamingTarget(quest, pokemonCaught);
  });
  if (roaming.length === 0) return [];
  const running = await db
    .select({ roamers: expeditions.roamers })
    .from(expeditions)
    .where(and(eq(expeditions.ownerId, userId), isNull(expeditions.claimedAt)));
  return roamerPositions(ctx, {
    userId,
    claimedQuests: roaming,
    progress: progress ?? (await playerProgress(db, ctx, userId)),
    engagedQuestIds: new Set(running.flatMap((r) => r.roamers.map((x) => x.questId))),
    at: now,
  });
}

/**
 * Rythme de chaque expédition de zone en cours (par id), calculé comme à la réclamation : contenu
 * de la version du départ, équipe, météo et heure du départ, baies de rencontres emportées.
 */
export async function expeditionPaces(
  db: Db,
  content: ContentCache,
  userId: string,
  rows: readonly ExpeditionRow[],
): Promise<Map<string, ExpeditionPace>> {
  const paces = new Map<string, ExpeditionPace>();
  const running = rows.filter((row) => !row.claimedAt && !row.questId && row.zoneId);
  const teams = await expeditionTeams(
    db,
    userId,
    running.map((row) => row.team),
  );
  for (const [i, row] of running.entries()) {
    const ctx = await content.version(row.contentVersionId);
    const zone = ctx.zone(row.zoneId!);
    if (!zone) continue;
    const team = teams[i]!;
    const site = { ...zone, weather: zoneWeather(zone, row.startedAt) };
    paces.set(
      row.id,
      expeditionPace(
        ctx,
        expeditionEnv(site, team, row.localHour),
        row.encounterBerryItemId
          ? { itemId: row.encounterBerryItemId, quantity: row.encounterBerries }
          : null,
        row.encounterIntervalGrowthMinutes,
      ),
    );
  }
  return paces;
}
