import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Rangée à défilement horizontal.
 */

/**
 * Rangée sur une seule ligne qui défile horizontalement quand elle déborde (mobile surtout) :
 * le bord qui cache encore des éléments s'estompe et porte une flèche (cliquable) qui invite à
 * faire glisser. L'élément `[aria-selected="true"]` est ramené dans la zone visible à chaque
 * changement de sélection.
 */
export function ScrollRow({
  children,
  selectedKey,
  className = '',
  role,
}: {
  children: ReactNode;
  /** Change à chaque sélection : l'onglet choisi est alors ramené en vue. */
  selectedKey?: string;
  /** Classes de la rangée (espacement…). */
  className?: string;
  role?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((e) => (e.left === left && e.right === right ? e : { left, right }));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    el.addEventListener('scroll', update, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener('scroll', update);
    };
  });

  useEffect(() => {
    const reveal = () => {
      const el = ref.current;
      const tab = el?.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!el || !tab || el.scrollWidth <= el.clientWidth) return;
      const start = tab.offsetLeft - el.offsetLeft;
      const end = start + tab.offsetWidth;
      if (start >= el.scrollLeft && end <= el.scrollLeft + el.clientWidth) return;
      el.scrollTo({ left: start - (el.clientWidth - tab.offsetWidth) / 2, behavior: 'smooth' });
    };
    reveal();
    // La police pixel peut arriver après le premier rendu et élargir les onglets.
    let cancelled = false;
    void document.fonts?.ready.then(() => {
      if (!cancelled) reveal();
    });
    return () => {
      cancelled = true;
    };
  }, [selectedKey]);

  const fade = 32;
  const mask = `linear-gradient(to right, ${edges.left ? `transparent, #000 ${fade}px` : '#000'}, ${
    edges.right ? `#000 calc(100% - ${fade}px), transparent` : '#000'
  })`;
  const scrollBy = (dir: 1 | -1) => {
    const el = ref.current;
    el?.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: 'smooth' });
  };
  const arrow = (dir: 1 | -1) => (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden
      onClick={() => scrollBy(dir)}
      className={`absolute top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border-2 border-ink bg-[#f8d030] text-[10px] leading-none text-ink shadow-[2px_2px_0_rgb(40_48_72/0.35)] ${
        dir === 1 ? 'right-0' : 'left-0'
      }`}
    >
      <span className={dir === 1 ? 'animate-nudge-right' : 'animate-nudge-left'}>
        {dir === 1 ? '▶' : '◀'}
      </span>
    </button>
  );

  return (
    <div className="relative min-w-0">
      <div
        ref={ref}
        role={role}
        className={`no-scrollbar flex overflow-x-auto overscroll-x-contain ${className}`}
        style={{ maskImage: mask, WebkitMaskImage: mask }}
      >
        {children}
      </div>
      {edges.left && arrow(-1)}
      {edges.right && arrow(1)}
    </div>
  );
}
