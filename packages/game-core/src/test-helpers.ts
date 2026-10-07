import { seedContent } from '@poke/content';
import type { GameContentData } from '@poke/content';
import { createGameContext } from './context';
import type { TeamMember } from './expedition';

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
