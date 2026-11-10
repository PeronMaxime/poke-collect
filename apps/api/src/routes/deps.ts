/**
 * Ce que reçoit chaque groupe de routes, et l'accès au joueur de la requête.
 *
 * `app.ts` construit un seul `RouteDeps` et le passe à tous les groupes ; un groupe qui a besoin
 * d'autre chose (clé push, supervision…) étend ce type.
 */
import type { FastifyRequest } from 'fastify';
import type { Db } from '@poke/db';
import type { ContentCache } from '../content-cache';
import type { SessionUser, sessionHooks } from '../plugins/session';

/** Les contrôles d'accès (`requireUser`, `requireAdmin`) et le rattrapage du temps écoulé. */
type SessionHooks = ReturnType<typeof sessionHooks>;

/** Dépendances communes à tous les groupes de routes. */
export interface RouteDeps {
  db: Db;
  /** Contenu publié, gardé en mémoire. */
  content: ContentCache;
  hooks: SessionHooks;
  /** Horloge injectée : les tests la figent. */
  now: () => Date;
}

/**
 * Le joueur (ou l'administrateur) de la requête. À n'appeler que dans une route protégée par
 * `hooks.requireUser` ou `hooks.requireAdmin`, qui répondent 401 avant le traitement sans session :
 * ailleurs, c'est une erreur de programmation (500).
 */
export function sessionUser(request: FastifyRequest): SessionUser {
  if (!request.user) throw new Error('Route sans contrôle de session : request.user est absent');
  return request.user;
}

/**
 * Identifiant du joueur de la requête : celui du profil secondaire actif (bêta) s'il y en a un,
 * sinon celui du compte. Mêmes conditions que `sessionUser`.
 */
export function currentUserId(request: FastifyRequest): string {
  return sessionUser(request).id;
}
