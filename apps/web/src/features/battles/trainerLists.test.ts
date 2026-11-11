import type { Trainer } from '@poke/content';
import { describe, expect, it } from 'vitest';
import { leagueRank } from './trainerLists';

const trainer = (trainerClass: string, badge?: Trainer['badge']) =>
  ({ trainerClass, badge }) as Trainer;

describe('leagueRank', () => {
  it('reconnaît le Conseil 4 et le Maître à leur classe', () => {
    expect(leagueRank(trainer('Conseil 4'))).toBe('elite');
    expect(leagueRank(trainer('Maître de la Ligue'))).toBe('master');
    expect(leagueRank(trainer('Maitresse de la Ligue'))).toBe('master');
  });

  it('fait d’un dresseur à badge un Champion, et des autres des dresseurs ordinaires', () => {
    expect(leagueRank(trainer('Champion', { name: 'Badge Roche' } as Trainer['badge']))).toBe(
      'gym',
    );
    expect(leagueRank(trainer('Montagnard'))).toBeNull();
  });
});
