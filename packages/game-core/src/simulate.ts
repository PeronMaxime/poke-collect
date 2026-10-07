import type { GameContext } from './context';
import { encounterCount, resolveExpedition } from './expedition';
import { createRng, MAX_SEED } from './rng';

export interface ZoneSimulationInput {
  zoneId: string;
  durationMinutes: number;
  /** Ball utilisée (stock illimité) ; null = aucune capture. */
  ballItemId: string | null;
  berryItemId: string | null;
  /** Membres de l'équipe en affinité avec la zone. */
  affinityCount: number;
  runs: number;
  seed: number;
}

export interface ZoneSimulation {
  runs: number;
  encountersPerRun: number;
  capturesPerRun: number;
  shiniesSeen: number;
  xpPerMemberPerRun: number;
  species: {
    speciesId: number;
    encounterShare: number;
    capturesPerRun: number;
    captureRate: number;
  }[];
  loot: { itemId: string; quantityPerRun: number; dropRate: number }[];
}

/** Simule N expéditions dans une zone (simulateur de l'admin) : moyennes par expédition. */
export function simulateZone(ctx: GameContext, input: ZoneSimulationInput): ZoneSimulation {
  const zone = ctx.zone(input.zoneId);
  if (!zone) throw new Error(`Zone inconnue : ${input.zoneId}`);
  const seeds = createRng(input.seed);
  const perRun = encounterCount(ctx, input.durationMinutes);
  const species = new Map<number, { seen: number; captured: number }>();
  const loot = new Map<string, { quantity: number; runs: number }>();
  let encounters = 0;
  let captures = 0;
  let shinies = 0;
  let xp = 0;

  for (let run = 0; run < input.runs; run++) {
    const result = resolveExpedition(ctx, {
      zone,
      durationMinutes: input.durationMinutes,
      seed: seeds.int(0, MAX_SEED),
      team: [],
      affinityCount: input.affinityCount,
      balls: input.ballItemId ? { itemId: input.ballItemId, quantity: perRun } : null,
      berries: input.berryItemId ? { itemId: input.berryItemId, quantity: perRun } : null,
      pity: {},
    });
    for (const e of result.encounters) {
      const s = species.get(e.speciesId) ?? { seen: 0, captured: 0 };
      s.seen++;
      encounters++;
      if (e.isShiny) shinies++;
      if (e.outcome === 'captured') {
        s.captured++;
        captures++;
      }
      species.set(e.speciesId, s);
    }
    for (const stack of result.loot) {
      const l = loot.get(stack.itemId) ?? { quantity: 0, runs: 0 };
      l.quantity += stack.quantity;
      l.runs++;
      loot.set(stack.itemId, l);
    }
    xp += result.xpPerMember;
  }

  const runs = Math.max(1, input.runs);
  return {
    runs: input.runs,
    encountersPerRun: encounters / runs,
    capturesPerRun: captures / runs,
    shiniesSeen: shinies,
    xpPerMemberPerRun: xp / runs,
    species: [...species]
      .map(([speciesId, s]) => ({
        speciesId,
        encounterShare: encounters ? s.seen / encounters : 0,
        capturesPerRun: s.captured / runs,
        captureRate: s.seen ? s.captured / s.seen : 0,
      }))
      .sort((a, b) => b.encounterShare - a.encounterShare),
    loot: [...loot]
      .map(([itemId, l]) => ({
        itemId,
        quantityPerRun: l.quantity / runs,
        dropRate: l.runs / runs,
      }))
      .sort((a, b) => b.quantityPerRun - a.quantityPerRun),
  };
}
