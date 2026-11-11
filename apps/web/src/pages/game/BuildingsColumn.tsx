import { createContext, useContext, useState } from 'react';
import type { KeyboardEvent, MouseEvent, PointerEvent, ReactNode } from 'react';
import { Reorder, useDragControls } from 'motion/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ASSISTANT_POST_PLACES,
  FARM_PLOTS,
  assistantSlotCount,
  berryPlantEffect,
  daycareXp,
  eggsLaid,
  fossilEffect,
  hatchMinutes,
} from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type {
  BagEggDto,
  BerryPlotDto,
  CollectEggsInput,
  CollectEggsResponse,
  DaycareDto,
  EggDto,
  FossilRevivalDto,
  HarvestBerriesResponse,
  HatchEggsResponse,
  IncubateEggsResponse,
  PlantBerryInput,
  PokemonDto,
  ReviveFossilsResponse,
} from '@poke/shared';
import { CollapseBody, CollapseButton } from '../../components/Collapsible';
import { Egg, EggTimer, Modal, PokemonSprite, ProgressBar, useNow } from '../../components/ui';
import { api } from '../../lib/api';
import {
  reorderWidgets,
  toggleWidgetCollapsed,
  useWidgetSettings,
  widgetTab,
} from '../../lib/widgets';
import type { BuildingTab, WidgetId } from '../../lib/widgets';
import {
  PROGRESS_KEYS,
  assistantPlaces,
  centerState,
  keys,
  refresh,
  serverOffset,
  shownPlaces,
  useAssistants,
  useDaycare,
  useFarm,
  useHeal,
  useInventory,
  useMuseum,
  usePlayerProgress,
  usePokemon,
} from '../../lib/game';
import {
  errorText,
  formatDuration,
  itemIcon,
  itemName,
  speciesName,
  yieldRange,
} from '../../lib/labels';
import { AbilityLine, AssistantCircle } from './AssistantCard';
import { groupBagEggs } from './DaycarePage';
import { DepositDialog } from './DepositDialog';
import { HatchReveal } from './HatchReveal';
import { formatXp, usePlayerBonuses } from './XpPreview';

/** Temps restant en minutes ou en heures (« 34 min », « 2 h 05 »). */
function shortCountdown(ms: number) {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

/**
 * Commandes de la fenêtre : poignée (glisser pour la déplacer, flèches du clavier pour la
 * monter/descendre) et repli en accordéon.
 */
type WidgetHandle = {
  start: (e: PointerEvent<HTMLElement>) => void;
  move: (delta: -1 | 1) => void;
  collapsed: boolean;
  toggle: () => void;
};
const WidgetHandleContext = createContext<WidgetHandle | null>(null);

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

/** Bouton de repli de l'en-tête d'une fenêtre (à gauche de la poignée). */
function WidgetCollapseButton({ title }: { title: string }) {
  const handle = useContext(WidgetHandleContext);
  if (!handle) return null;
  return (
    <CollapseButton
      collapsed={handle.collapsed}
      onToggle={handle.toggle}
      label={`la fenêtre ${title}`}
    />
  );
}

/** Contenu d'une fenêtre, masqué en accordéon quand elle est repliée. */
function TileBody({ children }: { children: ReactNode }) {
  const handle = useContext(WidgetHandleContext);
  return (
    <CollapseBody open={!handle?.collapsed} className="flex flex-col gap-2.5 pt-2.5">
      {children}
    </CollapseBody>
  );
}

/** Poignée à six points de l'en-tête d'une fenêtre. */
function DragHandle({ title }: { title: string }) {
  const handle = useContext(WidgetHandleContext);
  if (!handle) return null;
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const button = e.currentTarget;
    handle.move(e.key === 'ArrowUp' ? -1 : 1);
    // La fenêtre change de place dans le DOM : la poignée garde le focus.
    requestAnimationFrame(() => button.focus());
  };
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        e.preventDefault();
        handle.start(e);
      }}
      onKeyDown={onKeyDown}
      aria-label={`Déplacer la fenêtre ${title} (flèches haut et bas)`}
      title="Glisser pour déplacer"
      className="-my-1 -mr-1 grid size-7 shrink-0 cursor-grab touch-none place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing dark:hover:bg-slate-800 dark:hover:text-slate-200"
    >
      <svg viewBox="0 0 6 10" width="9" height="15" shapeRendering="crispEdges" aria-hidden>
        <path
          d="M0 0h2v2h-2zM4 0h2v2h-2zM0 4h2v2h-2zM4 4h2v2h-2zM0 8h2v2h-2zM4 8h2v2h-2z"
          fill="currentColor"
        />
      </svg>
    </button>
  );
}

/** Fenêtre d'un bâtiment : un clic hors des boutons et des liens ouvre sa page. */
function Tile({
  tab,
  title,
  icon,
  badge,
  children,
}: {
  tab: BuildingTab;
  title: string;
  icon: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
}) {
  const open = (e: MouseEvent<HTMLElement>) => {
    const target = e.target as Element;
    // Clic dans une fenêtre en portail (modale) : il remonte l'arbre React, pas celui de la page.
    if (!e.currentTarget.contains(target)) return;
    if (target.closest('a, button, input, select, textarea, label')) return;
    // Texte sélectionné à la souris : pas de changement de page.
    if (window.getSelection()?.type === 'Range') return;
    window.location.hash = `#${tab}`;
  };
  return (
    <section
      onClick={open}
      className="card flex cursor-pointer flex-col p-3 transition hover:ring-2 hover:ring-brand-500/40"
    >
      <div className="flex items-center gap-2">
        <span className="shrink-0" aria-hidden>
          {icon}
        </span>
        <h2 className="min-w-0 flex-1">
          <a
            href={`#${tab}`}
            className="font-pixel text-[10px] leading-relaxed text-title uppercase hover:text-brand-500"
          >
            {title}
          </a>
        </h2>
        {badge}
        <WidgetCollapseButton title={title} />
        <DragHandle title={title} />
      </div>
      <TileBody>{children}</TileBody>
    </section>
  );
}

/** Pied d'une fenêtre : résumé à gauche, action à droite. */
function TileFooter({ text, children }: { text?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-2 text-sm">
      <span className="min-w-0 text-slate-600 dark:text-slate-300">{text}</span>
      {children}
    </div>
  );
}

/** Page affichée d'une fenêtre, ramenée dans les bornes si le nombre de bâtiments baisse. */
function usePage(count: number) {
  const [page, setPage] = useState(0);
  return [Math.max(0, Math.min(page, count - 1)), setPage] as const;
}

/**
 * Sélecteur de bâtiment : le nom de celui affiché, puis un petit carré par Centre, pension,
 * place ou champ. Un carré jaune signale qu'une action y attend le joueur.
 */
function Pager({
  label,
  count,
  index,
  onChange,
  waiting,
  name = (i) => `${label} ${i + 1}`,
}: {
  label: string;
  count: number;
  index: number;
  onChange: (index: number) => void;
  waiting?: readonly boolean[];
  /** Nom d'une page (« Places 1 et 2 »…) ; par défaut le libellé suivi du numéro. */
  name?: (index: number) => string;
}) {
  if (count <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="shrink-0 text-xs font-semibold text-slate-600 dark:text-slate-300">
        {name(index)}
      </span>
      <div className="flex flex-wrap justify-end" role="group" aria-label={`Choisir : ${label}`}>
        {Array.from({ length: count }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onChange(i)}
            aria-label={`${name(i)}${waiting?.[i] ? ' (action en attente)' : ''}`}
            aria-current={i === index ? 'true' : undefined}
            className="group grid size-5 place-items-center"
          >
            <span
              className={`block size-2.5 rounded-[2px] border-2 transition group-hover:scale-125 ${
                i === index
                  ? 'border-ink bg-ink dark:border-title dark:bg-title'
                  : waiting?.[i]
                    ? 'border-[#b07a10] bg-[#f8d030]'
                    : 'border-slate-400 dark:border-slate-500'
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

const SMALL_BTN = 'shrink-0 whitespace-nowrap px-2.5 py-1.5';
/**
 * Survol bien visible des boutons d'action des widgets (Soigner, Couver, Récupérer…) : le fond
 * change franchement de couleur.
 */
const HOVER_PRIMARY = 'enabled:hover:bg-[#2878c8]! enabled:hover:text-white!';
const HOVER_GHOST = 'enabled:hover:bg-[#b8dcf6]! dark:enabled:hover:bg-[#2c5578]!';
const FREE_PLACE =
  'border-2 border-dashed border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400';
const CLOSED_PLACE =
  'border-2 border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-600';

function Badge({
  count,
  className = 'bg-brand-500 text-white',
  title,
}: {
  count: number;
  className?: string;
  title?: string;
}) {
  return count > 0 ? (
    <span className={`count-badge ${className}`} title={title}>
      {count}
    </span>
  ) : null;
}

/* ───────────────────────────── Centre Pokémon ───────────────────────────── */

function CenterTile({ ctx }: { ctx: GameContext }) {
  const pokemon = usePokemon();
  const progress = usePlayerProgress();
  const assistants = useAssistants();
  const heal = useHeal();
  const now = useNow(5000);
  const { slots, healing, knockedOut, free } = centerState(ctx, pokemon.data ?? [], now, progress);
  const shown = shownPlaces(slots, [
    ...healing.map((p) => p.healSlot ?? 0),
    ...assistantPlaces(assistants.data, 'center'),
  ]);
  const size = ASSISTANT_POST_PLACES.center;
  const centers = assistantSlotCount('center', shown);
  const [center, setCenter] = usePage(centers);
  const first = center * size;
  const waiting = [...knockedOut].sort((a, b) => b.level - a.level);
  // Plus de K.O. que de places libres : choix des Pokémon à soigner (les plus hauts niveaux d'abord).
  const [selected, setSelected] = useState<string[] | null>(null);
  const chosen = (selected ?? []).filter((id) => waiting.some((p) => p.id === id)).slice(0, free);
  const toggle = (id: string) =>
    setSelected(
      chosen.includes(id)
        ? chosen.filter((x) => x !== id)
        : chosen.length < free
          ? [...chosen, id]
          : chosen,
    );

  return (
    <>
      <Tile
        tab="center"
        title="Centre Pokémon"
        icon={<CenterIcon />}
        badge={
          <Badge
            count={free > 0 ? waiting.length : 0}
            className="bg-red-500 text-white"
            title="Pokémon K.O. à soigner"
          />
        }
      >
        <Pager label="Centre" count={centers} index={center} onChange={setCenter} />
        {centers > 0 && (
          <div className="flex items-center gap-2">
            <div className="grid min-w-0 flex-1 grid-cols-3 gap-1">
              {Array.from({ length: Math.min(size, shown - first) }, (_, i) => {
                const place = first + i;
                const p = healing.find((h) => h.healSlot === place);
                if (p) {
                  const left = shortCountdown(Date.parse(p.healUntil!) - now);
                  return (
                    <div
                      key={place}
                      className="flex h-12 flex-col items-center justify-end overflow-hidden rounded-md border-2 border-well-line bg-well pb-0.5"
                      title={`${speciesName(ctx, p.speciesId, p.formId)} : soins ${left}`}
                    >
                      <PokemonSprite
                        speciesId={p.speciesId}
                        formId={p.formId}
                        shiny={p.isShiny}
                        size={36}
                        className="-my-1"
                      />
                      <span className="font-mono text-[10px] leading-none text-pink-700 dark:text-pink-300">
                        {left}
                      </span>
                    </div>
                  );
                }
                return place < slots ? (
                  <div
                    key={place}
                    title="Place libre"
                    className={`h-12 rounded-md ${FREE_PLACE}`}
                  />
                ) : (
                  <div
                    key={place}
                    title="Place fermée"
                    className={`grid h-12 place-items-center rounded-md ${CLOSED_PLACE}`}
                  >
                    <LockIcon />
                  </div>
                );
              })}
            </div>
            <AssistantCircle ctx={ctx} post="center" slot={center} closed={first >= slots} />
          </div>
        )}
        <TileFooter
          text={
            waiting.length > 0 ? `${waiting.length} Pokémon K.O. en attente` : 'Aucun Pokémon K.O.'
          }
        >
          {waiting.length > 0 && (
            <button
              className={`btn-primary ${SMALL_BTN} ${HOVER_PRIMARY}`}
              disabled={free === 0 || heal.isPending}
              title={free === 0 ? 'Toutes les places du Centre sont occupées.' : undefined}
              onClick={() =>
                free >= waiting.length
                  ? heal.mutate(waiting.map((p) => p.id))
                  : setSelected(waiting.slice(0, free).map((p) => p.id))
              }
            >
              {free >= waiting.length || free === 0 ? 'Tout soigner' : 'Soigner'}
            </button>
          )}
        </TileFooter>
        {heal.error && <p className="text-xs text-red-600">{errorText(heal.error)}</p>}
      </Tile>
      <Modal open={selected !== null} onClose={() => setSelected(null)}>
        <h2 className="text-xl font-bold">Soigner des Pokémon</h2>
        <p className="mt-1 text-sm text-slate-500">
          {waiting.length} Pokémon K.O. pour{' '}
          {free > 1 ? `${free} places libres` : `${free} place libre`} : choisis ceux à soigner.
        </p>
        <ul className="-mx-1 mt-3 grid max-h-[60vh] gap-2 overflow-y-auto p-1">
          {waiting.map((p) => {
            const on = chosen.includes(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  disabled={!on && chosen.length >= free}
                  onClick={() => toggle(p.id)}
                  className={`flex w-full items-center gap-3 rounded-md border-2 p-2 text-left transition enabled:hover:border-brand-500 disabled:cursor-default disabled:opacity-50 ${
                    on ? 'border-ink bg-done' : 'border-well-line bg-tile'
                  }`}
                >
                  <PokemonSprite
                    speciesId={p.speciesId}
                    formId={p.formId}
                    shiny={p.isShiny}
                    size={40}
                  />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block font-medium">
                      {speciesName(ctx, p.speciesId, p.formId)}
                    </span>
                    <span className="text-xs text-slate-500">Niveau {p.level}</span>
                  </span>
                  <span
                    aria-hidden
                    className={`grid size-5 shrink-0 place-items-center rounded-[3px] border-2 text-xs font-bold ${
                      on
                        ? 'border-ink bg-ink text-white dark:border-title dark:bg-title dark:text-ink'
                        : 'border-slate-400'
                    }`}
                  >
                    {on ? '✓' : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {heal.error && <p className="mt-2 text-sm text-red-600">{errorText(heal.error)}</p>}
        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="text-sm text-slate-500">
            {chosen.length} / {free} place{free > 1 ? 's' : ''}
          </span>
          <span className="flex gap-2">
            <button className="btn-ghost" onClick={() => setSelected(null)}>
              Annuler
            </button>
            <button
              className="btn-primary"
              disabled={chosen.length === 0 || heal.isPending}
              onClick={() => heal.mutate(chosen, { onSuccess: () => setSelected(null) })}
            >
              {chosen.length > 1 ? `Soigner (${chosen.length})` : 'Soigner'}
            </button>
          </span>
        </div>
      </Modal>
    </>
  );
}

/* ───────────────────────────── Pension ───────────────────────────── */

function DaycareTile({ ctx }: { ctx: GameContext }) {
  const queryClient = useQueryClient();
  const daycare = useDaycare();
  const pokemon = usePokemon();
  const assistants = useAssistants();
  const now = useNow(5000);
  const [notice, setNotice] = useState<string | null>(null);
  // Pokémon cliqué (fenêtre Retirer / Changer), puis place où en déposer un.
  const [focus, setFocus] = useState<Place | null>(null);
  const [depositAt, setDepositAt] = useState<Place | null>(null);

  const refreshDaycare = () => refresh(queryClient, keys.daycare, keys.pokemon, keys.inventory);
  // XP reçue par les Pokémon qui quittent la pension.
  const xpNotice = (res: CollectEggsResponse) => {
    const xp = (res.parents ?? [])
      .filter((x) => x.xpGained > 0)
      .map((x) => {
        const parent = pokemonById.get(x.pokemonId);
        const name = parent ? speciesName(ctx, parent.speciesId, parent.formId) : 'Un Pokémon';
        const level = x.levelAfter > x.levelBefore ? ` et passe au N.${x.levelAfter}` : '';
        return `${name} gagne ${formatXp(x.xpGained)}${level}.`;
      });
    setNotice(xp.join(' ') || null);
  };
  const collect = useMutation({
    mutationFn: ({ slot, to }: { slot: number; to: CollectEggsInput['to'] }) =>
      api<CollectEggsResponse>(`/api/daycare/${slot}/collect`, { method: 'POST', json: { to } }),
    onSuccess: (res) => {
      setNotice(res.bagged > 0 ? `${plural(res.bagged, 'œuf')} dans le sac.` : null);
      return refreshDaycare();
    },
  });
  const withdraw = useMutation({
    mutationFn: ({ slot, side }: Place) =>
      api<CollectEggsResponse>(`/api/daycare/${slot}/parents/${side}`, { method: 'DELETE' }),
    onSuccess: (res) => {
      xpNotice(res);
      setFocus(null);
      return refreshDaycare();
    },
  });

  const data = daycare.data;
  const serverNow = now + serverOffset(data, daycare.dataUpdatedAt);
  const pokemonById = new Map(pokemon.data?.map((p) => [p.id, p]));
  const openSlots = data?.slots ?? 0;
  const pensions = data?.pensions ?? [];
  const shownSlots = shownPlaces(openSlots, [
    ...pensions.map((p) => p.slotIndex),
    ...assistantPlaces(assistants.data, 'daycare'),
  ]);
  const [slot, setSlot] = usePage(shownSlots);
  const laidOf = (p: DaycareDto | undefined) =>
    p?.breeds
      ? Math.min(
          eggsLaid(ctx, new Date(p.startedAt), new Date(serverNow), p.eggMinutes),
          ctx.balance.breeding.pensionMaxEggs,
        )
      : 0;
  const pensionAt = (i: number) => pensions.find((p) => p.slotIndex === i);
  // Pensions dont des œufs attendent (la couveuse a sa propre pastille).
  const badge = pensions.filter((p) => laidOf(p) > 0).length;
  const pension = pensionAt(slot);
  const closed = slot >= openSlots;
  const parentsOf = (p: DaycareDto | undefined) =>
    [p?.parentAId, p?.parentBId].map((id) => (id ? pokemonById.get(id) : undefined));
  const focused = focus ? pensionAt(focus.slot) : undefined;
  const busy = collect.isPending || withdraw.isPending;

  return (
    <>
      <Tile tab="daycare" title="Pension" icon={<HouseIcon />} badge={<Badge count={badge} />}>
        {shownSlots === 0 && (
          <p className="text-sm text-slate-500">Aucune pension débloquée pour l’instant.</p>
        )}
        <Pager
          label="Pension"
          count={shownSlots}
          index={slot}
          onChange={setSlot}
          waiting={Array.from({ length: shownSlots }, (_, i) => laidOf(pensionAt(i)) > 0)}
        />
        {shownSlots > 0 && (
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              {pension || !closed ? (
                <PensionRow
                  ctx={ctx}
                  pension={pension}
                  parents={parentsOf(pension)}
                  waiting={laidOf(pension)}
                  serverNow={serverNow}
                  busy={busy}
                  closed={closed}
                  onCollect={(to) => collect.mutate({ slot, to })}
                  onParent={(side) => {
                    withdraw.reset();
                    setFocus({ slot, side });
                  }}
                  onAdd={(side) => setDepositAt({ slot, side })}
                />
              ) : (
                <div className={`grid h-14 place-items-center rounded-md text-sm ${CLOSED_PLACE}`}>
                  Pension fermée
                </div>
              )}
            </div>
            <AssistantCircle ctx={ctx} post="daycare" slot={slot} closed={closed} />
          </div>
        )}
        {notice && <p className="text-xs text-emerald-700 dark:text-emerald-400">{notice}</p>}
        {collect.error && <p className="text-xs text-red-600">{errorText(collect.error)}</p>}
      </Tile>
      {focus && focused && (
        <PensionParentDialog
          ctx={ctx}
          pension={focused}
          side={focus.side}
          p={parentsOf(focused)[focus.side]}
          serverNow={serverNow}
          busy={withdraw.isPending}
          error={withdraw.error}
          onWithdraw={() => withdraw.mutate(focus)}
          onChange={() => {
            setFocus(null);
            setDepositAt(focus);
          }}
          onClose={() => setFocus(null)}
        />
      )}
      {depositAt && (
        <DepositDialog
          ctx={ctx}
          slotIndex={depositAt.slot}
          side={depositAt.side}
          pension={pensionAt(depositAt.slot)}
          onDeposited={xpNotice}
          onClose={() => setDepositAt(null)}
        />
      )}
    </>
  );
}

/** Place d'un Pokémon : pension et côté (0 : parent A, 1 : parent B). */
type Place = { slot: number; side: 0 | 1 };

/** Pokémon d'une pension cliqué dans la colonne : son séjour, et le retirer ou le changer. */
function PensionParentDialog({
  ctx,
  pension,
  side,
  p,
  serverNow,
  busy,
  error,
  onWithdraw,
  onChange,
  onClose,
}: {
  ctx: GameContext;
  pension: DaycareDto;
  side: 0 | 1;
  p: PokemonDto | undefined;
  serverNow: number;
  busy: boolean;
  error: unknown;
  onWithdraw: () => void;
  onChange: () => void;
  onClose: () => void;
}) {
  const bonuses = usePlayerBonuses(ctx);
  const since = side === 0 ? pension.parentADepositedAt : pension.parentBDepositedAt;
  const gain = p && since ? daycareXp(ctx, p, new Date(since), new Date(serverNow), bonuses) : null;
  const held = side === 0 ? pension.heldItemAId : pension.heldItemBId;
  const hasPartner = !!(side === 0 ? pension.parentBId : pension.parentAId);
  return (
    <Modal open onClose={onClose}>
      <h2 className="text-lg font-bold">Pension {pension.slotIndex + 1}</h2>
      {p && gain ? (
        <div className="mt-3 flex items-center gap-3 rounded-xl border-2 border-ink bg-tile p-3">
          <span className="sprite-well size-16 shrink-0">
            <PokemonSprite speciesId={p.speciesId} formId={p.formId} shiny={p.isShiny} size={64} />
          </span>
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">
              {speciesName(ctx, p.speciesId, p.formId)}{' '}
              <span className="text-xs text-slate-500">N.{p.level}</span>
            </p>
            <p className="text-xs text-slate-500">
              {gain.xpGained > 0 ? (
                <>
                  <span className="text-emerald-600">+{formatXp(gain.xpGained)}</span> au retrait
                  {gain.levelAfter > gain.levelBefore && ` (N.${gain.levelAfter})`}
                </>
              ) : p.level >= 100 ? (
                'Niveau maximal'
              ) : (
                'Pas encore d’XP'
              )}
            </p>
            {held && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                <img src={itemIcon(ctx, held)} alt="" className="h-4 w-4" />
                {itemName(ctx, held)}
              </p>
            )}
            <AbilityLine ctx={ctx} p={p} activities={['breeding']} />
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500">Ce Pokémon n’est plus dans le PC.</p>
      )}
      <p className="mt-3 text-sm text-slate-500">
        En quittant la pension, il reçoit son XP
        {pension.breeds && ' et les œufs prêts vont dans la couveuse (le surplus dans le sac)'}.
        {hasPartner && ' Son partenaire reste en pension.'}
      </p>
      {error ? <p className="mt-2 text-sm text-red-600">{errorText(error)}</p> : null}
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>
          Annuler
        </button>
        <button className="btn-ghost" disabled={busy} onClick={onWithdraw}>
          {busy ? 'Retrait…' : 'Retirer'}
        </button>
        <button className="btn-primary" disabled={busy} onClick={onChange}>
          Changer
        </button>
      </div>
    </Modal>
  );
}

function PensionRow({
  ctx,
  pension,
  parents,
  waiting,
  serverNow,
  busy,
  closed,
  onCollect,
  onParent,
  onAdd,
}: {
  ctx: GameContext;
  /** Pension vide : ses deux places sont libres. */
  pension: DaycareDto | undefined;
  parents: (PokemonDto | undefined)[];
  waiting: number;
  serverNow: number;
  busy: boolean;
  /** Pension fermée : on ne peut plus y déposer de Pokémon. */
  closed: boolean;
  onCollect: (to: CollectEggsInput['to']) => void;
  /** Clic sur un Pokémon : le retirer ou le changer. */
  onParent: (side: 0 | 1) => void;
  /** Clic sur une place libre : y déposer un Pokémon. */
  onAdd: (side: 0 | 1) => void;
}) {
  const max = ctx.balance.breeding.pensionMaxEggs;
  const breeds = pension?.breeds ?? false;
  const start = pension ? Date.parse(pension.startedAt) : 0;
  const cycle = (pension?.eggMinutes ?? 0) * 60_000;
  const laid =
    pension && breeds ? eggsLaid(ctx, new Date(start), new Date(serverNow), pension.eggMinutes) : 0;
  const nextAt = start + (laid + 1) * cycle;
  const [a, b] = parents;
  const sprite = (p: PokemonDto | undefined, side: 0 | 1) => (
    <ParentSprite
      ctx={ctx}
      p={p}
      onOpen={() => onParent(side)}
      onAdd={closed || busy ? undefined : () => onAdd(side)}
    />
  );
  return (
    <div
      className={`space-y-1.5 rounded-md border-2 p-2 ${
        pension ? `border-ink ${waiting > 0 ? 'bg-done' : 'bg-tile'}` : FREE_PLACE
      }`}
    >
      <div className="flex items-center gap-1">
        {sprite(a, 0)}
        <span
          className={breeds ? 'text-rose-400' : 'text-slate-300 dark:text-slate-600'}
          title={breeds || !a || !b ? undefined : 'Ces deux Pokémon ne peuvent pas s’accoupler.'}
          aria-hidden
        >
          ♥
        </span>
        {sprite(b, 1)}
        <span className="ml-auto text-right text-sm leading-tight">
          {!pension ? (
            <span className="text-xs text-slate-500">Pension libre</span>
          ) : breeds ? (
            <>
              <strong>
                {waiting} / {max}
              </strong>{' '}
              <span className="text-slate-500">{waiting > 1 ? 'œufs' : 'œuf'}</span>
            </>
          ) : (
            <span className="text-xs text-slate-500">XP seulement</span>
          )}
        </span>
      </div>
      {breeds && waiting < max && (
        <ProgressBar
          className="h-2"
          value={(serverNow - (nextAt - cycle)) / cycle}
          barClassName="bg-[#f8d030]"
        />
      )}
      {waiting > 0 && (
        <div className="flex justify-end gap-1.5">
          <button
            className={`btn-ghost ${SMALL_BTN} ${HOVER_GHOST}`}
            disabled={busy}
            onClick={() => onCollect('bag')}
            title="Range les œufs prêts dans le sac."
          >
            Ramasser
          </button>
          <button
            className={`btn-primary ${SMALL_BTN} ${HOVER_PRIMARY}`}
            disabled={busy}
            onClick={() => onCollect('incubator')}
            title="Place les œufs prêts dans la couveuse ; ceux qui n’y tiennent pas vont dans le sac."
          >
            Couver
          </button>
        </div>
      )}
    </div>
  );
}

function ParentSprite({
  ctx,
  p,
  onOpen,
  onAdd,
}: {
  ctx: GameContext;
  p: PokemonDto | undefined;
  onOpen: () => void;
  /** Place libre : y déposer un Pokémon (absent si la pension est fermée). */
  onAdd?: () => void;
}) {
  return p ? (
    <button
      type="button"
      onClick={onOpen}
      className="sprite-well size-10 shrink-0 transition hover:border-brand-500"
      title={`${speciesName(ctx, p.speciesId, p.formId)} · N.${p.level}. Retirer ou changer ce Pokémon.`}
    >
      <PokemonSprite speciesId={p.speciesId} formId={p.formId} shiny={p.isShiny} size={40} />
    </button>
  ) : (
    <button
      type="button"
      disabled={!onAdd}
      onClick={onAdd}
      className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-dashed border-slate-300 text-slate-400 transition enabled:hover:border-brand-500 enabled:hover:text-brand-500 disabled:cursor-default dark:border-slate-700"
      title={onAdd ? 'Déposer un Pokémon' : undefined}
      aria-label="Déposer un Pokémon"
    >
      +
    </button>
  );
}

/* ───────────────────────────── Couveuse ───────────────────────────── */

function IncubatorTile({ ctx }: { ctx: GameContext }) {
  const queryClient = useQueryClient();
  const daycare = useDaycare();
  const assistants = useAssistants();
  const now = useNow(5000);
  const [hatched, setHatched] = useState<HatchEggsResponse | null>(null);
  // « Couver » : choix des œufs du sac à mettre en couveuse.
  const [picking, setPicking] = useState(false);
  // Œuf cliqué (fenêtre Retirer).
  const [focusId, setFocusId] = useState<string | null>(null);

  const hatch = useMutation({
    mutationFn: () => api<HatchEggsResponse>('/api/eggs/hatch', { method: 'POST' }),
    onSuccess: (data) => {
      setHatched(data);
      // Éclosion : nouveaux Pokémon, Pokédex, quêtes et activité de guilde.
      return refresh(queryClient, keys.daycare, keys.pokemon, ...PROGRESS_KEYS, keys.guild);
    },
  });
  const incubate = useMutation({
    mutationFn: (ids: string[]) =>
      api<IncubateEggsResponse>('/api/eggs/incubate', { method: 'POST', json: { ids } }),
    onSuccess: () => refresh(queryClient, keys.daycare),
  });
  const withdraw = useMutation({
    mutationFn: (id: string) => api<BagEggDto>(`/api/eggs/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setFocusId(null);
      return refresh(queryClient, keys.daycare);
    },
  });

  const data = daycare.data;
  const serverNow = now + serverOffset(data, daycare.dataUpdatedAt);
  const incubated = data?.eggs ?? [];
  const focused = incubated.find((e) => e.id === focusId);
  const maxEggs = data?.maxEggs ?? 0;
  const bagEggs = data?.bagEggs ?? [];
  const shownEggs = shownPlaces(maxEggs, [
    ...incubated.map((e) => e.slotIndex),
    ...assistantPlaces(assistants.data, 'incubator'),
  ]);
  const size = ASSISTANT_POST_PLACES.incubator;
  const incubators = assistantSlotCount('incubator', shownEggs);
  const [incubator, setIncubator] = usePage(incubators);
  const first = incubator * size;
  const isReady = (e: EggDto) => Date.parse(e.hatchAt) <= serverNow;
  const readyEggs = incubated.filter(isReady).length;
  const taken = new Set(incubated.map((e) => e.slotIndex));
  const freePlaces = Array.from({ length: maxEggs }, (_, i) => i).filter(
    (i) => !taken.has(i),
  ).length;
  const toIncubate = Math.min(bagEggs.length, freePlaces);
  const busy = hatch.isPending || incubate.isPending;
  const error = hatch.error ?? incubate.error;

  return (
    <>
      <Tile
        tab="daycare"
        title="Couveuse"
        icon={<EggIcon />}
        badge={<Badge count={readyEggs + toIncubate} />}
      >
        {incubators === 0 && (
          <p className="text-sm text-slate-500">Aucune couveuse débloquée pour l’instant.</p>
        )}
        <Pager
          label="Couveuse"
          count={incubators}
          index={incubator}
          onChange={setIncubator}
          waiting={Array.from({ length: incubators }, (_, k) =>
            incubated.some((e) => Math.floor(e.slotIndex / size) === k && isReady(e)),
          )}
        />
        {incubators > 0 && (
          <div className="flex items-center gap-2">
            <div className="grid min-w-0 flex-1 grid-cols-3 gap-1">
              {Array.from({ length: Math.min(size, shownEggs - first) }, (_, i) => {
                const place = first + i;
                const egg = incubated.find((e) => e.slotIndex === place);
                if (egg) {
                  const ready = isReady(egg);
                  const start = Date.parse(egg.incubatedAt);
                  const end = Date.parse(egg.hatchAt);
                  const timer = (
                    <EggTimer
                      progress={(serverNow - start) / (end - start)}
                      ready={ready}
                      title={`${speciesName(ctx, egg.speciesId, egg.formId)} ? ${
                        ready
                          ? 'Prêt à éclore'
                          : `Éclosion dans ${shortCountdown(end - serverNow)}. Cliquer pour le retirer.`
                      }`}
                    />
                  );
                  return (
                    <div key={place} className="flex justify-center">
                      {ready ? (
                        timer
                      ) : (
                        <button
                          type="button"
                          className="rounded-full outline-offset-1 outline-brand-500 transition hover:outline-2 focus-visible:outline-2"
                          onClick={() => {
                            withdraw.reset();
                            setFocusId(egg.id);
                          }}
                        >
                          {timer}
                        </button>
                      )}
                    </div>
                  );
                }
                return place < maxEggs ? (
                  <div
                    key={place}
                    title="Place libre"
                    className={`mx-auto size-12 rounded-full ${FREE_PLACE}`}
                  />
                ) : (
                  <div
                    key={place}
                    title="Place fermée"
                    className={`mx-auto grid size-12 place-items-center rounded-full ${CLOSED_PLACE}`}
                  >
                    <LockIcon />
                  </div>
                );
              })}
            </div>
            <AssistantCircle
              ctx={ctx}
              post="incubator"
              slot={incubator}
              closed={first >= maxEggs}
            />
          </div>
        )}
        {incubators > 0 && (readyEggs > 0 || bagEggs.length > 0) && (
          <TileFooter
            text={
              <>
                {readyEggs > 0 && `${plural(readyEggs, 'œuf')} prêt${readyEggs > 1 ? 's' : ''}`}
                {bagEggs.length > 0 && (
                  <span className="block text-xs text-slate-500">
                    {plural(bagEggs.length, 'œuf')} dans le sac
                  </span>
                )}
              </>
            }
          >
            <span className="flex shrink-0 gap-1.5">
              {toIncubate > 0 && (
                <button
                  className={`btn-ghost ${SMALL_BTN} ${HOVER_GHOST}`}
                  disabled={busy}
                  onClick={() => setPicking(true)}
                  title="Choisis les œufs du sac à placer dans les places libres de la couveuse."
                >
                  Couver
                </button>
              )}
              {readyEggs > 0 && (
                <button
                  className={`btn-primary ${SMALL_BTN} ${HOVER_PRIMARY}`}
                  disabled={busy}
                  onClick={() => hatch.mutate()}
                >
                  {hatch.isPending ? 'Éclosion…' : `Éclore (${readyEggs})`}
                </button>
              )}
            </span>
          </TileFooter>
        )}
        {error && <p className="text-xs text-red-600">{errorText(error)}</p>}
      </Tile>
      {picking && (
        <BagEggsDialog
          ctx={ctx}
          eggs={bagEggs}
          freePlaces={freePlaces}
          busy={busy}
          onIncubate={(ids) => {
            incubate.mutate(ids);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
      {focused && (
        <WithdrawDialog
          title={`Couveuse ${Math.floor(focused.slotIndex / size) + 1}`}
          icon={<Egg size={40} />}
          name={`${speciesName(ctx, focused.speciesId, focused.formId)} ?`}
          detail={`Éclosion dans ${shortCountdown(Date.parse(focused.hatchAt) - serverNow)}`}
          explanation="L’œuf revient dans le sac et sa place se libère. Remis en couveuse, son incubation repartira de zéro."
          busy={withdraw.isPending}
          error={withdraw.error}
          onWithdraw={() => withdraw.mutate(focused.id)}
          onClose={() => setFocusId(null)}
        />
      )}
      <HatchReveal ctx={ctx} data={hatched} onClose={() => setHatched(null)} />
    </>
  );
}

/** Œuf ou fossile cliqué dans la colonne : le retirer (il revient dans le sac). */
function WithdrawDialog({
  title,
  icon,
  name,
  detail,
  explanation,
  busy,
  error,
  onWithdraw,
  onClose,
}: {
  title: string;
  icon: ReactNode;
  name: string;
  detail: ReactNode;
  explanation: string;
  busy: boolean;
  error: unknown;
  onWithdraw: () => void;
  onClose: () => void;
}) {
  return (
    <Modal open onClose={onClose}>
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="mt-3 flex items-center gap-3 rounded-xl border-2 border-ink bg-tile p-3">
        <span className="sprite-well size-16 shrink-0">{icon}</span>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-medium">{name}</p>
          <p className="text-xs text-slate-500">{detail}</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-500">{explanation}</p>
      {error ? <p className="mt-2 text-sm text-red-600">{errorText(error)}</p> : null}
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>
          Annuler
        </button>
        <button className="btn-primary" disabled={busy} onClick={onWithdraw}>
          {busy ? 'Retrait…' : 'Retirer'}
        </button>
      </div>
    </Modal>
  );
}

/** Choix des œufs du sac à couver, par espèce, dans la limite des places libres. */
function BagEggsDialog({
  ctx,
  eggs,
  freePlaces,
  busy,
  onIncubate,
  onClose,
}: {
  ctx: GameContext;
  eggs: readonly BagEggDto[];
  freePlaces: number;
  busy: boolean;
  onIncubate: (ids: string[]) => void;
  onClose: () => void;
}) {
  const groups = groupBagEggs(eggs);
  const keyOf = (g: (typeof groups)[number]) => `${g.speciesId}:${g.formId ?? ''}`;
  // Nombre d'œufs choisis par espèce (les plus anciens de chaque groupe partent en premier).
  const [counts, setCounts] = useState<Record<string, number>>({});
  const countOf = (g: (typeof groups)[number]) => Math.min(counts[keyOf(g)] ?? 0, g.ids.length);
  const total = groups.reduce((sum, g) => sum + countOf(g), 0);
  const left = freePlaces - total;
  const set = (g: (typeof groups)[number], n: number) =>
    setCounts((c) => ({ ...c, [keyOf(g)]: Math.max(0, Math.min(n, g.ids.length)) }));
  const chosen = groups.flatMap((g) => g.ids.slice(0, countOf(g))).slice(0, freePlaces);

  return (
    <Modal open onClose={onClose}>
      <h2 className="text-xl font-bold">Couver des œufs</h2>
      <p className="mt-1 text-sm text-slate-500">
        {left > 0
          ? `${plural(left, 'place')} libre${left > 1 ? 's' : ''} dans la couveuse.`
          : 'Toutes les places libres de la couveuse sont choisies.'}
      </p>
      <ul className="-mx-1 mt-2 grid max-h-[60vh] gap-2 overflow-y-auto p-1">
        {groups.map((g) => {
          const n = countOf(g);
          return (
            <li key={keyOf(g)} className="card flex items-center gap-3 p-3">
              <Egg size={32} />
              <span className="min-w-0 flex-1 text-sm">
                <span className="block font-medium">
                  {speciesName(ctx, g.speciesId, g.formId)} ?{' '}
                  <span className="font-mono text-slate-500">× {g.ids.length}</span>
                </span>
                <span className="block text-xs text-slate-500">
                  Éclosion en {formatDuration(hatchMinutes(ctx, g.speciesId))} (sans assistant)
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <button
                  className={`btn-ghost ${SMALL_BTN}`}
                  disabled={n === 0}
                  onClick={() => set(g, n - 1)}
                  aria-label="Un œuf de moins"
                >
                  −
                </button>
                <span className="w-6 text-center font-mono text-sm">{n}</span>
                <button
                  className={`btn-ghost ${SMALL_BTN}`}
                  disabled={left <= 0 || n >= g.ids.length}
                  onClick={() => set(g, n + 1)}
                  aria-label="Un œuf de plus"
                >
                  +
                </button>
                {g.ids.length > 1 && (
                  <button
                    className={`btn-ghost ${SMALL_BTN}`}
                    disabled={left <= 0 || n >= g.ids.length}
                    onClick={() => set(g, n + left)}
                    title="Autant d’œufs de cette espèce que possible"
                  >
                    Max
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>
          Annuler
        </button>
        <button
          className="btn-primary"
          disabled={busy || chosen.length === 0}
          onClick={() => onIncubate(chosen)}
        >
          {chosen.length > 0 ? `Couver (${chosen.length})` : 'Couver'}
        </button>
      </div>
    </Modal>
  );
}

/* ───────────────────────────── Musée ───────────────────────────── */

/** Places du Musée affichées ensemble. */
const MUSEUM_PAGE = 2;

function MuseumTile({ ctx }: { ctx: GameContext }) {
  const queryClient = useQueryClient();
  const museum = useMuseum();
  const assistants = useAssistants();
  const now = useNow(5000);
  const inventory = useInventory();
  const [revived, setRevived] = useState<ReviveFossilsResponse | null>(null);
  // Place libre cliquée : choix du fossile à déposer.
  const [picking, setPicking] = useState(false);
  // Fossile cliqué (fenêtre Retirer).
  const [focusId, setFocusId] = useState<string | null>(null);
  const withdraw = useMutation({
    mutationFn: (id: string) => api<FossilRevivalDto>(`/api/museum/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setFocusId(null);
      return refresh(queryClient, keys.museum, keys.inventory);
    },
  });
  const deposit = useMutation({
    mutationFn: (itemId: string) =>
      api<FossilRevivalDto>('/api/museum', { method: 'POST', json: { itemId } }),
    onSuccess: () => refresh(queryClient, keys.museum, keys.inventory),
  });
  const revive = useMutation({
    mutationFn: () => api<ReviveFossilsResponse>('/api/museum/revive', { method: 'POST' }),
    onSuccess: (data) => {
      setRevived(data);
      return refresh(queryClient, keys.museum, keys.inventory, keys.pokemon, ...PROGRESS_KEYS);
    },
  });

  const data = museum.data;
  const serverNow = now + serverOffset(data, museum.dataUpdatedAt);
  const revivals = data?.revivals ?? [];
  const focused = revivals.find((r) => r.id === focusId);
  const slots = data?.slots ?? 0;
  const shown = shownPlaces(slots, [
    ...revivals.map((r) => r.slotIndex),
    ...assistantPlaces(assistants.data, 'museum'),
  ]);
  // Places affichées deux par deux.
  const pages = Math.ceil(shown / MUSEUM_PAGE);
  const [page, setPage] = usePage(pages);
  const placesOf = (p: number) =>
    Array.from(
      { length: Math.min(MUSEUM_PAGE, shown - p * MUSEUM_PAGE) },
      (_, k) => p * MUSEUM_PAGE + k,
    );
  const isReady = (i: number) =>
    revivals.some((r) => r.slotIndex === i && Date.parse(r.readyAt) <= serverNow);
  const ready = revivals.filter((r) => Date.parse(r.readyAt) <= serverNow).length;
  const fossils = (inventory.data ?? []).filter(
    (s) => s.quantity > 0 && fossilEffect(ctx, s.itemId),
  );
  const busy = deposit.isPending || revive.isPending;
  const error = deposit.error ?? revive.error;
  const pageName = (p: number) => {
    const places = placesOf(p).map((i) => i + 1);
    return places.length > 1 ? `Places ${places.join(' et ')}` : `Place ${places[0]}`;
  };

  return (
    <>
      <Tile tab="museum" title="Musée" icon={<MuseumIcon />} badge={<Badge count={ready} />}>
        <Pager
          label="Places"
          count={pages}
          index={page}
          onChange={setPage}
          name={pageName}
          waiting={Array.from({ length: pages }, (_, p) => placesOf(p).some(isReady))}
        />
        {placesOf(page).map((i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <MuseumPlace
                ctx={ctx}
                revival={revivals.find((r) => r.slotIndex === i)}
                closed={i >= slots}
                serverNow={serverNow}
                noFossil={fossils.length === 0}
                busy={busy}
                onDeposit={() => setPicking(true)}
                onOpen={(id) => {
                  withdraw.reset();
                  setFocusId(id);
                }}
              />
            </div>
            <AssistantCircle ctx={ctx} post="museum" slot={i} closed={i >= slots} />
          </div>
        ))}
        {ready > 0 && (
          <TileFooter>
            <button
              className={`btn-primary ${SMALL_BTN} ${HOVER_PRIMARY} ml-auto`}
              disabled={busy}
              onClick={() => revive.mutate()}
            >
              {revive.isPending ? 'Restauration…' : `Récupérer (${ready})`}
            </button>
          </TileFooter>
        )}
        {error && <p className="text-xs text-red-600">{errorText(error)}</p>}
      </Tile>

      <Modal open={picking} onClose={() => setPicking(false)}>
        <h2 className="text-xl font-bold">Déposer un fossile</h2>
        {fossils.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Aucun fossile dans ton sac.</p>
        ) : (
          <ul className="-mx-1 mt-2 grid max-h-[60vh] gap-2 overflow-y-auto p-1">
            {fossils.map((s) => {
              const effect = fossilEffect(ctx, s.itemId)!;
              return (
                <li key={s.itemId} className="card flex items-center gap-3 p-3">
                  <img
                    src={itemIcon(ctx, s.itemId)}
                    alt=""
                    className="h-10 w-10 shrink-0 [image-rendering:pixelated]"
                  />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{itemName(ctx, s.itemId)}</span>
                      <span className="font-mono">× {s.quantity}</span>
                    </span>
                    <span className="block text-xs text-slate-500">
                      {speciesName(ctx, effect.speciesId, effect.formId)} · N.{effect.level} ·{' '}
                      {formatDuration(effect.minutes)}
                    </span>
                  </span>
                  <button
                    className={`btn-primary ${SMALL_BTN}`}
                    disabled={busy}
                    onClick={() => {
                      deposit.mutate(s.itemId);
                      setPicking(false);
                    }}
                  >
                    Déposer
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Modal>
      {focused && (
        <WithdrawDialog
          title={`Musée · place ${focused.slotIndex + 1}`}
          icon={
            <img
              src={itemIcon(ctx, focused.itemId)}
              alt=""
              className="size-10 [image-rendering:pixelated]"
            />
          }
          name={`${itemName(ctx, focused.itemId)} → ${speciesName(ctx, focused.speciesId, focused.formId)}`}
          detail={`Restauré dans ${shortCountdown(Date.parse(focused.readyAt) - serverNow)}`}
          explanation="Le fossile revient dans ton sac et sa place se libère. Redéposé, sa restauration repartira de zéro."
          busy={withdraw.isPending}
          error={withdraw.error}
          onWithdraw={() => withdraw.mutate(focused.id)}
          onClose={() => setFocusId(null)}
        />
      )}
      <HatchReveal
        ctx={ctx}
        data={revived && { ...revived, hatched: revived.revived }}
        onClose={() => setRevived(null)}
        kind="fossil"
      />
    </>
  );
}

/** Une place du Musée : fossile en cours (ou restauré), place libre ou fermée. */
function MuseumPlace({
  ctx,
  revival: r,
  closed,
  serverNow,
  noFossil,
  busy,
  onDeposit,
  onOpen,
}: {
  ctx: GameContext;
  revival: FossilRevivalDto | undefined;
  closed: boolean;
  serverNow: number;
  noFossil: boolean;
  busy: boolean;
  onDeposit: () => void;
  /** Clic sur un fossile en cours : le retirer. */
  onOpen: (id: string) => void;
}) {
  if (!r && closed) {
    return (
      <div className={`grid h-12 place-items-center rounded-md text-sm ${CLOSED_PLACE}`}>
        Place fermée
      </div>
    );
  }
  if (!r) {
    // Le serveur pose le fossile dans la première place libre.
    return (
      <button
        type="button"
        disabled={noFossil || busy}
        onClick={onDeposit}
        title={noFossil ? 'Aucun fossile dans ton sac.' : 'Déposer un fossile'}
        className={`grid h-12 w-full place-items-center rounded-md text-sm transition enabled:hover:border-brand-500 enabled:hover:text-brand-500 disabled:cursor-default ${FREE_PLACE}`}
      >
        {noFossil ? 'Place libre' : '+ Déposer un fossile'}
      </button>
    );
  }
  const start = Date.parse(r.startedAt);
  const end = Date.parse(r.readyAt);
  const done = serverNow >= end;
  const label = `${itemName(ctx, r.itemId)} → ${speciesName(ctx, r.speciesId, r.formId)}`;
  const body = (
    <>
      <img
        src={itemIcon(ctx, r.itemId)}
        alt=""
        className="size-8 shrink-0 [image-rendering:pixelated]"
      />
      <span className={`shrink-0 ${done ? '' : 'opacity-40 brightness-0 dark:invert'}`}>
        <PokemonSprite speciesId={r.speciesId} formId={r.formId} size={36} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex justify-between gap-1 text-xs">
          <span className="truncate font-medium">{speciesName(ctx, r.speciesId, r.formId)}</span>
          <span className="shrink-0 font-mono text-slate-500">
            {done ? 'Prêt !' : shortCountdown(end - serverNow)}
          </span>
        </span>
        <ProgressBar
          className="mt-1 h-2"
          value={(serverNow - start) / (end - start)}
          barClassName="bg-[#48a8e8]"
        />
      </span>
    </>
  );
  const frame = 'flex w-full items-center gap-2 rounded-md border-2 border-ink p-1.5 text-left';
  return done ? (
    <div className={`${frame} bg-done`} title={label}>
      {body}
    </div>
  ) : (
    <button
      type="button"
      onClick={() => onOpen(r.id)}
      className={`${frame} bg-tile transition hover:border-brand-500`}
      title={`${label}. Cliquer pour le retirer.`}
    >
      {body}
    </button>
  );
}

/* ───────────────────────────── Ferme à baies ───────────────────────────── */

/** Pousse restante d'une parcelle (0 = mûre), à l'heure du serveur. */
const remainingOf = (plot: BerryPlotDto, serverNow: number) =>
  plot.readyAt ? Math.max(0, Date.parse(plot.readyAt) - serverNow) : plot.remainingMs;

function FarmTile({ ctx }: { ctx: GameContext }) {
  const queryClient = useQueryClient();
  const farm = useFarm();
  const inventory = useInventory();
  const assistants = useAssistants();
  const now = useNow(5000);
  const [harvested, setHarvested] = useState<HarvestBerriesResponse | null>(null);
  // Parcelle vide cliquée : choix de la baie à y planter.
  const [picking, setPicking] = useState<number | null>(null);

  const refreshFarm = () => refresh(queryClient, keys.farm, keys.inventory);
  const plant = useMutation({
    mutationFn: async (inputs: PlantBerryInput[]) => {
      for (const json of inputs) await api<BerryPlotDto>('/api/farm', { method: 'POST', json });
    },
    onSettled: refreshFarm,
  });
  const harvest = useMutation({
    // Sans parcelle : toutes les baies mûres.
    mutationFn: (plot?: number) =>
      api<HarvestBerriesResponse>(
        plot === undefined ? '/api/farm/harvest' : `/api/farm/${plot}/harvest`,
        { method: 'POST' },
      ),
    onSuccess: (data) => {
      setHarvested(data);
      return refreshFarm();
    },
  });

  const data = farm.data;
  const serverNow = now + serverOffset(data, farm.dataUpdatedAt);
  const planted = data?.planted ?? [];
  const plots = data?.plots ?? 0;
  const shown = shownPlaces(plots, [
    ...planted.map((p) => p.plotIndex),
    ...assistantPlaces(assistants.data, 'farm'),
    ...assistantPlaces(assistants.data, 'harvest'),
  ]);
  const fields = Math.ceil(Math.max(shown, FARM_PLOTS) / FARM_PLOTS);
  const [field, setField] = usePage(fields);
  const isRipe = (p: BerryPlotDto) => remainingOf(p, serverNow) === 0;
  const ripe = planted.filter(isRipe).length;
  const seeds = (inventory.data ?? []).filter(
    (s) => s.quantity > 0 && berryPlantEffect(ctx, s.itemId),
  );
  const first = field * FARM_PLOTS;
  const indexes = Array.from({ length: FARM_PLOTS }, (_, k) => first + k);
  const watered = !!assistants.data?.some((a) => a.post === 'farm' && a.slot === field);
  const freeInField = indexes.filter((i) => i < plots && !planted.some((p) => p.plotIndex === i));
  const busy = plant.isPending || harvest.isPending;
  const error = plant.error ?? harvest.error;

  return (
    <>
      <Tile tab="farm" title="Ferme à baies" icon={<SproutIcon />} badge={<Badge count={ripe} />}>
        <Pager
          label="Champ"
          count={fields}
          index={field}
          onChange={setField}
          waiting={Array.from({ length: fields }, (_, f) =>
            planted.some((p) => Math.floor(p.plotIndex / FARM_PLOTS) === f && isRipe(p)),
          )}
        />
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="mb-1 flex items-center justify-between gap-1 text-xs">
              <span className="font-semibold">{fields > 1 ? '' : 'Champ 1'}</span>
              <span
                className={watered ? 'text-sky-700 dark:text-sky-300' : 'text-slate-400'}
                title={watered ? 'Arrosé' : 'Pas arrosé : les baies ne poussent pas.'}
              >
                {watered ? 'Arrosé' : 'Pas arrosé'}
              </span>
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {indexes.map((i) => {
                const plot = planted.find((p) => p.plotIndex === i);
                if (!plot) {
                  return i < plots ? (
                    <button
                      key={i}
                      type="button"
                      disabled={seeds.length === 0 || busy}
                      onClick={() => setPicking(i)}
                      title={seeds.length ? 'Planter une baie' : 'Aucune baie à planter.'}
                      className={`grid aspect-square place-items-center rounded-md text-[11px] transition enabled:hover:border-brand-500 enabled:hover:text-brand-500 disabled:cursor-default ${FREE_PLACE}`}
                    >
                      {seeds.length ? 'Planter' : ''}
                    </button>
                  ) : (
                    <div
                      key={i}
                      title="Parcelle à débloquer"
                      className={`grid aspect-square place-items-center rounded-md ${CLOSED_PLACE}`}
                    >
                      <LockIcon />
                    </div>
                  );
                }
                const remaining = remainingOf(plot, serverNow);
                const done = remaining === 0;
                const progress = 1 - remaining / plot.growMs;
                const size = 18 + 18 * Math.min(1, progress);
                const berry = (
                  <img
                    src={itemIcon(ctx, plot.itemId)}
                    alt=""
                    className={`[image-rendering:pixelated] ${plot.readyAt || done ? '' : 'opacity-60'}`}
                    style={{ width: size, height: size }}
                  />
                );
                return done ? (
                  <button
                    key={i}
                    type="button"
                    disabled={busy}
                    onClick={() => harvest.mutate(i)}
                    title={`Récolter : ${itemName(ctx, plot.itemId)}`}
                    className="grid aspect-square place-items-center rounded-md border-2 border-[#b07a10] bg-done transition enabled:hover:ring-2 enabled:hover:ring-brand-500 disabled:cursor-default"
                  >
                    {berry}
                  </button>
                ) : (
                  <div
                    key={i}
                    title={`${itemName(ctx, plot.itemId)} : ${
                      plot.readyAt ? shortCountdown(remaining) : 'en pause, champ pas arrosé'
                    }`}
                    className={`grid aspect-square place-items-center rounded-md border-2 ${
                      watered ? 'border-[#4a2f1b] bg-[#6b4528]' : 'border-[#8b5e3c] bg-[#a87a52]'
                    }`}
                  >
                    {berry}
                  </div>
                );
              })}
            </div>
          </div>
          {/* Assistants du champ : arrosage (fait pousser) et récolte. */}
          <div className="flex shrink-0 flex-col gap-3">
            {(
              [
                ['farm', 'Arrosage'],
                ['harvest', 'Récolte'],
              ] as const
            ).map(([post, label]) => (
              <div key={post} className="flex flex-col items-center gap-0.5">
                <AssistantCircle ctx={ctx} post={post} slot={field} closed={first >= plots} />
                <span className="text-[10px] text-slate-500">{label}</span>
              </div>
            ))}
          </div>
        </div>
        <TileFooter
          text={
            ripe > 0
              ? `${plural(ripe, 'baie')} mûre${ripe > 1 ? 's' : ''}`
              : seeds.length === 0 && freeInField.length > 0
                ? 'Aucune baie à planter'
                : 'Rien à récolter'
          }
        >
          {ripe > 0 && (
            <button
              className={`btn-primary ${SMALL_BTN} ${HOVER_PRIMARY}`}
              disabled={busy}
              onClick={() => harvest.mutate(undefined)}
            >
              Tout récolter
            </button>
          )}
        </TileFooter>
        {harvested && (
          <p className="text-xs text-emerald-700 dark:text-emerald-400">
            Récolte :{' '}
            {harvested.harvested
              .map((h) => `${h.quantity} × ${itemName(ctx, h.itemId)}`)
              .join(', ')}
            .
          </p>
        )}
        {error && <p className="text-xs text-red-600">{errorText(error)}</p>}
      </Tile>

      <Modal open={picking !== null} onClose={() => setPicking(null)}>
        <h2 className="text-xl font-bold">Planter une baie</h2>
        {seeds.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Aucune baie à planter dans ton sac.</p>
        ) : (
          <ul className="-mx-1 mt-2 grid max-h-[60vh] gap-2 overflow-y-auto p-1">
            {seeds.map((s) => {
              const effect = berryPlantEffect(ctx, s.itemId)!;
              const fill = freeInField.slice(0, s.quantity);
              return (
                <li key={s.itemId} className="card flex items-center gap-3 p-3">
                  <img
                    src={itemIcon(ctx, s.itemId)}
                    alt=""
                    className="h-10 w-10 shrink-0 [image-rendering:pixelated]"
                  />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{itemName(ctx, s.itemId)}</span>
                      <span className="font-mono">× {s.quantity}</span>
                    </span>
                    <span className="block text-xs text-slate-500">
                      Pousse en {formatDuration(effect.minutes)} · donne {yieldRange(effect)} baie
                      {effect.maxYield > 1 ? 's' : ''}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col gap-1">
                    <button
                      className={`btn-primary ${SMALL_BTN}`}
                      disabled={busy}
                      onClick={() => {
                        if (picking !== null)
                          plant.mutate([{ plotIndex: picking, itemId: s.itemId }]);
                        setPicking(null);
                      }}
                    >
                      Planter
                    </button>
                    {fill.length > 1 && (
                      <button
                        className={`btn-ghost ${SMALL_BTN}`}
                        disabled={busy}
                        title={`Plante ${plural(fill.length, 'baie')} dans les parcelles vides de ce champ.`}
                        onClick={() => {
                          plant.mutate(fill.map((plotIndex) => ({ plotIndex, itemId: s.itemId })));
                          setPicking(null);
                        }}
                      >
                        Tout le champ ({fill.length})
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Modal>
    </>
  );
}

/* ───────────────────────────── Icônes en pixels ───────────────────────────── */

function PixelIcon({ children }: { children: ReactNode }) {
  return (
    <svg width="18" height="18" viewBox="0 0 7 7" shapeRendering="crispEdges" aria-hidden>
      {children}
    </svg>
  );
}

function CenterIcon() {
  return (
    <PixelIcon>
      <path d="M2 0h3v2h2v3h-2v2h-3v-2h-2v-3h2z" fill="#d83828" />
      <path d="M3 1h1v2h2v1h-2v2h-1v-2h-2v-1h2z" fill="#fbfaf2" />
    </PixelIcon>
  );
}

function HouseIcon() {
  return (
    <PixelIcon>
      <path d="M3 0h1v1h1v1h1v1h1v1h-1v3h-5v-3h-1v-1h1v-1h1v-1h1z" fill="#d88a38" />
      <path d="M3 4h1v3h-1z" fill="#283048" />
    </PixelIcon>
  );
}

function EggIcon() {
  return (
    <PixelIcon>
      <path d="M3 0h1v1h1v1h1v4h-1v1h-3v-1h-1v-4h1v-1h1z" fill="#fbfaf2" />
      <path d="M2 3h1v1h-1zM4 4h1v1h-1zM3 5h1v1h-1z" fill="#78c060" />
    </PixelIcon>
  );
}

function MuseumIcon() {
  return (
    <PixelIcon>
      <path
        d="M3 0h1v1h2v1h1v1h-7v-1h1v-1h2zM1 3h1v3h-1zM3 3h1v3h-1zM5 3h1v3h-1zM0 6h7v1h-7z"
        fill="#6878a8"
      />
    </PixelIcon>
  );
}

function SproutIcon() {
  return (
    <PixelIcon>
      <path d="M3 2h1v5h-1z" fill="#3c7a28" />
      <path d="M0 1h1v-1h2v1h1v1h-1v1h-2v-1h-1zM5 0h2v2h-1v1h-2v-2h1z" fill="#58a838" />
    </PixelIcon>
  );
}

function LockIcon() {
  return (
    <svg width="10" height="12" viewBox="0 0 7 8" shapeRendering="crispEdges" aria-hidden>
      <path d="M2 0h3v1h1v2h1v5h-7v-5h1v-2h1zM2 1v2h3v-2z" fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}
