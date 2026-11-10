import { z } from 'zod';
import { slugSchema } from './common';
import { nameSchema } from './internal';
import { progressRewardSchema } from './rewards';

/**
 * Collections de formes à capturer.
 */

/**
 * Collection thématique : capturer toutes les espèces de la liste (forme par défaut) et toutes
 * les formes de `formIds` (Zarbi B, Prismillon Banquise…).
 */
export const collectionSchema = z.object({
  id: slugSchema,
  order: z.int().min(0),
  name: nameSchema,
  description: z.string().max(500),
  speciesIds: z.array(z.int().positive()).min(1, 'Au moins une espèce'),
  rewards: progressRewardSchema,
  /** Région : la collection n'apparaît qu'une fois la région débloquée ; null = toujours. */
  regionId: slugSchema.nullable(),
  formIds: z.array(z.int().positive()),
});

export type Collection = z.infer<typeof collectionSchema>;
