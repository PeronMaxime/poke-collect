import { defineConfig } from 'vitest/config';

/**
 * Couverture minimale des règles du jeu (`pnpm test:coverage`, lancé par la CI) : juste sous le
 * niveau atteint le 11 novembre (lignes 91 %, branches 81 %). Le plancher ne peut que monter.
 */
export default defineConfig({
  test: { coverage: { thresholds: { lines: 90, branches: 80 } } },
});
