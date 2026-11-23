/**
 * Mise en page d'un fichier de documentation : Markdown → HTML (marked, syntaxe GitHub), avec une
 * ancre sur chaque titre, le sommaire des titres de niveau 2, et des liens réécrits — vers un autre
 * fichier de la documentation, ils restent dans la page ; vers du code, ils ouvrent GitHub.
 * Le texte vient du dépôt (fichiers relus et commités) : le HTML est affiché tel quel.
 */
import { Marked } from 'marked';
import { resolveDocLink, slugify } from './docs';
import type { DocFile } from './docs';

/** Dépôt public : les liens vers du code ouvrent le fichier sur la branche de production. */
export const REPO_URL = 'https://github.com/PeronMaxime/poke-collect/blob/main';

/** Préfixe des ancres de titres, pour ne pas croiser les identifiants du reste de l'admin. */
export const HEADING_PREFIX = 'doc-';

/** Une entrée du sommaire : ancre (sans préfixe) et texte du titre. */
export interface TocEntry {
  id: string;
  text: string;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Attributs d'un lien écrit dans `from` : `data-doc` (+ `data-anchor`) vers un fichier connu,
 * l'ancre préfixée pour un lien interne, GitHub pour un autre chemin du dépôt, sinon l'adresse
 * telle quelle (nouvel onglet).
 */
function linkAttributes(from: string, href: string, known: ReadonlySet<string>): string {
  if (href.startsWith('#')) {
    return `href="#${HEADING_PREFIX}${escapeHtml(href.slice(1))}" data-anchor="${escapeHtml(href.slice(1))}"`;
  }
  const local = resolveDocLink(from, href);
  if (!local) return `href="${escapeHtml(href)}" target="_blank" rel="noreferrer"`;
  if (known.has(local.path)) {
    const query = `?f=${encodeURIComponent(local.path)}`;
    const anchor = local.anchor ? ` data-anchor="${escapeHtml(local.anchor)}"` : '';
    return `href="${escapeHtml(query)}" data-doc="${escapeHtml(local.path)}"${anchor}`;
  }
  return `href="${REPO_URL}/${escapeHtml(local.path)}" target="_blank" rel="noreferrer"`;
}

/** HTML d'un fichier et sommaire de ses titres de niveau 2. */
export function renderDoc(
  doc: DocFile,
  known: ReadonlySet<string>,
): { html: string; toc: TocEntry[] } {
  const toc: TocEntry[] = [];
  const used = new Map<string, number>();
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth, text }) {
        const base = slugify(text.replaceAll('`', '')) || 'section';
        const seen = used.get(base) ?? 0;
        used.set(base, seen + 1);
        const id = seen ? `${base}-${seen}` : base;
        const inner = this.parser.parseInline(tokens);
        if (depth === 2) toc.push({ id, text: text.replace(/[`*_]/g, '') });
        return `<h${depth} id="${HEADING_PREFIX}${id}">${inner}</h${depth}>\n`;
      },
      link({ href, title, tokens }) {
        const inner = this.parser.parseInline(tokens);
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
        return `<a ${linkAttributes(doc.path, href, known)}${titleAttr}>${inner}</a>`;
      },
    },
  });
  return { html: marked.parse(doc.markdown, { async: false }), toc };
}
