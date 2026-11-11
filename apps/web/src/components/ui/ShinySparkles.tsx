import { motion, useReducedMotion } from 'motion/react';

/**
 * Étincelles autour d'un Pokémon chromatique.
 */

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
