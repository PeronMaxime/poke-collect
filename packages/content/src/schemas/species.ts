import { z } from 'zod';
import { raritySchema, slugSchema } from './common';

/**
 * Surcharges de la base PokéAPI : espèces et conditions d'évolution.
 */

export const speciesOverrideSchema = z.object({
  speciesId: z.int().positive(),
  /** Une espèce désactivée n'apparaît plus en rencontre. */
  enabled: z.boolean(),
  nameFr: z.string().trim().min(1).max(64).nullable(),
  /** Habitat maison (indispensable pour la Gen IV et suivantes). */
  habitat: z.string().nullable(),
  rarity: raritySchema.nullable(),
  breedable: z.boolean().nullable(),
});

export type SpeciesOverride = z.infer<typeof speciesOverrideSchema>;

export const TIMES_OF_DAY = ['day', 'night'] as const;

export type TimeOfDay = (typeof TIMES_OF_DAY)[number];

/**
 * Une façon d'évoluer : toutes les conditions renseignées doivent être remplies.
 * L'objet est consommé (pierre, Câble Link…).
 */
export const evolutionMethodSchema = z
  .object({
    minLevel: z.int().min(1).max(100).nullable(),
    itemId: slugSchema.nullable(),
    minHappiness: z.int().min(0).max(255).nullable(),
    timeOfDay: z.enum(TIMES_OF_DAY).nullable(),
  })
  .refine((m) => m.minLevel !== null || m.itemId !== null || m.minHappiness !== null, {
    message: 'Au moins une condition : niveau, objet ou bonheur',
    path: ['minLevel'],
  });

export type EvolutionMethod = z.infer<typeof evolutionMethodSchema>;

export const evolutionOverrideId = (fromSpeciesId: number, toSpeciesId: number) =>
  `${fromSpeciesId}-${toSpeciesId}`;

/**
 * Remplace les conditions PokéAPI d'une évolution (ou en ajoute une) ; `enabled: false` la
 * supprime. Identifiant : `<espèce de départ>-<espèce d'arrivée>`.
 */
export const evolutionOverrideSchema = z
  .object({
    id: slugSchema,
    fromSpeciesId: z.int().positive(),
    toSpeciesId: z.int().positive(),
    enabled: z.boolean(),
    /** Au moins une méthode suffit. */
    methods: z.array(evolutionMethodSchema).max(10),
  })
  .refine((o) => o.id === evolutionOverrideId(o.fromSpeciesId, o.toSpeciesId), {
    message: 'Identifiant attendu : <départ>-<arrivée>',
    path: ['id'],
  })
  .refine((o) => o.fromSpeciesId !== o.toSpeciesId, {
    message: 'Une espèce ne peut pas évoluer en elle-même',
    path: ['toSpeciesId'],
  })
  .refine((o) => !o.enabled || o.methods.length > 0, {
    message: 'Au moins une méthode (ou désactiver l’évolution)',
    path: ['methods'],
  });

export type EvolutionOverride = z.infer<typeof evolutionOverrideSchema>;
