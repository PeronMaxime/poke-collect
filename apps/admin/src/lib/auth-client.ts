/**
 * Client d'authentification (Better Auth) de l'admin : connexion, second facteur (activation et
 * code à chaque connexion), déconnexion.
 */
import { createAuthClient } from 'better-auth/react';
import { twoFactorClient } from 'better-auth/client/plugins';

/**
 * Client Better Auth, sur la même origine que l'admin (l'API est servie derrière le même domaine).
 */
export const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [twoFactorClient()],
});
