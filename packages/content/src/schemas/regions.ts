import { z } from 'zod';
import { slugSchema } from './common';
import { imageSchema, nameSchema } from './internal';
import { unlockConditionSchema } from './unlock';

/**
 * Régions.
 */

export const regionSchema = z.object({
  id: slugSchema,
  order: z.int().min(0),
  name: nameSchema,
  image: imageSchema,
  speciesIds: z.array(z.int().positive()),
  /** Starters proposés aux nouveaux joueurs (seule la première région en a besoin). */
  starterSpeciesIds: z.array(z.int().positive()),
  /** Désactivée : la région, ses zones, ses dresseurs et ses quêtes sont cachés aux joueurs. */
  enabled: z.boolean().default(true),
  unlock: unlockConditionSchema,
});

export type Region = z.infer<typeof regionSchema>;
