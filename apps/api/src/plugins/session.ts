import type { FastifyReply, FastifyRequest } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { eq } from 'drizzle-orm';
import { users } from '@poke/db';
import type { Db } from '@poke/db';
import type { UserRole } from '@poke/shared';
import { deletedUserIds } from '../auth';
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

/** Rattrapage du temps écoulé pour un joueur (voir `PlayerSettler`). */
export interface Settler {
  settle(userId: string, scope?: 'balls' | 'all'): Promise<void>;
  invalidate(userId: string): void;
}

/**
 * `settler` : rattrapage du temps écoulé pour le joueur (combats terminés, places fermées, Balls
 * des expéditions en cours…), avant chaque requête de jeu. Un échec ne bloque pas la requête : le
 * prochain passage reprendra.
 */
export function sessionHooks(auth: Auth, db: Db, now: () => Date, settler?: Settler) {
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

  /**
   * `withProfile` : applique le profil secondaire actif (bêta), jamais pour l'administration, qui
   * relit aussi la session en base (un rôle retiré ou une session révoquée agit tout de suite).
   */
  const loadUser = async (
    request: FastifyRequest,
    reply: FastifyReply,
    withProfile: boolean,
  ): Promise<SessionUser | null> => {
    // Les en-têtes renvoyés portent le cookie de session rafraîchi : sans eux, le cache de 5 min
    // ne serait jamais renouvelé et chaque requête retournerait à la base.
    const { headers, response: session } = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
      query: withProfile ? undefined : { disableCookieCache: true },
      returnHeaders: true,
    });
    if (!session || deletedUserIds.has(session.user.id)) return null;
    for (const cookie of headers.getSetCookie()) reply.header('set-cookie', cookie);
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
    /**
     * Rattrapage complet (combat ou donjon terminé, places fermées), pour les lectures et départs
     * qui en dépendent. Les requêtes ne rattrapent d'office que les Balls.
     */
    settleAll(userId: string) {
      return settler?.settle(userId, 'all');
    },
    /** Une action vient de créer de quoi rattraper (départ d'expédition) : revérifier au prochain appel. */
    invalidateSettle(userId: string) {
      settler?.invalidate(userId);
    },
    /** Exige une session valide. */
    async requireUser(request: FastifyRequest, reply: FastifyReply) {
      request.user = await loadUser(request, reply, true);
      if (!request.user) return reply.code(401).send({ error: 'UNAUTHENTICATED' });
      await settler?.settle(request.user.id).catch((err: unknown) => request.log.warn({ err }));
    },
    /** Exige une session valide ET le rôle admin (vérifié côté serveur, à chaque requête). */
    async requireAdmin(request: FastifyRequest, reply: FastifyReply) {
      request.user = await loadUser(request, reply, false);
      if (!request.user) return reply.code(401).send({ error: 'UNAUTHENTICATED' });
      if (request.user.role !== 'admin') return reply.code(403).send({ error: 'FORBIDDEN' });
    },
  };
}
