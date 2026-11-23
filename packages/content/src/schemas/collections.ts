import { z } from 'zod';
import { slugSchema } from './common';
import { nameSchema } from './internal';
import { progressRewardSchema } from './rewards';

/**
 * Collections de formes à capturer.
 */

/**
 * Collection thématique : capturer toutes les espèces de la liste (forme par défaut) et toutes
 * les formes de `formIds` (Zarbi B, Prismillon Banquise…). L'une des deux listes peut être vide
 * (Méga-Évolutions d'une région : formes seules), pas les deux.
 */
export const collectionSchema = z
  .object({
    id: slugSchema,
    order: z.int().min(0),
    name: nameSchema,
    description: z.string().max(500),
    speciesIds: z.array(z.int().positive()),
    rewards: progressRewardSchema,
    /** Région : la collection n'apparaît qu'une fois la région débloquée ; null = toujours. */
    regionId: slugSchema.nullable(),
    formIds: z.array(z.int().positive()),
  })
  .refine((c) => c.speciesIds.length + c.formIds.length > 0, {
    message: 'Au moins une espèce ou une forme',
    path: ['speciesIds'],
  });

export type Collection = z.infer<typeof collectionSchema>;
