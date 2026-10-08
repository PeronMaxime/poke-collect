import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { api } from './api';
import { logError } from './log';

/**
 * Mode PWA : service worker (jeu installable, cache des sprites, notifications push) et invite
 * d'installation. Le service worker est servi depuis `public/sw.js`.
 */

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .catch((err: unknown) => logError('Service worker', err));
  });
}

// --- Installation ------------------------------------------------------------------------

/** Événement `beforeinstallprompt` (Chrome, Edge, Android), absent des types DOM standard. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // On garde l'invite pour la proposer depuis les réglages, au moment choisi par le joueur.
    e.preventDefault();
    deferredPrompt = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** iOS n'a pas d'invite : il faut passer par « Partager → Sur l'écran d'accueil ». */
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export function useInstallPrompt() {
  const prompt = useSyncExternalStore(subscribe, () => deferredPrompt);
  const install = useCallback(async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    notify();
    return outcome === 'accepted';
  }, []);
  return { canInstall: prompt !== null, install, installed: isStandalone() };
}

// --- Notifications push ----------------------------------------------------------------------

export const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** Clé VAPID (base64url) → octets, pour `pushManager.subscribe`. */
function applicationServerKey(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replaceAll('-', '+')
    .replaceAll('_', '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Abonnement push de cet appareil (navigateur). */
export function useDeviceSubscription() {
  const [subscription, setSubscription] = useState<PushSubscription | null | undefined>(
    pushSupported() ? undefined : null,
  );
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    'Notification' in window ? Notification.permission : 'denied',
  );

  useEffect(() => {
    if (!pushSupported()) return;
    let cancelled = false;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => !cancelled && setSubscription(sub))
      .catch(() => !cancelled && setSubscription(null));
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async (publicKey: string) => {
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result !== 'granted') return false;
    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(publicKey),
      }));
    await api('/api/push/subscriptions', { method: 'POST', json: sub.toJSON() });
    setSubscription(sub);
    return true;
  }, []);

  const disable = useCallback(async () => {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await api('/api/push/subscriptions', { method: 'DELETE', json: { endpoint: sub.endpoint } });
      await sub.unsubscribe();
    }
    setSubscription(null);
  }, []);

  return { subscription, permission, enable, disable };
}
