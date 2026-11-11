/**
 * Ce que l'écran de combat montre à un instant donné : événements en cours (projectiles, bulles)
 * et météo affichée. L'affichage a un léger retard sur la simulation (`TRAVEL_MS`), pour que chaque
 * projectile parte de l'attaquant et touche le défenseur à l'instant où les PV baissent.
 */
import type { Weather } from '@poke/content';
import type { DungeonEvent } from '@poke/game-core';

/** Durée du trajet d'un projectile (et retard de l'affichage sur le combat), en ms. */
export const TRAVEL_MS = 380;
/** Durée d'affichage des dégâts et de l'efficacité après l'impact, en ms. */
export const POPUP_MS = 900;
/** Durée d'affichage du nom d'un talent qui se déclenche, en ms. */
export const ABILITY_POPUP_MS = 1600;
/**
 * Météo imposée par un talent : le combat s'ouvre sur celle du lieu, qui laisse place à celle du
 * talent après `WEATHER_CHANGE_MS`, annoncée pendant `WEATHER_BANNER_MS` (affichage seulement :
 * le combat se joue tout entier sous la météo du talent).
 */
const WEATHER_CHANGE_MS = 1200;
const WEATHER_BANNER_MS = 2600;
/** Durée de l'annonce du déchaînement d'un légendaire (phase 2), en ms. */
export const ENRAGE_BANNER_MS = 2600;

/** Événements du combat, par famille. */
export type DungeonAttackEvent = DungeonEvent & { kind: 'attack' };
export type DungeonAbilityEvent = DungeonEvent & { kind: 'ability' };
export type DungeonStatusEvent = DungeonEvent & { kind: 'status' };
export type DungeonItemEvent = DungeonEvent & { kind: 'item' };

/**
 * Événements visibles à l'instant affiché `displayMs` : projectiles en vol (partis, pas encore
 * arrivés) et bulles récentes (dégâts, statuts, talents, baies), chacune pendant sa durée.
 */
export function shownEvents(events: readonly DungeonEvent[], displayMs: number) {
  const inFlight = events.filter(
    (e): e is DungeonAttackEvent =>
      e.kind === 'attack' && e.atMs > displayMs && e.atMs <= displayMs + TRAVEL_MS,
  );
  const popups = events.filter(
    (e): e is DungeonAttackEvent =>
      e.kind === 'attack' && e.atMs <= displayMs && e.atMs > displayMs - POPUP_MS,
  );
  const statusPopups = events.filter(
    (e): e is DungeonStatusEvent =>
      e.kind === 'status' && e.atMs <= displayMs && e.atMs > displayMs - ABILITY_POPUP_MS,
  );
  const abilityPopups = events.filter(
    (e): e is DungeonAbilityEvent =>
      e.kind === 'ability' && e.atMs <= displayMs && e.atMs > displayMs - ABILITY_POPUP_MS,
  );
  const itemPopups = events.filter(
    (e): e is DungeonItemEvent =>
      e.kind === 'item' && e.atMs <= displayMs && e.atMs > displayMs - ABILITY_POPUP_MS,
  );
  return { inFlight, popups, statusPopups, abilityPopups, itemPopups };
}

/**
 * Météo affichée : celle du lieu au tout début si un talent impose la sienne (`imposed`), puis
 * celle du combat ; `weatherBanner` : annonce du changement, affichée puis en fondu.
 */
export function weatherDisplay(
  setup: { weather?: Weather | null; placeWeather?: Weather | null },
  imposed: boolean,
  displayMs: number,
) {
  const startWeather = imposed ? (setup.placeWeather ?? null) : (setup.weather ?? null);
  const shownWeather =
    imposed && displayMs < WEATHER_CHANGE_MS ? startWeather : (setup.weather ?? null);
  const sinceChange = displayMs - WEATHER_CHANGE_MS;
  const weatherBanner =
    sinceChange < 0 || sinceChange >= WEATHER_BANNER_MS
      ? null
      : sinceChange >= WEATHER_BANNER_MS - 500
        ? 'fading'
        : 'shown';
  return {
    startWeather,
    shownWeather,
    weatherBanner: weatherBanner as 'fading' | 'shown' | null,
  };
}
