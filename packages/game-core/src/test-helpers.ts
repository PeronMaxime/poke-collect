import { seedContent } from '@poke/content/seed';
import type { GameContentData } from '@poke/content';
import { createGameContext } from './context';
import type { TeamMember } from './expedition';

/**
 * Aides des tests de `game-core` : un contexte de jeu bâti sur le contenu de test, et des Pokémon
 * aux IV parfaits pour des chiffres prévisibles. N'est importé que par les fichiers `*.test.ts`.
 */

/** Contexte de test à partir du seed, avec des modifications éventuelles. */
export function testContext(patch: (c: GameContentData) => void = () => {}) {
  const content = structuredClone(seedContent);
  patch(content);
  return createGameContext({ versionId: 1, ...content });
}

const PERFECT = {
  hp: 31,
  attack: 31,
  defense: 31,
  'special-attack': 31,
  'special-defense': 31,
  speed: 31,
};

/** Membre d'équipe de test : IV parfaits, nature neutre, sauf précision dans `extra`. */
export function member(
  id: string,
  speciesId: number,
  level: number,
  extra: Partial<TeamMember> = {},
): TeamMember {
  return {
    id,
    speciesId,
    level,
    xp: 0,
    ivs: PERFECT,
    nature: 'hardy',
    ability: 'none',
    isShiny: false,
    gender: 'male',
    happiness: 70,
    ...extra,
  };
}

/** Talents qui imposent une météo (Crachin ; Sécheresse et Alerte Neige en tête d'équipe). */
export function withWeatherAbilities(c: GameContentData) {
  c.abilities.push(
    {
      id: 'drizzle',
      description: '',
      effects: [{ type: 'setWeather', weather: 'rain', conditions: [] }],
    },
    {
      id: 'drought',
      description: '',
      effects: [{ type: 'setWeather', weather: 'sun', conditions: [{ type: 'leader' }] }],
    },
    {
      id: 'snow-warning',
      description: '',
      effects: [{ type: 'setWeather', weather: 'hail', conditions: [{ type: 'leader' }] }],
    },
  );
}
