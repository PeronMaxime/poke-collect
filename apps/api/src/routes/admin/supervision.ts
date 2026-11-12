import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { listAuditLog, logAdminAction } from '@poke/db';
import { telemetryQuerySchema } from '@poke/shared';
import type {
  AdminGuildQuestsResetResponse,
  ApiMetricsResponse,
  AdminSpeciesStatsDto,
  AuditLogEntryDto,
  Paginated,
  TelemetryResponse,
} from '@poke/shared';
import { speciesStats } from '../../game/admin-players';
import { resetGuildQuests } from '../../game/guilds';
import { telemetry } from '../../game/telemetry';
import { currentUserId } from '../deps';
import type { AdminDeps } from './admin-deps';

/**
 * Supervision : télémétrie d'équilibrage, santé de l'API, statistiques d'espèces, quêtes de
 * guilde, journal des actions d'administration.
 */

const auditQuery = z.object({
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/**
 * Supervision : télémétrie d'équilibrage, santé de l'API, statistiques d'espèces, remise à zéro
 * des quêtes de guilde, journal des actions d'administration.
 */
export function adminSupervisionRoutes(
  app: FastifyInstance,
  { db, content, now, monitoring }: AdminDeps,
) {
  /** Télémétrie d'équilibrage : temps de complétion et goulets (contenu publié). */
  app.get('/api/admin/telemetry', async (request): Promise<TelemetryResponse> => {
    const { days } = telemetryQuerySchema.parse(request.query);
    return telemetry(db, await content.get(), days, now());
  });

  /** Santé de l'API : requêtes, erreurs, refus 429 et durées par route (mémoire du processus). */
  app.get('/api/admin/metrics', async (): Promise<ApiMetricsResponse> => monitoring.snapshot());

  app.get('/api/admin/species-stats', async (): Promise<AdminSpeciesStatsDto[]> =>
    speciesStats(db),
  );

  /** Efface les quêtes de guilde en cours : retirées au prochain besoin avec le contenu publié. */
  app.post('/api/admin/guild-quests/reset', async (request) => {
    const result: AdminGuildQuestsResetResponse = await resetGuildQuests(
      db,
      await content.get(),
      now(),
    );
    await logAdminAction(db, {
      adminId: currentUserId(request),
      action: 'guild_quests.reset',
      entity: 'guild_quest',
      entityId: 'current',
      after: result,
    });
    return result;
  });

  app.get('/api/admin/audit-log', async (request): Promise<Paginated<AuditLogEntryDto>> => {
    const { cursor, limit } = auditQuery.parse(request.query);
    const page = await listAuditLog(db, { cursor, limit });
    return {
      items: page.items.map((e) => ({ ...e, at: e.at.toISOString() })),
      nextCursor: page.nextCursor,
    };
  });
}
