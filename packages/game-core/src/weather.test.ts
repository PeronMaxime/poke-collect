import { describe, expect, it } from 'vitest';
import type { Zone } from '@poke/content';
import {
  WEATHER_EPOCH,
  hasVariableWeather,
  nextWeatherRoll,
  weatherHour,
  zoneWeather,
  zoneWeatherAtHour,
} from './weather';

type WeatherZone = Pick<Zone, 'id' | 'weatherChangeChance' | 'weathers'>;

const zone = (patch: Partial<WeatherZone> = {}): WeatherZone => ({
  id: 'route-1',
  weatherChangeChance: 20,
  weathers: [
    { weather: 'clear', weight: 2 },
    { weather: 'sun', weight: 1 },
    { weather: 'rain', weight: 1 },
  ],
  ...patch,
});

/** Météos des `n` premières heures, calculées indépendamment (sans le cache). */
const history = (z: WeatherZone, n: number) =>
  Array.from({ length: n }, (_, h) => zoneWeatherAtHour({ ...z }, h));

describe('météo variable des zones', () => {
  it('reste en temps clair sans météo possible ou sans chance de changement', () => {
    expect(history(zone({ weathers: [] }), 200).every((w) => w === 'clear')).toBe(true);
    expect(history(zone({ weatherChangeChance: 0 }), 200).every((w) => w === 'clear')).toBe(true);
    expect(hasVariableWeather(zone({ weatherChangeChance: 0 }))).toBe(false);
    expect(hasVariableWeather(zone({ weathers: [{ weather: 'clear', weight: 1 }] }))).toBe(false);
    expect(hasVariableWeather(zone())).toBe(true);
  });

  it('démarre en temps clair et ne tire que des météos de la zone', () => {
    const list = history(zone(), 500);
    expect(list[0]).toBe('clear');
    expect(new Set(list)).toEqual(new Set(['clear', 'sun', 'rain']));
  });

  it('est déterministe et identique avec ou sans le cache', () => {
    const z = zone();
    const direct = history(z, 300);
    const cached = Array.from({ length: 300 }, (_, h) => zoneWeatherAtHour(z, h));
    expect(cached).toEqual(direct);
    // Retour en arrière après le cache.
    expect(zoneWeatherAtHour(z, 42)).toBe(direct[42]);
  });

  it('change pour une autre météo, environ au taux demandé', () => {
    const list = history(zone({ weatherChangeChance: 25 }), 4000);
    const changes = list.filter((w, h) => h > 0 && w !== list[h - 1]).length;
    expect(changes / 4000).toBeGreaterThan(0.2);
    expect(changes / 4000).toBeLessThan(0.3);
  });

  it('dépend de la zone', () => {
    expect(history(zone({ id: 'route-2' }), 300)).not.toEqual(history(zone(), 300));
  });

  it('une météo fixe (100 %, une seule météo) s’installe dès la première heure', () => {
    const fixed = zone({ weatherChangeChance: 100, weathers: [{ weather: 'sun', weight: 1 }] });
    expect(
      history(fixed, 50)
        .slice(1)
        .every((w) => w === 'sun'),
    ).toBe(true);
  });

  it('découpe le temps en heures pleines', () => {
    const at = WEATHER_EPOCH + 5 * 3_600_000 + 1_234;
    expect(weatherHour(at)).toBe(5);
    expect(nextWeatherRoll(at).getTime()).toBe(WEATHER_EPOCH + 6 * 3_600_000);
    expect(zoneWeather(zone(), at)).toBe(
      ((w) => (w === 'clear' ? null : w))(zoneWeatherAtHour(zone(), 5)),
    );
  });
});
