import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { pokemonSprite, pokemonSpriteUrl } from '@poke/data';
import type { SpriteKind } from '@poke/data';
import { TYPE_COLORS, typeLabel } from '../lib/labels';

export function PokemonSprite({
  speciesId,
  formId = null,
  shiny = false,
  size = 96,
  kind = 'default',
  className = '',
  silhouette = false,
  alt = '',
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
}) {
  const sprite = pokemonSprite(speciesId, formId);
  return (
    <img
      src={pokemonSpriteUrl(sprite, { shiny, kind })}
      onError={(e) => {
        // Sprite animé ou artwork absent (formes, générations récentes) : repli sur le sprite fixe.
        const fallback = pokemonSpriteUrl(sprite, { shiny });
        if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
      }}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      className={[
        kind === 'default' ? '[image-rendering:pixelated]' : '',
        silhouette ? 'brightness-0 opacity-30 dark:invert' : '',
        className,
      ].join(' ')}
    />
  );
}

export function TypeBadge({ type }: { type: string }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white uppercase"
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

export function ShinyStar({ className = '' }: { className?: string }) {
  return (
    <span className={`text-amber-400 ${className}`} title="Shiny" aria-label="Shiny">
      ★
    </span>
  );
}

/** Fenêtre modale simple (Échap ou clic à l'extérieur pour fermer). */
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
  wide?: boolean;
  /** Classes ajoutées à la boîte de dialogue (taille fixe, mise en page…). */
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/60 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            className={`card w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} ${className}`}
            initial={{ scale: 0.95, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 10 }}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Heure courante, rafraîchie toutes les secondes (comptes à rebours). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
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

export function ProgressBar({ value, className = '' }: { value: number; className?: string }) {
  return (
    <div className={`h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800 ${className}`}>
      <div
        className="h-full rounded-full bg-brand-500 transition-[width] duration-500"
        style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
      />
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
