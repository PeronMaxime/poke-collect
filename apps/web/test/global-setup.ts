import type { TestProject } from 'vitest/node';
import { startTestApi } from '../../api/src/testing/test-api';

declare module 'vitest' {
  export interface ProvidedContext {
    /** Adresse de l'API de test (voir `test/setup.ts`). */
    apiUrl: string;
  }
}

/**
 * Lance l'API de test une fois pour tous les tests d'écran du jeu. Seule différence avec le
 * contenu de test : tous les onglets sont ouverts d'emblée, pour qu'un joueur tout neuf puisse
 * afficher chaque écran.
 */
export default async function setup(project: TestProject) {
  const api = await startTestApi((content) => {
    content.balance.tabUnlocks = {};
  });
  project.provide('apiUrl', api.url);
  return () => api.close();
}
