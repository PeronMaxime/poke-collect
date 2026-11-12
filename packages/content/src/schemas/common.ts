import { z } from 'zod';

/**
 * Briques communes : identifiants, raretés, piles d'objets.
 */

/**
 * Schémas du contenu configurable (édité dans le panneau d'admin, stocké en base).
 * Les mêmes schémas valident le contenu côté serveur et les formulaires de l'admin.
 */

export const slugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Identifiant attendu en minuscules-avec-tirets');

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;

export const raritySchema = z.enum(RARITIES);

export type Rarity = z.infer<typeof raritySchema>;

export const itemStackSchema = z.object({
  itemId: slugSchema,
  quantity: z.int().min(1),
});

export type ItemStack = z.infer<typeof itemStackSchema>;
