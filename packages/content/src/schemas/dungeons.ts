import { z } from 'zod';
import { dungeonDifficultySchema } from './combat';
import { slugSchema } from './common';
import { nameSchema, probabilitySchema } from './internal';
import { trainerPokemonSchema } from './trainers';
import { unlockConditionSchema } from './unlock';
import { weatherSchema } from './weather';

/**
 * Donjons.
 */

/** Météo facultative d'un lieu : null (colonne vide en base) devient absente. */
const optionalWeatherSchema = z.preprocess((w) => w ?? undefined, weatherSchema.optional());

/**
 * Donjon : combats en temps réel contre une suite de Pokémon, jusqu'au boss (une Méga-Évolution).
 * Visible dès qu'une espèce de la lignée est capturée, ouvert quand toute la lignée l'est.
 */
export const dungeonSchema = z.object({
  id: slugSchema,
  regionId: slugSchema,
  order: z.int().min(0),
  name: nameSchema,
  description: z.string().max(500),
  /** Difficulté affichée au joueur (aucun effet sur le combat). */
  difficulty: dungeonDifficultySchema.default('easy'),
  /** Boss final : en général la forme Méga de l'espèce du donjon. */
  boss: trainerPokemonSchema,
  /** PV du boss multipliés (1 = normaux). */
  bossHpMultiplier: z.number().min(0.1).max(20),
  /** Espèces à avoir toutes capturées pour entrer (la lignée du boss). */
  familySpeciesIds: z.array(z.int().positive()).min(1, 'Au moins une espèce').max(10),
  /** Adversaires affrontés dans l'ordre, avant le boss. */
  opponents: z.array(trainerPokemonSchema).max(30),
  /** Temps imparti pour vaincre le boss. */
  timeLimitSeconds: z.int().min(10).max(3600),
  /** Temps de recharge après une tentative ; null = valeur de l'équilibrage. */
  cooldownMinutes: z.int().min(0).nullable(),
  /** Poké Dollars gagnés en cas de victoire. */
  money: z.int().min(0),
  lootTableId: slugSchema.nullable(),
  lootRolls: z.int().min(0).max(20),
  /** Méga-Gemme que le boss peut laisser (null = aucune), avec sa probabilité. */
  gemItemId: slugSchema.nullable(),
  gemChance: probabilitySchema,
  /** Désactivé : caché aux joueurs, plus aucune tentative ne peut être lancée. */
  enabled: z.boolean().default(true),
  /** Condition supplémentaire (en plus de la lignée capturée). */
  unlock: unlockConditionSchema,
  /** Météo du donjon (Soleil : Feu ×1,5 et Eau ×0,5…) ; absente = temps clair. */
  weather: optionalWeatherSchema,
});

export type Dungeon = z.infer<typeof dungeonSchema>;
