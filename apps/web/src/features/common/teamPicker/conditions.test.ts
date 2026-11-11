import type { ExpeditionSite, GameContext } from '@poke/game-core';
import type { PokemonDto } from '@poke/shared';
import { describe, expect, it } from 'vitest';
import { teamConditions, teamStatus } from './conditions';

/** Contexte réduit aux espèces : 1 est de type Feu, 2 de type Eau. */
const TYPES: Record<number, string[]> = { 1: ['fire'], 2: ['water'] };
const ctx = {
  species: (id: number) => ({ types: TYPES[id] ?? [] }),
} as unknown as GameContext;
const mon = (speciesId: number, level: number) => ({ speciesId, level }) as PokemonDto;
const zone: ExpeditionSite = {
  regionId: null,
  minPower: 100,
  requiredTypes: [{ type: 'fire', count: 1 }],
  affinityTypes: [],
};
const keysOf = (met: ReturnType<typeof teamConditions>) => met.map((m) => m.key);

describe('teamConditions', () => {
  it('ne coche rien tant que l’équipe est vide', () => {
    expect(teamConditions(ctx, zone, [], 500, 50, new Set(['water']))).toEqual([]);
  });

  it('coche la PE, les types requis, le niveau et l’absence de type interdit', () => {
    const met = teamConditions(ctx, zone, [mon(1, 30)], 120, 50, new Set(['water']));
    expect(keysOf(met)).toEqual(['power', 'type-fire', 'level', 'forbidden']);
  });

  it('ne coche pas ce qui manque', () => {
    const met = teamConditions(ctx, zone, [mon(2, 60)], 80, 50, new Set(['water']));
    expect(met).toEqual([]);
  });

  it('ne montre ni PE ni niveau quand le lieu n’en impose pas', () => {
    const open: ExpeditionSite = {
      regionId: null,
      minPower: 0,
      requiredTypes: [],
      affinityTypes: [],
    };
    expect(teamConditions(ctx, open, [mon(1, 30)], 120, null, new Set())).toEqual([]);
  });
});

describe('teamStatus', () => {
  it('invite à choisir, montre la première règle non respectée, ou annonce l’équipe prête', () => {
    expect(teamStatus(0, ['Trop faible']).tone).toBe('idle');
    expect(teamStatus(2, ['Trop faible', 'Autre'])).toEqual({ tone: 'bad', text: 'Trop faible' });
    expect(teamStatus(2, [])).toEqual({ tone: 'ok', text: 'Équipe prête' });
  });
});
