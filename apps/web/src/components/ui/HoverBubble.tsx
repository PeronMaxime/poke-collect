import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Bulle d'information au survol (au toucher sur mobile).
 */

/**
 * Bulle d'information au survol de son contenu (au toucher sur mobile, au clavier via le focus).
 * `focusable` : rend le contenu focalisable ; à désactiver quand il contient déjà un bouton.
 */
export function HoverBubble({
  content,
  children,
  width = 144,
  height,
  className = 'inline-block',
  focusable = true,
}: {
  content: ReactNode;
  children: ReactNode;
  /** Largeur de la bulle, en pixels. */
  width?: number;
  /** Hauteur approximative de la bulle, pour choisir dessus/dessous. */
  height: number;
  className?: string;
  focusable?: boolean;
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const open = (hovered || focused) && anchor !== null;

  // Bulle en position fixe : tout défilement la décalerait, on la ferme.
  useEffect(() => {
    if (!open) return;
    const close = () => {
      setHovered(false);
      setFocused(false);
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const measure = (el: HTMLElement) => setAnchor(el.getBoundingClientRect());
  const half = width / 2 + 8;

  return (
    <span
      className={className}
      tabIndex={focusable ? 0 : undefined}
      onMouseEnter={(e) => {
        measure(e.currentTarget);
        setHovered(true);
      }}
      onMouseLeave={() => setHovered(false)}
      onFocus={(e) => {
        // Au clavier ou au toucher seulement : un clic de souris ne doit pas figer la bulle.
        const target = e.target as HTMLElement;
        if (!target.matches(':focus-visible') && !window.matchMedia('(pointer: coarse)').matches)
          return;
        measure(e.currentTarget);
        setFocused(true);
      }}
      onBlur={() => setFocused(false)}
    >
      {children}
      {open &&
        createPortal(
          // Rendue dans <body> pour passer au-dessus des modales et des listes à défilement.
          <span
            className="pointer-events-none fixed z-[60] -translate-x-1/2 rounded-md border-2 border-ink bg-win p-2 text-left text-[11px] shadow-lg"
            style={{
              width,
              left: Math.min(
                Math.max(anchor.left + anchor.width / 2, half),
                window.innerWidth - half,
              ),
              // Au-dessus du contenu quand la place manque en dessous.
              ...(anchor.bottom + height > window.innerHeight
                ? { bottom: window.innerHeight - anchor.top }
                : { top: anchor.bottom }),
            }}
          >
            {content}
          </span>,
          document.body,
        )}
    </span>
  );
}
