import { describe, expect, it } from 'vitest';
import { DOCS, buildDocs, docTitle, findMatches, matchDoc, resolveDocLink } from '../src/lib/docs';
import { REPO_URL, renderDoc } from '../src/lib/doc-render';

/** Documentation de l'admin : fichiers réunis, liens entre eux, recherche et mise en page. */
describe('documentation technique', () => {
  it('réunit les fichiers du dépôt, rangés par rubrique, sans node_modules', () => {
    const paths = DOCS.map((d) => d.path);
    expect(paths[0]).toBe('README.md');
    expect(paths).toContain('docs/ARCHITECTURE.md');
    expect(paths).toContain('docs/plans/PLAN.md');
    expect(paths).toContain('apps/web/src/features/quests/README.md');
    expect(paths).toContain('packages/game-core/README.md');
    expect(paths.some((p) => p.includes('node_modules'))).toBe(false);
    expect(DOCS.find((d) => d.path === 'docs/RECETTES.md')?.group).toBe('Comprendre le code');
  });

  it('range un fichier inconnu dans « Autres », titre tiré du premier titre', () => {
    const [doc] = buildDocs({ '../../../../tools/NOTES.md': 'Texte\n# Les `notes`\n' });
    expect(doc).toMatchObject({ path: 'tools/NOTES.md', title: 'Les notes', group: 'Autres' });
    // Vite raccourcit les chemins proches : `../../../web/` depuis `apps/admin/src/lib`.
    expect(buildDocs({ '../../../web/README.md': '# Jeu' })[0]?.path).toBe('apps/web/README.md');
    expect(docTitle('a/SANS-TITRE.md', 'rien')).toBe('SANS-TITRE.md');
  });

  it('résout les liens relatifs, et laisse les liens externes et les ancres', () => {
    expect(resolveDocLink('docs/ARCHITECTURE.md', 'RECETTES.md')).toEqual({
      path: 'docs/RECETTES.md',
      anchor: null,
    });
    expect(resolveDocLink('apps/api/README.md', '../../docs/RECETTES.md#migrations')).toEqual({
      path: 'docs/RECETTES.md',
      anchor: 'migrations',
    });
    expect(resolveDocLink('README.md', './docs/DEMARRAGE.md')?.path).toBe('docs/DEMARRAGE.md');
    expect(resolveDocLink('README.md', 'https://pokeapi.co')).toBeNull();
    expect(resolveDocLink('README.md', '#titre')).toBeNull();
  });

  it('cherche sans tenir compte des accents ni de la casse', () => {
    expect(findMatches('Équipe, equipe et ÉQUIPÉ', 'equipe')).toEqual([
      [0, 6],
      [8, 14],
      [18, 24],
    ]);
    const doc = { path: 'x.md', title: 'Titre', group: 'Autres', markdown: 'Une **règle** pure.' };
    expect(matchDoc(doc, 'REGLE')).toEqual({ count: 1, excerpt: 'Une règle pure.' });
    expect(matchDoc(doc, 'titre')).toEqual({ count: 0, excerpt: '' });
    expect(matchDoc(doc, 'absent')).toBeNull();
    expect(matchDoc(doc, '  ')).toBeNull();
  });

  it('met en page : ancres, sommaire et liens réécrits', () => {
    const doc = {
      path: 'docs/ARCHITECTURE.md',
      title: 'Archi',
      group: 'Comprendre le code',
      markdown: [
        '# Archi',
        '## Les règles',
        '## Les règles',
        'Voir [recettes](RECETTES.md), [tx](../apps/api/src/game/tx.ts), [site](https://a.b) et [ici](#les-regles).',
      ].join('\n\n'),
    };
    const { html, toc } = renderDoc(doc, new Set(['docs/RECETTES.md']));
    expect(toc).toEqual([
      { id: 'les-règles', text: 'Les règles' },
      { id: 'les-règles-1', text: 'Les règles' },
    ]);
    expect(html).toContain('id="doc-les-règles-1"');
    expect(html).toContain('data-doc="docs/RECETTES.md"');
    expect(html).toContain(`href="${REPO_URL}/apps/api/src/game/tx.ts" target="_blank"`);
    expect(html).toContain('href="https://a.b" target="_blank"');
    expect(html).toContain('data-anchor="les-regles"');
  });
});
