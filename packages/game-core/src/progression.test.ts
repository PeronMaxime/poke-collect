import { describe, expect, it } from 'vitest';
import { captureProbability, resolveExpedition } from './expedition';
import { resolveBattle } from './battle';
import {
  NO_CLAIMS,
  claimableRewardCount,
  collectionState,
  dexProgress,
  milestoneState,
  playerBonuses,
  playerSlots,
  sortedMilestones,
} from './progression';
import { member, testContext } from './test-helpers';

const ctx = testContext();
const caught = (...ids: number[]) => ({ caughtSpeciesIds: new Set(ids) });
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);
const claims = (milestones: string[] = [], collections: string[] = []) => ({
  milestoneIds: new Set(milestones),
  collectionIds: new Set(collections),
});

describe('paliers du Pokédex', () => {
  it('mesure un Pokédex régional ou national', () => {
    expect(dexProgress(ctx, 'kanto', caught(1, 2, 3)).caught).toBe(3);
    expect(dexProgress(ctx, null, caught(1, 2, 3, 999)).total).toBe(151);
  });

  it('passe de verrouillé à réclamable puis réclamé', () => {
    const [ten] = sortedMilestones(ctx);
    expect(ten?.id).toBe('kanto-10');
    expect(milestoneState(ctx, ten!, caught(...range(1, 15)), NO_CLAIMS)).toBe('locked');
    expect(milestoneState(ctx, ten!, caught(...range(1, 16)), NO_CLAIMS)).toBe('claimable');
    expect(milestoneState(ctx, ten!, caught(...range(1, 16)), claims(['kanto-10']))).toBe(
      'claimed',
    );
  });
});

describe('collections', () => {
  it('se complète quand toutes les espèces sont capturées', () => {
    const insects = ctx.content.collections.find((c) => c.id === 'insectes-de-jade')!;
    expect(collectionState(insects, caught(10, 11, 12, 13, 14), NO_CLAIMS)).toBe('locked');
    expect(collectionState(insects, caught(...range(10, 15)), NO_CLAIMS)).toBe('claimable');
  });

  it('compte les récompenses à réclamer', () => {
    const progress = caught(...range(1, 16));
    expect(claimableRewardCount(ctx, progress, NO_CLAIMS)).toBe(3); // 10 %, insectes, starters
    expect(claimableRewardCount(ctx, progress, claims(['kanto-10']))).toBe(2);
  });
});

describe('emplacements et bonus', () => {
  it('ajoute les emplacements réclamés, plafonnés au maximum', () => {
    expect(playerSlots(ctx, NO_CLAIMS)).toEqual({ expeditions: 2, battles: 1, daycare: 1 });
    expect(playerSlots(ctx, claims(['kanto-10', 'kanto-25']))).toEqual({
      expeditions: 3,
      battles: 2,
      daycare: 2,
    });
    const all = claims(
      ctx.content.dexMilestones.map((m) => m.id),
      ctx.content.collections.map((c) => c.id),
    );
    expect(playerSlots(ctx, all)).toEqual({ expeditions: 6, battles: 3, daycare: 4 });
    const capped = testContext((c) => {
      c.balance.expeditions.maxSlots = 3;
    });
    expect(playerSlots(capped, all).expeditions).toBe(3);
  });

  it('ignore une récompense réclamée puis supprimée du contenu', () => {
    expect(playerSlots(ctx, claims(['palier-supprime'])).expeditions).toBe(2);
  });

  it('cumule les bonus permanents', () => {
    expect(playerBonuses(ctx, NO_CLAIMS)).toEqual({ capture: 1, xp: 1, money: 1 });
    expect(
      playerBonuses(ctx, claims([], ['insectes-de-jade', 'famille-nidoran', 'starters-de-kanto'])),
    ).toEqual({ capture: 1.05, xp: 1.1, money: 1.1 });
  });

  it('applique les bonus à la capture, à l’XP et à l’argent', () => {
    const base = captureProbability(ctx, { captureRate: 45, ballMultiplier: 1 });
    expect(
      captureProbability(ctx, { captureRate: 45, ballMultiplier: 1, bonusMultiplier: 1.5 }),
    ).toBeCloseTo(base * 1.5);

    const zone = ctx.zone('route-1')!;
    const input = {
      zone,
      durationMinutes: 60,
      seed: 42,
      team: [member('a', 4, 10)],
      balls: null,
      berries: null,
      pity: {},
    };
    const plain = resolveExpedition(ctx, input);
    const boosted = resolveExpedition(ctx, { ...input, bonuses: { capture: 1, xp: 2, money: 1 } });
    expect(boosted.xpPerMember).toBeGreaterThan(plain.xpPerMember);
    expect(boosted.encounters.map((e) => e.speciesId)).toEqual(
      plain.encounters.map((e) => e.speciesId),
    );

    const trainer = ctx.trainer('gamin-tom')!;
    const team = [member('a', 6, 60)];
    const win = resolveBattle(ctx, { trainer, team, seed: 1 });
    expect(win.outcome).toBe('win');
    const rich = resolveBattle(ctx, {
      trainer,
      team,
      seed: 1,
      bonuses: { capture: 1, xp: 1, money: 1.1 },
    });
    expect(rich.money).toBe(Math.floor(trainer.money * 1.1));
  });
});
