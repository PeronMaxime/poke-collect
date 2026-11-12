import type { FastifyInstance } from 'fastify';
import { chooseStarterInputSchema, createProfileInputSchema } from '@poke/shared';
import type { MeResponse } from '@poke/shared';
import { chooseRegionStarter, chooseStarter, createProfile, findProfile } from '../game/profile';
import { currentUserId, sessionUser } from './deps';
import type { RouteDeps } from './deps';

/**
 * Routes du joueur : contenu publié, compte et profil, présence, starter (/api/content, /api/me,
 * /api/profile, /api/starter). Chaque route valide sa requête, appelle le module de jeu et répond.
 */

/** Le joueur lui-même : contenu publié, session, création du profil, choix des starters. */
export async function playerRoutes(app: FastifyInstance, { db, content, hooks, now }: RouteDeps) {
  /** Contenu publié utile à l'affichage côté joueur. */
  app.get('/api/content', async (request, reply) => {
    const { body, etag } = await content.publicJson();
    // Le navigateur revalide à chaque appel : 304 sans corps tant que la version est la même.
    reply.header('etag', etag).header('cache-control', 'private, no-cache');
    if (request.headers['if-none-match'] === etag) return reply.code(304).send();
    return reply.type('application/json; charset=utf-8').send(body);
  });

  app.get('/api/me', { preHandler: hooks.requireUser }, async (request): Promise<MeResponse> => {
    const user = sessionUser(request);
    const profile = await findProfile(db, user.id);
    // Numéro de la version publiée : le jeu recharge le contenu quand il change.
    const contentVersion = await content
      .get()
      .then((ctx) => ctx.content.versionId)
      .catch(() => null);
    return { user, profile, contentVersion };
  });

  /** Signal de présence (anciennes versions du jeu ; la session met à jour `last_seen_at`). */
  app.post('/api/presence', { preHandler: hooks.requireUser }, async (_request, reply) =>
    reply.code(204).send(),
  );

  app.post('/api/profile', { preHandler: hooks.requireUser }, async (request, reply) => {
    const parsed = createProfileInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'VALIDATION', issues: parsed.error.issues });
    }
    const profile = await createProfile(
      db,
      () => content.get(),
      currentUserId(request),
      parsed.data.trainerName,
      now(),
    );
    return reply.code(201).send(profile);
  });

  /** Choix du starter : premier Pokémon, Pokédex, inventaire et argent de départ. */
  app.post('/api/starter', { preHandler: hooks.requireUser }, async (request, reply) => {
    const { speciesId } = chooseStarterInputSchema.parse(request.body);
    const ctx = await content.get();
    return reply
      .code(201)
      .send(await chooseStarter(db, ctx, currentUserId(request), speciesId, now()));
  });

  /** Starter d'une région suivante (Johto…) : un par région, une fois celle-ci débloquée. */
  app.post<{ Params: { regionId: string } }>(
    '/api/regions/:regionId/starter',
    { preHandler: hooks.requireUser },
    async (request, reply) => {
      const { speciesId } = chooseStarterInputSchema.parse(request.body);
      const ctx = await content.get();
      const starter = await chooseRegionStarter(
        db,
        ctx,
        currentUserId(request),
        request.params.regionId,
        speciesId,
        now(),
      );
      return reply.code(201).send(starter);
    },
  );
}
