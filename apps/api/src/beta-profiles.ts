import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, asc, eq, sql } from 'drizzle-orm';
import { playerProfiles, users } from '@poke/db';
import type { Db } from '@poke/db';
import { selectBetaProfileInputSchema } from '@poke/shared';
import type { BetaProfilesResponse } from '@poke/shared';
import type { ContentCache } from './content-cache';
import type { sessionHooks } from './plugins/session';

/**
 * Bêta : profils secondaires. Un profil secondaire est un utilisateur sans identifiant de
 * connexion, rattaché au compte (`users.parent_user_id`) ; toutes les données de jeu étant
 * indexées par `users.id`, le cookie ci-dessous suffit à jouer une autre partie. Le serveur
 * vérifie à chaque requête que le profil appartient bien au compte connecté.
 *
 * Pour retirer la fonctionnalité : supprimer ce fichier, son enregistrement dans `app.ts`,
 * l'appel à `activeProfileId` dans `plugins/session.ts`, `BetaProfilesSection` côté web et
 * les profils secondaires en base (`delete from users where parent_user_id is not null`).
 */

export const BETA_PROFILE_COOKIE = 'dex_profile';
/** Préfixe du pseudo d'un profil secondaire, suivi de son numéro : `Alt1_Sacha`. */
const NAME_PREFIX = 'Alt';
const MAX_SECONDARY_PROFILES = 3;

/** Profil secondaire demandé par le cookie, s'il appartient bien au compte `accountUserId`. */
export async function activeProfileId(
  db: Db,
  request: FastifyRequest,
  accountUserId: string,
): Promise<{ id: string; name: string } | null> {
  const wanted = readCookie(request, BETA_PROFILE_COOKIE);
  if (!wanted) return null;
  const [row] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.id, wanted), eq(users.parentUserId, accountUserId)));
  return row ?? null;
}

function readCookie(request: FastifyRequest, name: string): string | null {
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return null;
}

interface Deps {
  db: Db;
  content: ContentCache;
  hooks: ReturnType<typeof sessionHooks>;
  now: () => Date;
  secureCookie: boolean;
}

export async function betaProfileRoutes(
  app: FastifyInstance,
  { db, content, hooks, now, secureCookie }: Deps,
) {
  const setCookie = (reply: FastifyReply, profileId: string | null) => {
    const attributes = `Path=/; HttpOnly; SameSite=Lax${secureCookie ? '; Secure' : ''}`;
    reply.header(
      'set-cookie',
      profileId
        ? `${BETA_PROFILE_COOKIE}=${encodeURIComponent(profileId)}; ${attributes}; Max-Age=31536000`
        : `${BETA_PROFILE_COOKIE}=; ${attributes}; Max-Age=0`,
    );
  };

  const list = async (accountUserId: string, activeId: string): Promise<BetaProfilesResponse> => {
    const rows = await db
      .select({
        id: users.id,
        trainerName: playerProfiles.trainerName,
        starterSpeciesId: playerProfiles.starterSpeciesId,
        parentUserId: users.parentUserId,
      })
      .from(users)
      .innerJoin(playerProfiles, eq(playerProfiles.userId, users.id))
      .where(sql`${users.id} = ${accountUserId} or ${users.parentUserId} = ${accountUserId}`)
      .orderBy(sql`${users.parentUserId} is not null`, asc(users.createdAt));
    return {
      activeProfileId: activeId,
      maxSecondary: MAX_SECONDARY_PROFILES,
      profiles: rows.map((r) => ({
        id: r.id,
        trainerName: r.trainerName,
        main: r.parentUserId == null,
        starterChosen: r.starterSpeciesId != null,
      })),
    };
  };

  app.get('/api/beta/profiles', { preHandler: hooks.requireUser }, async (request) => {
    const user = request.user!;
    return list(user.accountUserId, user.id);
  });

  /** Crée un profil secondaire (partie neuve, starter à choisir) et le rend actif. */
  app.post('/api/beta/profiles', { preHandler: hooks.requireUser }, async (request, reply) => {
    const { accountUserId } = request.user!;
    const [main] = await db
      .select({ trainerName: playerProfiles.trainerName })
      .from(playerProfiles)
      .where(eq(playerProfiles.userId, accountUserId));
    if (!main) return reply.code(409).send({ error: 'NO_PROFILE' });

    const existing = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.parentUserId, accountUserId));
    if (existing.length >= MAX_SECONDARY_PROFILES) {
      return reply.code(409).send({ error: 'TOO_MANY_PROFILES' });
    }
    const used = new Set(existing.map((u) => u.name.toLowerCase()));
    let n = 1;
    while (used.has(`${NAME_PREFIX}${n}_${main.trainerName}`.toLowerCase())) n++;
    const trainerName = `${NAME_PREFIX}${n}_${main.trainerName}`;

    const startRegion = (await content.get()).regions[0];
    if (!startRegion) return reply.code(503).send({ error: 'NO_REGION_CONFIGURED' });

    const id = randomUUID();
    const at = now();
    try {
      await db.transaction(async (tx) => {
        await tx.insert(users).values({
          id,
          name: trainerName,
          // Adresse jamais utilisée (pas de compte de connexion) mais unique et non nulle.
          email: `${id}@profil-secondaire.invalid`,
          parentUserId: accountUserId,
          createdAt: at,
          updatedAt: at,
        });
        await tx
          .insert(playerProfiles)
          .values({ userId: id, trainerName, regionUnlocked: startRegion.id, createdAt: at });
      });
    } catch {
      // Pseudo déjà pris par un autre joueur (index unique insensible à la casse).
      return reply.code(409).send({ error: 'TRAINER_NAME_TAKEN' });
    }
    setCookie(reply, id);
    return reply.code(201).send(await list(accountUserId, id));
  });

  /** Change de profil actif (`null` : profil principal). */
  app.post(
    '/api/beta/profiles/active',
    { preHandler: hooks.requireUser },
    async (request, reply) => {
      const { profileId } = selectBetaProfileInputSchema.parse(request.body);
      const { accountUserId } = request.user!;
      if (profileId && profileId !== accountUserId) {
        const [owned] = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.id, profileId), eq(users.parentUserId, accountUserId)));
        if (!owned) return reply.code(404).send({ error: 'PROFILE_NOT_FOUND' });
        setCookie(reply, profileId);
        return list(accountUserId, profileId);
      }
      setCookie(reply, null);
      return list(accountUserId, accountUserId);
    },
  );
}
