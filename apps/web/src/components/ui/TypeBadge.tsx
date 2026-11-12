import { TYPE_COLORS, typeLabel } from '../../lib/labels';

/**
 * Pastille d'un type (Feu, Eau…).
 */

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
