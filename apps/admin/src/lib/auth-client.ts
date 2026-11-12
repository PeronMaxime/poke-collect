/** Client d'authentification (Better Auth) de l'admin : connexion et déconnexion. */
import { createAuthClient } from 'better-auth/react';

/**
 * Client Better Auth, sur la même origine que l'admin (l'API est servie derrière le même domaine).
 */
export const authClient = createAuthClient({ baseURL: window.location.origin });
