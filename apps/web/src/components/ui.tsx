import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { STAT_NAMES, pokemonSprite, pokemonSpriteUrl } from '@poke/data';
import type { SpriteKind, StatName, Stats } from '@poke/data';
import { MAX_IV } from '@poke/game-core';
import type { Gender } from '@poke/game-core';
import { STAT_LABELS, TYPE_COLORS, typeLabel } from '../lib/labels';

export function PokemonSprite({
  speciesId,
  formId = null,
  shiny = false,
  size = 96,
  kind = 'default',
  className = '',
  silhouette = false,
  alt = '',
  priority = false,
}: {
  speciesId: number;
  /** Forme de l'espèce (régionale, Méga, Gigamax…), qui a ses propres sprites. */
  formId?: number | null;
  shiny?: boolean;
  size?: number;
  kind?: SpriteKind;
  className?: string;
  silhouette?: boolean;
  alt?: string;
  /** Image visible dès l'ouverture (starter, révélations) : chargée tout de suite, en priorité. */
  priority?: boolean;
}) {
  const sprite = pokemonSprite(speciesId, formId);
  return (
    <img
      ref={markIfCached}
      data-sprite=""
      src={pokemonSpriteUrl(sprite, { shiny, kind })}
      onLoad={(e) => {
        const img = e.currentTarget;
        if (img.dataset.loaded === undefined) img.dataset.fade = '';
        img.dataset.loaded = '';
      }}
      onAnimationEnd={(e) => {
        if (e.animationName === 'sprite-in') delete e.currentTarget.dataset.fade;
      }}
      onError={(e) => {
        // Sprite animé ou artwork absent (formes, générations récentes) : repli sur le sprite fixe.
        const img = e.currentTarget;
        const fallback = pokemonSpriteUrl(sprite, { shiny });
        if (img.getAttribute('src') !== fallback) img.src = fallback;
        // Repli introuvable lui aussi : on arrête l'attente.
        else img.dataset.loaded = '';
      }}
      alt={alt}
      width={size}
      height={size}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      className={[
        kind === 'default' ? '[image-rendering:pixelated]' : '',
        silhouette ? 'brightness-0 opacity-30 dark:invert' : '',
        className,
      ].join(' ')}
    />
  );
}

/**
 * Image déjà en mémoire au montage (onglet revisité) : affichée telle quelle, sans fond d'attente
 * ni fondu. Les autres gardent le fond d'attente jusqu'au chargement, puis apparaissent en fondu
 * (styles `img[data-sprite]` de index.css).
 */
function markIfCached(img: HTMLImageElement | null) {
  if (img?.complete && img.naturalWidth > 0) img.dataset.loaded = '';
}

export function TypeBadge({ type }: { type: string }) {
  return (
    <span
      className="rounded border-2 border-ink px-1.5 py-px text-[11px] font-bold text-white uppercase [text-shadow:1px_1px_0_rgb(0_0_0/0.35)]"
      style={{ backgroundColor: TYPE_COLORS[type] ?? '#888' }}
    >
      {typeLabel(type)}
    </span>
  );
}

const SPARKLE_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

/**
 * Animation dédiée aux shiny : une gerbe d'étoiles jaillit autour du sprite (une fois, ou en
 * boucle discrète). À placer dans un parent `relative`.
 */
export function ShinySparkles({
  delay = 0,
  loop = false,
  radius = 44,
}: {
  delay?: number;
  loop?: boolean;
  radius?: number;
}) {
  const reduced = useReducedMotion();
  if (reduced) return null;
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
      <motion.span
        className="absolute rounded-full bg-amber-300/60 blur-md"
        style={{ width: radius, height: radius }}
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{ opacity: [0, 0.9, 0], scale: [0.4, 1.4, 1.8] }}
        transition={{
          delay,
          duration: 0.9,
          ...(loop && { repeat: Infinity, repeatDelay: 2.6 }),
        }}
      />
      {SPARKLE_ANGLES.map((angle, i) => {
        const rad = (angle * Math.PI) / 180;
        const distance = radius * (i % 2 ? 0.75 : 1);
        return (
          <motion.span
            key={angle}
            className={`absolute text-amber-400 drop-shadow ${i % 2 ? 'text-xs' : 'text-base'}`}
            initial={{ opacity: 0, x: 0, y: 0, scale: 0.3, rotate: 0 }}
            animate={{
              opacity: [0, 1, 0],
              x: Math.cos(rad) * distance,
              y: Math.sin(rad) * distance,
              scale: [0.3, 1.1, 0.6],
              rotate: 90,
            }}
            transition={{
              delay: delay + (i % 2) * 0.08,
              duration: 0.9,
              ease: 'easeOut',
              ...(loop && { repeat: Infinity, repeatDelay: 2.6 }),
            }}
          >
            ✦
          </motion.span>
        );
      })}
    </span>
  );
}

/** Symbole ♂ / ♀ coloré ; rien pour un Pokémon asexué. */
export function GenderSymbol({ gender }: { gender: Gender }) {
  if (gender === 'genderless') return null;
  const male = gender === 'male';
  return (
    <span
      className={male ? 'text-sky-500' : 'text-pink-500'}
      title={male ? 'Mâle' : 'Femelle'}
      aria-label={male ? 'Mâle' : 'Femelle'}
    >
      {male ? '♂' : '♀'}
    </span>
  );
}

export function ShinyStar({ className = '' }: { className?: string }) {
  return (
    <span className={`text-amber-400 ${className}`} title="Chromatique" aria-label="Chromatique">
      ★
    </span>
  );
}

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

/**
 * Horloge partagée : un seul intervalle par durée, quel que soit le nombre de composants qui
 * l'écoutent (au lieu d'un `setInterval` par composant, donc par carte d'une grille).
 */
interface Clock {
  now: number;
  timer: number | undefined;
  listeners: Set<() => void>;
}

const clocks = new Map<number, Clock>();

function clockFor(intervalMs: number): Clock {
  let clock = clocks.get(intervalMs);
  if (!clock) {
    clock = { now: Date.now(), timer: undefined, listeners: new Set() };
    clocks.set(intervalMs, clock);
  }
  return clock;
}

function subscribeClock(intervalMs: number, listener: () => void): () => void {
  const clock = clockFor(intervalMs);
  clock.listeners.add(listener);
  if (clock.timer === undefined) {
    // Premier abonné : l'heure gardée est peut-être ancienne, on la remet à jour tout de suite.
    clock.now = Date.now();
    clock.timer = window.setInterval(() => {
      clock.now = Date.now();
      for (const notify of clock.listeners) notify();
    }, intervalMs);
  }
  return () => {
    clock.listeners.delete(listener);
    if (clock.listeners.size === 0 && clock.timer !== undefined) {
      window.clearInterval(clock.timer);
      clock.timer = undefined;
    }
  };
}

function clockSnapshot(intervalMs: number): number {
  const clock = clockFor(intervalMs);
  // Sans abonné, l'horloge ne tourne pas : une heure plus vieille qu'un tour est rafraîchie
  // (premier rendu d'un composant), sinon la valeur reste stable entre deux lectures.
  if (clock.timer === undefined && Date.now() - clock.now >= intervalMs) clock.now = Date.now();
  return clock.now;
}

/** Heure de l'horloge partagée, à la seconde près, sans abonnement (décision ponctuelle au rendu). */
export const sharedNow = () => clockSnapshot(1000);

/**
 * Heure courante, rafraîchie à chaque `intervalMs` (comptes à rebours). N'utiliser que dans les
 * composants qui affichent vraiment un compte à rebours : chaque tic les redessine.
 */
export function useNow(intervalMs = 1000): number {
  const subscribe = useCallback(
    (listener: () => void) => subscribeClock(intervalMs, listener),
    [intervalMs],
  );
  return useSyncExternalStore(subscribe, () => clockSnapshot(intervalMs));
}

/** Bouton d'annulation à deux temps : un premier clic demande confirmation. */
export function CancelButton({
  label,
  pending,
  onConfirm,
}: {
  label: string;
  pending: boolean;
  onConfirm: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button className="btn-ghost" disabled={pending} onClick={() => setConfirming(true)}>
        Annuler
      </button>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <button className="btn-danger" disabled={pending} onClick={onConfirm}>
        {pending ? 'Annulation…' : label}
      </button>
      <button className="btn-ghost" disabled={pending} onClick={() => setConfirming(false)}>
        Non
      </button>
    </span>
  );
}

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

/** Lignes « statistique — valeur » d'une bulle, avec un total. */
export function StatLines({
  values,
  highlight,
  total,
}: {
  values: Stats;
  /** Valeurs mises en avant (IV parfaits…). */
  highlight?: (stat: StatName) => boolean;
  total: ReactNode;
}) {
  return (
    <>
      {STAT_NAMES.map((s) => (
        <span key={s} className="flex justify-between gap-2">
          <span className="text-slate-500">{STAT_LABELS[s]}</span>
          <span className={highlight?.(s) ? 'font-bold text-amber-600' : ''}>{values[s]}</span>
        </span>
      ))}
      <span className="mt-1 flex justify-between gap-2 border-t border-slate-200 pt-1 font-medium dark:border-slate-700">
        <span>Total</span>
        <span>{total}</span>
      </span>
    </>
  );
}

/** IV d'un Pokémon dans une bulle, au survol de son contenu. */
export function IvHover({
  ivs,
  children,
  className,
  focusable,
}: {
  ivs: Stats | undefined;
  children: ReactNode;
  /** Classe de l'enveloppe (par défaut `inline-block`). */
  className?: string;
  /** Faux autour d'un bouton, qui prend déjà le focus. */
  focusable?: boolean;
}) {
  if (!ivs) return children;
  const total = STAT_NAMES.reduce((sum, s) => sum + ivs[s], 0);
  return (
    <HoverBubble
      height={140}
      className={className}
      focusable={focusable}
      content={
        <StatLines
          values={ivs}
          highlight={(s) => ivs[s] === MAX_IV}
          total={`${total} / ${MAX_IV * 6}`}
        />
      }
    >
      {children}
    </HoverBubble>
  );
}

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

export interface ViewTab<T extends string> {
  id: T;
  label: ReactNode;
  /** Compteur à droite du libellé (quantité, avancement…). */
  badge?: ReactNode;
  /** Le compteur signale une action à faire (récompense à réclamer…) : pastille jaune. */
  alert?: boolean;
}

/**
 * Onglets principaux d'une page : barre sombre pleine largeur, onglet actif en jaune. Ils se
 * distinguent ainsi des onglets de région (pastilles rouges et blanches) et des filtres.
 */
export function ViewTabs<T extends string>({
  tabs,
  selected,
  onSelect,
  className = '',
}: {
  tabs: readonly ViewTab<T>[];
  selected: T;
  onSelect: (id: T) => void;
  className?: string;
}) {
  return (
    <nav
      className={`rounded-lg border-2 border-ink bg-hud p-1 shadow-[3px_3px_0_rgb(40_48_72/0.3)] ${className}`}
    >
      <ScrollRow role="tablist" selectedKey={selected} className="gap-1">
        {tabs.map((t) => {
          const active = t.id === selected;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelect(t.id)}
              className={`flex flex-auto shrink-0 items-center justify-center gap-1.5 whitespace-nowrap pixel-label rounded-md px-3 py-2.5 transition ${
                active
                  ? 'bg-[#f8d030] text-ink shadow-[inset_0_-3px_0_rgb(0_0_0/0.2)]'
                  : 'text-slate-300 hover:bg-hud-pill hover:text-white'
              }`}
            >
              {t.label}
              {t.badge !== undefined &&
                t.badge !== null &&
                (t.alert ? (
                  <span
                    className={`rounded-full px-1.5 text-[10px] ${
                      active ? 'bg-ink text-[#f8d030]' : 'bg-[#f8d030] text-ink'
                    }`}
                  >
                    {t.badge}
                  </span>
                ) : (
                  <span
                    className={`font-mono text-[10px] ${active ? 'text-ink/70' : 'text-slate-400'}`}
                  >
                    {t.badge}
                  </span>
                ))}
            </button>
          );
        })}
      </ScrollRow>
    </nav>
  );
}

export function ProgressBar({
  value,
  className = '',
  barClassName = 'bg-[#48c048]',
}: {
  value: number;
  className?: string;
  /** Couleur de la partie remplie. */
  barClassName?: string;
}) {
  return (
    <div className={`h-3 overflow-hidden rounded-full border-2 border-ink bg-track ${className}`}>
      <div
        className={`h-full shadow-[inset_0_2px_0_rgb(255_255_255/0.35)] transition-[width] duration-500 ${barClassName}`}
        style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
      />
    </div>
  );
}

/**
 * Œuf dans une case ronde : l'anneau se remplit dans le sens des aiguilles d'une montre jusqu'à
 * l'éclosion. Le temps restant n'est donné qu'au survol (`title`).
 */
export function EggTimer({
  progress,
  ready = false,
  size = 48,
  title,
}: {
  /** Avancement de l'incubation, de 0 à 1. */
  progress: number;
  ready?: boolean;
  size?: number;
  title?: string;
}) {
  const stroke = Math.max(3, Math.round(size / 12));
  const r = (size - stroke) / 2;
  const length = 2 * Math.PI * r;
  const value = ready ? 1 : Math.min(1, Math.max(0, progress));
  return (
    <div
      title={title}
      role="img"
      aria-label={title}
      className={`relative grid shrink-0 place-items-center rounded-full ${ready ? 'bg-done' : 'bg-well'}`}
      style={{ width: size, height: size }}
    >
      <svg
        aria-hidden
        className="absolute inset-0 -rotate-90"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-well-line"
        />
        {value > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap={value < 1 ? 'round' : 'butt'}
            strokeDasharray={length}
            strokeDashoffset={length * (1 - value)}
            className={`transition-[stroke-dashoffset] duration-1000 ease-linear ${
              ready ? 'stroke-[#b07a10]' : 'stroke-[#48c048]'
            }`}
          />
        )}
      </svg>
      <Egg size={Math.round(size * 0.46)} ready={ready} />
    </div>
  );
}

/** Œuf dessiné en CSS (aucun sprite d'œuf fiable côté PokéAPI) ; il tremble quand il est prêt. */
export function Egg({ size = 56, ready = false }: { size?: number; ready?: boolean }) {
  return (
    <motion.div
      aria-hidden
      className="relative rounded-[50%_50%_50%_50%/60%_60%_40%_40%] border border-amber-200 bg-gradient-to-br from-amber-50 to-amber-200 shadow-inner dark:border-amber-900 dark:from-amber-100 dark:to-amber-300"
      style={{ width: size * 0.78, height: size }}
      animate={ready ? { rotate: [0, -8, 8, -5, 5, 0] } : { rotate: 0 }}
      transition={ready ? { duration: 0.8, repeat: Infinity, repeatDelay: 1.2 } : undefined}
    >
      <span className="absolute top-[22%] left-[20%] h-[18%] w-[22%] rounded-full bg-emerald-400/70" />
      <span className="absolute top-[52%] right-[18%] h-[14%] w-[18%] rounded-full bg-emerald-400/70" />
      <span className="absolute bottom-[14%] left-[34%] h-[10%] w-[14%] rounded-full bg-emerald-400/70" />
    </motion.div>
  );
}
