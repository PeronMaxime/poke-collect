/**
 * Fond de page « ombres de Pokémon » (test) : les Pokémon de la vitrine de la Fiche Dresseur, complétés
 * par des starters tirés au hasard, sont dessinés en silhouettes blanches dans une tuile qui sert de
 * masque au calque body::before (couleur --grass-line, voir index.css). Les chromatiques reçoivent en
 * plus un voile doré (body::after, --shiny-shadow). Les couleurs suivent donc le thème sans régénérer
 * les tuiles.
 */
import { useEffect } from 'react';
import { pokemonSprite, pokemonSpriteUrl } from '@poke/data';
import { FEATURED_POKEMON_MAX } from '@poke/shared';
import { useTrainerCard } from './queries';

/** Premières formes des starters de toutes les générations. */
const STARTERS = [
  1, 4, 7, 152, 155, 158, 252, 255, 258, 387, 390, 393, 495, 498, 501, 650, 653, 656, 722, 725, 728,
  810, 813, 816, 906, 909, 912,
];

/** Starters de complément, tirés une fois par chargement de page (pas à chaque rendu). */
const randomStarters = [...STARTERS]
  .map((id) => ({ id, key: Math.random() }))
  .sort((a, b) => a.key - b.key)
  .slice(0, FEATURED_POKEMON_MAX)
  .map((s) => s.id);

/**
 * Grille fixe en quinconce : cases de 128 px, une rangée sur deux décalée d'une demi-case. La tuile
 * (8 × 8 cases, nombre pair de rangées pour le raccord) se répète sur toute la page.
 */
const CELL = 128;
const GRID = 8;
const TILE = CELL * GRID;
/** Taille d'un sprite (96 px, cadre transparent compris), centré dans sa case. */
const SPRITE = 96;

/** Cases voisines (6, quinconce) d'une case, bords raccordés. */
function neighbours(row: number, col: number): [number, number][] {
  const wrap = (n: number) => (n + GRID) % GRID;
  // Rangée paire : les voisines du dessus et du dessous sont en col - 1 et col ; impaire, col et col + 1.
  const shift = row % 2 === 0 ? -1 : 0;
  return [
    [row, wrap(col - 1)],
    [row, wrap(col + 1)],
    ...[-1, 1].flatMap((dr): [number, number][] => [
      [wrap(row + dr), wrap(col + shift)],
      [wrap(row + dr), wrap(col + shift + 1)],
    ]),
  ];
}

/**
 * Suite des Pokémon (0 à 5 dans la liste) case par case, tirée au hasard une fois par chargement de
 * page : chaque case prend, parmi les Pokémon absents des cases voisines, l'un des moins utilisés.
 * Changer la vitrine ne remplace que les silhouettes, pas la suite.
 */
const slots: number[][] = (() => {
  const grid: (number | null)[][] = Array.from({ length: GRID }, () =>
    Array<number | null>(GRID).fill(null),
  );
  const used = Array<number>(FEATURED_POKEMON_MAX).fill(0);
  const all = used.map((_, i) => i);
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const near = new Set(neighbours(row, col).map(([r, c]) => grid[r]![c]));
      const free = all.filter((i) => !near.has(i));
      const choices = free.length > 0 ? free : all;
      const least = Math.min(...choices.map((i) => used[i]!));
      const best = choices.filter((i) => used[i] === least);
      const slot = best[Math.floor(Math.random() * best.length)]!;
      used[slot]!++;
      grid[row]![col] = slot;
    }
  }
  return grid as number[][];
})();

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

interface ShadowEntry {
  sprite: number | string;
  shiny: boolean;
}

/**
 * Tuiles de silhouettes. La première a toutes les ombres ; la seconde, aux mêmes places, seulement
 * celles des chromatiques (voile doré).
 */
async function renderTiles(entries: ShadowEntry[]): Promise<[Blob | null, Blob | null]> {
  const all = document.createElement('canvas');
  const shiny = document.createElement('canvas');
  for (const canvas of [all, shiny]) {
    canvas.width = TILE;
    canvas.height = TILE;
  }
  const ctxAll = all.getContext('2d');
  const ctxShiny = shiny.getContext('2d');
  if (!ctxAll || !ctxShiny) return [null, null];
  ctxAll.imageSmoothingEnabled = false;
  ctxShiny.imageSmoothingEnabled = false;

  const images = await Promise.all(entries.map((e) => loadImage(pokemonSpriteUrl(e.sprite))));
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const k = slots[row]![col]! % entries.length;
      const img = images[k];
      if (!img) continue;
      const x = col * CELL + (row % 2) * (CELL / 2) + (CELL - SPRITE) / 2;
      const y = row * CELL + (CELL - SPRITE) / 2;
      const targets = entries[k]!.shiny ? [ctxAll, ctxShiny] : [ctxAll];
      for (const ctx of targets) {
        // Copie décalée pour la dernière case des rangées décalées, qui déborde à droite.
        for (const dx of [0, -TILE]) ctx.drawImage(img, x + dx, y, SPRITE, SPRITE);
      }
    }
  }
  // Silhouettes : tout pixel non transparent devient blanc opaque.
  for (const ctx of [ctxAll, ctxShiny]) {
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, TILE, TILE);
  }
  const toBlob = (canvas: HTMLCanvasElement) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  const hasShiny = entries.some((e) => e.shiny);
  return Promise.all([toBlob(all), hasShiny ? toBlob(shiny) : null]);
}

const currentUrls: string[] = [];

/** Signature d'une liste d'ombres (chromatique préfixé d'une étoile), clé de l'effet. */
const encode = (entries: ShadowEntry[]) =>
  entries.map((e) => `${e.shiny ? '*' : ''}${e.sprite}`).join(',');
const decode = (signature: string): ShadowEntry[] =>
  signature.split(',').map((s) => ({ sprite: s.replace('*', ''), shiny: s.startsWith('*') }));

/**
 * Pose le fond d'ombres. `withShowcase` : le joueur a une partie en cours, sa vitrine est lue ;
 * sinon (connexion, choix du starter) le fond n'a que des starters.
 */
export function usePokemonShadows(withShowcase: boolean) {
  const card = useTrainerCard(withShowcase);
  const featured = withShowcase ? (card.data?.featured ?? []) : [];
  const entries: ShadowEntry[] = [
    ...featured
      .slice(0, FEATURED_POKEMON_MAX)
      .map((p) => ({ sprite: pokemonSprite(p.speciesId, p.formId), shiny: p.isShiny })),
    ...randomStarters.map((sprite) => ({ sprite, shiny: false })),
  ].slice(0, FEATURED_POKEMON_MAX);
  // Vitrine pas encore reçue : on attend, pour ne pas afficher d'abord des starters à la place.
  const signature = withShowcase && card.isPending ? null : encode(entries);

  useEffect(() => {
    if (signature === null) return;
    let cancelled = false;
    void renderTiles(decode(signature)).then(([all, shiny]) => {
      if (cancelled || !all) return;
      const root = document.documentElement;
      for (const url of currentUrls.splice(0)) URL.revokeObjectURL(url);
      const allUrl = URL.createObjectURL(all);
      currentUrls.push(allUrl);
      root.style.setProperty('--pokemon-shadows', `url(${allUrl})`);
      if (shiny) {
        const shinyUrl = URL.createObjectURL(shiny);
        currentUrls.push(shinyUrl);
        root.style.setProperty('--pokemon-shiny-shadows', `url(${shinyUrl})`);
      } else {
        root.style.removeProperty('--pokemon-shiny-shadows');
      }
      root.style.setProperty('--pokemon-shadows-size', `${TILE}px ${TILE}px`);
    });
    return () => {
      cancelled = true;
    };
  }, [signature]);
}
