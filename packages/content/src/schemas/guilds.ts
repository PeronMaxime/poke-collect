import { z } from 'zod';
import { slugSchema } from './common';
import { nameSchema } from './internal';
import { chestRaritySchema } from './items';
import { unlockConditionSchema } from './unlock';

/**
 * Guildes : réglages, quêtes du jour et de la semaine, coffres.
 */

/** Un nombre par rareté de coffre de guilde (bronze, argent, or). */
const perChestRaritySchema = (min: number, max: number) =>
  z.object({
    bronze: z.int().min(min).max(max),
    silver: z.int().min(min).max(max),
    gold: z.int().min(min).max(max),
  });

/** Périodes des quêtes de guilde : du jour (minuit) et de la semaine (lundi minuit), heure de Paris. */
export const GUILD_QUEST_PERIODS = ['daily', 'weekly'] as const;

export const guildQuestPeriodSchema = z.enum(GUILD_QUEST_PERIODS);

export type GuildQuestPeriod = z.infer<typeof guildQuestPeriodSchema>;

export const GUILD_QUEST_PERIOD_LABELS: Record<GuildQuestPeriod, string> = {
  daily: 'Quotidienne',
  weekly: 'Hebdomadaire',
};

/** Difficultés des quêtes de guilde. */
export const GUILD_QUEST_DIFFICULTIES = ['easy', 'hard'] as const;

export const guildQuestDifficultySchema = z.enum(GUILD_QUEST_DIFFICULTIES);

export type GuildQuestDifficulty = z.infer<typeof guildQuestDifficultySchema>;

export const GUILD_QUEST_DIFFICULTY_LABELS: Record<GuildQuestDifficulty, string> = {
  easy: 'Facile',
  hard: 'Difficile',
};

/** Quêtes d'une période et d'une difficulté : combien, coffre gagné. */
const guildQuestTierSchema = z.object({
  /** Quêtes tirées à chaque période. */
  count: z.int().min(0).max(10),
  /** Coffre donné à chaque participant. */
  chest: z.enum(['bronze', 'silver', 'gold']),
});

export type GuildQuestTier = z.infer<typeof guildQuestTierSchema>;

const guildQuestPeriodTiersSchema = z.object({
  easy: guildQuestTierSchema,
  hard: guildQuestTierSchema,
});

export const DEFAULT_GUILD_QUEST_TIERS = {
  daily: {
    easy: { count: 2, chest: 'bronze' },
    hard: { count: 1, chest: 'silver' },
  },
  weekly: {
    easy: { count: 2, chest: 'silver' },
    hard: { count: 1, chest: 'gold' },
  },
} satisfies Record<GuildQuestPeriod, Record<GuildQuestDifficulty, GuildQuestTier>>;

/** Réglages des guildes par défaut (aussi utilisés pour les versions de contenu antérieures). */
export const DEFAULT_GUILD_SETTINGS = {
  creationCost: 100_000,
  maxMembers: 30,
  rejoinCooldownHours: 24,
  quests: DEFAULT_GUILD_QUEST_TIERS,
  chestRolls: { bronze: 1, silver: 2, gold: 3 },
};

export const guildSettingsSchema = z.object({
  /** Prix de création d'une guilde, en Poké Dollars. */
  creationCost: z.int().min(0).max(100_000_000),
  maxMembers: z.int().min(2).max(200),
  /** Délai après avoir quitté une guilde avant d'en rejoindre (ou d'en créer) une autre. */
  rejoinCooldownHours: z.int().min(0).max(720),
  /** Quêtes tirées chaque jour et chaque semaine, par difficulté. */
  quests: z
    .object({ daily: guildQuestPeriodTiersSchema, weekly: guildQuestPeriodTiersSchema })
    .default(DEFAULT_GUILD_QUEST_TIERS),
  /** Lots tirés à l'ouverture d'un coffre, par rareté. */
  chestRolls: perChestRaritySchema(1, 10),
});

export type GuildSettings = z.infer<typeof guildSettingsSchema>;

/** Objectif d'une quête de guilde : ce que chaque action des membres fait avancer. */
export const guildObjectiveSchema = z.discriminatedUnion('type', [
  /** Pokémon capturés (expéditions, quêtes), d'un type donné ou de tous types. */
  z.object({ type: z.literal('catchPokemon'), pokemonType: z.string().min(1).nullable() }),
  /** Expéditions récupérées (hors expéditions légendaires). */
  z.object({ type: z.literal('expeditions') }),
  /** Combats de dresseurs gagnés. */
  z.object({ type: z.literal('battlesWon') }),
  /** Donjons réussis. */
  z.object({ type: z.literal('dungeonsWon') }),
  /** Œufs éclos. */
  z.object({ type: z.literal('eggsHatched') }),
  /** Poké Dollars gagnés en combat de dresseur et en donjon. */
  z.object({ type: z.literal('moneyEarned') }),
]);

export type GuildObjective = z.infer<typeof guildObjectiveSchema>;

export type GuildObjectiveType = GuildObjective['type'];

/** Objectif d'une quête de guilde pour une période : ce nombre × membres, sans descendre sous `minCount`. */
export const guildQuestGoalSchema = z.object({
  countPerMember: z.int().min(1).max(1_000_000),
  minCount: z.int().min(1).max(10_000_000),
});

export type GuildQuestGoal = z.infer<typeof guildQuestGoalSchema>;

/**
 * Modèle de quête de guilde : chaque jour et chaque semaine, des modèles sont tirés au hasard pour
 * chaque guilde (nombre par difficulté dans l'équilibrage), parmi ceux qui ont un objectif pour la
 * période. L'équilibrage fixe le coffre donné à chaque membre qui a fait avancer la quête.
 */
export const guildQuestSchema = z.object({
  id: slugSchema,
  name: nameSchema,
  description: z.string().max(500),
  /** Tirée parmi les quêtes faciles ou difficiles (du jour comme de la semaine). */
  difficulty: guildQuestDifficultySchema,
  objective: guildObjectiveSchema,
  /** Objectif en quête du jour ; null = jamais tirée chaque jour. */
  daily: guildQuestGoalSchema.nullable(),
  /** Objectif en quête de la semaine ; null = jamais tirée chaque semaine. */
  weekly: guildQuestGoalSchema.nullable(),
  enabled: z.boolean(),
});

export type GuildQuest = z.infer<typeof guildQuestSchema>;

/**
 * Lot d'un coffre de guilde (comme un article de boutique) : à l'ouverture, chaque tirage choisit
 * un lot parmi ceux de la rareté du coffre que le joueur a débloqués, selon leur poids.
 */
export const chestEntrySchema = z.object({
  id: slugSchema,
  rarity: chestRaritySchema,
  itemId: slugSchema,
  /** Nombre d'objets du lot (ex. 100 Poké Balls). */
  lotSize: z.int().min(1).max(999),
  /** Poids relatif dans le tirage (les lots débloqués de la rareté se partagent le total). */
  weight: z.number().positive().max(1_000_000),
  /** Condition pour que le lot puisse sortir (progression du joueur). */
  unlock: unlockConditionSchema,
  enabled: z.boolean(),
});

export type ChestEntry = z.infer<typeof chestEntrySchema>;
