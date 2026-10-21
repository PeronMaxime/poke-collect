import type { FastifyReply, FastifyRequest } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { eq } from 'drizzle-orm';
import { users } from '@poke/db';
import type { Db } from '@poke/db';
import type { UserRole } from '@poke/shared';
import type { Auth } from '../auth';
import { activeProfileId } from '../beta-profiles';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  /** Compte connecté ; diffère de `id` quand un profil secondaire (bêta) est actif. */
  accountUserId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
  }
}

/** Intervalle minimal entre deux enregistrements de présence d'un même utilisateur. */
const PRESENCE_THROTTLE_MS = 60_000;

export function sessionHooks(auth: Auth, db: Db, now: () => Date) {
  const lastWrites = new Map<string, number>();
  /** Présence : `last_seen_at` mis à jour au plus une fois par minute et par utilisateur. */
  const touch = async (userId: string) => {
    const at = now();
    if (at.getTime() - (lastWrites.get(userId) ?? 0) < PRESENCE_THROTTLE_MS) return;
    lastWrites.set(userId, at.getTime());
    await db
      .update(users)
      .set({ lastSeenAt: at })
      .where(eq(users.id, userId))
      .catch(() => lastWrites.delete(userId));
  };

  /** `withProfile` : applique le profil secondaire actif (bêta), jamais pour l'administration. */
  const loadUser = async (
    request: FastifyRequest,
    withProfile: boolean,
  ): Promise<SessionUser | null> => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) return null;
    const { id, email, name, role } = session.user;
    await touch(id);
    const profile = withProfile ? await activeProfileId(db, request, id) : null;
    if (profile) {
      await touch(profile.id);
      return { id: profile.id, email, name: profile.name, role: 'player', accountUserId: id };
    }
    return { id, email, name, role: role === 'admin' ? 'admin' : 'player', accountUserId: id };
  };

  return {
    /** Exige une session valide. */
    async requireUser(request: FastifyRequest, reply: FastifyReply) {
      request.user = await loadUser(request, true);
      if (!request.user) return reply.code(401).send({ error: 'UNAUTHENTICATED' });
    },
    /** Exige une session valide ET le rôle admin (vérifié côté serveur, à chaque requête). */
    async requireAdmin(request: FastifyRequest, reply: FastifyReply) {
      request.user = await loadUser(request, false);
      if (!request.user) return reply.code(401).send({ error: 'UNAUTHENTICATED' });
      if (request.user.role !== 'admin') return reply.code(403).send({ error: 'FORBIDDEN' });
    },
  };
}
