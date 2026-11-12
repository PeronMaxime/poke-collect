import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

/** Longueur maximale d'une fonction, sans les lignes vides ni les commentaires. */
const LENGTH = { max: 150, skipBlankLines: true, skipComments: true };

/** Motifs d'import interdits : paquets internes cités, et ce qui n'a de sens que côté serveur. */
const forbidden = (...packages) => [
  ...packages.map((name) => `@poke/${name}`),
  'drizzle-orm',
  'drizzle-orm/*',
  'fastify',
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'packages/data/generated/**',
      'packages/db/drizzle/**',
      '**/.data/**',
      'scripts/import-pokeapi/.cache/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
      // Règles typées (promesses oubliées, `switch` incomplets) : ESLint lit les tsconfig.
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            'apps/api/vitest.config.ts',
            'packages/content/vitest.config.ts',
            'packages/game-core/vitest.config.ts',
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // Une promesse oubliée côté serveur est une action perdue sans erreur visible.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
      // Un nouveau cas d'une union (effet d'objet, condition…) doit être traité partout.
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        { considerDefaultExhaustiveForUnions: true },
      ],
      // Une fonction trop longue ou trop compliquée se découpe (voir CLAUDE.md).
      'max-lines-per-function': ['error', LENGTH],
      complexity: ['error', 40],
    },
  },
  {
    // Dette restante (docs/plans/PLAN-QUALITE.md, 7.4) : dans ces fichiers seulement, une fonction
    // trop longue reste un avertissement, plafonné par `pnpm lint` (--max-warnings). Un fichier
    // remis d'aplomb sort de la liste ; aucun n'y entre.
    files: [
      'apps/admin/src/pages/ApiHealthPage.tsx',
      'apps/admin/src/pages/ExpeditionSimulatorPage.tsx',
      'apps/admin/src/pages/PlayersPage.tsx',
      'apps/admin/src/pages/content/AbilitiesPage.tsx',
      'apps/admin/src/pages/content/EvolutionsPage.tsx',
      'apps/admin/src/pages/content/SpeciesPage.tsx',
      'apps/admin/src/pages/content/ZonesPage.tsx',
      'packages/content/src/integrity/usages.ts',
      'scripts/import-pokeapi/src/index.ts',
    ],
    rules: { 'max-lines-per-function': ['warn', LENGTH], complexity: ['warn', 40] },
  },
  {
    // Les tests et le contenu de test sont de longues listes de cas : pas de limite de longueur.
    files: ['**/*.test.{ts,tsx}', 'packages/content/src/seed/**'],
    rules: { 'max-lines-per-function': 'off', complexity: 'off' },
  },
  // Frontières entre paquets : la logique pure ne connaît ni la base ni le serveur, et les pages
  // (jeu, admin) ne parlent à la base que par l'API.
  {
    files: ['packages/content/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: forbidden('game-core', 'db', 'shared') }],
    },
  },
  {
    files: ['packages/game-core/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: forbidden('db', 'shared') }] },
  },
  {
    files: ['packages/shared/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: forbidden('db') }] },
  },
  {
    // Le client HTTP ne connaît que `fetch` : ni le contenu, ni les règles, ni le contrat.
    files: ['packages/client/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: forbidden('content', 'data', 'db', 'game-core', 'shared') },
      ],
    },
  },
  {
    files: ['apps/admin/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', { patterns: forbidden('db') }] },
  },
  {
    // Le contenu de test (9 000 lignes) ne doit pas partir dans le navigateur des joueurs.
    files: ['apps/web/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', { patterns: forbidden('db', 'content/seed') }] },
  },
  {
    // Fichiers hors des tsconfig (configuration, scripts sans types) : règles non typées seulement.
    files: ['**/*.{js,mjs,cjs}'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['apps/web/**/*.{ts,tsx}', 'apps/admin/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ['apps/web/public/sw.js'],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
);
