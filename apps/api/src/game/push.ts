import { and, eq, gt, inArray, isNull, lte } from 'drizzle-orm';
import webpush from 'web-push';
import {
  eggs,
  expeditions,
  fossilRevivals,
  playerProfiles,
  pushSubscriptions,
  trainerBattles,
} from '@poke/db';
import type { Db } from '@poke/db';
import type { GameContext } from '@poke/game-core';
import { DEFAULT_NOTIFICATION_SETTINGS, notificationSettingsSchema } from '@poke/shared';
import type { NotificationSettings, PushPayload } from '@poke/shared';
import type { ContentCache } from '../content-cache';
import type { VapidKeys } from '../env';

/**
 * Notifications Web Push : une tournée périodique repère les expéditions et combats terminés, les
 * œufs prêts à éclore et les fossiles restaurés, puis prévient leurs propriétaires abonnés (une notification groupée
 * par joueur). Chaque élément n'est notifié qu'une fois (`notified_at`).
 */

/** Au-delà, un élément terminé pendant une coupure du serveur n'est plus notifié. */
const MAX_DELAY_MS = 6 * 60 * 60_000;

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Envoie une notification ; `gone` = abonnement expiré (à supprimer). */
export type PushSender = (target: PushTarget, payload: PushPayload) => Promise<'ok' | 'gone'>;

export function webPushSender(vapid: VapidKeys): PushSender {
  const vapidDetails = {
    subject: vapid.subject,
    publicKey: vapid.publicKey,
    privateKey: vapid.privateKey,
  };
  return async (target, payload) => {
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        JSON.stringify(payload),
        { TTL: MAX_DELAY_MS / 1000, vapidDetails },
      );
      return 'ok';
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) return 'gone';
      throw err;
    }
  };
}

export function notificationSettings(settings: Record<string, unknown>): NotificationSettings {
  const parsed = notificationSettingsSchema.safeParse(settings.notifications);
  return parsed.success ? parsed.data : DEFAULT_NOTIFICATION_SETTINGS;
}

/** Ce qui attend un joueur depuis la tournée précédente. */
export interface ActivitySummary {
  zoneIds: string[];
  trainerIds: string[];
  eggs: number;
  fossils: number;
}

/** Texte de la notification groupée ; null si rien à signaler (types désactivés). */
export function pushMessage(
  ctx: GameContext,
  summary: ActivitySummary,
  settings: NotificationSettings,
): PushPayload | null {
  const parts: { text: string; tab: string }[] = [];
  const { zoneIds, trainerIds, eggs: eggCount, fossils } = summary;
  if (settings.expeditions && zoneIds.length > 0) {
    parts.push({
      tab: 'expeditions',
      text:
        zoneIds.length === 1
          ? `Expédition terminée : ${ctx.zone(zoneIds[0]!)?.name ?? zoneIds[0]}`
          : `${zoneIds.length} expéditions terminées`,
    });
  }
  if (settings.battles && trainerIds.length > 0) {
    const trainer = trainerIds.length === 1 ? ctx.trainer(trainerIds[0]!) : undefined;
    parts.push({
      tab: 'battles',
      text: trainer
        ? `Combat terminé contre ${trainer.trainerClass} ${trainer.name}`
        : `${trainerIds.length} combats terminés`,
    });
  }
  if (settings.eggs && eggCount > 0) {
    parts.push({
      tab: 'daycare',
      text: eggCount === 1 ? 'Un œuf est prêt à éclore' : `${eggCount} œufs sont prêts à éclore`,
    });
  }
  if (settings.fossils && fossils > 0) {
    parts.push({
      tab: 'museum',
      text:
        fossils === 1
          ? 'Un fossile a été restauré au Musée'
          : `${fossils} fossiles restaurés au Musée`,
    });
  }
  if (parts.length === 0) return null;
  const single = parts.length === 1 ? parts[0]! : null;
  return {
    title: single ? single.text : 'Poké Collect',
    body: single ? 'Touchez pour récupérer.' : parts.map((p) => p.text).join(' · '),
    url: single ? `/#${single.tab}` : '/',
    tag: 'activity',
  };
}

/** Envoie une notification à tous les appareils d'un joueur ; supprime les abonnements expirés. */
export async function sendToOwner(
  db: Db,
  send: PushSender,
  ownerId: string,
  payload: PushPayload,
  now: Date,
): Promise<number> {
  const targets = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.ownerId, ownerId));
  let sent = 0;
  for (const target of targets) {
    const outcome = await send(target, payload).catch(() => 'error' as const);
    if (outcome === 'gone') {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, target.id));
    } else if (outcome === 'ok') {
      sent++;
      await db
        .update(pushSubscriptions)
        .set({ lastSentAt: now })
        .where(eq(pushSubscriptions.id, target.id));
    }
  }
  return sent;
}

/**
 * Une tournée : marque les éléments dus des joueurs abonnés comme notifiés, puis envoie une
 * notification groupée par joueur. Retourne le nombre d'envois réussis.
 */
export async function runPushRound(
  db: Db,
  content: ContentCache,
  send: PushSender,
  now: Date,
): Promise<number> {
  const since = new Date(now.getTime() - MAX_DELAY_MS);
  const subscribed = db.select({ ownerId: pushSubscriptions.ownerId }).from(pushSubscriptions);
  const doneExpeditions = await db
    .update(expeditions)
    .set({ notifiedAt: now })
    .where(
      and(
        isNull(expeditions.claimedAt),
        isNull(expeditions.notifiedAt),
        lte(expeditions.endsAt, now),
        gt(expeditions.endsAt, since),
        inArray(expeditions.ownerId, subscribed),
      ),
    )
    .returning({ ownerId: expeditions.ownerId, zoneId: expeditions.zoneId });
  const doneBattles = await db
    .update(trainerBattles)
    .set({ notifiedAt: now })
    .where(
      and(
        isNull(trainerBattles.claimedAt),
        isNull(trainerBattles.notifiedAt),
        lte(trainerBattles.endsAt, now),
        gt(trainerBattles.endsAt, since),
        inArray(trainerBattles.ownerId, subscribed),
      ),
    )
    .returning({ ownerId: trainerBattles.ownerId, trainerId: trainerBattles.trainerId });
  const readyEggs = await db
    .update(eggs)
    .set({ notifiedAt: now })
    .where(
      and(
        eq(eggs.hatched, false),
        isNull(eggs.notifiedAt),
        lte(eggs.hatchAt, now),
        gt(eggs.hatchAt, since),
        inArray(eggs.ownerId, subscribed),
      ),
    )
    .returning({ ownerId: eggs.ownerId });
  const readyFossils = await db
    .update(fossilRevivals)
    .set({ notifiedAt: now })
    .where(
      and(
        isNull(fossilRevivals.revivedAt),
        isNull(fossilRevivals.notifiedAt),
        lte(fossilRevivals.readyAt, now),
        gt(fossilRevivals.readyAt, since),
        inArray(fossilRevivals.ownerId, subscribed),
      ),
    )
    .returning({ ownerId: fossilRevivals.ownerId });

  const summaries = new Map<string, ActivitySummary>();
  const summary = (ownerId: string) => {
    let s = summaries.get(ownerId);
    if (!s) summaries.set(ownerId, (s = { zoneIds: [], trainerIds: [], eggs: 0, fossils: 0 }));
    return s;
  };
  for (const e of doneExpeditions) summary(e.ownerId).zoneIds.push(e.zoneId);
  for (const b of doneBattles) summary(b.ownerId).trainerIds.push(b.trainerId);
  for (const e of readyEggs) summary(e.ownerId).eggs++;
  for (const f of readyFossils) summary(f.ownerId).fossils++;
  if (summaries.size === 0) return 0;

  const ctx = await content.get();
  const profiles = await db
    .select({ userId: playerProfiles.userId, settings: playerProfiles.settings })
    .from(playerProfiles)
    .where(inArray(playerProfiles.userId, [...summaries.keys()]));
  let sent = 0;
  for (const profile of profiles) {
    const payload = pushMessage(
      ctx,
      summaries.get(profile.userId)!,
      notificationSettings(profile.settings),
    );
    if (payload) sent += await sendToOwner(db, send, profile.userId, payload, now);
  }
  return sent;
}

/** Lance la tournée périodique ; retourne la fonction d'arrêt. */
export function startPushNotifier({
  db,
  content,
  send,
  intervalSeconds,
  onError,
}: {
  db: Db;
  content: ContentCache;
  send: PushSender;
  intervalSeconds: number;
  onError: (err: unknown) => void;
}): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    runPushRound(db, content, send, new Date())
      .catch(onError)
      .finally(() => {
        running = false;
      });
  }, intervalSeconds * 1000);
  timer.unref();
  return () => clearInterval(timer);
}
