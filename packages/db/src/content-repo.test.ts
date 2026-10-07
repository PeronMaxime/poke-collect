import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedContent } from '@poke/content';
import { createDb } from './client';
import {
  ContentError,
  createDraft,
  deleteDraftEntity,
  discardDraft,
  ensureSeedContent,
  getDraftVersion,
  listContentVersions,
  loadContent,
  loadPublishedContent,
  importContentAsDraft,
  loadContentWithIssues,
  publishDraft,
  saveDraftEntity,
  updateDraftBalance,
} from './content-repo';
import { listAuditLog, logAdminAction } from './audit';

const handle = createDb({ pgliteDataDir: 'memory://' });
const { db } = handle;

beforeAll(async () => {
  await handle.migrate();
});
afterAll(async () => {
  await handle.close();
});

describe('contenu versionné', () => {
  it('importe le seed une seule fois, comme version publiée', async () => {
    expect(await ensureSeedContent(db, seedContent)).toBe(true);
    expect(await ensureSeedContent(db, seedContent)).toBe(false);

    const content = await loadPublishedContent(db);
    expect(content.versionId).toBe(1);
    expect(content.balance).toEqual(seedContent.balance);
    expect(content.regions.map((r) => r.id)).toEqual(['kanto']);
    expect(content.zones.map((z) => z.id)).toEqual(seedContent.zones.map((z) => z.id));
    expect(content.items).toHaveLength(seedContent.items.length);
    expect(content.lootTables).toHaveLength(seedContent.lootTables.length);
  });

  it('crée un brouillon copié de la version publiée, sans toucher au publié', async () => {
    const draft = await createDraft(db, { label: 'Taux shiny x2', createdBy: null });
    expect(draft.status).toBe('draft');
    expect(draft.basedOnId).toBe(1);

    const balance = structuredClone(seedContent.balance);
    balance.shiny.baseRateDenominator = 2048;
    const { before } = await updateDraftBalance(db, draft.id, balance);
    expect(before?.shiny.baseRateDenominator).toBe(4096);

    expect((await loadContent(db, draft.id)).balance.shiny.baseRateDenominator).toBe(2048);
    expect((await loadPublishedContent(db)).balance.shiny.baseRateDenominator).toBe(4096);
    expect((await loadContent(db, draft.id)).regions).toHaveLength(1);
    expect((await loadContent(db, draft.id)).zones).toHaveLength(seedContent.zones.length);
  });

  it('crée, modifie et supprime des entités du brouillon', async () => {
    const draft = (await getDraftVersion(db))!;
    const zone = { ...seedContent.zones[0]!, id: 'route-2', name: 'Route 2' };
    await saveDraftEntity(db, draft.id, 'zone', zone, 'create');
    await expect(saveDraftEntity(db, draft.id, 'zone', zone, 'create')).rejects.toMatchObject({
      code: 'ALREADY_EXISTS',
    });
    const { before } = await saveDraftEntity(
      db,
      draft.id,
      'zone',
      { ...zone, minPower: 50 },
      'update',
    );
    expect(before?.minPower).toBe(0);
    const content = await loadContent(db, draft.id);
    expect(content.zones.find((z) => z.id === 'route-2')?.minPower).toBe(50);

    await deleteDraftEntity(db, draft.id, 'zone', 'route-2');
    expect((await loadContent(db, draft.id)).zones.some((z) => z.id === 'route-2')).toBe(false);
  });

  it('refuse de supprimer une entité encore utilisée', async () => {
    const draft = (await getDraftVersion(db))!;
    const err = await deleteDraftEntity(db, draft.id, 'item', 'poke-ball').catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'IN_USE' });
    expect((err as ContentError).details).toContain('Équilibrage : inventaire de départ');
  });

  it('enregistre les articles de boutique à l’identique (limite, dates)', async () => {
    const draft = (await getDraftVersion(db))!;
    // Le brouillon a copié la boutique de la version publiée.
    expect((await loadContent(db, draft.id)).shopEntries).toHaveLength(
      seedContent.shopEntries.length,
    );
    const entry = {
      ...seedContent.shopEntries[0]!,
      id: 'poke-ball-promo',
      purchaseLimit: { lots: 2, period: 'day' as const },
      availableFrom: '2026-12-01T00:00:00.000Z',
      availableUntil: '2026-12-26T00:00:00.000Z',
    };
    await saveDraftEntity(db, draft.id, 'shopEntry', entry, 'create');
    const content = await loadContent(db, draft.id);
    expect(content.shopEntries.find((e) => e.id === 'poke-ball-promo')).toEqual(entry);
    const err = await deleteDraftEntity(db, draft.id, 'shopCategory', 'balls').catch(
      (e: unknown) => e,
    );
    expect(err).toMatchObject({ code: 'IN_USE' });
    await deleteDraftEntity(db, draft.id, 'shopEntry', 'poke-ball-promo');
  });

  it('signale les incohérences sans bloquer l’édition, mais bloque la publication', async () => {
    const draft = (await getDraftVersion(db))!;
    const zone = { ...seedContent.zones[0]!, lootTableId: 'inexistante' };
    await saveDraftEntity(db, draft.id, 'zone', zone, 'update');
    const { issues } = await loadContentWithIssues(db, draft.id);
    expect(issues).toContainEqual(
      expect.objectContaining({ severity: 'error', entityId: 'route-1' }),
    );
    await expect(publishDraft(db, draft.id)).rejects.toMatchObject({ code: 'INVALID_CONTENT' });
    await saveDraftEntity(db, draft.id, 'zone', seedContent.zones[0]!, 'update');
  });

  it('refuse un deuxième brouillon', async () => {
    await expect(createDraft(db, { label: 'x', createdBy: null })).rejects.toMatchObject({
      code: 'DRAFT_EXISTS',
    });
  });

  it('publie le brouillon et archive l’ancienne version', async () => {
    const draft = (await getDraftVersion(db))!;
    const { published, archivedId } = await publishDraft(db, draft.id);
    expect(published.status).toBe('published');
    expect(archivedId).toBe(1);
    expect((await loadPublishedContent(db)).balance.shiny.baseRateDenominator).toBe(2048);

    const statuses = (await listContentVersions(db)).map((v) => [v.id, v.status]);
    expect(statuses).toEqual([
      [2, 'published'],
      [1, 'archived'],
    ]);
  });

  it('permet un retour arrière via un brouillon basé sur une version archivée', async () => {
    const rollback = await createDraft(db, { label: 'Retour v1', basedOnId: 1, createdBy: null });
    await publishDraft(db, rollback.id);
    expect((await loadPublishedContent(db)).balance.shiny.baseRateDenominator).toBe(4096);
  });

  it('refuse de modifier une version qui n’est pas un brouillon', async () => {
    const err = await updateDraftBalance(db, 1, seedContent.balance).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ContentError);
    expect((err as ContentError).code).toBe('NOT_A_DRAFT');
  });

  it('supprime un brouillon', async () => {
    const draft = await createDraft(db, { label: 'À jeter', createdBy: null });
    await discardDraft(db, draft.id);
    expect(await getDraftVersion(db)).toBeUndefined();
  });

  it('importe un contenu complet comme brouillon', async () => {
    await expect(
      importContentAsDraft(db, { balance: {} }, { label: 'cassé', createdBy: null }),
    ).rejects.toMatchObject({ code: 'INVALID_CONTENT' });
    const content = structuredClone(seedContent);
    content.zones = content.zones.slice(0, 1);
    const draft = await importContentAsDraft(db, content, { label: 'Import', createdBy: null });
    expect((await loadContent(db, draft.id)).zones).toHaveLength(1);
    await discardDraft(db, draft.id);
  });
});

describe('journal d’administration', () => {
  it('enregistre et pagine les actions', async () => {
    for (let i = 0; i < 3; i++) {
      await logAdminAction(db, {
        adminId: null,
        action: 'test',
        entity: 'demo',
        entityId: i,
        after: { i },
      });
    }
    const page1 = await listAuditLog(db, { limit: 2 });
    expect(page1.items.map((e) => e.entityId)).toEqual(['2', '1']);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await listAuditLog(db, { limit: 2, cursor: page1.nextCursor! });
    expect(page2.items.map((e) => e.entityId)).toEqual(['0']);
    expect(page2.nextCursor).toBeNull();
  });
});
