import { motion } from 'motion/react';

/**
 * Œuf et son compte à rebours avant l'éclosion.
 */

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
