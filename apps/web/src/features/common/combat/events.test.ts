import type { DungeonEvent } from '@poke/game-core';
import { describe, expect, it } from 'vitest';
import { ABILITY_POPUP_MS, POPUP_MS, TRAVEL_MS, shownEvents, weatherDisplay } from './events';

/** Événement réduit à ce que regardent les filtres : sa famille et son instant. */
const at = (kind: DungeonEvent['kind'], atMs: number) => ({ kind, atMs }) as DungeonEvent;

describe('shownEvents', () => {
  const events = [
    at('attack', 1000),
    at('attack', 1000 + TRAVEL_MS),
    at('attack', 1000 + TRAVEL_MS + 1),
    at('status', 1000 - ABILITY_POPUP_MS + 1),
    at('ability', 1000 - ABILITY_POPUP_MS),
    at('item', 1000),
  ];

  it('montre en vol les attaques qui partent dans la fenêtre du trajet, sans l’instant même', () => {
    expect(shownEvents(events, 1000).inFlight.map((e) => e.atMs)).toEqual([1000 + TRAVEL_MS]);
  });

  it('garde les dégâts affichés pendant `POPUP_MS` après l’impact, l’impact compris', () => {
    expect(shownEvents(events, 1000).popups.map((e) => e.atMs)).toEqual([1000]);
    expect(shownEvents([at('attack', 1000)], 1000 + POPUP_MS - 1).popups).toHaveLength(1);
    expect(shownEvents([at('attack', 1000)], 1000 + POPUP_MS).popups).toEqual([]);
  });

  it('garde statuts, talents et baies affichés pendant `ABILITY_POPUP_MS`, bornes exclues', () => {
    const shown = shownEvents(events, 1000);
    expect(shown.statusPopups).toHaveLength(1);
    expect(shown.abilityPopups).toHaveLength(0);
    expect(shown.itemPopups).toHaveLength(1);
  });
});

describe('weatherDisplay', () => {
  const setup = { weather: 'rain' as const, placeWeather: 'sun' as const };

  it('sans talent qui l’impose, montre la météo du combat dès le début', () => {
    expect(weatherDisplay(setup, false, 0)).toMatchObject({
      startWeather: 'rain',
      shownWeather: 'rain',
    });
  });

  it('avec un talent, ouvre sur la météo du lieu puis passe à la sienne', () => {
    expect(weatherDisplay(setup, true, 0)).toEqual({
      startWeather: 'sun',
      shownWeather: 'sun',
      weatherBanner: null,
    });
    expect(weatherDisplay(setup, true, 1200)).toEqual({
      startWeather: 'sun',
      shownWeather: 'rain',
      weatherBanner: 'shown',
    });
  });

  it('annonce le changement, le fait disparaître en fondu, puis le retire', () => {
    expect(weatherDisplay(setup, true, 1200 + 2100).weatherBanner).toBe('fading');
    expect(weatherDisplay(setup, true, 1200 + 2600).weatherBanner).toBeNull();
  });

  it('temps clair : aucune météo', () => {
    expect(weatherDisplay({}, false, 5000).shownWeather).toBeNull();
  });
});
