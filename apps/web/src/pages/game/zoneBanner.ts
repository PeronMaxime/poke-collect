import type { CSSProperties } from 'react';
import type { Zone } from '@poke/content';
import { pokemonTypes } from '@poke/data';
import type { GameContext } from '@poke/game-core';
import { TYPE_COLORS } from '../../lib/labels';

/** Damier discret des bandeaux de zone, façon tuiles d'herbe. */
export const CHECKER: CSSProperties = {
  backgroundImage:
    'linear-gradient(45deg, rgb(0 0 0 / 0.06) 25%, transparent 25%, transparent 75%, rgb(0 0 0 / 0.06) 75%), linear-gradient(45deg, rgb(0 0 0 / 0.06) 25%, transparent 25%, transparent 75%, rgb(0 0 0 / 0.06) 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0, 8px 8px',
};

/** Fond teinté d'un bandeau de zone (sans image), avec `--tint` = la couleur du type. */
export const TINTED_BANNER =
  'bg-[color-mix(in_srgb,var(--tint)_55%,#fbfaf2)] dark:bg-[color-mix(in_srgb,var(--tint)_40%,#111a24)]';

/** Étiquette posée sur un bandeau de zone (nom, PE requise…). */
export const BANNER_LABEL =
  'rounded border-2 border-ink bg-win px-2 py-1 font-pixel text-[10px] leading-normal';

/** Type principal le plus fréquent parmi les Pokémon d'une zone (« normal » sans Pokémon). */
function dominantType(species: { speciesId: number; formId?: number | null }[]): string {
  const counts = new Map<string, number>();
  for (const { speciesId, formId } of species) {
    const type = pokemonTypes(speciesId, formId)[0];
    if (type) counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  let best = 'normal';
  let max = 0;
  for (const [type, n] of counts) {
    if (n > max) [best, max] = [type, n];
  }
  return best;
}

/** Espèces et formes rencontrées dans une zone, sans doublon (espèces activées seulement). */
export function zoneSpecies(ctx: GameContext, zone: Zone) {
  return [
    ...new Map(
      zone.encounters
        .filter((e) => ctx.species(e.speciesId)?.enabled)
        .map((e) => [`${e.speciesId}:${e.formId ?? ''}`, e] as const),
    ).values(),
  ];
}

/** Couleur du bandeau d'une zone : celle du type le plus présent parmi ses Pokémon. */
export const zoneTint = (species: { speciesId: number; formId?: number | null }[]) =>
  TYPE_COLORS[dominantType(species)] ?? TYPE_COLORS.normal;
