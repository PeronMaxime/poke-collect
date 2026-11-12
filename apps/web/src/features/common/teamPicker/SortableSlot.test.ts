import { describe, expect, it } from 'vitest';
import { swapped, withOrder } from './SortableSlot';

describe('swapped', () => {
  it('échange un membre avec son voisin', () => {
    expect(swapped(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(swapped(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
  });

  it('ne bouge rien au bord de la liste', () => {
    const ids = ['a', 'b'];
    expect(swapped(ids, 0, -1)).toBe(ids);
    expect(swapped(ids, 1, 1)).toBe(ids);
  });
});

describe('withOrder', () => {
  it('suit le nouvel ordre et garde les absents à la fin', () => {
    expect(withOrder(['a', 'x', 'b', 'c'], ['c', 'a', 'b'])).toEqual(['c', 'a', 'b', 'x']);
  });
});
