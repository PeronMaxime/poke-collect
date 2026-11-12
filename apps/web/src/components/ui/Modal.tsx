import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';

/**
 * Fenêtre modale, et blocage du défilement de la page derrière elle.
 */

/** Modales ouvertes qui bloquent le défilement de la page (elles peuvent s'empiler). */
let scrollLocks = 0;

/**
 * Bloque le défilement de la page tant que `active` : la molette ou le doigt dans une modale ne
 * fait plus défiler la page en dessous.
 */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    if (scrollLocks++ === 0) {
      // Compense la barre de défilement qui disparaît, pour que la page ne saute pas de côté.
      const scrollbar = window.innerWidth - root.clientWidth;
      root.style.overflow = 'hidden';
      if (scrollbar > 0) root.style.paddingRight = `${scrollbar}px`;
    }
    return () => {
      if (--scrollLocks === 0) {
        root.style.overflow = '';
        root.style.paddingRight = '';
      }
    };
  }, [active]);
}

/**
 * Fenêtre modale simple (Échap ou clic à l'extérieur pour fermer). Rendue dans <body> pour pouvoir
 * s'ouvrir depuis une autre modale : Échap ne ferme alors que celle du dessus.
 */
export function Modal({
  open,
  onClose,
  children,
  wide = false,
  className = '',
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** `xl` : popup sur presque toute la largeur d'un ordinateur (lancement d'expédition). */
  wide?: boolean | 'xl';
  /** Classes ajoutées à la boîte de dialogue (taille fixe, mise en page…). */
  className?: string;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useBodyScrollLock(open);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (dialogs[dialogs.length - 1] === dialog.current) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid grid-cols-1 place-items-center overflow-y-auto overscroll-contain bg-slate-950/60 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            ref={dialog}
            role="dialog"
            aria-modal="true"
            className={`card w-full ${wide === 'xl' ? 'max-w-5xl' : wide ? 'max-w-3xl' : 'max-w-lg'} ${className}`}
            initial={{ scale: 0.95, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 10 }}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
