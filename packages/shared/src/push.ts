import { z } from 'zod';

/**
 * Notifications push (PWA).
 */

/** Types de notifications push, activables séparément (réglages du joueur). */
export const notificationSettingsSchema = z.object({
  /** Expédition terminée, prête à être récupérée. */
  expeditions: z.boolean(),
  /** Œuf prêt à éclore. */
  eggs: z.boolean(),
  /** Fossile restauré au Musée (absent des réglages enregistrés avant le Musée). */
  fossils: z.boolean().default(true),
});

export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  expeditions: true,
  eggs: true,
  fossils: true,
};

/** Abonnement Web Push du navigateur (`PushSubscription.toJSON()`). */
export const pushSubscriptionInputSchema = z.object({
  endpoint: z.url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInputSchema>;

export const pushUnsubscribeInputSchema = z.object({ endpoint: z.url().max(2000) });

export interface PushConfigResponse {
  /** Clé publique VAPID ; null = notifications push désactivées sur le serveur. */
  publicKey: string | null;
  settings: NotificationSettings;
  /** Appareils abonnés pour ce joueur. */
  subscriptions: number;
}

/** Contenu d'une notification, lu par le service worker. */
export interface PushPayload {
  title: string;
  body: string;
  /** Page à ouvrir au clic (onglet du jeu). */
  url: string;
  /** Une nouvelle notification remplace la précédente de même tag. */
  tag: string;
}
