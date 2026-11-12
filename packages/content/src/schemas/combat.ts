import { z } from 'zod';
import { nameSchema, probabilitySchema } from './internal';

/**
 * Réglages des combats en temps réel (dresseurs, donjons, légendaires) et difficultés des donjons.
 */

/** Attaque utilisée en combat (donjons et dresseurs) par les Pokémon d'un type (une seule attaque par type). */
export const dungeonAttackSchema = z.object({
  name: nameSchema,
  power: z.int().min(1).max(250),
});

export type DungeonAttack = z.infer<typeof dungeonAttackSchema>;

/** Niveaux de difficulté des donjons, du plus simple au plus dur. */
export const DUNGEON_DIFFICULTIES = ['easy', 'hard', 'veryHard', 'extreme'] as const;

export const dungeonDifficultySchema = z.enum(DUNGEON_DIFFICULTIES);

export type DungeonDifficulty = z.infer<typeof dungeonDifficultySchema>;

/**
 * Niveau de difficulté : une simple information pour le joueur (les niveaux, le temps et la
 * récompense se règlent sur chaque donjon).
 */
export const dungeonDifficultySettingsSchema = z.object({
  name: nameSchema,
});

export type DungeonDifficultySettings = z.infer<typeof dungeonDifficultySettingsSchema>;

/**
 * Réglages communs aux combats en temps réel (donjons et dresseurs). Un combat garde ceux de son
 * départ : une modification n'affecte pas un combat en cours.
 */
export const combatSettingsSchema = z.object({
  /**
   * Délai entre deux attaques, linéaire selon la Vitesse : `maxAttackIntervalMs` à Vitesse 0,
   * `baseAttackIntervalMs` à la Vitesse de référence, au plus court `minAttackIntervalMs`.
   */
  baseAttackIntervalMs: z.int().min(100).max(60_000),
  referenceSpeed: z.int().min(1).max(1000),
  minAttackIntervalMs: z.int().min(100).max(60_000),
  maxAttackIntervalMs: z.int().min(100).max(60_000),
  /**
   * Dégâts = ((2 × niveau / 5 + 2) × puissance × Att / Déf / 50 + 2) × bonus de type (STAB)
   * × efficacité × aléa (entre `minDamageRoll` et 1) × multiplicateur × coup critique.
   */
  damageMultiplier: z.number().positive().max(100),
  stabMultiplier: z.number().min(1).max(5),
  minDamageRoll: probabilitySchema,
  /** Chance de coup critique de chaque attaque (0 = aucun). */
  critChance: probabilitySchema,
  /** Dégâts d'un coup critique, qui ignore aussi les baisses d'Attaque (Intimidation). */
  critMultiplier: z.number().min(1).max(5),
  /** Délai avant qu'un Pokémon rappelé par le joueur puisse revenir au combat. */
  recallCooldownSeconds: z.number().min(0).max(60),
  /**
   * Pertes de la météo (sable, grêle), de la brûlure et du poison : toutes les `chipTickSeconds`
   * secondes pour les deux Pokémon en face, quelle que soit leur vitesse.
   */
  chipTickSeconds: z.number().min(1).max(30).default(3),
  /** Attaque de chaque type (clé : type PokéAPI, ex. `fire`). */
  attacks: z.record(z.string().min(1), dungeonAttackSchema),
  /** Les adversaires ont le premier talent de leur espèce (ou de leur forme). */
  enemyAbilities: z.boolean(),
});

export type CombatSettings = z.infer<typeof combatSettingsSchema>;

/** Réglages propres aux donjons (le combat suit `combatSettingsSchema`). */
export const dungeonSettingsSchema = z.object({
  maxTeamSize: z.int().min(1).max(6),
  /** IV des adversaires quand l'admin n'en fixe pas. */
  defaultOpponentIv: z.int().min(0).max(31),
  /** Nom affiché de chaque niveau de difficulté. */
  difficulties: z.object({
    easy: dungeonDifficultySettingsSchema,
    hard: dungeonDifficultySettingsSchema,
    veryHard: dungeonDifficultySettingsSchema,
    extreme: dungeonDifficultySettingsSchema,
  }),
  /** Temps de recharge d'un donjon après chaque tentative (surchargeable par donjon). */
  cooldownMinutes: z.int().min(0),
  /** XP par membre = Σ (XP de base × niveau / 7) des adversaires vaincus × multiplicateur. */
  xpMultiplier: z.number().min(0),
  happinessOnWin: z.int().min(-255).max(255),
  happinessOnLoss: z.int().min(-255).max(255),
});

export type DungeonSettings = z.infer<typeof dungeonSettingsSchema>;
