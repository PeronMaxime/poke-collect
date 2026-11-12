import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/** Pages de l'admin rendues dans jsdom contre la vraie API lancée en mémoire (voir `test/`). */
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@web': fileURLToPath(new URL('../web/src', import.meta.url)) } },
  define: { __BUILD_ID__: JSON.stringify('dev') },
  test: {
    include: ['test/**/*.test.tsx'],
    environment: 'jsdom',
    globalSetup: ['test/global-setup.ts'],
    // Même préparation de jsdom que le jeu : `fetch` vers l'API de test, cookie de session.
    setupFiles: ['../web/test/setup.ts'],
    css: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
