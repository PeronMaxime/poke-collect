/**
 * Captcha Cloudflare Turnstile des formulaires de connexion (jeu et admin) : le script de
 * Cloudflare n'est chargé que si le serveur annonce une clé publique (`captchaSiteKey` de
 * `/api/config`), et le jeton obtenu part dans l'en-tête `x-captcha-response` de Better Auth.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface Turnstile {
  render(
    element: HTMLElement,
    options: {
      sitekey: string;
      language?: string;
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
    },
  ): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let loading: Promise<Turnstile> | null = null;

/** Charge le script de Turnstile une seule fois pour toute la page. */
function loadTurnstile(): Promise<Turnstile> {
  loading ??= new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error()));
    script.onerror = () => {
      loading = null;
      reject(new Error('Captcha indisponible'));
    };
    document.head.append(script);
  });
  return loading;
}

/** État du captcha d'un formulaire (voir `useCaptcha`). */
export interface Captcha {
  /** À poser sur l'élément où s'affiche le widget (rien n'est affiché sans clé). */
  mount: (element: HTMLDivElement | null) => void;
  /** Le formulaire peut partir : pas de captcha, ou un jeton obtenu. */
  ready: boolean;
  /** Le script de Cloudflare n'a pas pu se charger (bloqueur, réseau). */
  failed: boolean;
  /** Options d'appel de Better Auth portant le jeton (vide sans captcha). */
  fetchOptions: { headers: Record<string, string> } | undefined;
  /** Un jeton ne sert qu'une fois : en redemander un après chaque envoi. */
  reset: () => void;
}

/**
 * Captcha d'un formulaire ; `siteKey` null (non configuré, ou `/api/config` pas encore chargé
 * sans clé) : aucun widget, formulaire toujours prêt.
 */
export function useCaptcha(siteKey: string | null | undefined): Captcha {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const widget = useRef<{ api: Turnstile; id: string } | null>(null);

  useEffect(() => {
    if (!siteKey || !element) return;
    let cancelled = false;
    loadTurnstile().then(
      (api) => {
        if (cancelled) return;
        const id = api.render(element, {
          sitekey: siteKey,
          language: 'fr',
          callback: setToken,
          'expired-callback': () => setToken(null),
          'error-callback': () => setToken(null),
        });
        widget.current = { api, id };
      },
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
      if (widget.current) widget.current.api.remove(widget.current.id);
      widget.current = null;
      setToken(null);
    };
  }, [siteKey, element]);

  const reset = useCallback(() => {
    setToken(null);
    if (widget.current) widget.current.api.reset(widget.current.id);
  }, []);

  return {
    mount: setElement,
    ready: !siteKey || token !== null,
    failed,
    fetchOptions: siteKey && token ? { headers: { 'x-captcha-response': token } } : undefined,
    reset,
  };
}
