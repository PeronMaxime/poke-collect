import { z } from 'zod';
import { slugSchema } from './common';

/**
 * Conditions de déblocage : la même brique pour les régions, zones, dresseurs, onglets, bâtiments…
 */

const baseUnlockConditions = [
  z.object({ type: z.literal('always') }),
  z.object({
    type: z.literal('regionDexPercent'),
    regionId: slugSchema,
    percent: z.number().min(0).max(100),
  }),
  /** Avoir battu un dresseur donné au moins une fois. */
  z.object({ type: z.literal('trainerDefeated'), trainerId: slugSchema }),
  /** Avoir débloqué une région (sa condition remplie ; une région désactivée ne l'est jamais). */
  z.object({ type: z.literal('regionUnlocked'), regionId: slugSchema }),
  /**
   * Posséder au moins N badges (victoires contre des dresseurs qui en donnent un), ceux d'une
   * région donnée ou de toutes les régions.
   */
  z.object({
    type: z.literal('badgeCount'),
    count: z.int().min(1).max(100),
    regionId: slugSchema.optional(),
  }),
  /** Avoir capturé au moins N espèces différentes (Pokédex national). */
  z.object({ type: z.literal('speciesCaught'), count: z.int().min(1).max(10_000) }),
  /** Avoir fait éclore au moins N œufs. */
  z.object({ type: z.literal('eggsHatched'), count: z.int().min(1).max(100_000) }),
  /** Avoir validé au moins N étapes d'une quête (ex. zone ouverte pendant une quête). */
  z.object({
    type: z.literal('questStepsDone'),
    questId: slugSchema,
    count: z.int().min(1).max(20),
  }),
  /** Avoir validé toutes les étapes d'une quête. */
  z.object({ type: z.literal('questCompleted'), questId: slugSchema }),
] as const;

/** Condition simple (une seule brique). */
export const baseUnlockConditionSchema = z.discriminatedUnion('type', [...baseUnlockConditions]);

export type BaseUnlockCondition = z.infer<typeof baseUnlockConditionSchema>;

export const unlockConditionSchema = z.discriminatedUnion('type', [
  ...baseUnlockConditions,
  /** Toutes les conditions de la liste à la fois (ex. 5 badges et 50 espèces capturées). */
  z.object({
    type: z.literal('allOf'),
    conditions: z.array(baseUnlockConditionSchema).min(2, 'Au moins deux conditions').max(5),
  }),
]);

export type UnlockCondition = z.infer<typeof unlockConditionSchema>;
