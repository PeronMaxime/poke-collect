import type { ImposedWeather } from '@poke/content';
import { WEATHER_LABELS } from '@poke/game-core';
import { HoverBubble } from '../../components/ui';

const ICONS: Record<ImposedWeather, string> = {
  clear: '🌤️',
  sun: '☀️',
  rain: '🌧️',
  sand: '🏜️',
  hail: '🌨️',
};

/** Effets directs en donjon (voir `weatherDamageMultiplier` et les dégâts de fin d'attaque). */
const DUNGEON_EFFECTS: Record<ImposedWeather, string> = {
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
  className = 'text-lg',
}: {
  /** `clear` : météo du lieu annulée par un talent. */
  weather: ImposedWeather;
  activity: 'expedition' | 'battle' | 'dungeon';
  /** Précision affichée sous l'effet (météo imposée par un talent…). */
  note?: string;
  className?: string;
}) {
  const label = WEATHER_LABELS[weather];
  return (
    <HoverBubble
      width={220}
      height={110}
      className={`inline-block cursor-help leading-none font-normal ${className}`}
      content={
        <>
          <span className="block font-semibold">Météo : {label}</span>
          <span className="mt-1 block text-slate-500">
            {activity === 'dungeon'
              ? DUNGEON_EFFECTS[weather]
              : weather === 'clear'
                ? 'Aucune météo : les talents qui en dépendent sont inactifs.'
                : 'Pas d’effet direct : active les talents qui dépendent de cette météo.'}
          </span>
          {note && <span className="mt-1 block text-slate-500 italic">{note}</span>}
        </>
      }
    >
      <span role="img" aria-label={`Météo : ${label}`}>
        {ICONS[weather]}
      </span>
    </HoverBubble>
  );
}
