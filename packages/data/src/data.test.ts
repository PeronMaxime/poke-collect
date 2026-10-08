import { describe, expect, it } from 'vitest';
import {
  STAT_NAMES,
  abilities,
  forms,
  getForm,
  getFormByName,
  getSpecies,
  growthRates,
  inferHabitat,
  natures,
  pokemonSprite,
  pokemonSpriteUrl,
  species,
  speciesForms,
} from './index';

describe('données PokéAPI importées', () => {
  it('contient toutes les espèces, de Kanto à Paldea, avec leurs noms FR', () => {
    expect(species).toHaveLength(1025);
    expect(getSpecies(152)?.nameFr).toBe('Germignon');
    expect(getSpecies(387)?.generation).toBe(4);
    expect(getSpecies(1025)?.generation).toBe(9);
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

  it('donne un habitat (PokéAPI ou déduit) à chaque espèce', () => {
    for (const s of species) expect(s.habitat).toBeTruthy();
    expect(getSpecies(1)?.habitatInferred).toBe(false);
    expect(getSpecies(387)?.habitatInferred).toBe(true);
    expect(getSpecies(483)?.habitat).toBe('rare');
  });

  it('importe toutes les formes : régionales, alternatives, Méga, Gigamax, apparence…', () => {
    const alolanVulpix = getFormByName('vulpix-alola');
    expect(alolanVulpix).toMatchObject({ speciesId: 37, formName: 'alola', kind: 'regional' });
    expect(alolanVulpix?.types).toEqual(['ice']);
    expect(getForm(alolanVulpix!.id)?.nameFr).toMatch(/Goupix/);
    expect(speciesForms(479).map((f) => f.formName)).toContain('wash');
    expect(getFormByName('rotom-wash')?.kind).toBe('alternate');
    expect(getFormByName('charizard-mega-x')).toMatchObject({
      kind: 'mega',
      nameFr: 'Méga-Dracaufeu X',
    });
    expect(getFormByName('charizard-gmax')?.kind).toBe('gmax');
    expect(getFormByName('kyogre-primal')?.kind).toBe('primal');
    expect(getFormByName('pikachu-alola-cap')?.kind).toBe('alternate');
    expect(getFormByName('darmanitan-zen')?.kind).toBe('battle');
    expect(getFormByName('raticate-totem-alola')?.kind).toBe('totem');
    // Formes d'apparence : identifiant décalé, sprite propre, types propres (Arceus).
    const unownB = getFormByName('unown-b')!;
    expect(unownB).toMatchObject({ kind: 'cosmetic', sprite: '201-b' });
    expect(unownB.id).toBeGreaterThan(100_000);
    expect(getFormByName('arceus-fire')?.types).toEqual(['fire']);
    expect(new Set(forms.map((f) => f.id)).size).toBe(forms.length);
    expect(pokemonSprite(201, unownB.id)).toBe('201-b');
    expect(pokemonSprite(25, unownB.id)).toBe(25);
    const abilityNames = new Set(abilities.map((a) => a.name));
    for (const f of forms) for (const a of f.abilities) expect(abilityNames.has(a.name)).toBe(true);
  });

  it('déduit un habitat des espèces proches', () => {
    const refs = [
      {
        id: 1,
        types: ['water'],
        shape: 'fish',
        color: 'blue',
        isLegendary: false,
        isMythical: false,
        habitat: 'sea',
      },
      {
        id: 2,
        types: ['water'],
        shape: 'fish',
        color: 'red',
        isLegendary: false,
        isMythical: false,
        habitat: 'sea',
      },
      {
        id: 3,
        types: ['grass'],
        shape: 'quadruped',
        color: 'green',
        isLegendary: false,
        isMythical: false,
        habitat: 'grassland',
      },
    ];
    const fish = {
      id: 9,
      types: ['water'],
      shape: 'fish',
      color: 'blue',
      isLegendary: false,
      isMythical: false,
    };
    expect(inferHabitat(fish, refs, 2)).toBe('sea');
    expect(inferHabitat({ ...fish, isLegendary: true }, refs)).toBe('rare');
  });

  it('a 25 natures', () => {
    expect(natures).toHaveLength(25);
  });

  it('construit les URLs de sprites', () => {
    expect(pokemonSpriteUrl(6, { shiny: true })).toMatch(/pokemon\/shiny\/6\.png$/);
  });
});
