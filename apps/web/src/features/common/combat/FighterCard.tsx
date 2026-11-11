/**
 * Encadré d'un combattant : nom, niveau, PV, statut, talent et variations de statistiques.
 */
import { STATUS_LABELS } from '@poke/game-core';
import type { DungeonStat, Status } from '@poke/content';
import type { GameContext } from '@poke/game-core';
import { ShinyStar } from '../../../components/ui';
import { abilityLabel } from '../../../lib/labels';
import { DUNGEON_STAT_SHORT, STATUS_BADGES, STATUS_COLORS, dungeonAbilityText } from './texts';

/** Barre de PV : verte, puis orange sous la moitié, rouge sous un cinquième. */
export function HpBar({
  hp,
  max,
  className = '',
}: {
  hp: number;
  max: number;
  className?: string;
}) {
  const ratio = max > 0 ? hp / max : 0;
  const color = ratio > 0.5 ? 'bg-emerald-500' : ratio > 0.2 ? 'bg-amber-400' : 'bg-red-500';
  return (
    <div className={`h-3 overflow-hidden rounded-sm border-2 border-ink bg-track ${className}`}>
      <div
        className={`h-full transition-[width] duration-200 ${color}`}
        style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%` }}
      />
    </div>
  );
}

/** Variations de statistiques d'un combattant : hausses en vert, baisses en rouge. */
export function StatChanges({
  changes,
  className = '',
}: {
  changes: Partial<Record<DungeonStat, number>>;
  className?: string;
}) {
  const entries = Object.entries(changes) as [DungeonStat, number][];
  if (entries.length === 0) return null;
  return (
    <span
      className={`flex flex-wrap gap-x-1.5 text-[10px] leading-tight font-semibold ${className}`}
    >
      {entries.map(([stat, percent]) => (
        <span
          key={stat}
          className={
            percent > 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-red-600 dark:text-red-400'
          }
        >
          {DUNGEON_STAT_SHORT[stat]}
          {percent > 0 ? '+' : '−'}
          {Math.abs(percent)} %
        </span>
      ))}
    </span>
  );
}

/**
 * Talent d'un combattant, expliqué au survol : bulle au-dessus (calée à droite) ou, avec
 * `below`, en dessous (calée à gauche), pour rester dans l'arène.
 */
function AbilityTag({
  ctx,
  ability,
  neutralizedBy,
  below = false,
}: {
  ctx: GameContext;
  ability: string;
  /** Talent du Pokémon en face qui neutralise celui-ci (Gaz Inhibiteur, Brise Moule…). */
  neutralizedBy: string | null;
  below?: boolean;
}) {
  return (
    <span className="group flex min-w-0" tabIndex={0}>
      <span
        className={`cursor-help truncate text-[10px] font-semibold text-violet-700 underline decoration-dotted dark:text-violet-300 ${
          neutralizedBy ? 'line-through opacity-60' : ''
        }`}
      >
        {abilityLabel(ability)}
      </span>
      <span
        className={`pointer-events-none invisible absolute z-20 w-max max-w-[16rem] rounded-md border-2 border-ink bg-win px-2 py-1 text-[11px] font-normal text-slate-700 opacity-0 shadow-[3px_3px_0_rgb(0_0_0/0.25)] transition group-hover:visible group-hover:opacity-100 group-focus:visible group-focus:opacity-100 dark:text-slate-200 ${
          below ? 'top-full left-0 mt-1' : 'right-0 bottom-full mb-1'
        }`}
      >
        <span className="block font-semibold text-violet-700 dark:text-violet-300">
          {abilityLabel(ability)}
        </span>
        {dungeonAbilityText(ctx, ability)}
        {neutralizedBy && (
          <span className="mt-0.5 block text-red-600 dark:text-red-400">
            Neutralisé par {abilityLabel(neutralizedBy)}, le talent du Pokémon en face
          </span>
        )}
      </span>
    </span>
  );
}
/** Encadré de nom, talent, variations de statistiques, niveau et PV d'un combattant. */
export function FighterCard({
  ctx,
  name,
  level,
  hp,
  maxHp,
  shiny,
  status,
  ability,
  neutralizedBy = null,
  statChanges,
  tooltipBelow,
}: {
  ctx: GameContext;
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  shiny?: boolean;
  status?: Status | null;
  ability?: string | null;
  neutralizedBy?: string | null;
  statChanges: Partial<Record<DungeonStat, number>>;
  tooltipBelow?: boolean;
}) {
  return (
    <div className="relative w-44 rounded-md border-[3px] border-ink bg-win px-2 py-1 text-xs shadow-[3px_3px_0_rgb(0_0_0/0.25)] sm:w-52">
      <div className="flex items-center justify-between gap-1">
        <span className="flex min-w-0 items-center gap-1">
          <span className="truncate font-semibold">{name}</span>
          {shiny && <ShinyStar />}
          {status && (
            <span
              title={STATUS_LABELS[status]}
              className={`pixel-label shrink-0 rounded-sm border border-ink px-0.5 text-[8px] leading-tight ${STATUS_COLORS[status]}`}
            >
              {STATUS_BADGES[status]}
            </span>
          )}
        </span>
        <span className="pixel-label shrink-0 text-[9px] text-slate-600 dark:text-slate-300">
          N.{level}
        </span>
      </div>
      {(ability || Object.keys(statChanges).length > 0) && (
        <div className="flex min-w-0 items-baseline gap-x-1.5">
          {ability && (
            <AbilityTag
              ctx={ctx}
              ability={ability}
              neutralizedBy={neutralizedBy}
              below={tooltipBelow}
            />
          )}
          <StatChanges changes={statChanges} />
        </div>
      )}
      <div className="mt-1 flex items-center gap-1">
        <span className="pixel-label rounded-sm bg-hud px-1 text-[8px] leading-[1.4] text-[#f8d030]">
          PV
        </span>
        <HpBar hp={hp} max={maxHp} className="flex-1" />
      </div>
      <p className="mt-0.5 text-right font-mono text-[10px] leading-tight text-slate-500 dark:text-slate-400">
        {hp} / {maxHp}
      </p>
    </div>
  );
}
