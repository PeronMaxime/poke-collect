import type { FastifyInstance } from 'fastify';
import type { AdminDeps } from './admin-deps';
import { adminContentRoutes } from './content';
import { adminPlayerRoutes } from './players';
import { adminSupervisionRoutes } from './supervision';

/**
 * Routes /api/admin/* : le contrôle du rôle admin, puis les trois groupes (contenu, joueurs,
 * supervision).
 */

/** Routes /api/admin/* : toutes réservées au rôle admin, toutes les écritures sont journalisées. */
export async function adminRoutes(app: FastifyInstance, deps: AdminDeps) {
  app.addHook('preHandler', deps.hooks.requireAdmin);

  app.get('/api/admin/me', async (request) => ({ user: request.user }));

  adminContentRoutes(app, deps);
  adminPlayerRoutes(app, deps);
  adminSupervisionRoutes(app, deps);
}
