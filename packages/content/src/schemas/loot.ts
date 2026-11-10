import { z } from 'zod';
import { slugSchema } from './common';
import { nameSchema, probabilitySchema } from './internal';

/**
 * Tables de butin.
 */

export const lootEntrySchema = z
  .object({
    itemId: slugSchema,
    /** Probabilité que l'entrée tombe à chaque tirage (0 à 1). */
    chance: probabilitySchema,
    min: z.int().min(1),
    max: z.int().min(1),
  })
  .refine((e) => e.max >= e.min, { message: 'max doit être ≥ min', path: ['max'] });

export type LootEntry = z.infer<typeof lootEntrySchema>;

export const lootTableSchema = z.object({
  id: slugSchema,
  name: nameSchema,
  entries: z.array(lootEntrySchema),
});

export type LootTable = z.infer<typeof lootTableSchema>;
