/**
 * Case de l'équipe qu'on glisse pour changer l'ordre (comme la vitrine de la fiche du dresseur),
 * et les deux calculs d'ordre qui vont avec.
 */
import { useState } from 'react';
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { Reorder, useDragControls } from 'motion/react';

/**
 * `ids` avec l'élément `index` échangé avec son voisin (`delta` = -1 au-dessus, 1 en dessous) ;
 * le même tableau si le voisin n'existe pas.
 */
export function swapped(ids: readonly string[], index: number, delta: -1 | 1): readonly string[] {
  const target = index + delta;
  if (index < 0 || target < 0 || target >= ids.length) return ids;
  const next = [...ids];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

/**
 * Équipe `team` remise dans l'ordre `order` (ses membres affichés) ; les identifiants absents de
 * `order` (Pokémon devenu indisponible) restent, à la fin.
 */
export function withOrder(team: readonly string[], order: readonly string[]): string[] {
  return [...order, ...team.filter((id) => !order.includes(id))];
}

/**
 * Case d'un membre, à poser dans un `Reorder.Group` d'identifiants. À la souris, elle se glisse
 * de n'importe où (sauf ses boutons) ; au doigt, par sa poignée seulement, pour que le reste de la
 * case laisse défiler la liste ; au clavier (case sélectionnée), avec les flèches haut et bas.
 * `children` reçoit la poignée, à placer dans la case.
 */
export function SortableSlot({
  id,
  label,
  className,
  onMove,
  children,
}: {
  id: string;
  /** Nom lu par les lecteurs d'écran (« 2. Pikachu »). */
  label: string;
  className: string;
  onMove: (delta: -1 | 1) => void;
  children: (grip: ReactNode) => ReactNode;
}) {
  const controls = useDragControls();
  const [dragging, setDragging] = useState(false);
  const onKeyDown = (e: KeyboardEvent<HTMLLIElement>) => {
    if (e.target !== e.currentTarget || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const row = e.currentTarget;
    onMove(e.key === 'ArrowUp' ? -1 : 1);
    // La case change de place dans le DOM : elle garde le focus.
    requestAnimationFrame(() => row.focus());
  };
  const onPointerDown = (e: PointerEvent<HTMLLIElement>) => {
    const fromButton = (e.target as Element).closest('button') !== null;
    if (e.pointerType === 'mouse' && e.button === 0 && !fromButton) controls.start(e);
  };
  const grip = (
    <span
      aria-hidden
      title="Glisser pour changer l’ordre"
      className="grid h-8 w-5 shrink-0 cursor-grab touch-none place-items-center text-slate-400"
      onPointerDown={(e) => {
        if (e.pointerType !== 'mouse') controls.start(e);
      }}
    >
      <svg viewBox="0 0 6 10" width="9" height="15" shapeRendering="crispEdges">
        <path
          d="M0 0h2v2h-2zM4 0h2v2h-2zM0 4h2v2h-2zM4 4h2v2h-2zM0 8h2v2h-2zM4 8h2v2h-2z"
          fill="currentColor"
        />
      </svg>
    </span>
  );
  return (
    <Reorder.Item
      as="li"
      value={id}
      dragListener={false}
      dragControls={controls}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onDragStart={() => setDragging(true)}
      onDragEnd={() => setDragging(false)}
      aria-label={`${label} (flèches haut et bas pour changer l’ordre)`}
      // Image du sprite inerte : sinon le navigateur lance son propre glisser d'image.
      className={`${className} relative cursor-grab select-none [&_img]:pointer-events-none ${
        dragging ? 'z-10 cursor-grabbing shadow-xl ring-2 ring-amber-600 dark:ring-[#f8d878]' : ''
      }`}
    >
      {children(grip)}
    </Reorder.Item>
  );
}
