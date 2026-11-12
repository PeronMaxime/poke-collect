import { pokemonSprite, pokemonSpriteUrl } from '@poke/data';
import type { SpriteKind } from '@poke/data';

/**
 * Sprite d'un Pokémon.
 */

export function PokemonSprite({
  speciesId,
  formId = null,
  shiny = false,
  size = 96,
  kind = 'default',
  className = '',
  silhouette = false,
  alt = '',
  priority = false,
}: {
  speciesId: number;
  /** Forme de l'espèce (régionale, Méga, Gigamax…), qui a ses propres sprites. */
  formId?: number | null;
  shiny?: boolean;
  size?: number;
  kind?: SpriteKind;
  className?: string;
  silhouette?: boolean;
  alt?: string;
  /** Image visible dès l'ouverture (starter, révélations) : chargée tout de suite, en priorité. */
  priority?: boolean;
}) {
  const sprite = pokemonSprite(speciesId, formId);
  return (
    <img
      ref={markIfCached}
      data-sprite=""
      src={pokemonSpriteUrl(sprite, { shiny, kind })}
      onLoad={(e) => {
        const img = e.currentTarget;
        if (img.dataset.loaded === undefined) img.dataset.fade = '';
        img.dataset.loaded = '';
      }}
      onAnimationEnd={(e) => {
        if (e.animationName === 'sprite-in') delete e.currentTarget.dataset.fade;
      }}
      onError={(e) => {
        // Sprite animé ou artwork absent (formes, générations récentes) : repli sur le sprite fixe.
        const img = e.currentTarget;
        const fallback = pokemonSpriteUrl(sprite, { shiny });
        if (img.getAttribute('src') !== fallback) img.src = fallback;
        // Repli introuvable lui aussi : on arrête l'attente.
        else img.dataset.loaded = '';
      }}
      alt={alt}
      width={size}
      height={size}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      className={[
        kind === 'default' ? '[image-rendering:pixelated]' : '',
        silhouette ? 'brightness-0 opacity-30 dark:invert' : '',
        className,
      ].join(' ')}
    />
  );
}

/**
 * Image déjà en mémoire au montage (onglet revisité) : affichée telle quelle, sans fond d'attente
 * ni fondu. Les autres gardent le fond d'attente jusqu'au chargement, puis apparaissent en fondu
 * (styles `img[data-sprite]` de index.css).
 */
function markIfCached(img: HTMLImageElement | null) {
  if (img?.complete && img.naturalWidth > 0) img.dataset.loaded = '';
}
