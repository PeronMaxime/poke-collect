/**
 * Page « Documentation » : toute la documentation technique du dépôt au même endroit (guides de
 * docs/, plans, README des applications, des paquets et des écrans du jeu, CLAUDE.md). À gauche les
 * fichiers par rubrique, ou les résultats d'une recherche dans tous les fichiers ; à droite le
 * fichier ouvert, avec son sommaire et les occurrences cherchées surlignées.
 * Le fichier ouvert et la recherche sont dans l'adresse (`?f=…&q=…`) : un lien se partage.
 */
import { useEffect, useMemo, useRef } from 'react';
import type { MouseEvent, RefObject } from 'react';
import { useSearchParams } from 'react-router';
import { DOCS, findMatches, matchDoc } from '../lib/docs';
import type { DocFile } from '../lib/docs';
import { HEADING_PREFIX, REPO_URL, renderDoc } from '../lib/doc-render';

const KNOWN = new Set(DOCS.map((d) => d.path));
/** Fichiers par rubrique, dans l'ordre de `DOCS`. */
const GROUPED = new Map<string, DocFile[]>();
for (const d of DOCS) GROUPED.set(d.group, [...(GROUPED.get(d.group) ?? []), d]);
/** Nom du surlignage des occurrences (API CSS Custom Highlight, styles dans index.css). */
const HIGHLIGHT = 'doc-search';

/** Page de la documentation (voir l'en-tête du fichier). */
export function DocsPage() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const doc = DOCS.find((d) => d.path === params.get('f')) ?? DOCS[0];

  const update = (patch: { f?: string; q?: string }, replace = false) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace });
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Documentation technique</h1>
        <p className="text-sm text-slate-500">
          Les {DOCS.length} fichiers de documentation du dépôt, réunis ici : ceux de la version
          déployée de l’admin.
        </p>
      </header>
      <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <DocsSidebar
          current={doc?.path ?? null}
          query={query}
          onQuery={(q) => update({ q }, true)}
          onOpen={(f) => update({ f })}
        />
        {doc ? (
          <DocArticle doc={doc} query={query} onOpen={(f) => update({ f })} />
        ) : (
          <p className="card text-sm text-slate-500">Aucun fichier de documentation trouvé.</p>
        )}
      </div>
    </div>
  );
}

/** Colonne de gauche : champ de recherche, puis résultats ou fichiers par rubrique. */
function DocsSidebar({
  current,
  query,
  onQuery,
  onOpen,
}: {
  current: string | null;
  query: string;
  onQuery: (q: string) => void;
  onOpen: (path: string) => void;
}) {
  const results = useMemo(
    () =>
      query.trim()
        ? DOCS.flatMap((doc) => {
            const match = matchDoc(doc, query);
            return match ? [{ doc, match }] : [];
          }).sort((a, b) => b.match.count - a.match.count)
        : null,
    [query],
  );
  const item = (path: string) =>
    `block w-full rounded-lg px-3 py-1.5 text-left text-sm transition ${
      path === current
        ? 'bg-brand-500/10 font-medium text-brand-600 dark:text-brand-500'
        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
    }`;

  return (
    <aside className="card space-y-3 p-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
      <input
        type="search"
        className="input"
        placeholder="Chercher dans toute la doc…"
        aria-label="Chercher dans la documentation"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
      />
      {results ? (
        <div className="space-y-1">
          <p className="px-3 text-xs text-slate-500">
            {results.length === 0
              ? 'Aucun résultat.'
              : `${results.reduce((n, r) => n + r.match.count, 0)} occurrence(s) dans ${results.length} fichier(s)`}
          </p>
          {results.map(({ doc, match }) => (
            <button key={doc.path} className={item(doc.path)} onClick={() => onOpen(doc.path)}>
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate">{doc.title}</span>
                <span className="shrink-0 text-xs text-slate-400">{match.count}</span>
              </span>
              {match.excerpt && (
                <span className="mt-0.5 line-clamp-2 block text-xs font-normal text-slate-500">
                  {match.excerpt}
                </span>
              )}
            </button>
          ))}
        </div>
      ) : (
        [...GROUPED].map(([group, docs]) => (
          <div key={group}>
            <p className="px-3 pb-1 text-xs font-semibold tracking-wide text-slate-400 uppercase">
              {group}
            </p>
            {docs.map((d) => (
              <button
                key={d.path}
                className={item(d.path)}
                title={d.path}
                aria-current={d.path === current ? 'true' : undefined}
                onClick={() => onOpen(d.path)}
              >
                {d.title}
              </button>
            ))}
          </div>
        ))
      )}
    </aside>
  );
}

/** Le fichier ouvert : chemin, lien GitHub, sommaire et texte mis en page. */
function DocArticle({
  doc,
  query,
  onOpen,
}: {
  doc: DocFile;
  query: string;
  onOpen: (path: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { html, toc } = useMemo(() => renderDoc(doc, KNOWN), [doc]);
  useSearchHighlight(ref, html, query);

  // Nouveau fichier : retour en haut, ou sur la première occurrence cherchée.
  useEffect(() => {
    const first = ref.current?.querySelector('[data-first-match]');
    if (first) first.scrollIntoView({ block: 'center' });
    else ref.current?.closest('article')?.scrollIntoView?.({ block: 'start' });
    // Seulement au changement de fichier : la recherche tapée ne fait pas défiler.
  }, [doc.path]);

  const scrollTo = (anchor: string) =>
    document.getElementById(HEADING_PREFIX + anchor)?.scrollIntoView({ block: 'start' });

  // Liens vers un autre fichier ou une ancre : on reste dans la page.
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const link = (e.target as HTMLElement).closest('a');
    if (!link || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const { doc: target, anchor } = link.dataset;
    if (target) {
      e.preventDefault();
      onOpen(target);
      if (anchor) requestAnimationFrame(() => scrollTo(anchor));
    } else if (anchor) {
      e.preventDefault();
      scrollTo(anchor);
    }
  };

  return (
    <article className="card min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <code>{doc.path}</code>
        <a
          href={`${REPO_URL}/${doc.path}`}
          target="_blank"
          rel="noreferrer"
          className="hover:underline"
        >
          Voir sur GitHub ↗
        </a>
      </div>
      {toc.length > 2 && (
        <details className="rounded-lg bg-slate-50 px-4 py-2 text-sm dark:bg-slate-800/50">
          <summary className="cursor-pointer font-medium">Sommaire</summary>
          <ol className="mt-2 list-decimal space-y-0.5 pl-5">
            {toc.map((t) => (
              <li key={t.id}>
                <button
                  className="text-left text-brand-600 hover:underline dark:text-brand-500"
                  onClick={() => scrollTo(t.id)}
                >
                  {t.text}
                </button>
              </li>
            ))}
          </ol>
        </details>
      )}
      <div
        ref={ref}
        className="doc-prose"
        onClick={onClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </article>
  );
}

/**
 * Surligne les occurrences de `query` dans le texte affiché (API CSS Custom Highlight, sans
 * toucher au HTML) et marque la première (`data-first-match` sur son élément) pour y défiler.
 * Sans cette API (navigateurs anciens, tests), rien n'est surligné.
 */
function useSearchHighlight(ref: RefObject<HTMLDivElement | null>, html: string, query: string) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    root.querySelector('[data-first-match]')?.removeAttribute('data-first-match');
    const registry = typeof CSS !== 'undefined' ? CSS.highlights : undefined;
    const ranges: Range[] = [];
    if (query.trim()) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        for (const [start, end] of findMatches(node.textContent ?? '', query)) {
          const range = document.createRange();
          range.setStart(node, start);
          range.setEnd(node, end);
          ranges.push(range);
        }
      }
    }
    ranges[0]?.startContainer.parentElement?.setAttribute('data-first-match', '');
    if (!registry || typeof Highlight === 'undefined') return;
    if (ranges.length) registry.set(HIGHLIGHT, new Highlight(...ranges));
    else registry.delete(HIGHLIGHT);
    return () => void registry.delete(HIGHLIGHT);
  }, [ref, html, query]);
}
