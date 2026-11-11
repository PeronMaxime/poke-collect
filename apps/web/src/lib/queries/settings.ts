import type { BetaProfilesResponse, NotificationSettings, PushConfigResponse } from '@poke/shared';
import { api } from '../api';

/**
 * Réglages du compte : notifications push de l'appareil et profils secondaires de la bêta.
 */

/** État des notifications : clé publique du serveur, appareils abonnés, réglages. */
export const fetchPushConfig = () => api<PushConfigResponse>('/api/push');

/** Enregistre l'abonnement push de cet appareil (`PushSubscription.toJSON()`). */
export const savePushSubscription = (subscription: PushSubscriptionJSON) =>
  api('/api/push/subscriptions', { method: 'POST', json: subscription });

/** Retire l'abonnement push de cet appareil. */
export const deletePushSubscription = (endpoint: string) =>
  api('/api/push/subscriptions', { method: 'DELETE', json: { endpoint } });

/** Choisit les événements qui déclenchent une notification. */
export const saveNotificationSettings = (settings: NotificationSettings) =>
  api<NotificationSettings>('/api/push/settings', { method: 'PUT', json: settings });

/** Envoie une notification d'essai aux appareils du joueur. */
export const sendTestNotification = () =>
  api<{ sent: number }>('/api/push/test', { method: 'POST' });

/** Profils secondaires du compte (bêta). */
export const fetchBetaProfiles = () => api<BetaProfilesResponse>('/api/beta/profiles');

/** Commence une nouvelle partie sur le même compte. */
export const createBetaProfile = () =>
  api<BetaProfilesResponse>('/api/beta/profiles', { method: 'POST' });

/** Change de partie (`null` : la partie principale). */
export const activateBetaProfile = (profileId: string | null) =>
  api<BetaProfilesResponse>('/api/beta/profiles/active', { method: 'POST', json: { profileId } });

/** Supprime une partie secondaire. */
export const deleteBetaProfile = (profileId: string) =>
  api<BetaProfilesResponse>(`/api/beta/profiles/${profileId}`, { method: 'DELETE' });
