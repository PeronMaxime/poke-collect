import type { TestProject } from 'vitest/node';
import { startTestApi } from '../../api/src/testing/test-api';

declare module 'vitest' {
  export interface ProvidedContext {
    apiUrl: string;
    /** Compte administrateur de l'API de test. */
    admin: { email: string; password: string };
  }
}

/** Lance l'API de test une fois pour tous les tests de l'admin, avec son compte administrateur. */
export default async function setup(project: TestProject) {
  const api = await startTestApi();
  project.provide('apiUrl', api.url);
  project.provide('admin', api.admin);
  return () => api.close();
}
