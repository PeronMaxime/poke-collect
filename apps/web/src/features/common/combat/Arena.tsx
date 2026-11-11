/**
 * L'arène du combat : décor et météo, les deux Pokémon et leur encadré, les annonces, ce qui s'anime
 * et les baies de soin.
 */
import { WEATHER_LABELS, dungeonStatChanges } from '@poke/game-core';
import { PokemonSprite } from '../../../components/ui';
import { abilityLabel, itemIcon, itemName } from '../../../lib/labels';
import { ENRAGE_BANNER_MS, TRAVEL_MS } from './events';
import {
  ARENA_BACKGROUNDS,
  ARENA_DIM,
  ARENA_GROUND,
  ARENA_LABEL,
  ARENA_PADS,
  MESSAGE_BOX,
  OUTCOME_LABELS,
  WEATHER_CHANGE_TEXTS,
  WEATHER_ICONS,
  fighterName,
  suppressorAbility,
} from './texts';
import { FighterCard } from './FighterCard';
import { AbilityPopup, DamagePopup, ItemPopup, Projectile, StatusPopup } from './popups';
import type { CombatModel } from './useDungeonCombat';

/** L'arène : notre Pokémon en bas à gauche, l'adversaire en haut à droite. */
export function Arena({ d }: { d: CombatModel }) {
  return (
    <div className="relative h-72 overflow-hidden border-b-[3px] border-ink select-none sm:h-80">
      <ArenaBackdrop d={d} />
      <RemainingEnemies d={d} />
      <WeatherNotice d={d} />
      <EnrageBanner d={d} />
      <Fighters d={d} />
      <CombatEffects d={d} />
      <HealItems d={d} />
      <OutcomeBanner d={d} />
    </div>
  );
}

/** Décor du lieu, puis celui de la météo du talent, en fondu, et ce qui tombe du ciel. */
function ArenaBackdrop({ d }: { d: CombatModel }) {
  const { setup, startWeather, shownWeather } = d;
  return (
    <>
      <div
        aria-hidden
        className={`absolute inset-0 ${ARENA_DIM}`}
        style={{ background: ARENA_BACKGROUNDS[startWeather ?? 'clear'] }}
      />
      <div
        aria-hidden
        className={`absolute inset-0 transition-opacity duration-1000 ${ARENA_DIM}`}
        style={{
          background: ARENA_BACKGROUNDS[setup.weather ?? 'clear'],
          opacity: shownWeather === (setup.weather ?? null) ? 1 : 0,
        }}
      />
      <div aria-hidden className="absolute inset-0" style={ARENA_GROUND} />
      <div aria-hidden className="absolute inset-0" style={{ background: ARENA_PADS }} />
      {/* Météo du combat : pluie, sable ou grêle qui tombent, reflets du soleil. */}
      {shownWeather && (
        <div
          key={`fx-${shownWeather}`}
          aria-hidden
          className="pointer-events-none absolute inset-0 animate-[dungeon-fade_1000ms_ease-out]"
        >
          <div className={`absolute inset-0 weather-${shownWeather}`} />
        </div>
      )}
    </>
  );
}

/** Adversaires restants, en petit et grisés, au-dessus de l'encadré de l'adversaire. */
function RemainingEnemies({ d }: { d: CombatModel }) {
  const { ctx, bossLast, remaining } = d;
  return (
    <div className="absolute top-2 left-3 sm:left-6">
      <div className={`flex h-8 items-center gap-0.5 px-1.5 ${ARENA_LABEL}`}>
        {remaining.length === 0 ? (
          <span className="pixel-label px-1 text-[8px] text-brand-600 uppercase dark:text-[#f8a8a0]">
            Dernier adversaire !
          </span>
        ) : (
          remaining.map((f, i) => (
            <span key={i} title={fighterName(ctx, f)} className="relative">
              <PokemonSprite
                speciesId={f.speciesId}
                formId={f.formId}
                size={28}
                className="opacity-60 grayscale"
              />
              {bossLast && i === remaining.length - 1 && (
                <span className="absolute -top-1 -right-0.5 text-[10px]" title="Boss">
                  👑
                </span>
              )}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

/** Météo en cours et, quand un talent la change, l'annonce du changement. */
function WeatherNotice({ d }: { d: CombatModel }) {
  const { ctx, setup, shownWeather, weatherSource, weatherBanner } = d;
  return (
    <>
      {shownWeather && (
        <span
          key={`label-${shownWeather}`}
          className={`absolute top-2 right-3 animate-[dungeon-enter_400ms_ease-out] px-2 py-0.5 text-sm font-semibold sm:right-6 ${ARENA_LABEL}`}
        >
          {WEATHER_ICONS[shownWeather]} {WEATHER_LABELS[shownWeather]}
        </span>
      )}
      {weatherSource && weatherBanner && (
        <div className="pointer-events-none absolute inset-x-0 top-[40%] z-10 flex justify-center px-3">
          <p
            className={`flex animate-[dungeon-enter_400ms_ease-out] items-center gap-2 py-1 pr-4 pl-1 text-sm transition-opacity duration-500 ${MESSAGE_BOX}`}
            style={{ opacity: weatherBanner === 'fading' ? 0 : 1 }}
          >
            <PokemonSprite
              speciesId={weatherSource.fighter.speciesId}
              formId={weatherSource.fighter.formId}
              shiny={weatherSource.fighter.isShiny}
              size={40}
              className={weatherSource.side === 'player' ? '-scale-x-100' : ''}
            />
            <span>
              <span className="font-semibold text-violet-700 dark:text-violet-300">
                {weatherSource.side === 'enemy' && 'Adversaire : '}
                {fighterName(ctx, weatherSource.fighter)} · {abilityLabel(weatherSource.ability)}
              </span>
              <span className="block font-medium">
                {WEATHER_CHANGE_TEXTS[setup.weather ?? 'clear']}
              </span>
            </span>
          </p>
        </div>
      )}
    </>
  );
}

/** Annonce du déchaînement d'un légendaire (phase 2). */
function EnrageBanner({ d }: { d: CombatModel }) {
  const { ctx, enemy, enrage, enrageAge } = d;
  return (
    <>
      {enrage && enrageAge < ENRAGE_BANNER_MS && (
        <div className="pointer-events-none absolute inset-x-0 top-[40%] z-10 flex justify-center px-3">
          <p
            className={`animate-[dungeon-enter_400ms_ease-out] px-4 py-1.5 text-center transition-opacity duration-500 ${MESSAGE_BOX}`}
            style={{ opacity: enrageAge > ENRAGE_BANNER_MS - 500 ? 0 : 1 }}
          >
            <span className="pixel-label block text-[10px] text-red-600 uppercase dark:text-red-400">
              {fighterName(ctx, enemy)} se déchaîne !
            </span>
            <span className="block text-sm">
              Ses statistiques augmentent de {enrage.percent} %.
            </span>
          </p>
        </div>
      )}
    </>
  );
}

/** Les deux Pokémon au combat et leur encadré. */
function Fighters({ d }: { d: CombatModel }) {
  const { ctx, bossLast, setup, shown, player, enemy, playerHp, hit, enrage, enrageAge } = d;
  return (
    <>
      {/* Adversaire, en haut à droite ; son encadré en haut à gauche. */}
      <div className="absolute top-12 left-3 sm:left-6">
        <FighterCard
          ctx={ctx}
          name={fighterName(ctx, enemy)}
          level={enemy.level}
          hp={shown.enemyHp}
          maxHp={enemy.maxHp}
          shiny={enemy.isShiny}
          status={shown.enemyStatus}
          ability={enemy.ability}
          neutralizedBy={suppressorAbility(player)}
          statChanges={dungeonStatChanges(setup, shown, 'enemy', shown.enemyIndex)}
          tooltipBelow
        />
      </div>
      <div
        key={`enemy-${shown.enemyIndex}`}
        className={`absolute top-[38%] left-[76%] -translate-x-1/2 -translate-y-1/2 transition-opacity duration-300 ${
          shown.enemyHp === 0 ? 'opacity-0' : 'animate-[dungeon-enter_400ms_ease-out]'
        }`}
      >
        <div className={hit('enemy') ? 'animate-[dungeon-hit_220ms_linear]' : ''}>
          <div
            className={
              enrage
                ? enrageAge < 900
                  ? 'animate-[dungeon-enrage_900ms_ease-out]'
                  : 'enraged'
                : ''
            }
          >
            <PokemonSprite
              speciesId={enemy.speciesId}
              formId={enemy.formId}
              shiny={enemy.isShiny}
              size={bossLast && shown.enemyIndex === setup.enemies.length - 1 ? 144 : 120}
            />
          </div>
        </div>
      </div>

      {/* Notre Pokémon, en bas à gauche, retourné pour regarder l'adversaire ; son encadré à droite. */}
      <div className="absolute right-3 bottom-3 sm:right-6">
        <FighterCard
          ctx={ctx}
          name={fighterName(ctx, player)}
          level={player.level}
          hp={playerHp}
          maxHp={player.maxHp}
          shiny={player.isShiny}
          status={shown.statuses[shown.active]}
          ability={player.ability}
          neutralizedBy={suppressorAbility(enemy)}
          statChanges={dungeonStatChanges(setup, shown, 'player', shown.active)}
        />
      </div>
      <div
        key={`player-${shown.active}`}
        className={`absolute top-[66%] left-[22%] -translate-x-1/2 -translate-y-1/2 transition-opacity duration-300 ${
          playerHp === 0 ? 'opacity-0' : 'animate-[dungeon-enter_300ms_ease-out]'
        }`}
      >
        <div className={hit('player') ? 'animate-[dungeon-hit_220ms_linear]' : ''}>
          <PokemonSprite
            speciesId={player.speciesId}
            formId={player.formId}
            shiny={player.isShiny}
            size={136}
            className="-scale-x-100"
          />
        </div>
      </div>
    </>
  );
}

/** Projectiles en vol et bulles (statuts, talents, dégâts, baies). */
function CombatEffects({ d }: { d: CombatModel }) {
  const { ctx, displayMs, inFlight, popups, statusPopups, abilityPopups, itemPopups } = d;
  return (
    <>
      {inFlight.map((e) => (
        <Projectile
          key={`${e.side}-${e.atMs}`}
          event={e}
          progress={1 - (e.atMs - displayMs) / TRAVEL_MS}
        />
      ))}
      {statusPopups.map((e, i) => (
        <StatusPopup key={`s-${e.side}-${e.atMs}-${i}`} event={e} age={displayMs - e.atMs} />
      ))}
      {abilityPopups.map((e, i) => (
        <AbilityPopup key={`a-${e.side}-${e.atMs}-${i}`} event={e} age={displayMs - e.atMs} />
      ))}
      {popups.map((e) => (
        <DamagePopup key={`${e.side}-${e.atMs}`} event={e} age={displayMs - e.atMs} />
      ))}
      {itemPopups.map((e, i) => (
        <ItemPopup key={`i-${e.atMs}-${i}`} ctx={ctx} event={e} age={displayMs - e.atMs} />
      ))}
    </>
  );
}

/** Baies de soin du sac : données au Pokémon actif. */
function HealItems({ d }: { d: CombatModel }) {
  const { ctx, healItems, canHeal, heal } = d;
  return (
    <>
      {healItems.length > 0 && (
        <div className="absolute bottom-3 left-3 z-10 flex gap-2 sm:left-6">
          {healItems.map(({ itemId, quantity, effect, cooldownLeft }) => (
            <button
              key={itemId}
              type="button"
              disabled={!canHeal || cooldownLeft > 0}
              onClick={() => heal(itemId, effect.fraction)}
              title={
                cooldownLeft > 0
                  ? `${itemName(ctx, itemId)} : de nouveau possible dans ${cooldownLeft} s`
                  : `${itemName(ctx, itemId)} : rend ${Math.round(effect.fraction * 100)} % de ses PV au Pokémon actif`
              }
              aria-label={`Donner une ${itemName(ctx, itemId)} (${quantity} restantes)`}
              className={`relative grid size-11 place-items-center transition enabled:hover:-translate-y-0.5 disabled:opacity-60 ${ARENA_LABEL}`}
            >
              <img
                src={itemIcon(ctx, itemId)}
                alt=""
                width={28}
                height={28}
                className="[image-rendering:pixelated]"
              />
              {cooldownLeft > 0 && (
                <span className="absolute inset-0 grid place-items-center bg-slate-900/70 font-pixel text-[10px] text-white">
                  {cooldownLeft}
                </span>
              )}
              <span className="absolute -top-2 -right-2 grid h-4 min-w-4 place-items-center rounded border-2 border-ink bg-brand-500 px-0.5 font-pixel text-[8px] leading-none text-white">
                {quantity}
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/** Issue du combat, affichée le temps que le résultat arrive. */
function OutcomeBanner({ d }: { d: CombatModel }) {
  const { outcome, over } = d;
  return (
    <>
      {over && outcome && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-slate-950/40 px-4">
          <p
            className={`flex animate-[dungeon-enter_400ms_ease-out] items-center gap-3 px-6 py-3 font-pixel text-xs uppercase sm:text-sm ${MESSAGE_BOX} ${
              outcome === 'win'
                ? 'text-emerald-700 dark:text-emerald-300'
                : outcome === 'fled'
                  ? ''
                  : 'text-red-600 dark:text-red-400'
            }`}
          >
            {OUTCOME_LABELS[outcome]}
            <span aria-hidden className="animate-blink text-[10px] text-brand-500">
              ▼
            </span>
          </p>
        </div>
      )}
    </>
  );
}
