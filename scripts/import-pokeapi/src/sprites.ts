/**
 * Télécharge les images du jeu dans apps/api/sprites (servies par l'API sous /api/sprites/…), pour
 * ne plus dépendre de sites tiers à l'exécution :
 *  - items/, trainers/, pokemon/ et pokemon/shiny/ : petits sprites PNG, versionnés dans Git ;
 *  - artwork/ et artwork/shiny/ : illustrations officielles réduites en WebP 256 px (≈ 40 Mo),
 *    ignorées par Git : à télécharger après un clone et au déploiement.
 *
 * Usage : pnpm sprites:download [--force] (sans --force, les fichiers déjà présents sont gardés)
 */
import { access, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import sharp from 'sharp';
import { forms, items, species } from '@poke/data';
import { seedContent } from '@poke/content';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const OUT_DIR = join(ROOT, 'apps/api/sprites');
const FORCE = process.argv.includes('--force');

const POKEAPI_SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites';
const POKEAPI_ITEMS = `${POKEAPI_SPRITES}/items`;
const POKESPRITE_ITEMS = 'https://raw.githubusercontent.com/msikma/pokesprite/master/items';
const SEREBII_ITEMS = 'https://www.serebii.net/itemdex/sprites';
const SHOWDOWN_TRAINERS = 'https://play.pokemonshowdown.com/sprites/trainers';

/** Statistique augmentée par chaque Aromate (Pokesprite n'a qu'une icône par statistique). */
const MINT_STATS: Record<string, string> = {
  lonely: 'attack',
  adamant: 'attack',
  naughty: 'attack',
  brave: 'attack',
  bold: 'defense',
  impish: 'defense',
  lax: 'defense',
  relaxed: 'defense',
  modest: 'special-attack',
  mild: 'special-attack',
  rash: 'special-attack',
  quiet: 'special-attack',
  calm: 'special-defense',
  gentle: 'special-defense',
  careful: 'special-defense',
  sassy: 'special-defense',
  timid: 'speed',
  hasty: 'speed',
  jolly: 'speed',
  naive: 'speed',
  serious: 'neutral',
};

/** Sources essayées dans l'ordre : PokeAPI, puis Pokesprite et Serebii (8e et 9e générations). */
function itemSources(id: string): string[] {
  const mint = id.endsWith('-mint') ? MINT_STATS[id.slice(0, -'-mint'.length)] : undefined;
  const compact = id.replaceAll('-', '');
  return [
    `${POKEAPI_ITEMS}/${id}.png`,
    ...(mint ? [`${POKESPRITE_ITEMS}/mint/${mint}.png`] : []),
    `${POKESPRITE_ITEMS}/evo-item/${id}.png`,
    `${POKESPRITE_ITEMS}/other-item/${id}.png`,
    `${SEREBII_ITEMS}/${compact}.png`,
    `${SEREBII_ITEMS}/sv/${compact}.png`,
  ];
}

/** Objets importés de PokéAPI, plus ceux du seed sans icône personnalisée (ex. Charme Chroma). */
function itemIds(): string[] {
  const seedIds = seedContent.items.filter((i) => !i.icon).map((i) => i.id);
  return [...new Set([...items.map((i) => i.name), ...seedIds])].sort();
}

/** Nom de fichier des sprites de dresseurs du seed (`/api/sprites/trainers/brock.png` → `brock`). */
function trainerNames(): string[] {
  const names = seedContent.trainers.flatMap((t) => {
    const match = t.sprite?.match(/^\/api\/sprites\/trainers\/([a-z0-9-]+)\.png$/);
    return match ? [match[1]!] : [];
  });
  return [...new Set(names)].sort();
}

/** Noms de fichier des sprites de Pokémon : identifiant de l'espèce, ou sprite d'une forme. */
function pokemonNames(): string[] {
  const formSprites = forms.flatMap((f) => (f.sprite ? [f.sprite] : []));
  return [...new Set([...species.map((s) => String(s.id)), ...formSprites])];
}

/** Taille des illustrations : le jeu les affiche au plus en 140 px (×2 pour les écrans denses). */
const ARTWORK_SIZE = 256;

const toArtwork = (data: Buffer) =>
  sharp(data)
    .resize(ARTWORK_SIZE, ARTWORK_SIZE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82, alphaQuality: 90 })
    .toBuffer();

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

async function download(
  path: string,
  sources: string[],
  transform?: (data: Buffer) => Promise<Buffer>,
): Promise<boolean> {
  for (const url of sources) {
    const res = await fetch(url).catch((err: unknown) => {
      console.warn(`  ${url} : ${(err as Error).message}`);
      return null;
    });
    if (!res?.ok || !res.headers.get('content-type')?.startsWith('image/')) continue;
    const data = Buffer.from(await res.arrayBuffer());
    await writeFile(path, transform ? await transform(data) : data);
    return true;
  }
  return false;
}

interface Batch {
  /** Dossier sous apps/api/sprites. */
  dir: string;
  ext: 'png' | 'webp';
  entries: [name: string, sources: string[]][];
  transform?: (data: Buffer) => Promise<Buffer>;
  /** Image facultative : le jeu a un repli (une illustration absente → petit sprite). */
  optional?: boolean;
}

/** Téléchargements en parallèle (raisonnable pour GitHub). */
const CONCURRENCY = 12;

async function downloadAll({ dir, ext, entries, transform, optional = false }: Batch) {
  await mkdir(join(OUT_DIR, dir), { recursive: true });
  const missing: string[] = [];
  let written = 0;
  const queue = [...entries];
  const worker = async () => {
    for (let entry = queue.shift(); entry; entry = queue.shift()) {
      const [name, sources] = entry;
      const path = join(OUT_DIR, dir, `${name}.${ext}`);
      if (!FORCE && (await exists(path))) continue;
      if (await download(path, sources, transform)) written++;
      else missing.push(name);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`${dir} : ${written} téléchargé(s), ${entries.length} au total`);
  if (missing.length) {
    const label = optional ? 'absents (repli sur le petit sprite)' : 'introuvables';
    console.warn(`  ${label} : ${missing.sort().join(', ')}`);
  }
  return optional ? 0 : missing.length;
}

const pokemon = pokemonNames();
const batches: Batch[] = [
  { dir: 'items', ext: 'png', entries: itemIds().map((id) => [id, itemSources(id)]) },
  {
    dir: 'trainers',
    ext: 'png',
    entries: trainerNames().map((name) => [name, [`${SHOWDOWN_TRAINERS}/${name}.png`]]),
  },
  ...[false, true].flatMap((shiny): Batch[] => {
    const sub = shiny ? '/shiny' : '';
    return [
      {
        dir: `pokemon${sub}`,
        ext: 'png',
        entries: pokemon.map((name) => [name, [`${POKEAPI_SPRITES}/pokemon${sub}/${name}.png`]]),
      },
      {
        dir: `artwork${sub}`,
        ext: 'webp',
        entries: pokemon.map((name) => [
          name,
          [`${POKEAPI_SPRITES}/pokemon/other/official-artwork${sub}/${name}.png`],
        ]),
        transform: toArtwork,
        optional: true,
      },
    ];
  }),
];

let failures = 0;
for (const batch of batches) failures += await downloadAll(batch);
if (failures) process.exitCode = 1;
