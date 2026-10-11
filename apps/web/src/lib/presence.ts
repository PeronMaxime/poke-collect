import { useEffect } from 'react';
import { api } from './api';

const HEARTBEAT_MS = 60_000;

/**
 * Signal de présence toutes les minutes tant que l'onglet est visible (et dès qu'il le
 * redevient), pour l'indicateur « connecté » de l'administration.
 */
export function usePresence(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const ping = () => {
      if (document.visibilityState === 'visible') {
        api('/api/presence', { method: 'POST' }).catch(() => undefined);
      }
    };
    const timer = setInterval(ping, HEARTBEAT_MS);
    document.addEventListener('visibilitychange', ping);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', ping);
    };
  }, [enabled]);
}
