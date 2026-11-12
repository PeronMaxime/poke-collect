import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Couverture minimale (`pnpm test:coverage`, lancé par la CI) : juste sous le niveau atteint le
    // 11 novembre sans Postgres (lignes 94 %, branches 78 %) ; la CI, qui lance aussi les tests
    // d'actions simultanées, est au-dessus. Le plancher ne peut que monter.
    coverage: { thresholds: { lines: 93, branches: 77 } },
  },
});
