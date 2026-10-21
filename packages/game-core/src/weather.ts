import type { ImposedWeather, Weather, Zone } from '@poke/content';
import { weatherOrClear } from './abilities';
import { createRng } from './rng';

/**
 * Météo variable des zones. Le temps est découpé en heures pleines (UTC) depuis `WEATHER_EPOCH` ;
 * la zone y est en temps clair, puis chaque heure tire si la météo change (`weatherChangeChance`)
 * et, si oui, laquelle parmi les autres météos de la zone (selon leurs poids). Les tirages ne
 * dépendent que de la zone et de l'heure : serveur et clients trouvent la même météo, et une
 * expédition retrouve à la réclamation celle de son départ (même version de contenu).
 */
export const WEATHER_EPOCH = Date.UTC(2026, 9, 1);
const HOUR_MS = 3_600_000;

type WeatherZone = Pick<Zone, 'id' | 'weatherChangeChance' | 'weathers'>;

/** Hachage FNV-1a de l'identifiant de la zone (graine de ses tirages). */
function zoneSeed(zoneId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < zoneId.length; i++) {
    hash = Math.imul(hash ^ zoneId.charCodeAt(i), 0x01000193);
  }
  return hash >>> 0;
}

/** Heure pleine de `at` (nombre d'heures depuis l'époque, 0 avant). */
export const weatherHour = (at: Date | number) =>
  Math.max(0, Math.floor((+at - WEATHER_EPOCH) / HOUR_MS));

/** Début de l'heure pleine `hour`. */
export const weatherHourStart = (hour: number) => new Date(WEATHER_EPOCH + hour * HOUR_MS);

/** Météo tirée à l'heure `hour` à partir de `current` (inchangée si pas de changement). */
function nextWeather(zone: WeatherZone, seed: number, hour: number, current: ImposedWeather) {
  const rng = createRng(seed ^ Math.imul(hour + 1, 0x9e3779b1));
  if (!rng.chance(zone.weatherChangeChance / 100)) return current;
  const others = zone.weathers.filter((w) => w.weather !== current && w.weight > 0);
  if (others.length === 0) return current;
  return rng.weighted(others.map((w) => ({ value: w.weather, weight: w.weight })));
}

/** Dernière météo calculée par zone (objet de contenu), pour ne pas tout recalculer. */
const cache = new WeakMap<WeatherZone, { hour: number; weather: ImposedWeather }>();

/** Météo de la zone pendant l'heure pleine `hour` ; temps clair = 'clear'. */
export function zoneWeatherAtHour(zone: WeatherZone, hour: number): ImposedWeather {
  if (zone.weathers.length === 0 || zone.weatherChangeChance <= 0) return 'clear';
  const seed = zoneSeed(zone.id);
  const cached = cache.get(zone);
  let from = 0;
  let weather: ImposedWeather = 'clear';
  if (cached && cached.hour <= hour) ({ hour: from, weather } = cached);
  for (let h = from + 1; h <= hour; h++) weather = nextWeather(zone, seed, h, weather);
  if (!cached || hour > cached.hour) cache.set(zone, { hour, weather });
  return weather;
}

/** Météo de la zone à l'instant `at` ; null = temps clair. */
export function zoneWeather(zone: WeatherZone, at: Date | number): Weather | null {
  return weatherOrClear(zoneWeatherAtHour(zone, weatherHour(at)));
}

/** La météo de la zone peut changer (au moins une météo possible et une chance non nulle). */
export const hasVariableWeather = (zone: WeatherZone) =>
  zone.weatherChangeChance > 0 && zone.weathers.some((w) => w.weather !== 'clear');

/** Prochain tirage de météo (début de l'heure pleine suivante). */
export const nextWeatherRoll = (at: Date | number) => weatherHourStart(weatherHour(at) + 1);
