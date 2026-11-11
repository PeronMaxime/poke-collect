/**
 * Bandeau du formulaire de départ et chiffres de la zone.
 */
import type { CSSProperties } from 'react';
import { roamerMeetChance } from '@poke/game-core';
import { PokemonSprite } from '../../../components/ui';
import { formatDuration, speciesName } from '../../../lib/labels';
import { TEAM_WEATHER_NOTE, WeatherIcon } from '../../common/WeatherIcon';
import { BANNER_LABEL, CHECKER, TINTED_BANNER } from '../../common/zoneBanner';
import { capitalize, formatChance, formatShortMinutes } from './preview';
import type { LaunchModel } from './useLaunchExpedition';
import { Stat } from './parts';

/**
 * Bandeau de la zone, comme sur sa carte : nom au milieu, PE et météo à gauche, fermeture à droite.
 */
export function LaunchBanner({ launch, onCancel }: { launch: LaunchModel; onCancel: () => void }) {
  const { zone, weather, placeWeather, forecast, tint } = launch;
  return (
    <header className="relative flex min-h-[4.5rem] shrink-0 flex-wrap items-center gap-2 border-b-[3px] border-ink px-3 py-3 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:px-4">
      {zone.image ? (
        <img
          src={zone.image}
          alt=""
          className="absolute inset-0 h-full w-full object-cover dark:brightness-75"
        />
      ) : (
        <span
          aria-hidden
          className={`absolute inset-0 ${TINTED_BANNER}`}
          style={{ '--tint': tint, ...CHECKER } as CSSProperties}
        />
      )}
      <div className="relative flex items-center gap-1.5">
        <span className={`inline-flex items-center gap-1 whitespace-nowrap ${BANNER_LABEL}`}>
          PE <span className="font-sans text-sm leading-none">≥</span> {zone.minPower}
        </span>
        {(weather || placeWeather || forecast) && (
          <WeatherIcon
            weather={weather ?? 'clear'}
            activity="expedition"
            note={weather !== placeWeather ? TEAM_WEATHER_NOTE : undefined}
            forecast={forecast}
            className="rounded border-2 border-ink bg-win px-1 text-base leading-snug"
          />
        )}
      </div>
      {/* z-10 : placé en tête par `order-first`, le nom serait peint sous le fond du bandeau. */}
      <h2 className="relative z-10 order-first max-w-full rounded border-2 border-ink bg-win px-3 py-1.5 text-center font-pixel text-xs leading-normal sm:order-none">
        {zone.name}
      </h2>
      <div className="relative ml-auto flex justify-end sm:ml-0">
        <button
          type="button"
          className="btn-ghost px-2.5 py-2"
          aria-label="Fermer"
          onClick={onCancel}
        >
          <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="2.5" />
          </svg>
        </button>
      </div>
    </header>
  );
}

/**
 * Sous le bandeau : description, chaîne de zone, chiffres du départ (durées, rythme, taux
 * chromatique) et annonces des fuyards et rencontres spéciales.
 */
export function LaunchSummary({ launch }: { launch: LaunchModel }) {
  const {
    ctx,
    zone,
    per,
    maxDurationMinutes,
    lootIntervalMinutes,
    minMinutes,
    encounterSpeed,
    encounterInterval,
    growthText,
    encounterTitle,
    encounters,
    roamers,
    specials,
    shinyRate,
    shinyDetails,
    chainText,
  } = launch;
  return (
    <div className="space-y-2 px-3 pt-3 sm:px-4 lg:shrink-0">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 basis-60 text-sm text-slate-600 dark:text-slate-300">
          {zone.description}
        </p>
        {chainText && (
          <p
            className="rounded-md border-2 border-dashed border-amber-600 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 dark:border-[#a07a20] dark:bg-[#3d3416] dark:text-[#f8d878]"
            title="Relance la zone avant la fin du délai pour allonger la chaîne."
          >
            ✦ {capitalize(chainText)}
          </p>
        )}
      </div>
      <dl className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 sm:gap-2">
        <Stat label="Arrêt dès" value={formatDuration(minMinutes)} />
        <Stat label="Retour après" value={formatDuration(maxDurationMinutes)} />
        <Stat
          label="Rencontre"
          value={`1 / ${formatShortMinutes(encounterInterval)}`}
          sub={growthText}
          title={encounterTitle}
          tone={encounterSpeed > 1 ? 'better' : encounterSpeed < 1 ? 'worse' : undefined}
        />
        <Stat label="Butin" value={`1 / ${lootIntervalMinutes} min`} />
        <Stat
          label="✦ Shiny"
          value={shinyRate}
          title={shinyDetails ? `Taux chromatique (${shinyDetails})` : 'Taux chromatique'}
          accent
        />
      </dl>
      {roamers.map((r) => (
        <p
          key={r.questId}
          className="flex items-center gap-2 rounded-md border-2 border-amber-500 bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:border-[#a07a20] dark:bg-amber-950/40 dark:text-amber-300"
        >
          <PokemonSprite speciesId={r.speciesId} formId={r.formId} size={40} />
          <span>
            <strong>{speciesName(ctx, r.speciesId, r.formId)}</strong> se cache ici ! Partez à sa
            recherche.
          </span>
        </p>
      ))}
      {specials.map((sp) => (
        <p
          key={`special:${sp.speciesId}:${sp.formId ?? ''}`}
          className="flex items-center gap-2 rounded-md border-2 border-violet-400 bg-violet-50 px-2 py-1 text-xs text-violet-800 dark:bg-violet-950/40 dark:text-violet-300"
        >
          <PokemonSprite speciesId={sp.speciesId} formId={sp.formId} size={40} />
          <span>
            ✧ Grâce à <strong>{speciesName(ctx, sp.requiredSpeciesId, sp.requiredFormId)}</strong>,{' '}
            <strong>{speciesName(ctx, sp.speciesId, sp.formId)}</strong> peut apparaître ! Chances
            de le croiser {per} : {formatChance(roamerMeetChance(sp.chance, encounters))}. Il reçoit
            la Ball de sa catégorie (nouveau ou déjà capturé).
          </span>
        </p>
      ))}
    </div>
  );
}
