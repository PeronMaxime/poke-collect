/**
 * Client d'authentification (Better Auth) du jeu : connexion, inscription, mot de passe oublié.
 */
import { createAuthClient } from 'better-auth/react';

/** Client d'authentification, sur la même origine que le jeu. */
export const authClient = createAuthClient({ baseURL: window.location.origin });
