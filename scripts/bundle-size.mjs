// Poids du JavaScript chargé à l'ouverture d'une application construite (compressé en gzip) :
// le fichier d'entrée d'`index.html` et ceux qu'il précharge (`modulepreload`). Les pages chargées
// à la demande ne comptent pas.
//
//   node scripts/bundle-size.mjs apps/web/dist            affiche le détail
//   node scripts/bundle-size.mjs apps/web/dist 400        échoue au-delà de 400 Ko
//
// La CI l'appelle après `pnpm build` : le plafond ne peut que baisser.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const [dist, maxArg] = process.argv.slice(2);
if (!dist) {
  console.error('Usage : node scripts/bundle-size.mjs <dossier dist> [plafond en Ko]');
  process.exit(2);
}

const html = readFileSync(join(dist, 'index.html'), 'utf8');
const files = new Set();
for (const tag of html.match(/<(?:script|link)\b[^>]*>/g) ?? []) {
  const isEntry = /^<script\b/.test(tag) && /type="module"/.test(tag);
  const isPreload = /^<link\b/.test(tag) && /rel="modulepreload"/.test(tag);
  const url = /(?:src|href)="([^"]+\.js)"/.exec(tag)?.[1];
  if (url && (isEntry || isPreload)) files.add(url.replace(/^\//, ''));
}
if (files.size === 0) {
  console.error(`Aucun fichier JavaScript trouvé dans ${join(dist, 'index.html')}`);
  process.exit(2);
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} Ko`;
let total = 0;
for (const file of files) {
  const size = gzipSync(readFileSync(join(dist, file))).length;
  total += size;
  console.log(`${kb(size).padStart(10)}  ${file}`);
}
console.log(`${kb(total).padStart(10)}  à l'ouverture (gzip)`);

const max = Number(maxArg);
if (maxArg !== undefined && !(total <= max * 1024)) {
  console.error(`Plafond dépassé : ${kb(total)} pour ${max} Ko autorisés.`);
  process.exit(1);
}
