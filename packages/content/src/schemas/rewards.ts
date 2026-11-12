import { z } from 'zod';
import { itemStackSchema, slugSchema } from './common';
import { nameSchema } from './internal';

/**
 * Récompenses de progression, bonus permanents et complétions d'expédition.
 */

/** Bonus permanents (briques génériques), cumulés tant que la récompense est réclamée. */
export const permanentBonusSchema = z.discriminatedUnion('type', [
  /** Probabilité de capture en expédition. */
  z.object({ type: z.literal('capture'), percent: z.number().positive().max(1000) }),
  /** XP gagnée en expédition et en combat. */
  z.object({ type: z.literal('xp'), percent: z.number().positive().max(1000) }),
  /** Poké Dollars gagnés en combat. */
  z.object({ type: z.literal('money'), percent: z.number().positive().max(1000) }),
  /**
   * Chance de chromatique (expéditions, œufs, fossiles) : +1 % = taux × 1,01, cumulé avec la
   * chaîne de zone, le Charme Chroma, Masuda et les talents.
   */
  z.object({ type: z.literal('shiny'), percent: z.number().positive().max(1000) }),
]);

export type PermanentBonus = z.infer<typeof permanentBonusSchema>;

export type PermanentBonusType = PermanentBonus['type'];

/**
 * Bonus permanents d'une région (complétions d'expédition) : ils ne valent que pour les Pokémon
 * du Pokédex de la région de l'expédition (ou de la région complétée).
 */
export const regionBonusSchema = z.discriminatedUnion('type', [
  /** XP gagnée de toutes les sources : expéditions, combats, donjons, pensions et Bonbons. */
  z.object({ type: z.literal('xp'), percent: z.number().positive().max(1000) }),
]);

export type RegionBonus = z.infer<typeof regionBonusSchema>;

export type RegionBonusType = RegionBonus['type'];

/** Récompense d'un palier ou d'une collection, accordée quand le joueur la réclame. */
export const progressRewardSchema = z.object({
  currency: z.int().min(0).max(100_000_000),
  items: z.array(itemStackSchema),
  /** Emplacements supplémentaires (le total reste plafonné par le maximum de l'équilibrage). */
  expeditionSlots: z.int().min(0).max(6),
  daycareSlots: z.int().min(0).max(10),
  /** Couveuses supplémentaires (6 places et un assistant chacune) ; absent des anciens contenus. */
  incubators: z.int().min(0).max(10).default(0),
  bonuses: z.array(permanentBonusSchema),
});

export type ProgressReward = z.infer<typeof progressRewardSchema>;

/**
 * Récompense de complétion : une expédition est complétée quand chaque Pokémon de ses rencontres
 * (espèce ou forme) est capturé, en version chromatique avec `shiny`. À réclamer une fois par
 * expédition (`zone`) ou par région dont toutes les expéditions sont complétées (`region`).
 */
export const expeditionCompletionSchema = z.object({
  id: slugSchema,
  name: nameSchema,
  scope: z.enum(['zone', 'region']),
  /** Région ; null = toutes les régions (une récompense pour chacune). */
  regionId: slugSchema.nullable(),
  /** Pour `zone` : une expédition précise ; null = chaque expédition de la région. */
  zoneId: slugSchema.nullable(),
  shiny: z.boolean(),
  rewards: progressRewardSchema,
  /** Bonus permanents pour la région de l'expédition ; absent des anciens contenus. */
  regionBonuses: z.array(regionBonusSchema).default([]),
});

export type ExpeditionCompletion = z.infer<typeof expeditionCompletionSchema>;

export type ExpeditionCompletionScope = ExpeditionCompletion['scope'];
