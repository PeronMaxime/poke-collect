import { defineConfig } from 'vitest/config';

/**
 * Couverture minimale des schémas et de la cohérence du contenu (`pnpm test:coverage`, lancé par
 * la CI) : juste sous le niveau atteint le 11 novembre (lignes 96 %, branches 87 %).
 */
export default defineConfig({
  test: { coverage: { thresholds: { lines: 95, branches: 86 } } },
});
