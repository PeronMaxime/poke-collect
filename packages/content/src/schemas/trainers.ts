import { z } from 'zod';
import { slugSchema } from './common';
import { formIdSchema, imageSchema, nameSchema } from './internal';
import { unlockConditionSchema } from './unlock';

/**
 * Dresseurs.
 */

export const trainerPokemonSchema = z.object({
  speciesId: z.int().positive(),
  formId: formIdSchema,
  level: z.int().min(1).max(100),
  /** IV appliqués aux 6 statistiques ; null = valeur par défaut de l'équilibrage. */
  iv: z.int().min(0).max(31).nullable(),
  /** Nature PokéAPI ; null = neutre. */
  nature: z.string().min(1).nullable(),
});

export type TrainerPokemon = z.infer<typeof trainerPokemonSchema>;

export const battleRulesSchema = z.object({
  /** Nombre exact de Pokémon imposé ; null = libre (jusqu'à la taille maximale). */
  teamSize: z.int().min(1).max(6).nullable(),
  /** Niveau maximal des Pokémon engagés ; null = aucun. */
  maxLevel: z.int().min(1).max(100).nullable(),
  requiredTypes: z.array(z.object({ type: z.string().min(1), count: z.int().min(1).max(6) })),
  forbiddenTypes: z.array(z.string().min(1)),
  /** PE totale minimale pour pouvoir lancer le combat. */
  minPower: z.int().min(0),
});

export type BattleRules = z.infer<typeof battleRulesSchema>;

export const trainerSchema = z.object({
  id: slugSchema,
  regionId: slugSchema,
  /** Zone (ou ville) de rattachement, pour l'affichage. */
  zoneId: slugSchema.nullable(),
  order: z.int().min(0),
  name: nameSchema,
  /** Classe : Gamin, Montagnard, Champion d'arène… */
  trainerClass: nameSchema,
  sprite: imageSchema,
  team: z.array(trainerPokemonSchema).min(1, 'Au moins un Pokémon').max(6),
  /** Temps imparti pour vaincre toute l'équipe du dresseur. */
  timeLimitSeconds: z.int().min(10).max(3600),
  rules: battleRulesSchema,
  /** Poké Dollars gagnés en cas de victoire. */
  money: z.int().min(0),
  lootTableId: slugSchema.nullable(),
  lootRolls: z.int().min(0).max(20),
  /** Badge obtenu à la première victoire (Champions d'arène). */
  badge: z.object({ name: nameSchema, image: imageSchema }).nullable(),
  /** Unique : une seule victoire possible. Répétable : temps de recharge après chaque combat. */
  repeatable: z.boolean(),
  /** Temps de recharge ; null = valeur de l'équilibrage. */
  cooldownMinutes: z.int().min(0).nullable(),
  /** Désactivé : caché aux joueurs, plus aucun combat ne peut être lancé contre lui. */
  enabled: z.boolean().default(true),
  unlock: unlockConditionSchema,
  /**
   * Dresseur de quête : réservé à une étape de cette quête, il n'apparaît (dans la section des
   * dresseurs de quêtes) qu'une fois cette étape atteinte, et ne se bat qu'une fois.
   * null = dresseur ordinaire.
   */
  questId: slugSchema.nullable().default(null),
});

export type Trainer = z.infer<typeof trainerSchema>;

/** Temps imparti proposé pour un dresseur : 1 min, plus 30 s par Pokémon de son équipe. */
export const defaultTrainerTimeLimitSeconds = (teamSize: number) => 60 + 30 * teamSize;
