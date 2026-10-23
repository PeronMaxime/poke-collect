import { describe, expect, it } from 'vitest';
import { resolveExpedition } from './expedition';
import type { ExpeditionInput } from './expedition';
import type { PlayerProgress } from './progress';
import {
  roamerFleeZoneId,
  roamerMeetChance,
  roamerPositions,
  roamerZoneIndex,
  roamingTarget,
  roamingZones,
} from './roaming';
import { member, testContext } from './test-helpers';
import { weatherHourStart } from './weather';

const ctx = testContext();
const raikou = ctx.quest('raikou')!;
const target = raikou.rewards.pokemon[0]!;

/** Joueur ayant tout Johto (8 badges de Johto, dont ceux de toutes les zones ordinaires). */
const johtoProgress: PlayerProgress = {
  caughtSpeciesIds: new Set(Array.from({ length: 251 }, (_, i) => i + 1)),
  defeatedTrainerIds: new Set(ctx.trainers.map((t) => t.id)),
  eggsHatched: 0,
};

describe('Pokémon fuyards', () => {
  it('les bêtes de Johto et les oiseaux de Galar sont des fuyards', () => {
    for (const id of ['raikou', 'entei', 'suicune', 'artikodin-galar', 'electhor-galar']) {
      expect(roamingTarget(ctx.quest(id)!, 0)).toBeDefined();
    }
    expect(roamingTarget(ctx.quest('sulfura-galar')!, 0)?.formId).toBe(10171);
    expect(roamingTarget(ctx.quest('lugia')!, 0)).toBeUndefined();
    // Une fois capturé, plus de fuyard.
    expect(roamingTarget(raikou, 1)).toBeUndefined();
  });

  it('change de zone à chaque heure, sans jamais rester sur place', () => {
    for (const count of [2, 3, 4, 7, 20]) {
      for (const seed of [0, 1, 123_456, 0xffffffff]) {
        let previous = -1;
        for (let hour = 0; hour < 300; hour++) {
          const index = roamerZoneIndex(seed, hour, count);
          expect(index).toBeGreaterThanOrEqual(0);
          expect(index).toBeLessThan(count);
          expect(index).not.toBe(previous);
          previous = index;
        }
      }
    }
    expect(roamerZoneIndex(42, 7, 1)).toBe(0);
  });

  it('se cache dans une zone ordinaire débloquée de sa région, sauf s’il est déjà parti', () => {
    const input = {
      userId: 'joueur',
      claimedQuests: [
        { questId: 'raikou', pokemonCaught: 0 },
        { questId: 'entei', pokemonCaught: 1 }, // déjà capturé
        { questId: 'lugia', pokemonCaught: 0 }, // expédition légendaire
      ],
      progress: johtoProgress,
      engagedQuestIds: new Set<string>(),
      at: weatherHourStart(100),
    };
    const positions = roamerPositions(ctx, input);
    expect(positions.map((p) => p.questId)).toEqual(['raikou']);
    const zone = ctx.zone(positions[0]!.zoneId)!;
    expect(zone.regionId).toBe('johto');
    expect(zone.unlock.type).not.toMatch(/^(allOf|questStepsDone|questCompleted)$/);
    expect(positions[0]!.movesAt).toEqual(weatherHourStart(101));
    // Même heure : même zone ; l'heure suivante, une autre.
    expect(roamerPositions(ctx, { ...input, at: +weatherHourStart(100) + 59 * 60_000 })).toEqual(
      positions,
    );
    expect(roamerPositions(ctx, { ...input, at: weatherHourStart(101) })[0]!.zoneId).not.toBe(
      zone.id,
    );
    // Parti avec une expédition : introuvable ailleurs.
    expect(roamerPositions(ctx, { ...input, engagedQuestIds: new Set(['raikou']) })).toEqual([]);
  });

  it('croisé sans être capturé, fuit vers une autre zone jusqu’à l’heure suivante', () => {
    const zones = roamingZones(ctx, 'johto', johtoProgress);
    expect(zones.length).toBeGreaterThan(2);
    const at = weatherHourStart(100);
    const input = (pokemonIndex: number, hour: number, zoneId: string) => ({
      userId: 'joueur',
      claimedQuests: [
        { questId: 'raikou', pokemonCaught: 0, roamerHideout: { pokemonIndex, hour, zoneId } },
      ],
      progress: johtoProgress,
      engagedQuestIds: new Set<string>(),
      at,
    });
    const usual = roamerPositions(ctx, { ...input(0, 99, zones[0]!.id) })[0]!.zoneId;
    for (const seed of [0, 1, 123_456, 0xffffffff]) {
      const fled = roamerFleeZoneId(zones, usual, seed)!;
      expect(fled).not.toBe(usual);
      expect(roamerPositions(ctx, input(0, 100, fled))[0]!.zoneId).toBe(fled);
      // L'heure suivante, ou pour un autre Pokémon de la récompense : trajet habituel.
      expect(roamerPositions(ctx, { ...input(0, 100, fled), at: weatherHourStart(101) })).toEqual(
        roamerPositions(ctx, { ...input(0, 99, fled), at: weatherHourStart(101) }),
      );
      expect(roamerPositions(ctx, input(1, 100, fled))[0]!.zoneId).toBe(usual);
    }
    // Une seule zone : il y reste.
    expect(roamerFleeZoneId(zones.slice(0, 1), zones[0]!.id, 7)).toBe(zones[0]!.id);
  });

  it('à l’arrivée à Johto, seule la Route 29 est débloquée', () => {
    const positions = roamerPositions(ctx, {
      userId: 'joueur',
      claimedQuests: [{ questId: 'raikou', pokemonCaught: 0 }],
      progress: {
        caughtSpeciesIds: new Set(Array.from({ length: 151 }, (_, i) => i + 1)),
        defeatedTrainerIds: new Set(),
        eggsHatched: 0,
      },
      engagedQuestIds: new Set(),
      at: weatherHourStart(5),
    });
    expect(positions.map((p) => p.zoneId)).toEqual(['route-29']);
  });

  const input: ExpeditionInput = {
    zone: ctx.zone('route-29')!,
    durationMinutes: 60,
    seed: 7,
    team: [member('a', 155, 30)],
    balls: { itemId: 'ultra-ball', quantity: 50 },
    berries: null,
    pity: {},
    captureFilter: { speciesIds: [16], minPerfectIvs: 0, shiny: 'any' },
  };

  it('se rencontre une fois au plus, tenté même hors du filtre de capture', () => {
    const roamers = [{ questId: 'raikou', target: { ...target, roaming: 100 } }];
    // Capture assurée : multiplicateur global démesuré.
    const sure = testContext((c) => {
      c.balance.capture.globalMultiplier = 1000;
    });
    const result = resolveExpedition(sure, { ...input, roamers });
    const met = result.encounters.filter((e) => e.questId === 'raikou');
    expect(met).toHaveLength(1);
    expect(result.encounters[0]).toMatchObject({ speciesId: 243, level: 50, outcome: 'captured' });
    expect(result.encounters.slice(1).some((e) => e.speciesId === 243)).toBe(false);
    expect(result.pity[243]).toBeUndefined();
  });

  it('sans fuyard, le résultat ne change pas', () => {
    const roamers = [{ questId: 'raikou', target: { ...target, roaming: 0.0001 } }];
    const without = resolveExpedition(ctx, input);
    expect(resolveExpedition(ctx, { ...input, roamers: [] })).toEqual(without);
    expect(resolveExpedition(ctx, { ...input, roamers })).not.toEqual(without);
  });

  it('chances de le croiser selon le nombre de rencontres', () => {
    expect(roamerMeetChance(3, 0)).toBe(0);
    expect(roamerMeetChance(3, 20)).toBeCloseTo(1 - 0.97 ** 20);
    expect(roamerMeetChance(100, 1)).toBe(1);
  });
});
