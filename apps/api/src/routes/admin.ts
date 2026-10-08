import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { balanceSettingsSchema } from '@poke/content';
import {
  ContentError,
  contentEntitySchemas,
  createDraft,
  deleteDraftEntity,
  discardDraft,
  getContentVersion,
  importContentAsDraft,
  listAuditLog,
  listContentVersions,
  loadContentWithIssues,
  logAdminAction,
  publishDraft,
  saveDraftEntity,
  updateDraftBalance,
} from '@poke/db';
import type { ContentEntityType, ContentErrorCode, Db } from '@poke/db';
import {
  createDraftInputSchema,
  importContentInputSchema,
  telemetryQuerySchema,
} from '@poke/shared';
import type {
  AuditLogEntryDto,
  ContentVersionDetailDto,
  ContentVersionDto,
  Paginated,
  TelemetryResponse,
} from '@poke/shared';
import type { ContentCache } from '../content-cache';
import { telemetry } from '../game/telemetry';
import type { sessionHooks } from '../plugins/session';

interface Deps {
  db: Db;
  content: ContentCache;
  hooks: ReturnType<typeof sessionHooks>;
  now: () => Date;
  onContentPublished?: (() => Promise<void>) | undefined;
}

const idParams = z.object({ id: z.coerce.number().int().positive() });
const auditQuery = z.object({
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const STATUS_BY_CODE: Record<ContentErrorCode, number> = {
  NOT_FOUND: 404,
  NO_PUBLISHED_VERSION: 404,
  DRAFT_EXISTS: 409,
  NOT_A_DRAFT: 409,
  INVALID_CONTENT: 422,
  ALREADY_EXISTS: 409,
  IN_USE: 409,
};

/** Segment d'URL → type d'entité de contenu (et nom dans le journal). */
const ENTITY_ROUTES: Record<string, { type: ContentEntityType; audit: string }> = {
  regions: { type: 'region', audit: 'region' },
  species: { type: 'speciesOverride', audit: 'species_override' },
  items: { type: 'item', audit: 'item' },
  'loot-tables': { type: 'lootTable', audit: 'loot_table' },
  zones: { type: 'zone', audit: 'zone' },
  trainers: { type: 'trainer', audit: 'trainer' },
  'shop-categories': { type: 'shopCategory', audit: 'shop_category' },
  'shop-entries': { type: 'shopEntry', audit: 'shop_entry' },
  evolutions: { type: 'evolutionOverride', audit: 'evolution_override' },
  'dex-milestones': { type: 'dexMilestone', audit: 'dex_milestone' },
  collections: { type: 'collection', audit: 'collection' },
  quests: { type: 'quest', audit: 'quest' },
};

const entityParams = z.object({
  id: z.coerce.number().int().positive(),
  collection: z.enum(Object.keys(ENTITY_ROUTES) as [string, ...string[]]),
  key: z.string().min(1).max(64),
});

function sendContentError(reply: FastifyReply, err: unknown) {
  if (err instanceof ContentError) {
    return reply
      .code(STATUS_BY_CODE[err.code])
      .send({ error: err.code, message: err.message, details: err.details });
  }
  throw err;
}

function versionDto(v: Awaited<ReturnType<typeof listContentVersions>>[number]): ContentVersionDto {
  return {
    id: v.id,
    status: v.status,
    label: v.label,
    basedOnId: v.basedOnId,
    createdBy: v.createdBy,
    createdAt: v.createdAt.toISOString(),
    publishedAt: v.publishedAt?.toISOString() ?? null,
  };
}

/** Routes /api/admin/* : toutes réservées au rôle admin, toutes les écritures sont journalisées. */
export async function adminRoutes(
  app: FastifyInstance,
  { db, content, hooks, now, onContentPublished }: Deps,
) {
  app.addHook('preHandler', hooks.requireAdmin);

  app.get('/api/admin/me', async (request) => ({ user: request.user }));

  app.get('/api/admin/content/versions', async () =>
    (await listContentVersions(db)).map(versionDto),
  );

  app.get('/api/admin/content/versions/:id', async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const version = await getContentVersion(db, id);
    if (!version) return reply.code(404).send({ error: 'NOT_FOUND' });
    try {
      const { content: data, issues } = await loadContentWithIssues(db, id);
      const detail: ContentVersionDetailDto = {
        version: versionDto(version),
        content: data,
        issues,
      };
      return detail;
    } catch (err) {
      return sendContentError(reply, err);
    }
  });

  /** Import d'un contenu complet (JSON exporté, contenu de test) comme nouveau brouillon. */
  app.post('/api/admin/content/import', async (request, reply) => {
    const { label, content: data } = importContentInputSchema.parse(request.body);
    try {
      const draft = await importContentAsDraft(db, data, { label, createdBy: request.user!.id });
      await logAdminAction(db, {
        adminId: request.user!.id,
        action: 'content.import',
        entity: 'content_version',
        entityId: draft.id,
        after: { label },
      });
      return reply.code(201).send(versionDto(draft));
    } catch (err) {
      return sendContentError(reply, err);
    }
  });

  /*
   * Entités d'un brouillon : POST crée, PUT remplace, DELETE supprime (refusé si encore utilisée).
   * Corps validé par le même schéma Zod que les formulaires de l'admin.
   */
  const saveEntity = (mode: 'create' | 'update') =>
    async function (request: FastifyRequest, reply: FastifyReply) {
      const { id, collection, key } = entityParams.parse({
        ...(request.params as object),
        key: (request.params as { key?: string }).key ?? '_',
      });
      const route = ENTITY_ROUTES[collection]!;
      const parsed = contentEntitySchemas[route.type].safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'VALIDATION', issues: parsed.error.issues });
      }
      const entityKey = String(
        (parsed.data as Record<string, unknown>)[
          route.type === 'speciesOverride' ? 'speciesId' : 'id'
        ],
      );
      if (mode === 'update' && entityKey !== key) {
        return reply
          .code(400)
          .send({ error: 'KEY_MISMATCH', message: 'L’identifiant ne peut pas changer' });
      }
      try {
        const { before } = await saveDraftEntity(db, id, route.type, parsed.data, mode);
        await logAdminAction(db, {
          adminId: request.user!.id,
          action: `content.${route.audit}.${mode}`,
          entity: route.audit,
          entityId: `v${id}/${entityKey}`,
          before,
          after: parsed.data,
        });
        return reply.code(mode === 'create' ? 201 : 200).send(parsed.data);
      } catch (err) {
        return sendContentError(reply, err);
      }
    };
  app.post('/api/admin/content/versions/:id/:collection', saveEntity('create'));
  app.put('/api/admin/content/versions/:id/:collection/:key', saveEntity('update'));

  app.delete('/api/admin/content/versions/:id/:collection/:key', async (request, reply) => {
    const { id, collection, key } = entityParams.parse(request.params);
    const route = ENTITY_ROUTES[collection]!;
    const typedKey = route.type === 'speciesOverride' ? Number(key) : key;
    try {
      const { before } = await deleteDraftEntity(db, id, route.type, typedKey);
      await logAdminAction(db, {
        adminId: request.user!.id,
        action: `content.${route.audit}.delete`,
        entity: route.audit,
        entityId: `v${id}/${key}`,
        before,
      });
      return reply.code(204).send();
    } catch (err) {
      return sendContentError(reply, err);
    }
  });

  app.post('/api/admin/content/drafts', async (request, reply) => {
    const parsed = createDraftInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'VALIDATION', issues: parsed.error.issues });
    }
    try {
      const draft = await createDraft(db, { ...parsed.data, createdBy: request.user!.id });
      await logAdminAction(db, {
        adminId: request.user!.id,
        action: 'content.draft.create',
        entity: 'content_version',
        entityId: draft.id,
        after: { label: draft.label, basedOnId: draft.basedOnId },
      });
      return reply.code(201).send(versionDto(draft));
    } catch (err) {
      return sendContentError(reply, err);
    }
  });

  app.put('/api/admin/content/versions/:id/balance', async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const parsed = balanceSettingsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'VALIDATION', issues: parsed.error.issues });
    }
    try {
      const { before } = await updateDraftBalance(db, id, parsed.data);
      await logAdminAction(db, {
        adminId: request.user!.id,
        action: 'content.balance.update',
        entity: 'balance_settings',
        entityId: id,
        before,
        after: parsed.data,
      });
      return parsed.data;
    } catch (err) {
      return sendContentError(reply, err);
    }
  });

  app.post('/api/admin/content/versions/:id/publish', async (request, reply) => {
    const { id } = idParams.parse(request.params);
    try {
      const { published, archivedId } = await publishDraft(db, id);
      content.invalidate();
      await logAdminAction(db, {
        adminId: request.user!.id,
        action: 'content.publish',
        entity: 'content_version',
        entityId: id,
        before: { publishedId: archivedId },
        after: { publishedId: published.id },
      });
      await onContentPublished?.().catch((err: unknown) =>
        request.log.error(err, 'Instantané du contenu'),
      );
      return versionDto(published);
    } catch (err) {
      return sendContentError(reply, err);
    }
  });

  app.delete('/api/admin/content/versions/:id', async (request, reply) => {
    const { id } = idParams.parse(request.params);
    try {
      const version = await getContentVersion(db, id);
      await discardDraft(db, id);
      await logAdminAction(db, {
        adminId: request.user!.id,
        action: 'content.draft.discard',
        entity: 'content_version',
        entityId: id,
        before: version ? { label: version.label } : null,
      });
      return reply.code(204).send();
    } catch (err) {
      return sendContentError(reply, err);
    }
  });

  /** Télémétrie d'équilibrage : temps de complétion et goulets (contenu publié). */
  app.get('/api/admin/telemetry', async (request): Promise<TelemetryResponse> => {
    const { days } = telemetryQuerySchema.parse(request.query);
    return telemetry(db, await content.get(), days, now());
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
