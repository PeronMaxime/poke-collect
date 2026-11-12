/**
 * Ce qui s'anime au-dessus de l'arène : projectiles, dégâts, statuts, talents et baies.
 */
import { TYPE_COLORS } from '@poke/data';
import type { GameContext } from '@poke/game-core';
import { abilityLabel, itemIcon, itemName } from '../../../lib/labels';
import { ABILITY_POPUP_MS, POPUP_MS } from './events';
import type {
  DungeonAbilityEvent,
  DungeonAttackEvent,
  DungeonItemEvent,
  DungeonStatusEvent,
} from './events';
import {
  ABILITY_EFFECT_TEXTS,
  POPUP_BOX,
  TYPE_GLYPHS,
  effectivenessText,
  statusText,
} from './texts';

/** Projectile d'une attaque en vol : de l'attaquant vers le défenseur, en arc. */
export function Projectile({ event, progress }: { event: DungeonAttackEvent; progress: number }) {
  const fromPlayer = event.side === 'player';
  // Positions (en % de l'arène) des deux sprites.
  const [x0, y0, x1, y1] = fromPlayer ? [22, 66, 76, 38] : [76, 38, 22, 66];
  const x = x0 + (x1 - x0) * progress;
  const y = y0 + (y1 - y0) * progress - Math.sin(Math.PI * progress) * 12;
  const color = TYPE_COLORS[event.attackType] ?? '#888';
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute grid h-9 w-9 place-items-center rounded-full text-base"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        background: `radial-gradient(circle, #fff 0%, ${color} 55%, ${color}00 75%)`,
        boxShadow: `0 0 18px 6px ${color}aa`,
        transform: `translate(-50%, -50%) scale(${0.7 + progress * 0.5}) rotate(${progress * 360}deg)`,
      }}
    >
      {TYPE_GLYPHS[event.attackType] ?? '✦'}
    </span>
  );
}

/** Dégâts et efficacité qui s'envolent au-dessus du défenseur après l'impact. */
export function DamagePopup({ event, age }: { event: DungeonAttackEvent; age: number }) {
  const onEnemy = event.side === 'player';
  const t = age / POPUP_MS;
  const text = effectivenessText(event.effectiveness);
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute -translate-x-1/2 text-center font-bold whitespace-nowrap drop-shadow"
      style={{
        left: onEnemy ? '76%' : '22%',
        top: `calc(${onEnemy ? 10 : 34}% - ${t * 28}px)`,
        opacity: 1 - t * t,
        textShadow: '0 0 3px #fff, 0 0 3px #fff, 0 0 2px #fff',
      }}
    >
      <span
        className={`block font-pixel text-sm ${event.damage > 0 ? 'text-red-600' : 'text-slate-500'}`}
      >
        {event.damage > 0 ? `−${event.damage}` : '0'}
      </span>
      {event.critical && <span className="block text-[11px] text-red-600">Coup critique !</span>}
      {text && (
        <span
          className={`block text-[11px] ${event.effectiveness > 1 ? 'text-amber-600' : 'text-slate-600'}`}
        >
          {text}
        </span>
      )}
    </span>
  );
}
/** Statut infligé, sommeil, réveil ou dégâts de statut et de météo, au-dessus du Pokémon. */
export function StatusPopup({ event, age }: { event: DungeonStatusEvent; age: number }) {
  const onEnemy = event.side === 'enemy';
  const t = age / ABILITY_POPUP_MS;
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute -translate-x-1/2 text-center text-[11px] font-semibold whitespace-nowrap text-amber-700 dark:text-amber-300 ${POPUP_BOX}`}
      style={{
        left: onEnemy ? '76%' : '22%',
        top: `calc(${onEnemy ? 28 : 52}% - ${t * 16}px)`,
        opacity: 1 - t * t,
      }}
    >
      {statusText(event)}
    </span>
  );
}

/** Talent qui se déclenche : son nom et son effet, au-dessus du Pokémon qui l'a. */
export function AbilityPopup({ event, age }: { event: DungeonAbilityEvent; age: number }) {
  const onEnemy = event.side === 'enemy';
  const t = age / ABILITY_POPUP_MS;
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute -translate-x-1/2 text-center text-[11px] font-semibold whitespace-nowrap text-violet-700 dark:text-violet-300 ${POPUP_BOX}`}
      style={{
        left: onEnemy ? '76%' : '22%',
        top: `calc(${onEnemy ? 22 : 46}% - ${t * 16}px)`,
        opacity: 1 - t * t,
      }}
    >
      {abilityLabel(event.ability)} ·{' '}
      {ABILITY_EFFECT_TEXTS[event.effect](event.amount, event.stats ?? [])}
    </span>
  );
}
/** Baie donnée au Pokémon actif : PV rendus, au-dessus de lui. */
export function ItemPopup({
  ctx,
  event,
  age,
}: {
  ctx: GameContext;
  event: DungeonItemEvent;
  age: number;
}) {
  const t = age / ABILITY_POPUP_MS;
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute flex -translate-x-1/2 items-center gap-1 text-[11px] font-semibold whitespace-nowrap text-emerald-700 dark:text-emerald-300 ${POPUP_BOX}`}
      style={{ left: '22%', top: `calc(40% - ${t * 16}px)`, opacity: 1 - t * t }}
    >
      <img src={itemIcon(ctx, event.itemId)} alt="" width={18} height={18} />
      {itemName(ctx, event.itemId)} · +{event.amount} PV
    </span>
  );
}
