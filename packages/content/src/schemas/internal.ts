import { z } from 'zod';

/**
 * Petits schémas réutilisés par plusieurs domaines, non exportés par le paquet.
 */

export const nameSchema = z.string().trim().min(1, 'Obligatoire').max(64);

/** URL complète, ou chemin servi par l'API (ex. `/api/sprites/trainers/brock.png`). */
export const imageSchema = z
  .string()
  .refine((v) => /^\/[^/]/.test(v) || z.url().safeParse(v).success, 'URL invalide')
  .nullable();

export const probabilitySchema = z.number().min(0).max(1);

/**
 * Forme alternative ou régionale (identifiant PokéAPI `pokemon`, ex. Goupix d'Alola) ;
 * null ou absente = forme par défaut. Elle doit appartenir à l'espèce (alertes de cohérence).
 */
export const formIdSchema = z.int().positive().nullish();
