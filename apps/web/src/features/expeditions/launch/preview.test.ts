import type { BallPlan, GameContext } from '@poke/game-core';
import { describe, expect, it } from 'vitest';
import {
  ballUsage,
  expectedCaptures,
  formatChance,
  formatShortMinutes,
  launchItems,
  launchStatus,
  resolveBallPlan,
} from './preview';

/** Contexte réduit aux objets : trois Balls (dont une à capture assurée) et deux baies. */
const BALLS: Record<string, { catchMultiplier: number; guaranteed?: boolean }> = {
  master: { catchMultiplier: 255, guaranteed: true },
  ultra: { catchMultiplier: 2 },
  poke: { catchMultiplier: 1 },
};
const BERRIES: Record<string, { multiplier: number }> = {
  strong: { multiplier: 2 },
  weak: { multiplier: 1.5 },
};
const ctx = {
  content: { items: ['master', 'ultra', 'strong', 'poke', 'weak', 'potion'].map((id) => ({ id })) },
  itemEffect: (id: string, type: string) =>
    type === 'ball' ? BALLS[id] : type === 'captureBoost' ? BERRIES[id] : undefined,
} as unknown as GameContext;

describe('formatChance', () => {
  it('n’affiche jamais « 0 % » pour une chance infime', () => {
    expect(formatChance(0.004)).toBe('< 1 %');
    expect(formatChance(0)).toBe('< 1 %');
  });
  it('arrondit au pour cent', () => {
    expect(formatChance(0.126)).toBe('13 %');
    expect(formatChance(1)).toBe('100 %');
  });
});

describe('formatShortMinutes', () => {
  it('écrit secondes, minutes, ou les deux', () => {
    expect(formatShortMinutes(0.5)).toBe('30 s');
    expect(formatShortMinutes(3)).toBe('3 min');
    expect(formatShortMinutes(3.5)).toBe('3 min 30 s');
  });
});

describe('launchItems', () => {
  it('ne propose que ce qui est dans le sac, du plus faible au plus fort', () => {
    const owned = (id: string) => (id === 'ultra' ? 0 : 3);
    expect(launchItems(ctx, owned, false)).toEqual({
      balls: ['poke', 'master'],
      captureBerries: ['weak', 'strong'],
      encounterBerries: [],
    });
  });
  it('propose tout avec un stock illimité', () => {
    expect(launchItems(ctx, () => 0, true).balls).toEqual(['poke', 'ultra', 'master']);
  });
});

describe('resolveBallPlan', () => {
  const balls = ['poke', 'ultra', 'master'];
  it('par défaut : la meilleure Ball hors capture assurée pour les nouveaux et les shiny', () => {
    expect(resolveBallPlan(ctx, balls, {}, false)).toEqual({
      ballCategories: ['new', 'shiny', 'caught'],
      ballPlan: { new: 'ultra', shiny: 'ultra', caught: 'poke' },
    });
  });
  it('garde un choix, « ne pas capturer » compris, et écarte une Ball absente du sac', () => {
    const choice: Partial<BallPlan> = { new: 'master', shiny: null, caught: 'disparue' };
    expect(resolveBallPlan(ctx, balls, choice, false).ballPlan).toEqual({
      new: 'master',
      shiny: null,
      caught: 'poke',
    });
  });
  it('les catégories par IV parfaits suivent « déjà capturé » tant qu’elles n’ont pas de choix', () => {
    const { ballCategories, ballPlan } = resolveBallPlan(ctx, balls, { caught: 'ultra' }, true);
    expect(ballCategories.length).toBeGreaterThan(3);
    for (const category of ballCategories.slice(3)) expect(ballPlan[category]).toBe('ultra');
  });
  it('sans Ball, rien n’est lancé', () => {
    expect(resolveBallPlan(ctx, [], {}, false).ballPlan).toEqual({
      new: null,
      shiny: null,
      caught: null,
    });
  });
});

describe('expectedCaptures', () => {
  const rows = [
    { share: 0.5, chance: 0.8, plainChance: 0.4 },
    { share: 0.5, chance: null, plainChance: null },
  ];
  it('ignore les Pokémon sans Ball prévue', () => {
    expect(expectedCaptures(rows, 20, 1)).toBe(8);
  });
  it('la baie de capture ne compte que pour sa part du temps', () => {
    expect(expectedCaptures(rows, 20, 0)).toBe(4);
    expect(expectedCaptures(rows, 20, 0.5)).toBe(6);
  });
});

describe('ballUsage', () => {
  it('compte une Ball par rencontre de la catégorie, la plus utilisée d’abord', () => {
    const rows = [
      { share: 0.2, ballItemId: 'ultra' },
      { share: 0.5, ballItemId: 'poke' },
      { share: 0.2, ballItemId: 'poke' },
      { share: 0.1, ballItemId: null },
    ];
    const usage = ballUsage(rows, 10);
    expect(usage.map(([id]) => id)).toEqual(['poke', 'ultra']);
    expect(usage[0]![1]).toBeCloseTo(7);
    expect(usage[1]![1]).toBeCloseTo(2);
  });
});

describe('launchStatus', () => {
  it('demande une équipe, puis annonce la première règle non respectée', () => {
    expect(launchStatus([], [{ code: 'TEAM_EMPTY' }]).tone).toBe('idle');
    expect(launchStatus(['a'], [{ code: 'DUPLICATE_MEMBER' }])).toEqual({
      tone: 'bad',
      text: 'Un Pokémon est sélectionné deux fois.',
    });
    expect(launchStatus(['a'], []).tone).toBe('ok');
  });
});
