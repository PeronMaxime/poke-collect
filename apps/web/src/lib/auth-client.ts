/**
 * Client d'authentification (Better Auth) du jeu : connexion, inscription, mot de passe oublié,
 * code du second facteur (comptes administrateurs qui jouent aussi).
 */
import { createAuthClient } from 'better-auth/react';
import { twoFactorClient } from 'better-auth/client/plugins';

/** Client d'authentification, sur la même origine que le jeu. */
export const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [twoFactorClient()],
});
