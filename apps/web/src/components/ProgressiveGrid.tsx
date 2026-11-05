import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/** Nombre de cartes affichées d'emblée, puis ajoutées à chaque fois que la fin approche. */
const PAGE_SIZE = 120;

/**
 * Grille affichée par tranches : les premiers éléments tout de suite, la suite quand le joueur
 * approche du bas (une collection de plusieurs milliers de Pokémon ne se dessine pas d'un coup).
 * À placer dans la grille : les éléments et la sentinelle de fin sont ses enfants directs.
 * `resetKey` : valeur qui change quand le contenu est une autre vue (filtres, tri…) ; la liste
 * repart alors de la première tranche. Un simple rechargement des mêmes données la garde.
 */
export function ProgressiveItems<T>({
  items,
  resetKey,
  children,
  pageSize = PAGE_SIZE,
}: {
  items: readonly T[];
  resetKey?: string;
  children: (item: T) => ReactNode;
  pageSize?: number;
}) {
  const [count, setCount] = useState(pageSize);
  const [shownKey, setShownKey] = useState(resetKey);
  if (shownKey !== resetKey) {
    // Autre vue : retour à la première tranche (ajustement pendant le rendu, sans effet en plus).
    setShownKey(resetKey);
    setCount(pageSize);
  }
  const more = items.length > count;
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!more || !el) return;
    // Observateur recréé à chaque tranche : il signale tout de suite si la fin est déjà en vue
    // (grand écran), sans quoi la suite ne se chargerait qu'après un défilement.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setCount((c) => c + pageSize);
      },
      { rootMargin: '600px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [more, count, pageSize]);

  return (
    <>
      {items.slice(0, count).map(children)}
      {more && <div ref={sentinel} className="col-span-full h-px" aria-hidden />}
    </>
  );
}
