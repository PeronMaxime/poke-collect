import type { Gender } from '@poke/game-core';

/**
 * Symbole du sexe d'un Pokémon.
 */

/** Symbole ♂ / ♀ coloré ; rien pour un Pokémon asexué. */
export function GenderSymbol({ gender }: { gender: Gender }) {
  if (gender === 'genderless') return null;
  const male = gender === 'male';
  return (
    <span
      className={male ? 'text-sky-500' : 'text-pink-500'}
      title={male ? 'Mâle' : 'Femelle'}
      aria-label={male ? 'Mâle' : 'Femelle'}
    >
      {male ? '♂' : '♀'}
    </span>
  );
}
