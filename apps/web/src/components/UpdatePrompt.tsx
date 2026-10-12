import { useEffect, useState } from 'react';
import { Modal } from './ui';

/** Fréquence de vérification d'une nouvelle version, en plus du retour sur l'onglet. */
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

/** Vrai si `/version.json` annonce une version différente de celle chargée dans la page. */
async function isOutdated(): Promise<boolean> {
  try {
    const res = await fetch('/version.json', { cache: 'no-store' });
    if (!res.ok) return false;
    const { buildId } = (await res.json()) as { buildId?: string };
    return !!buildId && buildId !== __BUILD_ID__;
  } catch {
    // Hors ligne ou serveur en cours de redémarrage : on réessaiera plus tard.
    return false;
  }
}

/**
 * Avertissement au milieu de l'écran quand une nouvelle version du jeu a été mise en ligne,
 * avec un bouton pour recharger la page. « Plus tard » le masque jusqu'à la vérification suivante.
 */
export function UpdatePrompt() {
  const [outdated, setOutdated] = useState(false);

  useEffect(() => {
    if (__BUILD_ID__ === 'dev') return;
    const check = () => {
      void isOutdated().then((o) => o && setOutdated(true));
    };
    const onVisible = () => document.visibilityState === 'visible' && check();
    check();
    const id = window.setInterval(check, CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return (
    <Modal open={outdated} onClose={() => setOutdated(false)} className="text-center">
      <div className="text-4xl">⚠️</div>
      <h2 className="mt-2 text-lg font-bold">Nouvelle version disponible</h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        Dexpedition a été mis à jour. Recharge la page pour profiter des nouveautés et éviter les
        erreurs liées à l’ancienne version.
      </p>
      <div className="mt-4 flex justify-center gap-2">
        <button type="button" className="btn-ghost" onClick={() => setOutdated(false)}>
          Plus tard
        </button>
        <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
          Recharger
        </button>
      </div>
    </Modal>
  );
}
