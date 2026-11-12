import type { FastifyInstance } from 'fastify';
import {
  notificationSettingsSchema,
  pushSubscriptionInputSchema,
  pushUnsubscribeInputSchema,
} from '@poke/shared';
import type { NotificationSettings, PushConfigResponse } from '@poke/shared';
import { GameError } from '../game/errors';
import {
  pushStatus,
  saveNotificationSettings,
  sendToOwner,
  subscribeDevice,
  unsubscribeDevice,
} from '../game/push';
import type { PushSender } from '../game/push';
import { currentUserId } from './deps';
import type { RouteDeps } from './deps';

/**
 * Routes des notifications push (/api/push) : abonnement de l'appareil, réglages, notification
 * d'essai. Chaque route valide sa requête, appelle le module de jeu et répond.
 */

interface PushDeps extends RouteDeps {
  /** Clé publique VAPID ; absente = notifications push désactivées. */
  publicKey: string | null;
  send: PushSender | null;
}

/** Notifications push : abonnement de l'appareil, réglages par type, notification de test. */
export async function pushRoutes(
  app: FastifyInstance,
  { db, hooks, now, publicKey, send }: PushDeps,
) {
  app.addHook('preHandler', hooks.requireUser);

  app.get('/api/push', async (request): Promise<PushConfigResponse> => {
    const { settings, subscriptions } = await pushStatus(db, currentUserId(request));
    return { publicKey, settings, subscriptions };
  });

  app.post('/api/push/subscriptions', async (request, reply) => {
    if (!publicKey) throw new GameError(503, 'PUSH_DISABLED');
    const input = pushSubscriptionInputSchema.parse(request.body);
    const userAgent = request.headers['user-agent']?.slice(0, 300) ?? null;
    await subscribeDevice(db, currentUserId(request), input, userAgent);
    return reply.code(204).send();
  });

  app.delete('/api/push/subscriptions', async (request, reply) => {
    const { endpoint } = pushUnsubscribeInputSchema.parse(request.body);
    await unsubscribeDevice(db, currentUserId(request), endpoint);
    return reply.code(204).send();
  });

  app.put('/api/push/settings', async (request): Promise<NotificationSettings> => {
    const settings = notificationSettingsSchema.parse(request.body);
    await saveNotificationSettings(db, currentUserId(request), settings);
    return settings;
  });

  /** Notification de test sur tous les appareils du joueur. */
  app.post('/api/push/test', async (request): Promise<{ sent: number }> => {
    if (!send) throw new GameError(503, 'PUSH_DISABLED');
    const sent = await sendToOwner(
      db,
      send,
      currentUserId(request),
      {
        title: 'Dexpedition',
        body: 'Les notifications fonctionnent : tu seras prévenu à la fin de tes expéditions.',
        url: '/',
        tag: 'test',
      },
      now(),
    );
    return { sent };
  });
}
