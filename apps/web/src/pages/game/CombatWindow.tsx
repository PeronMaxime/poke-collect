import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { useBodyScrollLock } from '../../components/ui';

/** Écran d'ordinateur : la fenêtre du combat y est agrandie. */
const DESKTOP_QUERY = '(min-width: 64rem)';
/** Agrandissement maximal de la fenêtre du combat sur ordinateur. */
const MAX_ZOOM = 1.5;
/** Marge gardée autour de la fenêtre agrandie (celle du fond, `p-4`, des deux côtés). */
const ZOOM_MARGIN_PX = 32;

/**
 * Agrandissement de la fenêtre `ref` : jusqu'à `MAX_ZOOM` sur ordinateur, sans jamais dépasser
 * l'écran en largeur ni en hauteur ; 1 sur téléphone et tablette. Recalculé quand l'écran ou la
 * fenêtre change de taille.
 */
function useFitZoom(ref: RefObject<HTMLElement | null>, open: boolean): number {
  const [zoom, setZoom] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!open || !el) return;
    const update = () => {
      if (!window.matchMedia(DESKTOP_QUERY).matches) {
        setZoom(1);
        return;
      }
      // Taille à l'échelle 1 : celle affichée, divisée par l'agrandissement en cours.
      const current = parseFloat(getComputedStyle(el).zoom) || 1;
      const rect = el.getBoundingClientRect();
      const fit = Math.min(
        MAX_ZOOM,
        (window.innerWidth - ZOOM_MARGIN_PX) / (rect.width / current),
        (window.innerHeight - ZOOM_MARGIN_PX) / (rect.height / current),
      );
      const next = Math.max(1, fit);
      setZoom((z) => (Math.abs(z - next) < 0.01 ? z : next));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [ref, open]);
  return zoom;
}

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
  const dialog = useRef<HTMLDivElement>(null);
  const zoom = useFitZoom(dialog, open);
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
          ? // Centrée tant qu'elle tient dans l'écran, sinon calée en haut (jamais coupée).
            'fixed inset-0 z-50 grid grid-cols-1 animate-[dungeon-fade_150ms_ease-out] [place-items:safe_center] overflow-y-auto overscroll-contain bg-slate-950/60 p-4'
          : 'hidden'
      }
      onClick={onClose}
    >
      {/*
       * Sur ordinateur, toute la fenêtre est agrandie d'un bloc (arène, sprites, textes, équipe),
       * jusqu'à ×1,5 tant qu'elle tient dans l'écran. Téléphone : taille normale.
       */}
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        className="card w-full max-w-3xl overflow-hidden p-0"
        style={zoom === 1 ? undefined : { zoom }}
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
      className={`card group flex w-full flex-wrap items-center gap-x-4 gap-y-3 p-3 text-left transition hover:brightness-[1.03] sm:flex-nowrap md:p-4 ${
        over ? 'bg-done' : ''
      }`}
    >
      <span className="sprite-well size-20 shrink-0 overflow-hidden">{portrait}</span>
      <span className="min-w-0 flex-1">
        <span
          className={`pixel-label flex items-center gap-2 text-[9px] uppercase ${
            over ? 'text-amber-700 dark:text-[#f8d878]' : 'text-brand-600 dark:text-[#f8a8a0]'
          }`}
        >
          <span
            aria-hidden
            className={`size-2.5 rounded-sm border-2 border-ink ${
              over ? 'bg-amber-400' : 'animate-blink bg-brand-500'
            }`}
          />
          {over ? 'Combat terminé' : 'Combat en cours'}
        </span>
        <span className="mt-1 block truncate font-semibold sm:text-lg">{title}</span>
      </span>
      <span className="btn-primary w-full shrink-0 sm:w-auto">
        {claiming ? 'Résultat…' : over ? 'Voir le résultat' : 'Afficher le combat'}
      </span>
    </button>
  );
}
