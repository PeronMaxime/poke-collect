/**
 * URLs des images du jeu, téléchargées par `pnpm sprites:download` et servies par l'API.
 * À terme, remplacer SPRITE_BASE_URL par un CDN (Cloudflare R2 ou celui du front).
 */
export const SPRITE_BASE_URL = '/api/sprites';

/** `default` : petit sprite PNG ; `artwork` : illustration officielle (WebP 256 px). */
export type SpriteKind = 'default' | 'artwork';

/**
 * @param sprite Nom de fichier du sprite : identifiant de l'espèce, ou sprite d'une forme
 *   (voir `pokemonSprite`).
 */
export function pokemonSpriteUrl(
  sprite: number | string,
  { shiny = false, kind = 'default' }: { shiny?: boolean; kind?: SpriteKind } = {},
): string {
  const shinyPath = shiny ? 'shiny/' : '';
  return kind === 'artwork'
    ? `${SPRITE_BASE_URL}/artwork/${shinyPath}${sprite}.webp`
    : `${SPRITE_BASE_URL}/pokemon/${shinyPath}${sprite}.png`;
}

export function itemSpriteUrl(itemName: string): string {
  return `${SPRITE_BASE_URL}/items/${itemName}.png`;
}
