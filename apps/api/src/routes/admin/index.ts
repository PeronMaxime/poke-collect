import type { FastifyInstance } from 'fastify';
import type { AdminDeps } from './admin-deps';
import { adminContentRoutes } from './content';
import { adminModerationRoutes } from './moderation';
import { adminPlayerRoutes } from './players';
import { adminSupervisionRoutes } from './supervision';

/**
 * Routes /api/admin/* : le contrôle du rôle admin, puis les quatre groupes (contenu, joueurs,
 * modération, supervision).
 */

/** Routes /api/admin/* : toutes réservées au rôle admin, toutes les écritures sont journalisées. */
export async function adminRoutes(app: FastifyInstance, deps: AdminDeps) {
  app.addHook('preHandler', deps.hooks.requireAdmin);

  app.get('/api/admin/me', async (request) => ({ user: request.user }));

  adminContentRoutes(app, deps);
  adminPlayerRoutes(app, deps);
  adminModerationRoutes(app, deps);
  adminSupervisionRoutes(app, deps);
}
