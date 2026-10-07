import { describe, expect, it } from 'vitest';
import { createRng } from './rng';

describe('createRng', () => {
  it('est déterministe pour un même seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('diffère pour des seeds différents', () => {
    expect(createRng(1).next()).not.toEqual(createRng(2).next());
  });

  it('reste dans les bornes', () => {
    const rng = createRng(7);
    for (let i = 0; i < 10_000; i++) {
      const f = rng.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = rng.int(3, 5);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(5);
    }
  });

  it('respecte approximativement les poids', () => {
    const rng = createRng(123);
    const counts = { a: 0, b: 0, c: 0 };
    const entries = [
      { value: 'a' as const, weight: 1 },
      { value: 'b' as const, weight: 3 },
      { value: 'c' as const, weight: 0 },
    ];
    for (let i = 0; i < 40_000; i++) counts[rng.weighted(entries)]++;
    expect(counts.c).toBe(0);
    expect(counts.b / counts.a).toBeGreaterThan(2.8);
    expect(counts.b / counts.a).toBeLessThan(3.2);
  });

  it('refuse une table de poids vide', () => {
    expect(() => createRng(1).weighted([{ value: 'x', weight: 0 }])).toThrow();
  });
});
