import { describe, expect, it } from 'vitest';
import { STAT_NAMES, getSpecies, growthRates, natures, pokemonSpriteUrl, species } from './index';

describe('données PokéAPI importées', () => {
  it('contient les 151 espèces de Kanto avec leurs noms FR', () => {
    expect(species).toHaveLength(151);
    expect(getSpecies(25)?.nameFr).toBe('Pikachu');
    expect(getSpecies('bulbasaur')?.nameFr).toBe('Bulbizarre');
  });

  it('a des stats de base complètes', () => {
    for (const s of species) {
      for (const stat of STAT_NAMES) expect(s.baseStats[stat]).toBeGreaterThan(0);
    }
  });

  it('a une courbe d’XP pour chaque espèce', () => {
    const names = new Set(growthRates.map((g) => g.name));
    for (const s of species) expect(names.has(s.growthRate)).toBe(true);
  });

  it('a 25 natures', () => {
    expect(natures).toHaveLength(25);
  });

  it('construit les URLs de sprites', () => {
    expect(pokemonSpriteUrl(6, { shiny: true })).toMatch(/pokemon\/shiny\/6\.png$/);
  });
});
