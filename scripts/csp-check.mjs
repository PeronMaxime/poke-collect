// Politique de contenu (CSP) de deploy/Caddyfile face aux applications construites : chaque script
// en ligne d'un `index.html` doit avoir son empreinte (`'sha256-…'`) dans `script-src`, sinon le
// navigateur le bloque (le script de thème du jeu, par exemple, après une retouche ou un
// reformatage d'apps/web/index.html).
//
//   node scripts/csp-check.mjs apps/web/dist apps/admin/dist
//
// La CI l'appelle après `pnpm build`. En cas d'échec : recopier dans le Caddyfile l'empreinte
// affichée.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dists = process.argv.slice(2);
if (dists.length === 0) {
  console.error('Usage : node scripts/csp-check.mjs <dossier dist>…');
  process.exit(2);
}

const caddyfile = readFileSync(new URL('../deploy/Caddyfile', import.meta.url), 'utf8');
const policy = caddyfile.match(/Content-Security-Policy(?:-Report-Only)?\s+"([^"]+)"/)?.[1];
const scriptSrc = policy?.split(';').find((d) => d.trim().startsWith('script-src'));
if (!scriptSrc) {
  console.error('Caddyfile : aucune directive script-src trouvée.');
  process.exit(1);
}
const allowed = new Set(scriptSrc.match(/'sha256-[A-Za-z0-9+/=]+'/g) ?? []);

let missing = 0;
for (const dist of dists) {
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  for (const [, body] of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    const hash = `'sha256-${createHash('sha256').update(body).digest('base64')}'`;
    if (allowed.has(hash)) continue;
    console.error(`${dist}/index.html : script en ligne absent de script-src, ajouter ${hash}`);
    missing++;
  }
}
if (missing > 0) process.exit(1);
console.log(`CSP : scripts en ligne autorisés (${dists.join(', ')}).`);
