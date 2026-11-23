import { describe, expect, it } from 'vitest';
import type { Encounter, Zone } from '@poke/content';
import { seedContent } from '@poke/content/seed';
import { createGameContext } from '@poke/game-core';
import {
  filterCounts,
  matchesFilter,
  speciesStage,
  suggestedLevels,
  withEncounter,
  zoneSpeciesReport,
} from '../src/lib/zone-species';

const enc = (speciesId: number, weight: number, minLevel = 5, maxLevel = 10): Encounter => ({
  speciesId,
  weight,
  minLevel,
  maxLevel,
});

const baseZone = seedContent.zones.find((z) => z.regionId === 'kanto')!;
const zone = (id: string, order: number, encounters: Encounter[], enabled = true): Zone => ({
  ...baseZone,
  id,
  name: id,
  order,
  enabled,
  encounters,
  specialEncounters: [],
});

/** Une petite région : Roucool, Roucoups et Pikachu dans deux zones, Ronflex dans une zone fermée. */
const content = {
  versionId: 0,
  ...seedContent,
  regions: [
    {
      ...seedContent.regions.find((r) => r.id === 'kanto')!,
      speciesIds: [1, 2, 16, 17, 18, 25, 26, 143],
    },
  ],
  zones: [
    zone('b', 1, [enc(17, 10), enc(25, 10, 8, 14)]),
    zone('a', 0, [enc(16, 30), enc(17, 10)]),
    zone('c', 2, [enc(143, 10)], false),
  ],
};
const ctx = createGameContext(content);

describe('espèces par zone', () => {
  it('range les zones dans l’ordre et compte les nouvelles espèces de chacune', () => {
    const { zones } = zoneSpeciesReport(ctx, 'kanto');
    expect(zones.map((c) => [c.zone.id, c.index, c.newCount])).toEqual([
      ['a', 1, 2],
      ['b', 2, 1],
    ]);
  });

  it('donne pour chaque espèce ses zones, sa première apparition et sa chance', () => {
    const { rows } = zoneSpeciesReport(ctx, 'kanto');
    const row = (id: number) => rows.find((r) => r.speciesId === id)!;
    expect(rows.map((r) => r.speciesId)).toEqual([1, 2, 16, 17, 18, 25, 26, 143]);
    expect(row(17)).toMatchObject({ zoneCount: 2, availability: 'present' });
    expect(row(17).first?.zone.id).toBe('a');
    expect(row(16).cells.get('a')).toMatchObject({ weight: 30, chance: 0.75, encounterIndex: 0 });
    expect(row(25).first?.zone.id).toBe('b');
  });

  it('dit comment obtenir une espèce absente des zones', () => {
    const { rows } = zoneSpeciesReport(ctx, 'kanto');
    const availability = (id: number) => rows.find((r) => r.speciesId === id)!.availability;
    expect(availability(18)).toBe('evolution');
    expect(availability(26)).toBe('evolution');
    expect(availability(1)).toBe('missing');
    expect(availability(143)).toBe('missing');
    // Zone désactivée comptée sur demande.
    const all = zoneSpeciesReport(ctx, 'kanto', { includeDisabled: true });
    expect(all.rows.find((r) => r.speciesId === 143)?.first?.zone.id).toBe('c');
  });

  it('calcule le stade sans compter les bébés, et si l’espèce peut encore évoluer', () => {
    expect(speciesStage(ctx, 172, null)).toMatchObject({ stage: 0, evolved: false });
    expect(speciesStage(ctx, 25, null)).toMatchObject({
      stage: 1,
      evolved: true,
      fromBaby: true,
      canEvolve: true,
    });
    expect(speciesStage(ctx, 18, null)).toMatchObject({ stage: 3, canEvolve: false });
    expect(speciesStage(ctx, 143, null)).toMatchObject({ fromBaby: true, canEvolve: false });
  });

  it('filtre les lignes', () => {
    const { rows } = zoneSpeciesReport(ctx, 'kanto');
    const ids = (f: Parameters<typeof matchesFilter>[1]) =>
      rows.filter((r) => matchesFilter(r, f)).map((r) => r.speciesId);
    expect(ids('single')).toEqual([16, 25]);
    expect(ids('multiple')).toEqual([17]);
    expect(ids('missing')).toEqual([1, 2, 143]);
    expect(ids('evolved')).toEqual([17, 25]);
    expect(filterCounts(rows)).toMatchObject({ all: 8, absent: 5, final: 0, outsideDex: 0 });
  });

  it('ajoute, change et retire une rencontre, et propose les niveaux de la zone', () => {
    const z = zone('z', 0, [enc(16, 30, 2, 4), enc(19, 10, 3, 6), enc(21, 5, 4, 8)]);
    expect(suggestedLevels(z)).toEqual({ minLevel: 3, maxLevel: 6 });
    expect(suggestedLevels(zone('vide', 0, []))).toEqual({ minLevel: 5, maxLevel: 10 });
    expect(withEncounter(z, null, enc(25, 1)).encounters).toHaveLength(4);
    expect(withEncounter(z, 1, enc(19, 99)).encounters[1]?.weight).toBe(99);
    expect(withEncounter(z, 0, null).encounters.map((e) => e.speciesId)).toEqual([19, 21]);
  });
});
