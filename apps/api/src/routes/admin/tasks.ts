import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { logAdminAction } from '@poke/db';
import { adminTaskInputSchema, adminTaskUpdateSchema } from '@poke/shared';
import type { AdminTaskDto } from '@poke/shared';
import {
  createAdminTask,
  deleteAdminTask,
  listAdminTasks,
  updateAdminTask,
} from '../../game/admin-tasks';
import { currentUserId } from '../deps';
import type { AdminDeps } from './admin-deps';

/**
 * Tâches de suivi (`/api/admin/tasks`, page « À faire ») : ce qu'il reste à faire ou à surveiller.
 * Chaque écriture est journalisée (`admin_audit_log`, actions `task.*`).
 */

const taskParams = z.object({ taskId: z.uuid() });

/** Routes des tâches de suivi ; le contrôle du rôle admin est posé par `adminRoutes`. */
export function adminTaskRoutes(app: FastifyInstance, { db, now }: AdminDeps) {
  app.get('/api/admin/tasks', async (): Promise<AdminTaskDto[]> => listAdminTasks(db));

  app.post('/api/admin/tasks', async (request, reply) => {
    const input = adminTaskInputSchema.parse(request.body);
    const task = await createAdminTask(db, input, currentUserId(request), now());
    await logAdminAction(db, {
      adminId: currentUserId(request),
      action: 'task.create',
      entity: 'admin_task',
      entityId: task.id,
      after: task,
    });
    return reply.code(201).send(task satisfies AdminTaskDto);
  });

  app.patch('/api/admin/tasks/:taskId', async (request): Promise<AdminTaskDto> => {
    const { taskId } = taskParams.parse(request.params);
    const update = adminTaskUpdateSchema.parse(request.body);
    const { before, after } = await updateAdminTask(db, taskId, update, now());
    await logAdminAction(db, {
      adminId: currentUserId(request),
      action: 'task.update',
      entity: 'admin_task',
      entityId: taskId,
      before,
      after,
    });
    return after;
  });

  app.delete('/api/admin/tasks/:taskId', async (request, reply) => {
    const { taskId } = taskParams.parse(request.params);
    const before = await deleteAdminTask(db, taskId);
    await logAdminAction(db, {
      adminId: currentUserId(request),
      action: 'task.delete',
      entity: 'admin_task',
      entityId: taskId,
      before,
    });
    return reply.code(204).send();
  });
}
