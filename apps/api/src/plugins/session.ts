import type { FastifyReply, FastifyRequest } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { eq } from 'drizzle-orm';
import { users } from '@poke/db';
import type { Db } from '@poke/db';
import type { AccountSuspensionDto, UserRole } from '@poke/shared';
import type { Auth } from '../auth';
import { activeProfileId } from '../beta-profiles';
import { suspensionOf } from '../game/moderation';
import type { AccountStatusCache } from '../game/moderation';

/**
 * Contrôles de session des routes (`preHandler`) : qui appelle, a-t-il le droit, et rattrapage du
 * temps écoulé avant de lui répondre.
 */

/**
 * Le joueur (ou l'administrateur) d'une requête, posé sur `request.user` par les contrôles de
 * session.
 */
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
 * `accounts` : état des comptes (supprimé, suspendu), vérifié à chaque requête de jeu.
 * `settler` : rattrapage du temps écoulé pour le joueur (combats terminés, places fermées, Balls
 * des expéditions en cours…), avant chaque requête de jeu. Un échec ne bloque pas la requête : le
 * prochain passage reprendra.
 */
export function sessionHooks(
  auth: Auth,
  db: Db,
  now: () => Date,
  accounts: AccountStatusCache,
  settler?: Settler,
) {
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
   * `twoFactor` : second facteur activé sur le compte, et passé pour ouvrir cette session.
   */
  const loadSession = async (
    request: FastifyRequest,
    reply: FastifyReply,
    withProfile: boolean,
  ): Promise<{ user: SessionUser; twoFactor: { enabled: boolean; verified: boolean } } | null> => {
    // Les en-têtes renvoyés portent le cookie de session rafraîchi : sans eux, le cache de 5 min
    // ne serait jamais renouvelé et chaque requête retournerait à la base.
    const { headers, response: session } = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
      query: withProfile ? undefined : { disableCookieCache: true },
      returnHeaders: true,
    });
    if (!session) return null;
    for (const cookie of headers.getSetCookie()) reply.header('set-cookie', cookie);
    const { id, email, name, role } = session.user;
    const twoFactor = {
      enabled: session.user.twoFactorEnabled === true,
      verified: session.session.twoFactorVerified === true,
    };
    await touch(id);
    const profile = withProfile ? await activeProfileId(db, request, id) : null;
    if (profile) {
      await touch(profile.id);
      const user = { id: profile.id, email, name: profile.name, role: 'player' as const };
      return { user: { ...user, accountUserId: id }, twoFactor };
    }
    const user = {
      id,
      email,
      name,
      role: role === 'admin' ? ('admin' as const) : ('player' as const),
    };
    return { user: { ...user, accountUserId: id }, twoFactor };
  };

  /**
   * Ce qui ferme le jeu à ce joueur : compte ou profil supprimé (`deleted`), ou suspension en
   * cours du compte ou du profil ; null s'il peut jouer.
   */
  const accountBlock = async (
    user: SessionUser,
  ): Promise<'deleted' | AccountSuspensionDto | null> => {
    const ids = user.id === user.accountUserId ? [user.id] : [user.accountUserId, user.id];
    const statuses = await accounts.statuses(ids);
    if (statuses.some((s) => s === null)) return 'deleted';
    const at = now();
    for (const status of statuses) {
      const suspension = status && suspensionOf(status, at);
      if (suspension) return suspension;
    }
    return null;
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
    /**
     * Exige une session valide, d'un compte (et d'un profil actif) qui existe encore et n'est pas
     * suspendu : sinon 401 `UNAUTHENTICATED`, ou 403 `ACCOUNT_SUSPENDED` avec la fin et le motif.
     */
    async requireUser(request: FastifyRequest, reply: FastifyReply) {
      const user = (await loadSession(request, reply, true))?.user;
      if (!user) return reply.code(401).send({ error: 'UNAUTHENTICATED' });
      const block = await accountBlock(user);
      if (block === 'deleted') return reply.code(401).send({ error: 'UNAUTHENTICATED' });
      if (block) return reply.code(403).send({ error: 'ACCOUNT_SUSPENDED', ...block });
      request.user = user;
      await settler?.settle(user.id).catch((err: unknown) => request.log.warn({ err }));
    },
    /**
     * Exige une session valide, le rôle admin et le second facteur (vérifiés côté serveur, à chaque
     * requête) : `ADMIN_2FA_SETUP_REQUIRED` tant que l'administrateur ne l'a pas activé,
     * `ADMIN_2FA_REQUIRED` pour une session ouverte sans lui (connexion Google ou Discord, session
     * antérieure à l'activation). L'admin affiche alors l'enrôlement ou la reconnexion.
     */
    async requireAdmin(request: FastifyRequest, reply: FastifyReply) {
      const session = await loadSession(request, reply, false);
      request.user = session?.user ?? null;
      if (!session) return reply.code(401).send({ error: 'UNAUTHENTICATED' });
      if (session.user.role !== 'admin') return reply.code(403).send({ error: 'FORBIDDEN' });
      if (!session.twoFactor.enabled) {
        return reply.code(403).send({ error: 'ADMIN_2FA_SETUP_REQUIRED' });
      }
      if (!session.twoFactor.verified) return reply.code(403).send({ error: 'ADMIN_2FA_REQUIRED' });
    },
  };
}
