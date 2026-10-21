import type { Weather, ZoneWeather } from './schemas';

/**
 * Météos du contenu de test. Zones : temps clair dominant, plus des météos selon l'habitat
 * (pluie au bord de l'eau, sable en terrain accidenté…) et les types en affinité (Glace → grêle,
 * Feu → soleil, Eau → pluie). Donjons : météo fixe selon le type de la Méga-Évolution.
 */

/** Chance de changer de météo à chaque heure pile, pour toutes les zones. */
export const ZONE_WEATHER_CHANGE_CHANCE = 25;

const HABITAT_WEATHERS: Record<string, ZoneWeather[]> = {
  grassland: [
    { weather: 'clear', weight: 6 },
    { weather: 'sun', weight: 2 },
    { weather: 'rain', weight: 2 },
  ],
  forest: [
    { weather: 'clear', weight: 6 },
    { weather: 'rain', weight: 3 },
    { weather: 'sun', weight: 1 },
  ],
  'waters-edge': [
    { weather: 'clear', weight: 5 },
    { weather: 'rain', weight: 4 },
    { weather: 'sun', weight: 1 },
  ],
  sea: [
    { weather: 'clear', weight: 5 },
    { weather: 'rain', weight: 5 },
  ],
  cave: [
    { weather: 'clear', weight: 8 },
    { weather: 'sand', weight: 2 },
  ],
  mountain: [
    { weather: 'clear', weight: 6 },
    { weather: 'sand', weight: 2 },
    { weather: 'hail', weight: 2 },
  ],
  'rough-terrain': [
    { weather: 'clear', weight: 5 },
    { weather: 'sand', weight: 3 },
    { weather: 'sun', weight: 2 },
  ],
  urban: [
    { weather: 'clear', weight: 8 },
    { weather: 'rain', weight: 2 },
  ],
};

const DEFAULT_WEATHERS: ZoneWeather[] = [
  { weather: 'clear', weight: 8 },
  { weather: 'sun', weight: 1 },
  { weather: 'rain', weight: 1 },
];

/** Météo ajoutée par un type en affinité (sauf dans les grottes, à part la grêle). */
const TYPE_WEATHERS: [type: string, weather: Weather, weight: number][] = [
  ['ice', 'hail', 3],
  ['fire', 'sun', 2],
  ['water', 'rain', 2],
];

/** Météos possibles d'une zone du contenu de test (toujours avec le temps clair). */
export function seedZoneWeathers(habitat: string | null, affinityTypes: readonly string[]) {
  const list = [...((habitat && HABITAT_WEATHERS[habitat]) || DEFAULT_WEATHERS)];
  for (const [type, weather, weight] of TYPE_WEATHERS) {
    if (!affinityTypes.includes(type) || list.some((w) => w.weather === weather)) continue;
    if (habitat === 'cave' && weather !== 'hail') continue;
    list.push({ weather, weight });
  }
  // Pas de grêle sur un volcan, ni de soleil sur une banquise.
  return list.filter(
    (w) =>
      !(w.weather === 'hail' && affinityTypes.includes('fire')) &&
      !(w.weather === 'sun' && affinityTypes.includes('ice')),
  );
}

/** Météo d'un donjon selon les types de sa Méga-Évolution (premier type qui en a une). */
const MEGA_WEATHERS: [type: string, weather: Weather][] = [
  ['fire', 'sun'],
  ['water', 'rain'],
  ['ice', 'hail'],
  ['rock', 'sand'],
  ['ground', 'sand'],
];

export function seedDungeonWeather(megaTypes: readonly string[]): Weather | undefined {
  return MEGA_WEATHERS.find(([type]) => megaTypes.includes(type))?.[1];
}
