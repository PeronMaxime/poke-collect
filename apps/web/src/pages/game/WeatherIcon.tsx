import type { ImposedWeather, Zone } from '@poke/content';
import { WEATHER_LABELS, hasVariableWeather, nextWeatherRoll, zoneWeather } from '@poke/game-core';
import { HoverBubble } from '../../components/ui';

const ICONS: Record<ImposedWeather, string> = {
  clear: '🌤️',
  sun: '☀️',
  rain: '🌧️',
  sand: '🏜️',
  hail: '🌨️',
};

/** Effets directs en combat, donjons et dresseurs (voir `weatherDamageMultiplier` et les dégâts de fin d'attaque). */
const COMBAT_EFFECTS: Record<ImposedWeather, string> = {
  clear: 'Aucun effet de météo.',
  sun: 'Attaques Feu ×1,5 et Eau ×0,5. Aucun Pokémon ne peut être gelé.',
  rain: 'Attaques Eau ×1,5 et Feu ×0,5.',
  sand: 'Chaque Pokémon perd 1/16 de ses PV max après chacune de ses attaques, sauf les types Roche, Sol et Acier.',
  hail: 'Chaque Pokémon perd 1/16 de ses PV max après chacune de ses attaques, sauf le type Glace.',
};

/** Précision d'une météo qui n'est pas celle du lieu. */
export const TEAM_WEATHER_NOTE = 'Imposée par un talent de ton équipe.';

/** Logo de la météo d'une activité ; l'explication s'affiche au survol. */
export function WeatherIcon({
  weather,
  activity,
  note,
  forecast,
  className = 'text-lg',
}: {
  /** `clear` : météo du lieu annulée par un talent. */
  weather: ImposedWeather;
  activity: 'expedition' | 'battle' | 'dungeon';
  /** Précision affichée sous l'effet (météo imposée par un talent…). */
  note?: string;
  /** Météo variable du lieu (voir `zoneWeatherForecast`). */
  forecast?: string;
  className?: string;
}) {
  const label = WEATHER_LABELS[weather];
  return (
    <HoverBubble
      width={220}
      height={forecast ? 170 : 110}
      className={`inline-block cursor-help leading-none font-normal ${className}`}
      content={
        <>
          <span className="block font-semibold">Météo : {label}</span>
          <span className="mt-1 block text-slate-500">
            {activity !== 'expedition'
              ? COMBAT_EFFECTS[weather]
              : weather === 'clear'
                ? 'Aucune météo : les talents qui en dépendent sont inactifs.'
                : 'Pas d’effet direct : active les talents qui dépendent de cette météo.'}
          </span>
          {note && <span className="mt-1 block text-slate-500 italic">{note}</span>}
          {forecast && <span className="mt-1 block text-slate-500">{forecast}</span>}
        </>
      }
    >
      <span role="img" aria-label={`Météo : ${label}`}>
        {ICONS[weather]}
      </span>
    </HoverBubble>
  );
}

/** Explication de la météo variable d'une zone : chance de changement, prochain tirage, météos possibles. */
export function zoneWeatherForecast(zone: Zone, at: number): string | undefined {
  if (!hasVariableWeather(zone)) return undefined;
  const next = nextWeatherRoll(at).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const chance = zone.weatherChangeChance.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
  const possible = zone.weathers.map((w) => WEATHER_LABELS[w.weather].toLowerCase()).join(', ');
  return `Météo variable : ${chance} % de chances qu’elle change à chaque heure pile (prochain tirage à ${next}). Possibles : ${possible}.`;
}

/** Météo du moment d'une zone, si elle en a une (rien pour une zone toujours en temps clair). */
export function ZoneWeatherIcon({
  zone,
  at,
  activity,
  className,
}: {
  zone: Zone;
  /** Instant affiché (horloge du serveur de préférence). */
  at: number;
  activity: 'expedition' | 'battle';
  className?: string;
}) {
  const weather = zoneWeather(zone, at);
  const forecast = zoneWeatherForecast(zone, at);
  if (!weather && !forecast) return null;
  return (
    <WeatherIcon
      weather={weather ?? 'clear'}
      activity={activity}
      forecast={forecast}
      className={className}
    />
  );
}
