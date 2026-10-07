import { describe, expect, it } from 'vitest';
import { getSpecies } from '@poke/data';
import {
  computeStats,
  expeditionPower,
  generatePokemon,
  levelForXp,
  natureModifier,
  xpForLevel,
} from './pokemon';
import { createRng } from './rng';
import { testContext } from './test-helpers';

const pikachu = getSpecies(25)!;
const perfect = {
  hp: 31,
  attack: 31,
  defense: 31,
  'special-attack': 31,
  'special-defense': 31,
  speed: 31,
};

describe('statistiques', () => {
  it('suit la formule officielle (sans EV)', () => {
    // Pikachu niv. 50, IV 31, nature neutre : valeurs des calculateurs officiels.
    expect(computeStats(pikachu, { level: 50, ivs: perfect, nature: 'hardy' })).toEqual({
      hp: 110,
      attack: 75,
      defense: 60,
      'special-attack': 70,
      'special-defense': 70,
      speed: 110,
    });
  });

  it('applique la nature (+10 % / −10 %)', () => {
    expect(natureModifier('adamant', 'attack')).toBe(1.1);
    expect(natureModifier('adamant', 'special-attack')).toBe(0.9);
    expect(natureModifier('hardy', 'attack')).toBe(1);
    const stats = computeStats(pikachu, { level: 50, ivs: perfect, nature: 'adamant' });
    expect(stats.attack).toBe(82);
    expect(stats['special-attack']).toBe(63);
  });

  it('calcule la PE comme la somme des stats', () => {
    const stats = computeStats(pikachu, { level: 50, ivs: perfect, nature: 'hardy' });
    expect(expeditionPower(stats)).toBe(495);
  });
});

describe('expérience', () => {
  it('convertit XP et niveau selon la courbe', () => {
    expect(xpForLevel('medium', 1)).toBe(0);
    expect(xpForLevel('medium', 10)).toBe(1000);
    expect(levelForXp('medium', 999)).toBe(9);
    expect(levelForXp('medium', 1000)).toBe(10);
    expect(levelForXp('medium', 10_000_000)).toBe(100);
  });
});

describe('generatePokemon', () => {
  const ctx = testContext();

  it('est déterministe et respecte les bornes', () => {
    const a = generatePokemon(ctx, createRng(5), 1, 5, { shinyProbability: 0 });
    const b = generatePokemon(ctx, createRng(5), 1, 5, { shinyProbability: 0 });
    expect(a).toEqual(b);
    expect(a.level).toBe(5);
    expect(a.xp).toBe(xpForLevel('medium-slow', 5));
    expect(a.isShiny).toBe(false);
    for (const iv of Object.values(a.ivs)) {
      expect(iv).toBeGreaterThanOrEqual(0);
      expect(iv).toBeLessThanOrEqual(31);
    }
    expect(['overgrow', 'chlorophyll']).toContain(a.ability);
    expect(['male', 'female']).toContain(a.gender);
  });

  it('respecte le taux shiny et les espèces asexuées', () => {
    const shiny = generatePokemon(ctx, createRng(1), 81, 10, { shinyProbability: 1 });
    expect(shiny.isShiny).toBe(true);
    expect(shiny.gender).toBe('genderless'); // Magnéti
  });
});
