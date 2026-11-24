/**
 * Documentation technique du dépôt, réunie pour la page « Documentation » : tous les fichiers
 * Markdown (docs/, plans, README des applications, des paquets et des écrans du jeu, CLAUDE.md),
 * embarqués au build par Vite, donc toujours ceux de la version déployée. Un nouveau fichier `.md`
 * dans ces dossiers apparaît tout seul ; `GROUPS` décide seulement de sa rubrique.
 */

/** Ce fichier, depuis la racine du dépôt : les clés de `import.meta.glob` lui sont relatives. */
const SELF = 'apps/admin/src/lib/docs.ts';

const RAW = import.meta.glob<string>(
  [
    '../../../../*.md',
    '../../../../docs/**/*.md',
    '../../../../{apps,packages,scripts}/**/*.md',
    '!**/node_modules/**',
    '!**/dist/**',
  ],
  { query: '?raw', import: 'default', eager: true },
);

/** Un fichier de documentation : chemin depuis la racine du dépôt, titre et texte Markdown. */
export interface DocFile {
  path: string;
  title: string;
  group: string;
  markdown: string;
}

/** Rubriques, dans l'ordre du menu ; un fichier va dans la première dont un motif le reconnaît. */
const GROUPS: { label: string; paths: (string | RegExp)[] }[] = [
  { label: 'Pour commencer', paths: ['README.md', 'CLAUDE.md', 'docs/DEMARRAGE.md'] },
  {
    label: 'Comprendre le code',
    paths: ['docs/ARCHITECTURE.md', 'docs/GLOSSAIRE.md', 'docs/RECETTES.md', 'docs/DECISIONS.md'],
  },
  {
    label: 'Serveur et production',
    paths: [
      'docs/INSTALLATION-SERVEUR.md',
      'docs/MISE-EN-PRODUCTION.md',
      'docs/MISE-A-JOUR.md',
      'docs/SECURITE.md',
      'docs/SURCHARGE.md',
      /^scripts\//,
    ],
  },
  { label: 'Applications', paths: [/^apps\/[^/]+\/README\.md$/] },
  { label: 'Paquets', paths: [/^packages\//] },
  { label: 'Écrans du jeu', paths: [/^apps\/web\/src\/features\//] },
  { label: 'Plans', paths: [/^docs\/plans\//] },
];
const OTHER = 'Autres';

/** Rang d'un fichier : sa rubrique, puis sa place dans la liste de la rubrique (motifs : à la fin). */
function rank(path: string): { group: string; order: number } {
  for (const { label, paths } of GROUPS) {
    const i = paths.findIndex((p) => (typeof p === 'string' ? p === path : p.test(path)));
    if (i >= 0) return { group: label, order: typeof paths[i] === 'string' ? i : paths.length };
  }
  return { group: OTHER, order: 0 };
}

/** Titre d'un fichier : son premier titre `# …` sans les accents graves, sinon son nom. */
export function docTitle(path: string, markdown: string): string {
  const heading = /^#\s+(.+)$/m.exec(markdown)?.[1];
  return heading ? heading.replaceAll('`', '').trim() : (path.split('/').pop() ?? path);
}

/** Classe les fichiers : rubriques dans l'ordre de `GROUPS`, puis ordre voulu, puis titre. */
export function buildDocs(raw: Record<string, string>): DocFile[] {
  const groupOrder = [...GROUPS.map((g) => g.label), OTHER];
  return Object.entries(raw)
    .map(([key, markdown]) => {
      const path = resolveDocLink(SELF, key)?.path ?? key;
      return { path, markdown, title: docTitle(path, markdown), ...rank(path) };
    })
    .sort(
      (a, b) =>
        groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group) ||
        a.order - b.order ||
        a.title.localeCompare(b.title, 'fr'),
    )
    .map(({ path, title, group, markdown }) => ({ path, title, group, markdown }));
}

/** Tous les fichiers de documentation du dépôt, classés. */
export const DOCS: DocFile[] = buildDocs(RAW);

/**
 * Chemin depuis la racine d'un lien relatif écrit dans `from` (`../RECETTES.md#x` → chemin et
 * ancre) ; null pour un lien externe ou une ancre seule.
 */
export function resolveDocLink(
  from: string,
  href: string,
): { path: string; anchor: string | null } | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#') || href.startsWith('//')) {
    return null;
  }
  const [target = '', anchor] = href.split('#');
  const parts = href.startsWith('/') ? [] : from.split('/').slice(0, -1);
  for (const segment of target.split('/')) {
    if (segment === '..') parts.pop();
    else if (segment && segment !== '.') parts.push(segment);
  }
  return { path: parts.join('/'), anchor: anchor || null };
}

/** Identifiant d'ancre d'un titre, comme sur GitHub : minuscules, sans ponctuation, tirets. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s/g, '-');
}

/** Un caractère sans accent ni majuscule (« É » → « e »). */
function foldChar(c: string): string {
  return c.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Texte replié (sans accents ni majuscules), avec la position d'origine de chaque caractère. */
interface Folded {
  text: string;
  positions: number[];
}

function fold(text: string): Folded {
  let out = '';
  const positions: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const f = foldChar(text[i]!);
    out += f;
    for (let k = 0; k < f.length; k++) positions.push(i);
  }
  return { text: out, positions };
}

/** Texte comparable pour la recherche : minuscules, sans accents. */
function searchable(text: string): string {
  return fold(text).text;
}

/**
 * Occurrences de `query` dans `text`, sans tenir compte des accents ni de la casse : paires
 * `[début, fin[` dans le texte d'origine, sans chevauchement.
 */
export function findMatches(text: string, query: string, folded = fold(text)): [number, number][] {
  const q = searchable(query.trim());
  if (!q) return [];
  const found: [number, number][] = [];
  for (let i = folded.text.indexOf(q); i >= 0; i = folded.text.indexOf(q, i + q.length)) {
    found.push([folded.positions[i]!, folded.positions[i + q.length - 1]! + 1]);
  }
  return found;
}

/** Textes repliés des fichiers, calculés à la première recherche. */
const foldedCache = new Map<string, Folded>();

/** Résultat de recherche dans un fichier : nombre d'occurrences et extrait autour de la première. */
export interface DocMatch {
  count: number;
  excerpt: string;
}

/**
 * Cherche `query` dans le titre et le texte d'un fichier ; null s'il n'y figure pas. L'extrait
 * garde environ 60 caractères de part et d'autre de la première occurrence, sans la syntaxe
 * Markdown (vide si seul le titre correspond).
 */
export function matchDoc(doc: DocFile, query: string): DocMatch | null {
  let folded = foldedCache.get(doc.path);
  if (!folded) foldedCache.set(doc.path, (folded = fold(doc.markdown)));
  const matches = findMatches(doc.markdown, query, folded);
  if (matches.length === 0) {
    const q = searchable(query.trim());
    return q && searchable(doc.title).includes(q) ? { count: 0, excerpt: '' } : null;
  }
  const [start, end] = matches[0]!;
  const from = Math.max(0, start - 60);
  const to = Math.min(doc.markdown.length, end + 60);
  const excerpt = doc.markdown
    .slice(from, to)
    .replace(/[#*`>|_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    count: matches.length,
    excerpt: `${from > 0 ? '… ' : ''}${excerpt}${to < doc.markdown.length ? ' …' : ''}`,
  };
}
