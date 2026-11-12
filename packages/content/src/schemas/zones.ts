import { z } from 'zod';
import { slugSchema } from './common';
import { formIdSchema, imageSchema, nameSchema } from './internal';
import { unlockConditionSchema } from './unlock';
import { zoneWeatherSchema } from './weather';

/**
 * Zones d'expédition.
 */

export const encounterSchema = z
  .object({
    speciesId: z.int().positive(),
    formId: formIdSchema,
    weight: z.number().positive(),
    minLevel: z.int().min(1).max(100),
    maxLevel: z.int().min(1).max(100),
  })
  .refine((e) => e.maxLevel >= e.minLevel, {
    message: 'Niveau max doit être ≥ niveau min',
    path: ['maxLevel'],
  });

export type Encounter = z.infer<typeof encounterSchema>;

/**
 * Rencontre spéciale (formes événementielles : Pikachu à casquette, Pichu Troizépi…) : possible
 * seulement si l'équipe compte le Pokémon requis exact (espèce et forme, pas une évolution). Chaque
 * rencontre a alors `chance` % d'être lui, une fois au plus par expédition ; jamais chromatique.
 */
export const specialEncounterSchema = z
  .object({
    speciesId: z.int().positive(),
    formId: formIdSchema,
    minLevel: z.int().min(1).max(100),
    maxLevel: z.int().min(1).max(100),
    requiredSpeciesId: z.int().positive(),
    /** Forme exacte du Pokémon requis ; null = forme par défaut. */
    requiredFormId: formIdSchema,
    chance: z.number().gt(0).max(100),
    /** Phrase énigmatique affichée sur la zone quand le joueur possède le Pokémon requis. */
    hint: z.string().max(300),
  })
  .refine((e) => e.maxLevel >= e.minLevel, {
    message: 'Niveau max doit être ≥ niveau min',
    path: ['maxLevel'],
  });

export type SpecialEncounter = z.infer<typeof specialEncounterSchema>;

export const zoneSchema = z.object({
  id: slugSchema,
  regionId: slugSchema,
  order: z.int().min(0),
  name: nameSchema,
  description: z.string().max(500),
  image: imageSchema,
  habitat: z.string().nullable(),
  /** Puissance d'expédition (PE) totale minimale de l'équipe. */
  /** Désactivée : cachée aux joueurs, plus aucune expédition ne peut y partir. */
  enabled: z.boolean().default(true),
  minPower: z.int().min(0),
  /** Exemple : 2 Pokémon de type Eau pour une zone sous-marine. */
  requiredTypes: z.array(z.object({ type: z.string().min(1), count: z.int().min(1).max(6) })),
  affinityTypes: z.array(z.string().min(1)),
  /** Temps avant de pouvoir arrêter une expédition dans la zone. */
  minDurationMinutes: z.int().positive(),
  encounters: z.array(encounterSchema).min(1, 'Au moins une rencontre'),
  lootTableId: slugSchema.nullable(),
  unlock: unlockConditionSchema,
  /**
   * Météo variable (talents qui en dépendent) : temps clair au départ, puis à chaque heure pile,
   * `weatherChangeChance` % de chances d'en changer pour une autre de `weathers`, tirée selon
   * les poids. Aucune météo = toujours temps clair.
   */
  weatherChangeChance: z.number().min(0).max(100).default(0),
  weathers: z
    .array(zoneWeatherSchema)
    .default([])
    .refine((list) => new Set(list.map((w) => w.weather)).size === list.length, 'Météo en double'),
  specialEncounters: z.array(specialEncounterSchema).default([]),
});

export type Zone = z.infer<typeof zoneSchema>;
