/**
 * Colonne des bâtiments (grand écran) : une fenêtre réduite par bâtiment débloqué, déplaçable
 * et repliable ; ordre et fenêtres masquées gardés dans le navigateur.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Reorder, useDragControls } from 'motion/react';
import type { GameContext } from '@poke/game-core';
import {
  reorderWidgets,
  toggleWidgetCollapsed,
  useWidgetSettings,
  widgetTab,
} from '../../lib/widgets';
import type { BuildingTab, WidgetId } from '../../lib/widgets';
import { CenterTile } from './CenterTile';
import { DaycareTile } from './DaycareTile';
import { FarmTile } from './FarmTile';
import { IncubatorTile } from './IncubatorTile';
import { MuseumTile } from './MuseumTile';
import { WidgetHandleContext } from './tileParts';

/**
 * Colonne de droite (grand écran) : les bâtiments débloqués en version réduite. Chaque fenêtre
 * montre un Centre, une pension, une place du Musée ou un champ à la fois (petits carrés pour
 * passer aux suivants) et les actions rapides ; un clic ailleurs que sur un bouton ouvre la page
 * du bâtiment. La poignée de l'en-tête déplace la fenêtre ; ordre et fenêtres masquées (menu
 * « Widgets ») sont gardés dans le navigateur.
 */
export function BuildingsColumn({
  ctx,
  buildings,
}: {
  ctx: GameContext;
  buildings: readonly BuildingTab[];
}) {
  const { order, hidden, collapsed } = useWidgetSettings();
  const shown = order.filter((id) => !hidden.has(id) && buildings.includes(widgetTab(id)));
  if (shown.length === 0) return null;

  const reorder = (next: WidgetId[]) => reorderWidgets(next);
  const move = (id: WidgetId, delta: -1 | 1) => {
    const from = shown.indexOf(id);
    const to = from + delta;
    if (to < 0 || to >= shown.length) return;
    const next = [...shown];
    next.splice(to, 0, ...next.splice(from, 1));
    reorder(next);
  };

  return (
    <Reorder.Group
      as="aside"
      axis="y"
      values={shown}
      onReorder={reorder}
      aria-label="Bâtiments"
      className="hidden w-80 shrink-0 flex-col gap-4 xl:flex"
    >
      {shown.map((id) => (
        <DraggableWidget
          key={id}
          id={id}
          onMove={(delta) => move(id, delta)}
          collapsed={collapsed.has(id)}
        >
          {id === 'center' && <CenterTile ctx={ctx} />}
          {id === 'daycare' && <DaycareTile ctx={ctx} />}
          {id === 'incubator' && <IncubatorTile ctx={ctx} />}
          {id === 'museum' && <MuseumTile ctx={ctx} />}
          {id === 'farm' && <FarmTile ctx={ctx} />}
        </DraggableWidget>
      ))}
    </Reorder.Group>
  );
}

/** Fenêtre déplaçable : seule la poignée de son en-tête lance le glisser. */
function DraggableWidget({
  id,
  onMove,
  collapsed,
  children,
}: {
  id: WidgetId;
  onMove: (delta: -1 | 1) => void;
  collapsed: boolean;
  children: ReactNode;
}) {
  const controls = useDragControls();
  const [dragging, setDragging] = useState(false);
  return (
    <Reorder.Item
      as="div"
      value={id}
      dragListener={false}
      dragControls={controls}
      onDragStart={() => setDragging(true)}
      onDragEnd={() => setDragging(false)}
      className={`relative ${dragging ? 'z-10 [&>section]:shadow-2xl [&>section]:ring-2 [&>section]:ring-brand-500/60' : ''}`}
    >
      <WidgetHandleContext.Provider
        value={{
          start: (e) => controls.start(e),
          move: onMove,
          collapsed,
          toggle: () => toggleWidgetCollapsed(id),
        }}
      >
        {children}
      </WidgetHandleContext.Provider>
    </Reorder.Item>
  );
}
