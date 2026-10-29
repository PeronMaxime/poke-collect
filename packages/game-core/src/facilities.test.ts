import { describe, expect, it } from 'vitest';
import { facilityPlaces, lockedFacilityUnlocks } from './facilities';
import { FARM_PLOTS } from './farm';
import { testContext } from './test-helpers';

const start = {
  caughtSpeciesIds: new Set<number>(),
  defeatedTrainerIds: new Set<string>(),
  eggsHatched: 0,
};
const hatched = (eggsHatched: number) => ({ ...start, eggsHatched });

describe('bâtiments à débloquer', () => {
  it('sans palier, garde les places de l’équilibrage', () => {
    const ctx = testContext();
    expect(facilityPlaces(ctx, 'expedition', start)).toBe(ctx.balance.expeditions.initialSlots);
    expect(facilityPlaces(ctx, 'museum', start)).toBe(ctx.balance.museum.slots);
    expect(facilityPlaces(ctx, 'center', start)).toBe(ctx.balance.center.slots);
    expect(facilityPlaces(ctx, 'farm', start)).toBe(FARM_PLOTS);
    expect(facilityPlaces(ctx, 'daycare', start)).toBe(ctx.balance.daycare.initialSlots);
    expect(facilityPlaces(ctx, 'incubator', start)).toBe(ctx.balance.breeding.maxEggs);
  });

  it('ajoute les paliers remplis, une couveuse et un Centre valant 6 places', () => {
    const ctx = testContext((c) => {
      c.balance.museum.slots = 2;
      c.balance.center.slots = 6;
      c.balance.farm = { initialPlots: 3 };
      c.balance.daycare = { initialSlots: 1 };
      c.balance.breeding.maxEggs = 6;
      c.balance.expeditions.initialSlots = 2;
      c.balance.expeditions.maxSlots = 4;
      const step = (amount: number, count: number) => ({
        amount,
        unlock: { type: 'eggsHatched' as const, count },
      });
      c.balance.facilityUnlocks = {
        expedition: [step(1, 1), step(3, 2)],
        daycare: [step(1, 1), step(5, 2)],
        incubator: [step(1, 1)],
        museum: [step(1, 1), step(2, 5)],
        farm: [step(3, 1), step(9, 2)],
        center: [step(1, 1)],
      };
    });
    expect(facilityPlaces(ctx, 'expedition', hatched(1))).toBe(3);
    expect(facilityPlaces(ctx, 'expedition', hatched(2))).toBe(4); // maximum des expéditions
    expect(facilityPlaces(ctx, 'museum', start)).toBe(2);
    expect(facilityPlaces(ctx, 'museum', hatched(1))).toBe(3);
    expect(facilityPlaces(ctx, 'museum', hatched(5))).toBe(5);
    expect(facilityPlaces(ctx, 'center', hatched(1))).toBe(12);
    expect(facilityPlaces(ctx, 'incubator', hatched(1))).toBe(12);
    expect(facilityPlaces(ctx, 'farm', hatched(1))).toBe(6);
    expect(facilityPlaces(ctx, 'farm', hatched(2))).toBe(15);
    expect(facilityPlaces(ctx, 'daycare', hatched(1))).toBe(2);
    expect(facilityPlaces(ctx, 'daycare', hatched(2))).toBe(7);
    expect(lockedFacilityUnlocks(ctx, 'museum', hatched(1))).toEqual([
      { amount: 2, unlock: { type: 'eggsHatched', count: 5 } },
    ]);
  });
});
