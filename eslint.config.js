import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

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
        projectService: { allowDefaultProject: ['apps/api/vitest.config.ts'] },
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
      // Dette visible : avertissements plafonnés par `pnpm lint` (--max-warnings), le plafond ne
      // peut que baisser (voir docs/plans/PLAN-QUALITE.md).
      'max-lines-per-function': ['warn', { max: 150, skipBlankLines: true, skipComments: true }],
      complexity: ['warn', 40],
    },
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
