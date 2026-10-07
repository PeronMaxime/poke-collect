/**
 * URLs des sprites (dépôt GitHub PokeAPI/sprites).
 * À terme, remplacer SPRITE_BASE_URL par un CDN (Cloudflare R2 ou celui du front).
 */
export const SPRITE_BASE_URL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites';

export type SpriteKind = 'default' | 'artwork' | 'animated';

export function pokemonSpriteUrl(
  speciesId: number,
  { shiny = false, kind = 'default' }: { shiny?: boolean; kind?: SpriteKind } = {},
): string {
  const shinyPath = shiny ? 'shiny/' : '';
  switch (kind) {
    case 'artwork':
      return `${SPRITE_BASE_URL}/pokemon/other/official-artwork/${shinyPath}${speciesId}.png`;
    case 'animated':
      return `${SPRITE_BASE_URL}/pokemon/versions/generation-v/black-white/animated/${shinyPath}${speciesId}.gif`;
    default:
      return `${SPRITE_BASE_URL}/pokemon/${shinyPath}${speciesId}.png`;
  }
}

export function itemSpriteUrl(itemName: string): string {
  return `${SPRITE_BASE_URL}/items/${itemName}.png`;
}
