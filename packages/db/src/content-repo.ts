import { and, asc, desc, eq } from 'drizzle-orm';
import {
  collectionSchema,
  contentIssues,
  dexMilestoneSchema,
  evolutionOverrideSchema,
  findUsages,
  gameContentSchema,
  gameContentStructureSchema,
  itemSchema,
  lootTableSchema,
  questSchema,
  regionSchema,
  shopCategorySchema,
  shopEntrySchema,
  speciesOverrideSchema,
  trainerSchema,
  zoneSchema,
} from '@poke/content';
import type {
  BalanceSettings,
  Collection,
  ContentIssue,
  DexMilestone,
  EvolutionOverride,
  GameContent,
  GameContentData,
  Item,
  LootTable,
  Quest,
  Region,
  ShopCategory,
  ShopEntry,
  SpeciesOverride,
  Trainer,
  Zone,
} from '@poke/content';
import type { z } from 'zod';
import type { Db } from './client';
import {
  balanceSettings,
  collections,
  contentVersions,
  dexMilestones,
  evolutionOverrides,
  items,
  lootTables,
  quests,
  regions,
  shopCategories,
  shopEntries,
  speciesOverrides,
  trainers,
  versionedContentTables,
  zones,
} from './schema';

export type ContentVersion = typeof contentVersions.$inferSelect;

export type ContentErrorCode =
  | 'NOT_FOUND'
  | 'NO_PUBLISHED_VERSION'
  | 'DRAFT_EXISTS'
  | 'NOT_A_DRAFT'
  | 'INVALID_CONTENT'
  | 'ALREADY_EXISTS'
  | 'IN_USE';

export class ContentError extends Error {
  constructor(
    readonly code: ContentErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ContentError';
  }
}

export async function listContentVersions(db: Db): Promise<ContentVersion[]> {
  return db.select().from(contentVersions).orderBy(desc(contentVersions.id));
}

export async function getContentVersion(db: Db, id: number): Promise<ContentVersion | undefined> {
  const [row] = await db.select().from(contentVersions).where(eq(contentVersions.id, id));
  return row;
}

async function findByStatus(db: Db, status: 'draft' | 'published') {
  const [row] = await db.select().from(contentVersions).where(eq(contentVersions.status, status));
  return row;
}

export const getPublishedVersion = (db: Db) => findByStatus(db, 'published');
export const getDraftVersion = (db: Db) => findByStatus(db, 'draft');

// --- Entités de contenu (hors équilibrage) -------------------------------------------

/**
 * Tables d'entités : les colonnes portent les noms des champs Zod, une ligne = l'entité
 * + `contentVersionId`. Ajouter ici toute nouvelle entité éditable dans l'admin.
 */
const entityDefs = {
  region: { table: regions, key: 'id', schema: regionSchema, order: regions.order },
  speciesOverride: {
    table: speciesOverrides,
    key: 'speciesId',
    schema: speciesOverrideSchema,
    order: speciesOverrides.speciesId,
  },
  item: { table: items, key: 'id', schema: itemSchema, order: items.id },
  lootTable: { table: lootTables, key: 'id', schema: lootTableSchema, order: lootTables.id },
  zone: { table: zones, key: 'id', schema: zoneSchema, order: zones.order },
  trainer: { table: trainers, key: 'id', schema: trainerSchema, order: trainers.order },
  shopCategory: {
    table: shopCategories,
    key: 'id',
    schema: shopCategorySchema,
    order: shopCategories.order,
  },
  shopEntry: { table: shopEntries, key: 'id', schema: shopEntrySchema, order: shopEntries.order },
  evolutionOverride: {
    table: evolutionOverrides,
    key: 'id',
    schema: evolutionOverrideSchema,
    order: evolutionOverrides.fromSpeciesId,
  },
  dexMilestone: {
    table: dexMilestones,
    key: 'id',
    schema: dexMilestoneSchema,
    order: dexMilestones.order,
  },
  collection: { table: collections, key: 'id', schema: collectionSchema, order: collections.order },
  quest: { table: quests, key: 'id', schema: questSchema, order: quests.order },
} as const;

export type ContentEntityType = keyof typeof entityDefs;

export interface ContentEntityMap {
  region: Region;
  speciesOverride: SpeciesOverride;
  item: Item;
  lootTable: LootTable;
  zone: Zone;
  trainer: Trainer;
  shopCategory: ShopCategory;
  shopEntry: ShopEntry;
  evolutionOverride: EvolutionOverride;
  dexMilestone: DexMilestone;
  collection: Collection;
  quest: Quest;
}

/** Collection de `GameContentData` correspondant à chaque type d'entité. */
const collectionOf = {
  region: 'regions',
  speciesOverride: 'speciesOverrides',
  item: 'items',
  lootTable: 'lootTables',
  zone: 'zones',
  trainer: 'trainers',
  shopCategory: 'shopCategories',
  shopEntry: 'shopEntries',
  evolutionOverride: 'evolutionOverrides',
  dexMilestone: 'dexMilestones',
  collection: 'collections',
  quest: 'quests',
} as const satisfies Record<ContentEntityType, keyof GameContentData>;

export const contentEntitySchemas: { [K in ContentEntityType]: z.ZodType<ContentEntityMap[K]> } = {
  region: regionSchema,
  speciesOverride: speciesOverrideSchema,
  item: itemSchema,
  lootTable: lootTableSchema,
  zone: zoneSchema,
  trainer: trainerSchema,
  shopCategory: shopCategorySchema,
  shopEntry: shopEntrySchema,
  evolutionOverride: evolutionOverrideSchema,
  dexMilestone: dexMilestoneSchema,
  collection: collectionSchema,
  quest: questSchema,
};

type AnyRow = Record<string, unknown>;

async function selectEntities(db: Db, type: ContentEntityType, versionId: number) {
  const def = entityDefs[type];
  const rows = (await db
    .select()
    .from(def.table)
    .where(eq(def.table.contentVersionId, versionId))
    .orderBy(asc(def.order))) as AnyRow[];
  return rows.map(({ contentVersionId: _, ...entity }) => entity);
}

function keyCondition(type: ContentEntityType, versionId: number, key: string | number) {
  const def = entityDefs[type];
  const keyColumn = (def.table as unknown as Record<string, Parameters<typeof eq>[0]>)[def.key]!;
  return and(eq(def.table.contentVersionId, versionId), eq(keyColumn, key));
}

// --- Chargement ------------------------------------------------------------------------

async function readContent(db: Db, versionId: number): Promise<unknown> {
  const [balanceRow] = await db
    .select()
    .from(balanceSettings)
    .where(eq(balanceSettings.contentVersionId, versionId));
  const data: Record<string, unknown> = { balance: balanceRow?.data };
  for (const type of Object.keys(entityDefs) as ContentEntityType[]) {
    data[collectionOf[type]] = await selectEntities(db, type, versionId);
  }
  return data;
}

/**
 * Charge et valide (Zod) le contenu complet d'une version.
 * `strict` vérifie aussi les références croisées (exigé pour publier).
 */
export async function loadContent(
  db: Db,
  versionId: number,
  { strict = false }: { strict?: boolean } = {},
): Promise<GameContent> {
  const schema = strict ? gameContentSchema : gameContentStructureSchema;
  const parsed = schema.safeParse(await readContent(db, versionId));
  if (!parsed.success) {
    throw new ContentError(
      'INVALID_CONTENT',
      `Contenu invalide pour la version ${versionId}`,
      parsed.error.issues,
    );
  }
  return { versionId, ...parsed.data };
}

/** Contenu d'une version + alertes de cohérence (pour l'admin). */
export async function loadContentWithIssues(
  db: Db,
  versionId: number,
): Promise<{ content: GameContent; issues: ContentIssue[] }> {
  const content = await loadContent(db, versionId);
  return { content, issues: contentIssues(content) };
}

export async function loadPublishedContent(db: Db): Promise<GameContent> {
  const published = await getPublishedVersion(db);
  if (!published) throw new ContentError('NO_PUBLISHED_VERSION', 'Aucune version publiée');
  return loadContent(db, published.id);
}

async function insertContent(db: Db, versionId: number, content: GameContentData) {
  await db.insert(balanceSettings).values({ contentVersionId: versionId, data: content.balance });
  for (const type of Object.keys(entityDefs) as ContentEntityType[]) {
    const list = content[collectionOf[type]] as object[];
    if (list.length === 0) continue;
    const { table } = entityDefs[type];
    await db
      .insert(table)
      .values(list.map((e) => ({ ...e, contentVersionId: versionId })) as never);
  }
}

/**
 * Au premier lancement, importe le contenu de test comme version 1 publiée.
 * Ne fait rien si une version existe déjà. Retourne vrai si le seed a été importé.
 */
export async function ensureSeedContent(db: Db, seed: GameContentData): Promise<boolean> {
  const data = gameContentSchema.parse(seed);
  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: contentVersions.id }).from(contentVersions).limit(1);
    if (existing) return false;
    const [version] = await tx
      .insert(contentVersions)
      .values({ status: 'published', label: 'Contenu de test (seed)', publishedAt: new Date() })
      .returning();
    await insertContent(tx, version!.id, data);
    return true;
  });
}

async function assertNoDraft(db: Db) {
  if (await getDraftVersion(db)) {
    throw new ContentError('DRAFT_EXISTS', 'Un brouillon existe déjà : publiez-le ou supprimez-le');
  }
}

/**
 * Crée un brouillon en copiant une version existante (la version publiée par défaut).
 * Copier une version archivée puis la publier permet de revenir en arrière.
 */
export async function createDraft(
  db: Db,
  { label, basedOnId, createdBy }: { label: string; basedOnId?: number; createdBy: string | null },
): Promise<ContentVersion> {
  return db.transaction(async (tx) => {
    await assertNoDraft(tx);
    const base = basedOnId ? await getContentVersion(tx, basedOnId) : await getPublishedVersion(tx);
    if (!base) {
      throw new ContentError(
        'NOT_FOUND',
        `Version de départ introuvable (${basedOnId ?? 'publiée'})`,
      );
    }

    const [draft] = await tx
      .insert(contentVersions)
      .values({ status: 'draft', label, basedOnId: base.id, createdBy })
      .returning();

    for (const table of versionedContentTables) {
      const rows = await tx.select().from(table).where(eq(table.contentVersionId, base.id));
      if (rows.length === 0) continue;
      // Chaque table versionnée a une colonne content_version_id : on ne change que celle-ci.
      const copies = rows.map((r) => ({ ...r, contentVersionId: draft!.id }));
      await tx.insert(table).values(copies as (typeof table.$inferInsert)[]);
    }
    return draft!;
  });
}

/** Crée un brouillon à partir d'un contenu complet (import JSON, contenu de test). */
export async function importContentAsDraft(
  db: Db,
  data: unknown,
  { label, createdBy }: { label: string; createdBy: string | null },
): Promise<ContentVersion> {
  const parsed = gameContentStructureSchema.safeParse(data);
  if (!parsed.success) {
    throw new ContentError('INVALID_CONTENT', 'Contenu importé invalide', parsed.error.issues);
  }
  return db.transaction(async (tx) => {
    await assertNoDraft(tx);
    const published = await getPublishedVersion(tx);
    const [draft] = await tx
      .insert(contentVersions)
      .values({ status: 'draft', label, basedOnId: published?.id ?? null, createdBy })
      .returning();
    await insertContent(tx, draft!.id, parsed.data);
    return draft!;
  });
}

async function requireDraft(db: Db, versionId: number): Promise<ContentVersion> {
  const version = await getContentVersion(db, versionId);
  if (!version) throw new ContentError('NOT_FOUND', `Version ${versionId} introuvable`);
  if (version.status !== 'draft') {
    throw new ContentError('NOT_A_DRAFT', `La version ${versionId} n'est pas un brouillon`);
  }
  return version;
}

/** Remplace les réglages d'équilibrage d'un brouillon. Retourne l'ancienne valeur. */
export async function updateDraftBalance(
  db: Db,
  versionId: number,
  data: BalanceSettings,
): Promise<{ before: BalanceSettings | undefined }> {
  return db.transaction(async (tx) => {
    await requireDraft(tx, versionId);
    const [before] = await tx
      .select()
      .from(balanceSettings)
      .where(eq(balanceSettings.contentVersionId, versionId));
    await tx
      .insert(balanceSettings)
      .values({ contentVersionId: versionId, data })
      .onConflictDoUpdate({ target: balanceSettings.contentVersionId, set: { data } });
    return { before: before?.data };
  });
}

function entityKey<K extends ContentEntityType>(type: K, entity: ContentEntityMap[K]) {
  return (entity as unknown as Record<string, string | number>)[entityDefs[type].key]!;
}

/**
 * Crée (`mode: 'create'`) ou remplace (`mode: 'update'`) une entité d'un brouillon.
 * L'identifiant n'est jamais modifié : pour renommer, dupliquer puis supprimer.
 */
export async function saveDraftEntity<K extends ContentEntityType>(
  db: Db,
  versionId: number,
  type: K,
  entity: ContentEntityMap[K],
  mode: 'create' | 'update',
): Promise<{ before: ContentEntityMap[K] | undefined }> {
  const def = entityDefs[type];
  const key = entityKey(type, entity);
  return db.transaction(async (tx) => {
    await requireDraft(tx, versionId);
    const [existing] = (await tx
      .select()
      .from(def.table)
      .where(keyCondition(type, versionId, key))) as AnyRow[];
    if (mode === 'create' && existing) {
      throw new ContentError('ALREADY_EXISTS', `« ${key} » existe déjà`);
    }
    if (mode === 'update' && !existing) {
      throw new ContentError('NOT_FOUND', `« ${key} » introuvable dans le brouillon`);
    }
    if (existing) await tx.delete(def.table).where(keyCondition(type, versionId, key));
    await tx.insert(def.table).values({ ...entity, contentVersionId: versionId } as never);
    if (!existing) return { before: undefined };
    const { contentVersionId: _, ...before } = existing;
    return { before: before as unknown as ContentEntityMap[K] };
  });
}

/** Supprime une entité d'un brouillon, sauf si elle est encore utilisée ailleurs. */
export async function deleteDraftEntity(
  db: Db,
  versionId: number,
  type: ContentEntityType,
  key: string | number,
): Promise<{ before: unknown }> {
  const def = entityDefs[type];
  return db.transaction(async (tx) => {
    await requireDraft(tx, versionId);
    const content = await loadContent(tx, versionId);
    const usages = findUsages(content, type, key);
    if (usages.length > 0) {
      throw new ContentError('IN_USE', `« ${key} » est encore utilisé`, usages);
    }
    const deleted = (await tx
      .delete(def.table)
      .where(keyCondition(type, versionId, key))
      .returning()) as AnyRow[];
    if (deleted.length === 0) throw new ContentError('NOT_FOUND', `« ${key} » introuvable`);
    const { contentVersionId: _, ...before } = deleted[0]!;
    return { before };
  });
}

/** Publie le brouillon (après validation complète) et archive la version publiée précédente. */
export async function publishDraft(
  db: Db,
  versionId: number,
): Promise<{ published: ContentVersion; archivedId: number | null }> {
  return db.transaction(async (tx) => {
    await requireDraft(tx, versionId);
    await loadContent(tx, versionId, { strict: true }); // lève INVALID_CONTENT si incohérent

    const previous = await getPublishedVersion(tx);
    if (previous) {
      await tx
        .update(contentVersions)
        .set({ status: 'archived' })
        .where(eq(contentVersions.id, previous.id));
    }
    const [published] = await tx
      .update(contentVersions)
      .set({ status: 'published', publishedAt: new Date() })
      .where(eq(contentVersions.id, versionId))
      .returning();
    return { published: published!, archivedId: previous?.id ?? null };
  });
}

/** Supprime un brouillon et tout son contenu (cascade). */
export async function discardDraft(db: Db, versionId: number): Promise<void> {
  await db.transaction(async (tx) => {
    await requireDraft(tx, versionId);
    await tx.delete(contentVersions).where(eq(contentVersions.id, versionId));
  });
}
