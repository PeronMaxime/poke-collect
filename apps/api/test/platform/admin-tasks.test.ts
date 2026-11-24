import { describe, expect, it } from 'vitest';
import type { AdminTaskDto, AuditLogEntryDto, Paginated } from '@poke/shared';
import { testApi } from '../support/api';

/**
 * Tâches de suivi de l'admin (`/api/admin/tasks`, page « À faire ») : liste de départ de la
 * migration, ajout, cochage, modification, suppression, journal ; réservées aux administrateurs.
 */

const api = testApi({ start: '2026-11-24T10:00:00Z' });

async function admin(email: string) {
  const { cookie, userId } = await api.signUp(email);
  return (await api.promoteAdmin(userId, cookie)).call;
}

describe('tâches de suivi', () => {
  it('la liste de départ est là, en cours d’abord, sans date puis par date', async () => {
    const call = await admin('suivi@example.com');
    const { status, body } = await call<AdminTaskDto[]>('GET', '/api/admin/tasks');
    expect(status).toBe(200);
    expect(body.length).toBeGreaterThan(10);
    expect(body.every((t) => t.doneAt === null)).toBe(true);
    const dated = body.map((t) => t.dueOn).filter((d) => d !== null);
    expect(dated).toEqual([...dated].sort());
    expect(body.findIndex((t) => t.dueOn !== null)).toBeGreaterThan(
      body.findLastIndex((t) => t.dueOn === null),
    );
  });

  it('ajoute, coche, rouvre, modifie et supprime une tâche, chaque fois journalisée', async () => {
    const call = await admin('chen-suivi@example.com');
    const created = await call<AdminTaskDto>('POST', '/api/admin/tasks', {
      kind: 'watch',
      title: '  Surveiller les inscriptions  ',
      dueOn: '2026-12-15',
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      kind: 'watch',
      title: 'Surveiller les inscriptions',
      details: '',
      dueOn: '2026-12-15',
      doneAt: null,
    });
    const url = `/api/admin/tasks/${created.body.id}`;

    api.advance(60);
    const done = await call<AdminTaskDto>('PATCH', url, { done: true });
    // Seuls les champs donnés changent : la date reste.
    expect(done.body).toMatchObject({ doneAt: '2026-11-24T11:00:00.000Z', dueOn: '2026-12-15' });
    // Recocher garde la date ; modifier le texte d'une tâche faite aussi.
    api.advance(60);
    const again = await call<AdminTaskDto>('PATCH', url, {
      done: true,
      details: 'Ligne 1\nLigne 2',
    });
    expect(again.body).toMatchObject({
      doneAt: '2026-11-24T11:00:00.000Z',
      details: 'Ligne 1\nLigne 2',
    });
    const list = await call<AdminTaskDto[]>('GET', '/api/admin/tasks');
    expect(list.body.at(-1)!.id).toBe(created.body.id);

    const reopened = await call<AdminTaskDto>('PATCH', url, { done: false, dueOn: null });
    expect(reopened.body).toMatchObject({ doneAt: null, dueOn: null });

    expect((await call('DELETE', url)).status).toBe(204);
    expect((await call('DELETE', url)).status).toBe(404);
    expect((await call('PATCH', url, { done: true })).status).toBe(404);

    const log = await call<Paginated<AuditLogEntryDto>>('GET', '/api/admin/audit-log');
    const actions = log.body.items
      .filter((e) => e.entityId === created.body.id)
      .map((e) => e.action);
    expect(actions).toEqual([
      'task.delete',
      'task.update',
      'task.update',
      'task.update',
      'task.create',
    ]);
  });

  it('refuse un titre vide, une date mal formée et une modification vide', async () => {
    const call = await admin('orme-suivi@example.com');
    const bad = [
      { kind: 'todo', title: '   ' },
      { kind: 'todo', title: 'Date', dueOn: '01/12/2026' },
      { kind: 'autre', title: 'Sorte' },
    ];
    for (const body of bad) {
      expect((await call('POST', '/api/admin/tasks', body)).status).toBe(400);
    }
    const [first] = (await call<AdminTaskDto[]>('GET', '/api/admin/tasks')).body;
    expect((await call('PATCH', `/api/admin/tasks/${first!.id}`, {})).status).toBe(400);
  });

  it('est réservée aux administrateurs', async () => {
    const { call } = await api.newPlayer('joueur-suivi@example.com', 'JoueurSuivi');
    expect((await call('GET', '/api/admin/tasks')).status).toBe(403);
    expect((await call('POST', '/api/admin/tasks', { kind: 'todo', title: 'x' })).status).toBe(403);
  });
});
