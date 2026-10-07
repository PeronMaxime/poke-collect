/**
 * PRNG seedé (mulberry32). Le seed est tiré côté serveur au lancement d'une action :
 * le même seed donne toujours le même résultat (reproductible, vérifiable, testable).
 */
export interface Rng {
  /** Flottant dans [0, 1). */
  next(): number;
  /** Entier dans [min, max] (bornes incluses). */
  int(min: number, max: number): number;
  /** Vrai avec une probabilité `p` (0 à 1). */
  chance(p: number): boolean;
  /** Tirage pondéré ; lève une erreur si la somme des poids est nulle. */
  weighted<T>(entries: readonly { value: T; weight: number }[]): T;
}

export const MAX_SEED = 0xffffffff;

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int(min, max) {
      if (max < min) throw new RangeError(`int(${min}, ${max}) : max < min`);
      return min + Math.floor(next() * (max - min + 1));
    },
    chance(p) {
      return next() < p;
    },
    weighted(entries) {
      const total = entries.reduce((sum, e) => sum + Math.max(0, e.weight), 0);
      if (total <= 0) throw new RangeError('weighted() : somme des poids nulle');
      let roll = next() * total;
      for (const entry of entries) {
        roll -= Math.max(0, entry.weight);
        if (roll < 0) return entry.value;
      }
      // Arrondi flottant : on retombe sur la dernière entrée de poids positif.
      return entries.findLast((e) => e.weight > 0)!.value;
    },
  };
}
