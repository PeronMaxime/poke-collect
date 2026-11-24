import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { logAdminAction } from '@poke/db';
import {
  moderateGuildInputSchema,
  moderationGuildQuerySchema,
  renameTrainerInputSchema,
  suspendAccountInputSchema,
} from '@poke/shared';
import type {
  AccountSuspensionDto,
  ModerationGuildDetailResponse,
  ModerationGuildDto,
} from '@poke/shared';
import {
  deleteModeratedMessage,
  moderateGuild,
  moderationGuild,
  moderationGuilds,
} from '../../game/guilds';
import { liftSuspension, renameTrainer, suspendAccount } from '../../game/moderation';
import { currentUserId } from '../deps';
import type { AdminDeps } from './admin-deps';

/**
 * Modération (`/api/admin/moderation/*`) : suspendre ou rétablir un compte, renommer un dresseur,
 * corriger une guilde, lire sa discussion et en supprimer un message. Chaque écriture est
 * journalisée (`admin_audit_log`, actions `moderation.*`).
 *
 * Tout est sous ce préfixe pour qu'un futur rôle de modérateur puisse n'ouvrir que lui.
 */

const userParams = z.object({ userId: z.string().min(1).max(64) });
const guildParams = z.object({ guildId: z.uuid() });
const messageParams = z.object({ guildId: z.uuid(), messageId: z.uuid() });

/** Routes de la modération ; le contrôle du rôle admin est posé par `adminRoutes`. */
export function adminModerationRoutes(app: FastifyInstance, { db, now, accounts }: AdminDeps) {
  /** Suspend un compte (durée en heures, null : définitive) et le déconnecte. */
  app.post(
    '/api/admin/moderation/players/:userId/suspension',
    async (request): Promise<AccountSuspensionDto> => {
      const { userId } = userParams.parse(request.params);
      const input = suspendAccountInputSchema.parse(request.body);
      const { before, after } = await suspendAccount(db, userId, input, now());
      accounts.invalidate(userId);
      await logAdminAction(db, {
        adminId: currentUserId(request),
        action: 'moderation.suspend',
        entity: 'user',
        entityId: userId,
        before,
        after: { ...after, hours: input.hours },
      });
      return after;
    },
  );

  /** Lève la suspension d'un compte. */
  app.delete('/api/admin/moderation/players/:userId/suspension', async (request, reply) => {
    const { userId } = userParams.parse(request.params);
    const before = await liftSuspension(db, userId, now());
    accounts.invalidate(userId);
    await logAdminAction(db, {
      adminId: currentUserId(request),
      action: 'moderation.unsuspend',
      entity: 'user',
      entityId: userId,
      before,
    });
    return reply.code(204).send();
  });

  /** Renomme le dresseur d'un joueur. */
  app.put('/api/admin/moderation/players/:userId/trainer-name', async (request) => {
    const { userId } = userParams.parse(request.params);
    const { trainerName } = renameTrainerInputSchema.parse(request.body);
    const previous = await renameTrainer(db, userId, trainerName);
    await logAdminAction(db, {
      adminId: currentUserId(request),
      action: 'moderation.rename_trainer',
      entity: 'user',
      entityId: userId,
      before: { trainerName: previous },
      after: { trainerName },
    });
    return { trainerName };
  });

  app.get('/api/admin/moderation/guilds', async (request): Promise<ModerationGuildDto[]> => {
    const { q } = moderationGuildQuerySchema.parse(request.query);
    return moderationGuilds(db, q);
  });

  app.get(
    '/api/admin/moderation/guilds/:guildId',
    async (request): Promise<ModerationGuildDetailResponse> => {
      const { guildId } = guildParams.parse(request.params);
      return moderationGuild(db, guildId);
    },
  );

  /** Corrige le nom ou la description d'une guilde. */
  app.patch('/api/admin/moderation/guilds/:guildId', async (request, reply) => {
    const { guildId } = guildParams.parse(request.params);
    const input = moderateGuildInputSchema.parse(request.body);
    const { before, after } = await moderateGuild(db, guildId, input);
    await logAdminAction(db, {
      adminId: currentUserId(request),
      action: 'moderation.guild_update',
      entity: 'guild',
      entityId: guildId,
      before,
      after,
    });
    return reply.code(204).send();
  });

  /** Supprime un message de la discussion d'une guilde (son texte reste dans le journal). */
  app.delete(
    '/api/admin/moderation/guilds/:guildId/messages/:messageId',
    async (request, reply) => {
      const { guildId, messageId } = messageParams.parse(request.params);
      const deleted = await deleteModeratedMessage(db, guildId, messageId);
      await logAdminAction(db, {
        adminId: currentUserId(request),
        action: 'moderation.delete_message',
        entity: 'guild_message',
        entityId: messageId,
        before: { guildId, ...deleted },
      });
      return reply.code(204).send();
    },
  );
}
