import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Deux familles de tests :
 * - `unit` : fonctions pures de `src/` (Node, sans navigateur) ;
 * - `ui` : écrans rendus dans jsdom contre la vraie API lancée en mémoire (voir `test/`).
 */
export default defineConfig({
  plugins: [react()],
  define: { __BUILD_ID__: JSON.stringify('dev') },
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['src/**/*.test.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          include: ['test/**/*.test.tsx'],
          environment: 'jsdom',
          globalSetup: ['test/global-setup.ts'],
          setupFiles: ['test/setup.ts'],
          css: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
