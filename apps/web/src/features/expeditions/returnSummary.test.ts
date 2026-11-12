import { describe, expect, it } from 'vitest';
import { returnSummary, revealStep } from './returnSummary';
import type { ExpeditionResult } from './returnSummary';

type Encounter = ExpeditionResult['encounters'][number];

const met = (speciesId: number, extra: Partial<Encounter> = {}) =>
  ({
    speciesId,
    formId: null,
    level: 5,
    isShiny: false,
    outcome: 'captured',
    ...extra,
  }) as Encounter;

const resultWith = (encounters: Encounter[], extra: Partial<ExpeditionResult> = {}) =>
  ({
    encounters,
    newSpeciesIds: [],
    berriesUsed: 0,
    loot: [],
    team: [],
    ...extra,
  }) as unknown as ExpeditionResult;

describe('revealStep', () => {
  it('accélère quand les rencontres sont nombreuses, sans dépasser les bornes', () => {
    expect(revealStep(1)).toBe(0.45);
    expect(revealStep(30)).toBeCloseTo(0.2);
    expect(revealStep(1000)).toBe(0.06);
  });
});

describe('returnSummary', () => {
  it('ne montre ni les transférés, ni les échappés connus, ni les observés ou ignorés', () => {
    const summary = returnSummary(
      resultWith([
        met(1),
        met(2, { transferred: true }),
        met(3, { outcome: 'escaped', filtered: true }),
        met(4, { outcome: 'noBall' }),
        met(5, { outcome: 'ignored' }),
        met(6, { outcome: 'escaped', isShiny: true }),
      ]),
    );
    expect(summary.shown.map((e) => e.speciesId)).toEqual([1, 6]);
    expect(summary.escapedCount).toBe(1);
    // Les captures transférées comptent parmi les captures.
    expect(summary.captured).toBe(2);
    expect(summary.shinies).toBe(1);
    expect(summary.firstShiny).toBe(1);
  });

  it('« Nouveau ! » seulement sur la première capture de chaque nouvelle espèce', () => {
    const summary = returnSummary(
      resultWith([met(7, { outcome: 'escaped' }), met(7), met(7), met(8)], { newSpeciesIds: [7] }),
    );
    expect([...summary.firstNew]).toEqual([1]);
  });

  it('additionne les baies de capture et de rencontres', () => {
    const summary = returnSummary(resultWith([], { berriesUsed: 2, encounterBerriesUsed: 3 }));
    expect(summary.berriesUsed).toBe(5);
    expect(summary.firstShiny).toBe(-1);
  });
});
