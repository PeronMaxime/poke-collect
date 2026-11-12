/**
 * Barre de progression.
 */

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
