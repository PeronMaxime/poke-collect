import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useBodyScrollLock } from '../../components/ui';

/**
 * Fenêtre d'un combat en temps réel (donjon ou dresseur) et rappel du combat en cours, communs
 * aux pages Donjons et Combats.
 */

/** Combat dont le joueur a fermé la fenêtre (rouverte via le bandeau), par page. */
function readHidden(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function saveHidden(key: string, id: string | null) {
  try {
    if (id) sessionStorage.setItem(key, id);
    else sessionStorage.removeItem(key);
  } catch {
    // Stockage indisponible : la fenêtre se rouvrira au prochain passage sur la page.
  }
}

/**
 * Fenêtre du combat `activeId` : ouverte d'office pour un nouveau combat, sauf si le joueur l'a
 * fermée (mémorisé pour la session sous `storageKey`).
 */
export function useCombatWindow(storageKey: string, activeId: string | null) {
  const [hidden, setHidden] = useState(() => readHidden(storageKey));
  const open = !!activeId && hidden !== activeId;
  function show(next: boolean) {
    const id = next ? null : activeId;
    saveHidden(storageKey, id);
    setHidden(id);
  }
  return { open, show };
}

/**
 * Fenêtre du combat. Contrairement à `Modal`, son contenu reste monté une fois fermée :
 * le combat continue de tourner (et se réclame à sa fin) pendant que le joueur parcourt la liste.
 */
export function CombatWindow({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useBodyScrollLock(open);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div
      className={
        open
          ? 'fixed inset-0 z-50 grid animate-[dungeon-fade_150ms_ease-out] place-items-center overflow-y-auto overscroll-contain bg-slate-950/60 p-4'
          : 'hidden'
      }
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="card w-full max-w-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Rappel du combat en cours, bien visible en haut de la liste, pour rouvrir sa fenêtre ;
 * une fois le combat terminé, pour en voir le résultat.
 */
export function OngoingCombatBanner({
  title,
  portrait,
  over,
  claiming,
  onShow,
}: {
  title: string;
  /** Boss du donjon, dresseur affronté. */
  portrait: ReactNode;
  over: boolean;
  claiming: boolean;
  onShow: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onShow}
      disabled={claiming}
      className="group flex w-full items-center gap-4 rounded-2xl border-2 border-brand-500 bg-brand-500/10 p-4 text-left shadow-lg transition hover:bg-brand-500/20"
    >
      {portrait}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-xs font-semibold tracking-wide text-brand-600 uppercase">
          <span className="relative flex h-2.5 w-2.5">
            {!over && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-75" />
            )}
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-500" />
          </span>
          {over ? 'Combat terminé' : 'Combat en cours'}
        </span>
        <span className="block truncate text-lg font-bold">{title}</span>
      </span>
      <span className="btn-primary shrink-0 px-5 py-3 text-base">
        {claiming ? 'Résultat…' : over ? '🏁 Voir le résultat' : '⚔️ Afficher le combat'}
      </span>
    </button>
  );
}
