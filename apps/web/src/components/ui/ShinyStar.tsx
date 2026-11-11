/**
 * Étoile des Pokémon chromatiques.
 */

export function ShinyStar({ className = '' }: { className?: string }) {
  return (
    <span className={`text-amber-400 ${className}`} title="Chromatique" aria-label="Chromatique">
      ★
    </span>
  );
}
