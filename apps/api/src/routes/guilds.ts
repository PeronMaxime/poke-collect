import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '@poke/db';
import {
  createGuildInputSchema,
  guildMessageInputSchema,
  guildRoleInputSchema,
  openChestInputSchema,
  updateGuildInputSchema,
} from '@poke/shared';
import type {
  GuildLeaderboardResponse,
  GuildMessagesResponse,
  GuildProfileResponse,
  GuildSearchResponse,
  GuildStateResponse,
  OpenChestResponse,
} from '@poke/shared';
import type { ContentCache } from '../content-cache';
import {
  answerJoinRequest,
  cancelJoinRequest,
  createGuild,
  deleteGuildMessage,
  guildLeaderboard,
  guildMessagesOf,
  guildProfile,
  guildState,
  joinGuild,
  kickMember,
  leaveGuild,
  openChests,
  postGuildMessage,
  searchGuilds,
  setMemberRole,
  updateGuild,
} from '../game/guilds';
import type { sessionHooks } from '../plugins/session';

interface Deps {
  db: Db;
  content: ContentCache;
  hooks: ReturnType<typeof sessionHooks>;
  now: () => Date;
}

const guildParams = z.object({ id: z.uuid() });
const nameParams = z.object({ name: z.string().min(1).max(32) });
const messageParams = z.object({ id: z.uuid() });
const searchQuery = z.object({ q: z.string().max(32).default('') });

/** Guildes : état, recherche, adhésion, gestion des membres, discussion ; coffres du sac. */
export async function guildRoutes(app: FastifyInstance, { db, content, hooks, now }: Deps) {
  app.addHook('preHandler', hooks.requireUser);

  app.get('/api/guild', async (request): Promise<GuildStateResponse> =>
    guildState(db, content, request.user!.id, now()),
  );

  app.get('/api/guilds', async (request): Promise<GuildSearchResponse> => {
    const { q } = searchQuery.parse(request.query);
    return searchGuilds(db, content, request.user!.id, q);
  });

  app.get('/api/guilds/leaderboard', async (request): Promise<GuildLeaderboardResponse> =>
    guildLeaderboard(db, request.user!.id),
  );

  app.get('/api/guilds/:id', async (request): Promise<GuildProfileResponse> => {
    const { id } = guildParams.parse(request.params);
    return guildProfile(db, content, request.user!.id, id);
  });

  app.post('/api/guilds', async (request, reply): Promise<GuildStateResponse> => {
    const input = createGuildInputSchema.parse(request.body);
    const state = await createGuild(db, content, request.user!.id, input, now());
    reply.code(201);
    return state;
  });

  app.post('/api/guilds/:id/join', async (request) => {
    const { id } = guildParams.parse(request.params);
    return joinGuild(db, content, request.user!.id, id, now());
  });

  app.delete('/api/guilds/:id/request', async (request, reply) => {
    const { id } = guildParams.parse(request.params);
    await cancelJoinRequest(db, request.user!.id, id);
    return reply.code(204).send();
  });

  app.patch('/api/guild', async (request, reply) => {
    await updateGuild(db, request.user!.id, updateGuildInputSchema.parse(request.body));
    return reply.code(204).send();
  });

  app.post('/api/guild/leave', async (request, reply) => {
    await leaveGuild(db, request.user!.id, now());
    return reply.code(204).send();
  });

  for (const [action, accept] of [
    ['accept', true],
    ['decline', false],
  ] as const) {
    app.post(`/api/guild/requests/:name/${action}`, async (request, reply) => {
      const { name } = nameParams.parse(request.params);
      await answerJoinRequest(db, content, request.user!.id, name, accept, now());
      return reply.code(204).send();
    });
  }

  app.post('/api/guild/members/:name/kick', async (request, reply) => {
    const { name } = nameParams.parse(request.params);
    await kickMember(db, request.user!.id, name, now());
    return reply.code(204).send();
  });

  app.post('/api/guild/members/:name/role', async (request, reply) => {
    const { name } = nameParams.parse(request.params);
    const { role } = guildRoleInputSchema.parse(request.body);
    await setMemberRole(db, request.user!.id, name, role, now());
    return reply.code(204).send();
  });

  app.get('/api/guild/messages', async (request): Promise<GuildMessagesResponse> =>
    guildMessagesOf(db, request.user!.id),
  );

  app.post('/api/guild/messages', async (request, reply) => {
    const { body } = guildMessageInputSchema.parse(request.body);
    await postGuildMessage(db, request.user!.id, body, now());
    return reply.code(204).send();
  });

  app.delete('/api/guild/messages/:id', async (request, reply) => {
    const { id } = messageParams.parse(request.params);
    await deleteGuildMessage(db, request.user!.id, id);
    return reply.code(204).send();
  });

  app.post('/api/items/open-chest', async (request): Promise<OpenChestResponse> => {
    const input = openChestInputSchema.parse(request.body);
    return openChests(db, content, request.user!.id, input);
  });
}
