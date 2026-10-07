import { describe, expect, it } from 'vitest';
import { resolveEgg } from './breeding';
import type { DaycareParent } from './breeding';
import { resolveExpedition } from './expedition';
import { isMilestoneReached } from './progression';
import {
  chainMultiplier,
  charmMultiplier,
  isMasudaPair,
  shinyMultiplier,
  shinyProbability,
  zoneChainStatus,
} from './shiny';
import { member, testContext } from './test-helpers';

const ctx = testContext();
const MIN = 60_000;
const now = new Date('2026-10-07T12:00:00Z');
const ago = (minutes: number) => new Date(now.getTime() - minutes * MIN);

describe('taux shiny', () => {
  it('part du taux de base, sans multiplicateur', () => {
    expect(shinyProbability(ctx)).toBe(1 / 4096);
    expect(shinyMultiplier(ctx, { chain: 0, charm: 1, masuda: false })).toBe(1);
  });

  it('cumule chaîne, Charme Chroma et Masuda en les multipliant', () => {
    // Chaîne de 2 : 1 + 2 × 0,25 = 1,5 ; Charme ×3 ; Masuda ×4.
    expect(shinyMultiplier(ctx, { chain: 2, charm: 3, masuda: true })).toBeCloseTo(18);
    expect(shinyProbability(ctx, { chain: 2, charm: 3, masuda: true })).toBeCloseTo(18 / 4096);
  });

  it('plafonne la chaîne et la probabilité', () => {
    expect(chainMultiplier(ctx, 100)).toBe(3);
    const lucky = testContext((c) => {
      c.balance.shiny.baseRateDenominator = 2;
    });
    expect(shinyProbability(lucky, { charm: 3 })).toBe(1);
  });

  it('prend le meilleur Charme Chroma possédé', () => {
    expect(charmMultiplier(ctx, ['poke-ball', 'destiny-knot'])).toBe(1);
    expect(charmMultiplier(ctx, ['poke-ball', 'shiny-charm'])).toBe(3);
  });

  it('applique les multiplicateurs aux rencontres d’expédition', () => {
    const zone = ctx.zone('route-1')!;
    const input = {
      zone,
      durationMinutes: 480,
      seed: 7,
      team: [member('a', 6, 50)],
      balls: null,
      berries: null,
      pity: {},
    };
    const always = testContext((c) => {
      c.balance.shiny.baseRateDenominator = 3;
    });
    expect(resolveExpedition(ctx, input).shinyChance).toBe(1 / 4096);
    const boosted = resolveExpedition(always, { ...input, shiny: { charm: 3 } });
    expect(boosted.shinyChance).toBe(1);
    expect(boosted.encounters.every((e) => e.isShiny)).toBe(true);
  });
});

describe('chaîne de zone', () => {
  it('démarre à 0 sans expédition récente', () => {
    expect(zoneChainStatus(ctx, [], now)).toEqual({ chain: 0, expiresAt: null });
  });

  it('ajoute un maillon si la zone est relancée dans le délai', () => {
    const status = zoneChainStatus(ctx, [{ chain: 2, claimedAt: ago(30) }], now);
    expect(status.chain).toBe(3);
    expect(status.expiresAt).toEqual(new Date(ago(30).getTime() + 120 * MIN));
  });

  it('retombe à 0 une fois le délai passé', () => {
    expect(zoneChainStatus(ctx, [{ chain: 5, claimedAt: ago(121) }], now).chain).toBe(0);
  });

  it('partage le maillon en cours entre expéditions parallèles, sans expiration', () => {
    const status = zoneChainStatus(
      ctx,
      [
        { chain: 3, claimedAt: null },
        { chain: 2, claimedAt: ago(10) },
      ],
      now,
    );
    expect(status).toEqual({ chain: 3, expiresAt: null });
    expect(
      zoneChainStatus(
        ctx,
        [
          { chain: 3, claimedAt: null },
          { chain: 3, claimedAt: ago(10) },
        ],
        now,
      ).chain,
    ).toBe(4);
  });
});

describe('élevage et Pokédex shiny', () => {
  const parent = (originRegion: string | null, gender: 'male' | 'female'): DaycareParent => ({
    ...member('p', 129, 20),
    gender,
    heldItemId: null,
    originRegion,
  });

  it('reconnaît les parents d’origines différentes (Masuda)', () => {
    expect(isMasudaPair(parent('kanto', 'male'), parent('johto', 'female'))).toBe(true);
    expect(isMasudaPair(parent('kanto', 'male'), parent('kanto', 'female'))).toBe(false);
    expect(isMasudaPair(parent(null, 'male'), parent('johto', 'female'))).toBe(false);
  });

  it('applique Masuda et le Charme Chroma à l’éclosion', () => {
    const generous = testContext((c) => {
      c.balance.shiny.baseRateDenominator = 12;
    });
    const egg = (parents: [DaycareParent, DaycareParent], shinyCharm?: number) =>
      [...Array(40).keys()].filter(
        (seed) =>
          resolveEgg(generous, { seed, speciesId: 129, parents, motherIndex: 1, shinyCharm })
            .isShiny,
      ).length;
    const same = egg([parent('kanto', 'male'), parent('kanto', 'female')]);
    // 1/12 × 4 × 3 = 100 % : tous les œufs sont shiny.
    expect(egg([parent('kanto', 'male'), parent('johto', 'female')], 3)).toBe(40);
    expect(same).toBeLessThan(40);
  });

  it('mesure les paliers shiny sur les captures shiny', () => {
    const milestone = ctx.content.dexMilestones.find((m) => m.id === 'kanto-shiny-5')!;
    const ids = new Set([...Array(8).keys()].map((i) => i + 1));
    expect(isMilestoneReached(ctx, milestone, { caughtSpeciesIds: ids })).toBe(false);
    expect(
      isMilestoneReached(ctx, milestone, { caughtSpeciesIds: ids, caughtShinySpeciesIds: ids }),
    ).toBe(true);
  });
});
