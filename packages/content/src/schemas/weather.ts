import { z } from 'zod';

/**
 * Météo et statuts de combat.
 */

/** Météo d'une zone ou d'un donjon (Soleil, Pluie, Tempête de sable, Grêle). */
export const WEATHERS = ['sun', 'rain', 'sand', 'hail'] as const;

export const weatherSchema = z.enum(WEATHERS);

export type Weather = z.infer<typeof weatherSchema>;

/** Météo qu'un talent peut imposer : une météo, ou le temps clair (annule celle du lieu). */
export const IMPOSED_WEATHERS = [...WEATHERS, 'clear'] as const;

export const imposedWeatherSchema = z.enum(IMPOSED_WEATHERS);

export type ImposedWeather = z.infer<typeof imposedWeatherSchema>;

/** Météo possible d'une zone (temps clair compris) et son poids au tirage. */
export const zoneWeatherSchema = z.object({
  weather: imposedWeatherSchema,
  weight: z.int().min(1),
});

export type ZoneWeather = z.infer<typeof zoneWeatherSchema>;

/** Statuts des combats (donjons et dresseurs). */
export const STATUSES = ['paralysis', 'burn', 'poison', 'sleep', 'freeze'] as const;

export const statusSchema = z.enum(STATUSES);

export type Status = z.infer<typeof statusSchema>;

/** Statistiques qu'un talent peut faire varier en combat (Intimidation). */
export const DUNGEON_STATS = [
  'attack',
  'defense',
  'special-attack',
  'special-defense',
  'speed',
] as const;

export const dungeonStatSchema = z.enum(DUNGEON_STATS);

export type DungeonStat = z.infer<typeof dungeonStatSchema>;
