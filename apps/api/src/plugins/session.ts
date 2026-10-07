import type { FastifyReply, FastifyRequest } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import type { UserRole } from '@poke/shared';
import type { Auth } from '../auth';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
  }
}

export function sessionHooks(auth: Auth) {
  const loadUser = async (request: FastifyRequest): Promise<SessionUser | null> => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) return null;
    const { id, email, name, role } = session.user;
    return { id, email, name, role: role === 'admin' ? 'admin' : 'player' };
  };

  return {
    /** Exige une session valide. */
    async requireUser(request: FastifyRequest, reply: FastifyReply) {
      request.user = await loadUser(request);
      if (!request.user) return reply.code(401).send({ error: 'UNAUTHENTICATED' });
    },
    /** Exige une session valide ET le rôle admin (vérifié côté serveur, à chaque requête). */
    async requireAdmin(request: FastifyRequest, reply: FastifyReply) {
      request.user = await loadUser(request);
      if (!request.user) return reply.code(401).send({ error: 'UNAUTHENTICATED' });
      if (request.user.role !== 'admin') return reply.code(403).send({ error: 'FORBIDDEN' });
    },
  };
}
