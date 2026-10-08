import type { FastifyInstance } from 'fastify';
import { and, count, eq, sql } from 'drizzle-orm';
import { playerProfiles, pushSubscriptions } from '@poke/db';
import type { Db } from '@poke/db';
import {
  notificationSettingsSchema,
  pushSubscriptionInputSchema,
  pushUnsubscribeInputSchema,
} from '@poke/shared';
import type { NotificationSettings, PushConfigResponse } from '@poke/shared';
import { GameError } from '../game/errors';
import { notificationSettings, sendToOwner } from '../game/push';
import type { PushSender } from '../game/push';
import type { sessionHooks } from '../plugins/session';

interface Deps {
  db: Db;
  hooks: ReturnType<typeof sessionHooks>;
  now: () => Date;
  /** Clé publique VAPID ; absente = notifications push désactivées. */
  publicKey: string | null;
  send: PushSender | null;
}

/** Notifications push : abonnement de l'appareil, réglages par type, notification de test. */
export async function pushRoutes(app: FastifyInstance, { db, hooks, now, publicKey, send }: Deps) {
  app.addHook('preHandler', hooks.requireUser);

  const loadSettings = async (userId: string) => {
    const [profile] = await db
      .select({ settings: playerProfiles.settings })
      .from(playerProfiles)
      .where(eq(playerProfiles.userId, userId));
    if (!profile) throw new GameError(404, 'PROFILE_NOT_FOUND');
    return notificationSettings(profile.settings);
  };

  app.get('/api/push', async (request): Promise<PushConfigResponse> => {
    const userId = request.user!.id;
    const [settings, [subs]] = await Promise.all([
      loadSettings(userId),
      db
        .select({ n: count() })
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.ownerId, userId)),
    ]);
    return { publicKey, settings, subscriptions: subs?.n ?? 0 };
  });

  app.post('/api/push/subscriptions', async (request, reply) => {
    if (!publicKey) throw new GameError(503, 'PUSH_DISABLED');
    const { endpoint, keys } = pushSubscriptionInputSchema.parse(request.body);
    const userAgent = request.headers['user-agent']?.slice(0, 300) ?? null;
    // Un appareil abonné change de propriétaire s'il se reconnecte avec un autre compte.
    await db
      .insert(pushSubscriptions)
      .values({
        ownerId: request.user!.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { ownerId: request.user!.id, p256dh: keys.p256dh, auth: keys.auth, userAgent },
      });
    return reply.code(204).send();
  });

  app.delete('/api/push/subscriptions', async (request, reply) => {
    const { endpoint } = pushUnsubscribeInputSchema.parse(request.body);
    await db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.ownerId, request.user!.id),
          eq(pushSubscriptions.endpoint, endpoint),
        ),
      );
    return reply.code(204).send();
  });

  app.put('/api/push/settings', async (request): Promise<NotificationSettings> => {
    const settings = notificationSettingsSchema.parse(request.body);
    const updated = await db
      .update(playerProfiles)
      .set({
        settings: sql`${playerProfiles.settings} || ${JSON.stringify({ notifications: settings })}::jsonb`,
      })
      .where(eq(playerProfiles.userId, request.user!.id))
      .returning({ userId: playerProfiles.userId });
    if (updated.length === 0) throw new GameError(404, 'PROFILE_NOT_FOUND');
    return settings;
  });

  /** Notification de test sur tous les appareils du joueur. */
  app.post('/api/push/test', async (request): Promise<{ sent: number }> => {
    if (!send) throw new GameError(503, 'PUSH_DISABLED');
    const sent = await sendToOwner(
      db,
      send,
      request.user!.id,
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
