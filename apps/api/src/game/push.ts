import { and, count, desc, eq, gt, inArray, isNull, lte, notInArray, sql } from 'drizzle-orm';
import webpush from 'web-push';
import { eggs, expeditions, fossilRevivals, playerProfiles, pushSubscriptions } from '@poke/db';
import type { Db } from '@poke/db';
import type { GameContext } from '@poke/game-core';
import { DEFAULT_NOTIFICATION_SETTINGS, notificationSettingsSchema } from '@poke/shared';
import type { NotificationSettings, PushPayload, PushSubscriptionInput } from '@poke/shared';
import type { ContentCache } from '../content-cache';
import type { VapidKeys } from '../env';
import { GameError } from './errors';
import { playerTransaction } from './tx';

/**
 * Notifications Web Push : une tournée périodique repère les expéditions et combats terminés, les
 * œufs prêts à éclore et les fossiles restaurés, puis prévient leurs propriétaires abonnés (une notification groupée
 * par joueur). Chaque élément n'est notifié qu'une fois (`notified_at`).
 *
 * Le serveur appelle l'adresse fournie par le navigateur : elle doit appartenir à un service push
 * connu (liste blanche), sinon un joueur ferait atteindre au serveur son propre réseau interne.
 */

/** Au-delà, un élément terminé pendant une coupure du serveur n'est plus notifié. */
const MAX_DELAY_MS = 6 * 60 * 60_000;

/** Délai maximal d'un envoi : un service qui ne répond pas ne retarde pas la tournée. */
const SEND_TIMEOUT_MS = 10_000;

/** Joueurs notifiés en même temps pendant une tournée (leurs appareils, en parallèle). */
const PARALLEL_OWNERS = 5;

/** Appareils abonnés par joueur ; au-delà, le plus ancien est remplacé. */
export const MAX_DEVICES = 10;

/** Délai entre deux notifications d'essai d'un même joueur. */
const TEST_INTERVAL_MS = 30_000;

/** Services push des navigateurs : Chrome, Edge, Opera… (FCM) et Firefox, hôtes exacts. */
const PUSH_HOSTS = new Set(['fcm.googleapis.com', 'updates.push.services.mozilla.com']);

/** Services push à sous-domaines : Safari (`web.push.apple.com`…) et Windows (`wns2-….notify…`). */
const PUSH_HOST_SUFFIXES = ['.push.apple.com', '.notify.windows.com'];

/**
 * Vrai si le serveur peut envoyer à cette adresse : HTTPS, port par défaut, sans identifiants, chez
 * un service push connu. Même liste que la migration 0151, qui a purgé les anciennes adresses.
 */
function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username || url.password) return false;
  return PUSH_HOSTS.has(url.hostname) || PUSH_HOST_SUFFIXES.some((s) => url.hostname.endsWith(s));
}

/** Applique `fn` à chaque élément, `limit` à la fois au plus. */
async function forEachLimited<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const lane = async () => {
    while (next < items.length) await fn(items[next++]!);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
}

/** Un appareil abonné : son adresse chez le service push et ses clés de chiffrement. */
export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Envoie une notification ; `gone` = abonnement expiré (à supprimer). */
export type PushSender = (target: PushTarget, payload: PushPayload) => Promise<'ok' | 'gone'>;

/**
 * L'expéditeur réel : envoie par Web Push, signé avec les clés VAPID. Un abonnement refusé pour de
 * bon (404, 410) est signalé `gone`. Un envoi est abandonné (rejeté) après `timeoutMs`, connexion
 * muette ou réponse trop lente. L'adresse est passée normalisée (`URL.href`) : web-push la relit
 * avec l'ancien `url.parse`, qui ne doit pas y voir un autre hôte que celui de la liste blanche.
 */
export function webPushSender(vapid: VapidKeys, timeoutMs = SEND_TIMEOUT_MS): PushSender {
  const vapidDetails = {
    subject: vapid.subject,
    publicKey: vapid.publicKey,
    privateKey: vapid.privateKey,
  };
  return async (target, payload) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('push : délai dépassé')), timeoutMs);
    });
    try {
      await Promise.race([
        webpush.sendNotification(
          {
            endpoint: new URL(target.endpoint).href,
            keys: { p256dh: target.p256dh, auth: target.auth },
          },
          JSON.stringify(payload),
          { TTL: MAX_DELAY_MS / 1000, vapidDetails, timeout: timeoutMs },
        ),
        deadline,
      ]);
      return 'ok';
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) return 'gone';
      throw err;
    } finally {
      clearTimeout(timer);
    }
  };
}

function notificationSettings(settings: Record<string, unknown>): NotificationSettings {
  const parsed = notificationSettingsSchema.safeParse(settings.notifications);
  return parsed.success ? parsed.data : DEFAULT_NOTIFICATION_SETTINGS;
}

/** Réglages de notification du joueur et nombre de ses appareils abonnés. */
export async function pushStatus(
  db: Db,
  userId: string,
): Promise<{ settings: NotificationSettings; subscriptions: number }> {
  const loadSettings = async () => {
    const [profile] = await db
      .select({ settings: playerProfiles.settings })
      .from(playerProfiles)
      .where(eq(playerProfiles.userId, userId));
    if (!profile) throw new GameError(404, 'PROFILE_NOT_FOUND');
    return notificationSettings(profile.settings);
  };
  const [settings, [subs]] = await Promise.all([
    loadSettings(),
    db.select({ n: count() }).from(pushSubscriptions).where(eq(pushSubscriptions.ownerId, userId)),
  ]);
  return { settings, subscriptions: subs?.n ?? 0 };
}

/**
 * Abonne un appareil aux notifications du joueur ; refus `PUSH_ENDPOINT_REFUSED` hors des services
 * push connus. Un appareil déjà abonné change de propriétaire s'il se reconnecte avec un autre
 * compte. Au-delà de `MAX_DEVICES`, les abonnements les plus anciens du joueur sont supprimés.
 */
export async function subscribeDevice(
  db: Db,
  userId: string,
  { endpoint, keys }: PushSubscriptionInput,
  userAgent: string | null,
  now: Date,
): Promise<void> {
  if (!isAllowedPushEndpoint(endpoint)) throw new GameError(400, 'PUSH_ENDPOINT_REFUSED');
  await playerTransaction(db, userId, async (tx) => {
    const device = { ownerId: userId, p256dh: keys.p256dh, auth: keys.auth, userAgent };
    await tx
      .insert(pushSubscriptions)
      .values({ ...device, endpoint, createdAt: now })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { ...device, createdAt: now },
      });
    const kept = tx
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.ownerId, userId))
      .orderBy(desc(pushSubscriptions.createdAt), desc(pushSubscriptions.id))
      .limit(MAX_DEVICES);
    await tx
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.ownerId, userId), notInArray(pushSubscriptions.id, kept)));
  });
}

/**
 * Garde-fou de la notification d'essai : `check(userId, now)` refuse (`RATE_LIMITED`, 429) un
 * second essai du même joueur avant 30 s. En mémoire : l'API tourne en un seul processus.
 */
export function pushTestThrottle() {
  const lastTest = new Map<string, number>();
  return {
    check(userId: string, now: Date) {
      const at = now.getTime();
      if (lastTest.size > 10_000) {
        for (const [id, t] of lastTest) if (at - t >= TEST_INTERVAL_MS) lastTest.delete(id);
      }
      const last = lastTest.get(userId);
      if (last !== undefined && at - last < TEST_INTERVAL_MS) {
        const retryAfter = Math.ceil((TEST_INTERVAL_MS - (at - last)) / 1000);
        throw new GameError(429, 'RATE_LIMITED', { retryAfter });
      }
      lastTest.set(userId, at);
    },
  };
}

/** Désabonne un appareil du joueur (sans effet s'il ne l'était pas). */
export async function unsubscribeDevice(db: Db, userId: string, endpoint: string): Promise<void> {
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.ownerId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}

/** Enregistre les types de notification voulus par le joueur, dans les réglages de son profil. */
export async function saveNotificationSettings(
  db: Db,
  userId: string,
  settings: NotificationSettings,
): Promise<void> {
  const updated = await db
    .update(playerProfiles)
    .set({
      settings: sql`${playerProfiles.settings} || ${JSON.stringify({ notifications: settings })}::jsonb`,
    })
    .where(eq(playerProfiles.userId, userId))
    .returning({ userId: playerProfiles.userId });
  if (updated.length === 0) throw new GameError(404, 'PROFILE_NOT_FOUND');
}

/** Ce qui attend un joueur depuis la tournée précédente. */
interface ActivitySummary {
  zoneIds: string[];
  /** Expéditions légendaires terminées (quêtes). */
  questIds: string[];
  eggs: number;
  fossils: number;
}

/** Texte de la notification groupée ; null si rien à signaler (types désactivés). */
function pushMessage(
  ctx: GameContext,
  summary: ActivitySummary,
  settings: NotificationSettings,
): PushPayload | null {
  const parts: { text: string; tab: string }[] = [];
  const { zoneIds, questIds, eggs: eggCount, fossils } = summary;
  const expeditionCount = zoneIds.length + questIds.length;
  if (settings.expeditions && expeditionCount > 0) {
    parts.push({
      tab: 'expeditions',
      text:
        expeditionCount > 1
          ? `${expeditionCount} expéditions terminées`
          : zoneIds[0]
            ? `Expédition terminée : ${ctx.zone(zoneIds[0])?.name ?? zoneIds[0]}`
            : `Expédition légendaire terminée : ${ctx.quest(questIds[0]!)?.name ?? questIds[0]}`,
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
    title: single ? single.text : 'Dexpedition',
    body: single ? 'Touchez pour récupérer.' : parts.map((p) => p.text).join(' · '),
    url: single ? `/#${single.tab}` : '/',
    tag: 'activity',
  };
}

/**
 * Envoie une notification à tous les appareils d'un joueur, en parallèle ; supprime les abonnements
 * expirés et ceux dont l'adresse n'est pas (ou plus) dans la liste blanche, sans les appeler.
 */
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
  await forEachLimited(targets, MAX_DEVICES, async (target) => {
    const outcome = isAllowedPushEndpoint(target.endpoint)
      ? await send(target, payload).catch(() => 'error' as const)
      : 'gone';
    if (outcome === 'gone') {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, target.id));
    } else if (outcome === 'ok') {
      sent++;
      await db
        .update(pushSubscriptions)
        .set({ lastSentAt: now })
        .where(eq(pushSubscriptions.id, target.id));
    }
  });
  return sent;
}

/**
 * Une tournée : marque les éléments dus des joueurs abonnés comme notifiés, puis envoie une
 * notification groupée par joueur, `PARALLEL_OWNERS` joueurs à la fois. Retourne le nombre
 * d'envois réussis.
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
    .returning({
      ownerId: expeditions.ownerId,
      zoneId: expeditions.zoneId,
      questId: expeditions.questId,
    });
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
    if (!s) summaries.set(ownerId, (s = { zoneIds: [], questIds: [], eggs: 0, fossils: 0 }));
    return s;
  };
  for (const e of doneExpeditions) {
    if (e.zoneId) summary(e.ownerId).zoneIds.push(e.zoneId);
    else if (e.questId) summary(e.ownerId).questIds.push(e.questId);
  }
  for (const e of readyEggs) summary(e.ownerId).eggs++;
  for (const f of readyFossils) summary(f.ownerId).fossils++;
  if (summaries.size === 0) return 0;

  const ctx = await content.get();
  const profiles = await db
    .select({ userId: playerProfiles.userId, settings: playerProfiles.settings })
    .from(playerProfiles)
    .where(inArray(playerProfiles.userId, [...summaries.keys()]));
  let sent = 0;
  await forEachLimited(profiles, PARALLEL_OWNERS, async (profile) => {
    const payload = pushMessage(
      ctx,
      summaries.get(profile.userId)!,
      notificationSettings(profile.settings),
    );
    if (!payload) return;
    const delivered = await sendToOwner(db, send, profile.userId, payload, now);
    sent += delivered;
  });
  return sent;
}
