import { describe, expect, it } from 'vitest';
import { seedContent } from '@poke/content';
import { createGameContext } from './context';
import {
  chestCandidates,
  drawGuildQuests,
  guildObjectiveAmount,
  guildQuestTarget,
  guildWeek,
  openGuildChests,
} from './guilds';
import type { PlayerProgress } from './progress';

const ctx = createGameContext({ versionId: 1, ...seedContent });
const beginner: PlayerProgress = {
  caughtSpeciesIds: new Set(),
  defeatedTrainerIds: new Set(),
  eggsHatched: 0,
};

describe('semaine de guilde', () => {
  it('commence le lundi à minuit, heure de Paris (hiver)', () => {
    // Dimanche 1er novembre 2026, 23 h 59 à Paris (UTC+1).
    expect(guildWeek(new Date('2026-11-01T22:59:00Z'))).toEqual({
      id: '2026-10-26',
      startsAt: new Date('2026-10-25T23:00:00Z'), // l'heure d'hiver commence le dimanche 25
      endsAt: new Date('2026-11-01T23:00:00Z'),
    });
    // Lundi 2 novembre, minuit à Paris : nouvelle semaine.
    expect(guildWeek(new Date('2026-11-01T23:00:00Z')).id).toBe('2026-11-02');
  });

  it('suit l’heure d’été', () => {
    const week = guildWeek(new Date('2026-07-15T12:00:00Z')); // mercredi
    expect(week.id).toBe('2026-07-13');
    expect(week.startsAt).toEqual(new Date('2026-07-12T22:00:00Z'));
    expect(week.endsAt).toEqual(new Date('2026-07-19T22:00:00Z'));
  });
});

describe('quêtes de guilde', () => {
  it('tire les quêtes par rareté, toujours les mêmes pour une guilde et une semaine', () => {
    const draws = drawGuildQuests(ctx, 'guilde-a', '2026-10-26', 4);
    expect(draws.map((d) => d.rarity)).toEqual(['bronze', 'bronze', 'silver', 'silver', 'gold']);
    expect(new Set(draws.map((d) => d.questId)).size).toBe(5);
    expect(draws.map((d) => d.slot)).toEqual([0, 1, 2, 3, 4]);
    expect(drawGuildQuests(ctx, 'guilde-a', '2026-10-26', 4)).toEqual(draws);
    const other = Array.from({ length: 10 }, (_, i) =>
      drawGuildQuests(ctx, `guilde-${i}`, '2026-10-26', 4)
        .map((d) => d.questId)
        .join(),
    );
    expect(new Set(other).size).toBeGreaterThan(1);
  });

  it('adapte l’objectif au nombre de membres, sans descendre sous le minimum', () => {
    const quest = ctx.guildQuests.find((q) => q.id === 'captures')!;
    expect(guildQuestTarget(quest, 1)).toBe(50);
    expect(guildQuestTarget(quest, 10)).toBe(250);
  });

  it('compte les actions selon l’objectif', () => {
    const caught = [{ speciesId: 7 }, { speciesId: 1 }, { speciesId: 8 }]; // Eau, Plante, Eau
    expect(guildObjectiveAmount(ctx, { type: 'catchPokemon', pokemonType: null }, { caught })).toBe(
      3,
    );
    expect(
      guildObjectiveAmount(ctx, { type: 'catchPokemon', pokemonType: 'water' }, { caught }),
    ).toBe(2);
    expect(guildObjectiveAmount(ctx, { type: 'battlesWon' }, { caught })).toBe(0);
    expect(guildObjectiveAmount(ctx, { type: 'moneyEarned' }, { money: 1234.5 })).toBe(1234);
  });
});

describe('coffres de guilde', () => {
  it('ne propose que les lots débloqués', () => {
    const lots = chestCandidates(ctx, 'gold', beginner).map((e) => e.itemId);
    expect(lots).toContain('rare-candy');
    expect(lots).not.toContain('master-ball');
    const champion: PlayerProgress = {
      ...beginner,
      defeatedTrainerIds: new Set(ctx.trainers.filter((t) => t.badge).map((t) => t.id)),
    };
    expect(chestCandidates(ctx, 'gold', champion).map((e) => e.itemId)).toContain('master-ball');
  });

  it('tire autant de lots que l’équilibrage le prévoit', () => {
    const loot = openGuildChests(ctx, 'bronze', beginner, 3, 42);
    const lots = loot.reduce((n, s) => {
      const entry = ctx.chestEntries.find((e) => e.rarity === 'bronze' && e.itemId === s.itemId)!;
      return n + s.quantity / entry.lotSize;
    }, 0);
    expect(lots).toBe(3 * ctx.balance.guilds.chestRolls.bronze);
    expect(openGuildChests(ctx, 'bronze', beginner, 3, 42)).toEqual(loot);
  });
});
