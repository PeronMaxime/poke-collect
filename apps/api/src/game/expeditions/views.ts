import { and, asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { expeditions, playerProfiles } from '@poke/db';
import type { Db } from '@poke/db';
import type { ExpeditionDto, ExpeditionsResponse } from '@poke/shared';
import type { ContentCache } from '../../content-cache';
import { GameError } from '../errors';
import { expeditionSlots } from './basics';
import { expeditionPaces, playerRoamers, shinyChains } from './state';

/**
 * Ce que la page Expéditions affiche : les expéditions en cours, l'historique et les zones
 * favorites. Des lectures seulement, plus le réglage des favoris ; les départs, annulations et
 * réclamations sont dans `expeditions.ts`.
 */

/** Une expédition telle qu'elle est enregistrée. */
export type ExpeditionRow = typeof expeditions.$inferSelect;

/** L'expédition telle que le jeu la reçoit ; `pace` (son rythme) n'est calculé que pour celles en cours. */
export function toExpeditionDto(
  row: ExpeditionRow,
  pace: ExpeditionDto['pace'] = null,
): ExpeditionDto {
  return {
    id: row.id,
    zoneId: row.zoneId,
    questId: row.questId,
    slotIndex: row.slotIndex,
    team: row.team,
    durationMinutes: row.durationMinutes,
    ballItemId: row.ballItemId,
    balls: row.balls,
    berryItemId: row.berryItemId,
    berries: row.berries,
    encounterBerryItemId: row.encounterBerryItemId,
    encounterBerries: row.encounterBerries,
    captureFilter: row.captureFilter,
    ballPlan: row.ballPlan,
    ballsUsed: Object.entries(row.ballsUsed).map(([itemId, quantity]) => ({ itemId, quantity })),
    contentVersionId: row.contentVersionId,
    startedAt: row.startedAt.toISOString(),
    minEndsAt: row.minEndsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    claimedAt: row.claimedAt?.toISOString() ?? null,
    shinyChain: row.shinyChain,
    localHour: row.localHour,
    roamerQuestIds: row.roamers.map((r) => r.questId),
    roamersMet: row.roamersMet,
    autoTransfer: row.autoTransfer ?? null,
    pace,
    result: (row.result as ExpeditionDto['result']) ?? null,
  };
}

/** Nombre d'expéditions réclamées gardées dans l'historique affiché. */
const HISTORY_LIMIT = 20;

/**
 * L'état de la page Expéditions à l'instant `at` : places, expéditions en cours et leur rythme,
 * chaînes chromatiques par zone, zones favorites, position des Pokémon fuyards.
 */
export async function expeditionsOverview(
  db: Db,
  content: ContentCache,
  userId: string,
  at: Date,
): Promise<ExpeditionsResponse> {
  const ctx = await content.get();
  const [rows, slots, chains, [profile], roamers] = await Promise.all([
    db
      .select()
      .from(expeditions)
      .where(and(eq(expeditions.ownerId, userId), isNull(expeditions.claimedAt)))
      .orderBy(asc(expeditions.slotIndex)),
    expeditionSlots(db, ctx, userId),
    shinyChains(db, ctx, userId, at),
    db
      .select({ favoriteZoneIds: playerProfiles.favoriteZoneIds })
      .from(playerProfiles)
      .where(eq(playerProfiles.userId, userId)),
    playerRoamers(db, ctx, userId, at),
  ]);
  const paces = await expeditionPaces(db, content, userId, rows);
  const chainDto = (s: { chain: number; expiresAt: Date | null }) => ({
    chain: s.chain,
    expiresAt: s.expiresAt?.toISOString() ?? null,
  });
  return {
    slots,
    serverTime: at.toISOString(),
    active: rows.map((r) => toExpeditionDto(r, paces.get(r.id) ?? null)),
    chains: ctx.zones.flatMap((z) => {
      const s = chains.get(z.id);
      return s ? [{ zoneId: z.id, ...chainDto(s) }] : [];
    }),
    favoriteZoneIds: profile?.favoriteZoneIds ?? [],
    roamers: roamers.map((r) => ({
      questId: r.questId,
      speciesId: r.target.speciesId,
      formId: r.target.formId ?? null,
      zoneId: r.zoneId,
      encounterChance: r.target.roaming ?? 0,
      movesAt: r.movesAt.toISOString(),
    })),
  };
}

/**
 * Met une zone en favori (ou l'en retire) : elle s'affiche en tête de la page Expéditions. Une
 * zone disparue du contenu peut toujours être retirée. Refus : `ZONE_NOT_FOUND`, `NO_PROFILE`.
 */
export async function setFavoriteZone(
  db: Db,
  content: ContentCache,
  userId: string,
  zoneId: string,
  favorite: boolean,
): Promise<{ favoriteZoneIds: string[] }> {
  const ctx = await content.get();
  if (favorite && !ctx.zone(zoneId)) throw new GameError(404, 'ZONE_NOT_FOUND');
  const [updated] = await db
    .update(playerProfiles)
    .set({
      favoriteZoneIds: favorite
        ? sql`array_append(array_remove(${playerProfiles.favoriteZoneIds}, ${zoneId}), ${zoneId})`
        : sql`array_remove(${playerProfiles.favoriteZoneIds}, ${zoneId})`,
    })
    .where(eq(playerProfiles.userId, userId))
    .returning({ favoriteZoneIds: playerProfiles.favoriteZoneIds });
  if (!updated) throw new GameError(409, 'NO_PROFILE');
  return updated;
}

/** Dernières expéditions réclamées du joueur, de la plus récente à la plus ancienne. */
export async function expeditionHistory(db: Db, userId: string): Promise<ExpeditionDto[]> {
  const rows = await db
    .select()
    .from(expeditions)
    .where(and(eq(expeditions.ownerId, userId), isNotNull(expeditions.claimedAt)))
    .orderBy(desc(expeditions.claimedAt))
    .limit(HISTORY_LIMIT);
  return rows.map((r) => toExpeditionDto(r));
}
