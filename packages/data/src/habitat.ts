/**
 * Habitat maison des espèces sans habitat PokéAPI (Gen IV et suivantes) : vote des espèces les
 * plus proches parmi celles qui en ont un, selon les types, la forme et la couleur. Le résultat
 * n'est qu'une valeur par défaut, surchargeable dans le panneau d'admin.
 */

export interface HabitatTraits {
  id: number;
  types: readonly string[];
  shape: string | null;
  color: string;
  isLegendary: boolean;
  isMythical: boolean;
}

export interface HabitatReference extends HabitatTraits {
  habitat: string;
}

/** Habitat PokéAPI des légendaires et mythiques. */
export const RARE_HABITAT = 'rare';

function similarity(a: HabitatTraits, b: HabitatTraits): number {
  let score = 0;
  if (a.types[0] === b.types[0]) score += 3;
  for (const [i, t] of a.types.entries()) {
    if ((i > 0 || t !== b.types[0]) && b.types.includes(t)) score += 2;
  }
  if (a.shape && a.shape === b.shape) score += 1.5;
  if (a.color === b.color) score += 1;
  return score;
}

export function inferHabitat(
  target: HabitatTraits,
  references: readonly HabitatReference[],
  neighbours = 7,
): string | null {
  if (target.isLegendary || target.isMythical) return RARE_HABITAT;
  const candidates = references.filter((r) => r.habitat !== RARE_HABITAT);
  if (candidates.length === 0) return null;
  const nearest = candidates
    .map((r) => ({ habitat: r.habitat, id: r.id, score: similarity(target, r) }))
    .sort((a, b) => b.score - a.score || a.id - b.id)
    .slice(0, neighbours);
  const votes = new Map<string, number>();
  for (const n of nearest) votes.set(n.habitat, (votes.get(n.habitat) ?? 0) + n.score + 0.01);
  return [...votes].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
}
