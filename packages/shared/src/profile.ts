import { z } from 'zod';
import { nameRefusal } from './names';

/**
 * Compte, dresseur, starter et Pokémon favori (avatar).
 */

/** Schémas et types de l'API, partagés entre `apps/api`, `apps/web` et `apps/admin`. */

export const userRoleSchema = z.enum(['player', 'admin']);

export type UserRole = z.infer<typeof userRoleSchema>;

export const trainerNameSchema = z
  .string()
  .trim()
  .min(3, 'Au moins 3 caractères')
  .max(16, 'Au plus 16 caractères')
  .regex(/^[\p{L}\p{N} _-]+$/u, 'Lettres, chiffres, espaces, - et _ uniquement')
  .superRefine((name, ctx) => {
    const reason = nameRefusal(name);
    if (reason) ctx.addIssue({ code: 'custom', message: reason });
  });

/** Ce que l'écran de connexion doit proposer (`GET /api/config`). */
export interface AuthConfigDto {
  /** Fournisseurs OAuth configurés (`google`, `discord`). */
  oauthProviders: string[];
  /** Les e-mails partent : « Mot de passe oublié ? » est proposé. */
  passwordReset: boolean;
  /** Un nouveau compte ne s'ouvre qu'après le clic sur le lien envoyé par e-mail. */
  emailVerification: boolean;
  /** Clé publique Cloudflare Turnstile ; null : pas de captcha. */
  captchaSiteKey: string | null;
}

export const createProfileInputSchema = z.object({
  trainerName: trainerNameSchema,
});

export type CreateProfileInput = z.infer<typeof createProfileInputSchema>;

export interface PlayerProfileDto {
  trainerName: string;
  regionUnlocked: string;
  /** Null tant que le starter n'a pas été choisi. */
  starterSpeciesId: number | null;
  /** Starter choisi dans chaque région suivante (identifiant de région → espèce). */
  regionStarters: Record<string, number>;
  /** Régions ouvertes pour de bon, même si leur condition de déblocage s'est durcie depuis. */
  openedRegions: string[];
  /** Pokémon favori choisi ; null : le starter. */
  favorite: FavoritePokemonDto | null;
  currency: number;
  createdAt: string;
}

/**
 * Pokémon favori d'un dresseur (son avatar sur sa fiche, dans les classements, la recherche et
 * sa guilde) : une espèce ou une forme capturée, en chromatique si capturée ainsi.
 */
export interface FavoritePokemonDto {
  speciesId: number;
  formId: number | null;
  shiny: boolean;
}

export const favoritePokemonInputSchema = z.object({
  /** Null : revenir au starter. */
  favorite: z
    .object({
      speciesId: z.int().positive(),
      formId: z.int().positive().nullable(),
      shiny: z.boolean(),
    })
    .nullable(),
});

export type FavoritePokemonInput = z.infer<typeof favoritePokemonInputSchema>;

export const chooseStarterInputSchema = z.object({ speciesId: z.int().positive() });

export type ChooseStarterInput = z.infer<typeof chooseStarterInputSchema>;
