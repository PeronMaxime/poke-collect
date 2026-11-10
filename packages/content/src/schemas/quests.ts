import { z } from 'zod';
import { slugSchema } from './common';
import { formIdSchema, imageSchema, nameSchema } from './internal';
import { progressRewardSchema } from './rewards';
import { unlockConditionSchema } from './unlock';
import type { BaseUnlockCondition, UnlockCondition } from './unlock';
import { imposedWeatherSchema } from './weather';
import type { Zone } from './zones';

/**
 * Quêtes et Pokémon légendaires qu'elles offrent.
 */

/**
 * Conditions de départ d'une expédition de quête : Pokémon précis dans l'équipe (espèces, toutes
 * formes), météo au départ (celle de la zone, ou celle qu'impose un talent de l'équipe ; « clear »
 * = temps clair ; vide = toutes) et moment du
 * départ (heure locale du joueur ; null = jour comme nuit).
 */
const questExpeditionRequirements = {
  speciesIds: z.array(z.int().positive()).max(6).default([]),
  weathers: z.array(imposedWeatherSchema).default([]),
  timeOfDay: z.enum(['day', 'night']).nullable().default(null),
};

/** Conditions d'étape propres aux quêtes, comptées à partir du début de l'étape. */
const questActionConditions = [
  /** Capturer N Pokémon en expédition (filtrés par type et / ou espèce), dans la zone indiquée ou, sans zone, dans la région de la quête. */
  z.object({
    type: z.literal('catchPokemon'),
    count: z.int().min(1).max(10_000),
    pokemonType: z.string().min(1).nullable(),
    speciesId: z.int().positive().nullable(),
    zoneId: slugSchema.nullable().default(null),
  }),
  /**
   * Réussir N expéditions dans une zone, avec au moins `memberCount` Pokémon (du type demandé,
   * le cas échéant) de PE individuelle ≥ `minMemberPower`.
   */
  z.object({
    type: z.literal('expedition'),
    zoneId: slugSchema,
    count: z.int().min(1).max(1000),
    memberType: z.string().min(1).nullable(),
    memberCount: z.int().min(0).max(6),
    minMemberPower: z.int().min(0),
    ...questExpeditionRequirements,
  }),
  /**
   * Trouver N objets de quête en expédition dans une zone : chaque rencontre d'une expédition qui
   * remplit les conditions (équipe, météo et moment du départ) a `chance` % d'en faire trouver un.
   * L'objet n'est trouvé que pendant cette étape ; il rejoint le sac.
   */
  z.object({
    type: z.literal('questItem'),
    itemId: slugSchema,
    count: z.int().min(1).max(99),
    zoneId: slugSchema,
    chance: z.number().gt(0).max(100),
    memberType: z.string().min(1).nullable().default(null),
    memberCount: z.int().min(0).max(6).default(0),
    minMemberPower: z.int().min(0).default(0),
    ...questExpeditionRequirements,
  }),
] as const;

/**
 * Condition d'une étape : une condition de déblocage (état du joueur, évaluée à tout moment) ou
 * une action à accomplir pendant l'étape (captures, expédition réussie).
 */
export const questConditionSchema = z.discriminatedUnion('type', [
  ...unlockConditionSchema.options,
  ...questActionConditions,
]);

export type QuestCondition = z.infer<typeof questConditionSchema>;

export type QuestActionCondition = Extract<
  QuestCondition,
  { type: 'catchPokemon' | 'expedition' | 'questItem' }
>;

/** Étape jouée en expédition, avec ses conditions de départ. */
export type QuestExpeditionCondition = Extract<
  QuestCondition,
  { type: 'expedition' | 'questItem' }
>;

/** Briques d'une condition : celles d'un « toutes ces conditions », ou la condition elle-même. */
export function unlockParts(condition: UnlockCondition): BaseUnlockCondition[];

export function unlockParts(
  condition: QuestCondition,
): Exclude<QuestCondition, { type: 'allOf' }>[];

export function unlockParts(condition: QuestCondition) {
  return condition.type === 'allOf' ? condition.conditions : [condition];
}

/**
 * Zone où peuvent fuir les Pokémon fuyards : active, et ordinaire, c'est-à-dire ni zone de quête
 * (ouverte par une quête) ni zone spéciale (plusieurs conditions de déblocage).
 */
export function isRoamingZone(zone: Pick<Zone, 'enabled' | 'unlock'>): boolean {
  const { unlock } = zone;
  return (
    zone.enabled &&
    unlock.type !== 'allOf' &&
    unlock.type !== 'questStepsDone' &&
    unlock.type !== 'questCompleted'
  );
}

export const questStepSchema = z.object({
  name: nameSchema,
  description: z.string().max(500),
  condition: questConditionSchema,
  /** Dénouement, affiché une fois l'étape validée (la suite de l'histoire) ; vide = aucun. */
  outcome: z.string().max(1000).default(''),
});

export type QuestStep = z.infer<typeof questStepSchema>;

/**
 * Combat légendaire : une fois la récompense réclamée, le Pokémon s'affronte en combat en temps
 * réel (lancé depuis les quêtes), seul contre l'équipe du joueur. Il est renforcé (PV et
 * statistiques multipliés) et, sous `enrageHpFraction` de ses PV, se déchaîne : ses statistiques
 * (hors PV) gagnent `enragePercent` %. Une victoire permet de lancer une Ball, qui le capture à
 * `captureChance` % (Ball à capture assurée : 100 %).
 */
export const legendaryBattleSchema = z.object({
  /** Niveau en combat ; null = niveau de la récompense. */
  level: z.int().min(1).max(100).nullable(),
  /** IV de chaque statistique en combat. */
  iv: z.int().min(0).max(31),
  hpMultiplier: z.number().min(1).max(100),
  /** Multiplicateur des statistiques hors PV. */
  statMultiplier: z.number().min(0.1).max(10),
  enrageHpFraction: z.number().min(0).max(1),
  enragePercent: z.number().min(0).max(500),
  timeLimitSeconds: z.int().min(30).max(3600),
  minPower: z.int().min(0),
  requiredTypes: z.array(z.object({ type: z.string().min(1), count: z.int().min(1).max(6) })),
  captureChance: z.number().gt(0).max(100),
});

export type LegendaryBattle = z.infer<typeof legendaryBattleSchema>;

/** Combat légendaire par défaut (niveau de la récompense). */
export const DEFAULT_LEGENDARY_BATTLE: LegendaryBattle = {
  level: null,
  iv: 31,
  hpMultiplier: 5,
  statMultiplier: 1.1,
  enrageHpFraction: 0.5,
  enragePercent: 20,
  timeLimitSeconds: 300,
  minPower: 0,
  requiredTypes: [],
  captureChance: 30,
};

/** Pokémon offert (légendaire…) : IV aléatoires, dont au moins `perfectIvs` à 31. */
export const questPokemonSchema = z.object({
  speciesId: z.int().positive(),
  formId: formIdSchema,
  level: z.int().min(1).max(100),
  perfectIvs: z.int().min(0).max(6),
  /** Combat légendaire (sans effet pour un fuyard). */
  battle: legendaryBattleSchema.default(DEFAULT_LEGENDARY_BATTLE),
  /**
   * Pokémon fuyard : pas de combat légendaire ; une fois la récompense réclamée, il change de
   * zone à chaque heure (zones ordinaires débloquées de la région de la quête) et chaque rencontre
   * d'une expédition dans sa zone a `roaming` % de chances d'être lui (une fois au plus).
   * null = combat légendaire.
   */
  roaming: z.number().gt(0).max(100).nullable().default(null),
});

export type QuestPokemon = z.infer<typeof questPokemonSchema>;

export const questRewardSchema = progressRewardSchema.extend({
  pokemon: z.array(questPokemonSchema).max(6),
});

export type QuestReward = z.infer<typeof questRewardSchema>;

/** Chaîne de quêtes : étapes ordonnées, validées l'une après l'autre, puis récompense. */
export const questSchema = z.object({
  id: slugSchema,
  order: z.int().min(0),
  name: nameSchema,
  description: z.string().max(1000),
  /** Illustration ; si absente, artwork du premier Pokémon offert. */
  image: imageSchema,
  /** Région de rattachement (affichage, origine des Pokémon offerts) ; null = aucune. */
  regionId: slugSchema.nullable(),
  /** Désactivée : cachée aux joueurs, elle ne progresse plus et sa récompense n'est plus réclamable. */
  enabled: z.boolean().default(true),
  /** Condition d'apparition de la quête. */
  unlock: unlockConditionSchema,
  steps: z.array(questStepSchema).min(1, 'Au moins une étape').max(20),
  rewards: questRewardSchema,
});

export type Quest = z.infer<typeof questSchema>;
