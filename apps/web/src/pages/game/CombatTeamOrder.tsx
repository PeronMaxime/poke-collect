import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { AbilityEffect } from '@poke/content';
import { STAT_NAMES, types } from '@poke/data';
import {
  abilityEffectText,
  computeStats,
  dungeonAttack,
  dungeonTypeEffectiveness,
  effectiveAbility,
  effectiveDungeonMove,
} from '@poke/game-core';
import type { DungeonFighter, DungeonMove, GameContext } from '@poke/game-core';
import type { PokemonDto } from '@poke/shared';
import { HoverBubble, PokemonSprite, ShinyStar, StatLines, TypeBadge } from '../../components/ui';
import { STAT_LABELS, abilityLabel, speciesName } from '../../lib/labels';
import { CrossIcon, ExpandableLine, SELECTED_CELL, SLOT_BUTTON, SLOT_CLASS } from './dialogParts';

/** Multiplicateur lisible (×2, ×½, ×¼, ×⅛…). */
export function effectivenessLabel(e: number): string {
  if (e === 0.5) return '×½';
  if (e === 0.25) return '×¼';
  if (e === 0.125) return '×⅛';
  if (e < 0.125) return `×1/${Math.round(1 / e)}`;
  return `×${e}`;
}

export const effectivenessClass = (e: number) =>
  e > 1 ? 'text-emerald-600' : e < 1 ? 'text-red-600' : 'text-slate-500';

/** Types techniques des données, qui ne sont pas des types d'attaque. */
const NON_POKEMON_TYPES = new Set(['stellar', 'unknown', 'shadow']);

/** Types d'attaque regroupés par efficacité contre `defenderTypes` (une immunité comptant ×¼). */
export function matchups(defenderTypes: readonly string[]) {
  const byFactor = new Map<number, string[]>();
  for (const { name } of types) {
    const e = dungeonTypeEffectiveness(name, defenderTypes);
    if (e !== 1 && !NON_POKEMON_TYPES.has(name)) {
      byFactor.set(e, [...(byFactor.get(e) ?? []), name]);
    }
  }
  return [...byFactor.entries()].sort(([a], [b]) => b - a);
}

/** Adversaire contre lequel l'efficacité des attaques est affichée. */
export interface CombatTarget {
  name: string;
  types: readonly string[];
}

/** Attaque choisie pour un Pokémon : celle du joueur, sinon celle mémorisée, sinon par défaut. */
export function combatMove(
  ctx: GameContext,
  p: PokemonDto,
  moves: Readonly<Record<string, DungeonMove>>,
): DungeonMove {
  const species = ctx.species(p.speciesId, p.formId)!;
  return effectiveDungeonMove(species, p, moves[p.id] ?? p.dungeonMove);
}

/**
 * Cases de l'équipe d'un combat, dans son ordre d'entrée : chaque Pokémon avec son talent (et son
 * effet ici), ses flèches pour changer l'ordre, le retrait, puis son attaque (un de ses types, avec
 * son efficacité contre chaque adversaire de `targets`, en physique ou en spécial).
 * Rend des `<li>`, à poser dans la liste de l'équipe.
 */
export function CombatTeamOrder({
  ctx,
  members,
  effectsOf,
  moves,
  setMoves,
  setTeam,
  targets,
}: {
  ctx: GameContext;
  members: readonly PokemonDto[];
  /** Effets des talents qui agissent ici, par rang dans l'équipe. */
  effectsOf: (index: number) => readonly AbilityEffect[];
  moves: Readonly<Record<string, DungeonMove>>;
  setMoves: Dispatch<SetStateAction<Record<string, DungeonMove>>>;
  setTeam: Dispatch<SetStateAction<string[]>>;
  targets: readonly CombatTarget[];
}) {
  function move(index: number, delta: number) {
    setTeam((t) => {
      const next = [...t];
      const target = index + delta;
      if (target < 0 || target >= next.length) return t;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  return (
    <>
      {members.map((p, i) => {
        const species = ctx.species(p.speciesId, p.formId)!;
        const stats = computeStats(species, p);
        const current = combatMove(ctx, p, moves);
        const setMove = (patch: Partial<DungeonMove>) =>
          setMoves((m) => ({ ...m, [p.id]: { ...current, ...patch } }));
        const effects = effectsOf(i);
        const ability = abilityLabel(effectiveAbility(ctx, p));
        const effectText = effects.map(abilityEffectText).join(' · ');
        return (
          <li
            key={p.id}
            className={`${SLOT_CLASS} flex flex-col gap-2 p-2 ${
              effects.length > 0 ? 'border-emerald-500 dark:border-emerald-400' : 'border-well-line'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-center font-pixel text-[10px] text-slate-500 dark:text-slate-400">
                {i + 1}
              </span>
              <span className={`sprite-well size-12 shrink-0 ${p.isShiny ? 'shiny-well' : ''}`}>
                <PokemonSprite
                  speciesId={p.speciesId}
                  formId={p.formId}
                  shiny={p.isShiny}
                  size={44}
                />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold">
                  {species.nameFr} {p.isShiny && <ShinyStar />}{' '}
                  <span className="font-normal text-slate-500 dark:text-slate-400">
                    N.{p.level}
                  </span>
                </span>
                {effects.length > 0 ? (
                  <ExpandableLine
                    className="text-xs text-emerald-700 dark:text-emerald-400"
                    title={`${species.nameFr} · ${ability} : ${effectText}`}
                  >
                    ✦ {ability} : {effectText}
                  </ExpandableLine>
                ) : (
                  <span className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {ability}
                  </span>
                )}
              </span>
              <button
                type="button"
                className={SLOT_BUTTON}
                disabled={i === 0}
                onClick={() => move(i, -1)}
                aria-label={`Monter ${species.nameFr}`}
              >
                <svg viewBox="0 0 10 10" className="size-2.5" aria-hidden>
                  <path d="M5 2L9 7H1z" fill="currentColor" />
                </svg>
              </button>
              <button
                type="button"
                className={SLOT_BUTTON}
                disabled={i === members.length - 1}
                onClick={() => move(i, 1)}
                aria-label={`Descendre ${species.nameFr}`}
              >
                <svg viewBox="0 0 10 10" className="size-2.5" aria-hidden>
                  <path d="M5 8L1 3h8z" fill="currentColor" />
                </svg>
              </button>
              <button
                type="button"
                className={`${SLOT_BUTTON} hover:border-red-500 hover:text-red-600 dark:hover:text-red-400`}
                onClick={() => setTeam((t) => t.filter((id) => id !== p.id))}
                aria-label={`Retirer ${species.nameFr}`}
              >
                <CrossIcon className="size-2.5" />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pl-7">
              {species.types.map((t) => {
                const factors = targets.map((target) => ({
                  name: target.name,
                  e: dungeonTypeEffectiveness(t, target.types),
                }));
                const on = current.type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setMove({ type: t })}
                    aria-pressed={on}
                    title={`${dungeonAttack(ctx.balance.combat, t).name} : ${factors
                      .map((f) => `${effectivenessLabel(f.e)} contre ${f.name}`)
                      .join(', ')}`}
                    className={`flex items-center gap-1 rounded-md border-2 p-0.5 pr-1.5 text-[11px] transition ${
                      on ? SELECTED_CELL : 'border-transparent opacity-60 hover:opacity-100'
                    }`}
                  >
                    <TypeBadge type={t} />
                    {factors.map((f, j) => (
                      <span key={j} className={`font-bold ${effectivenessClass(f.e)}`}>
                        {effectivenessLabel(f.e)}
                      </span>
                    ))}
                  </button>
                );
              })}
              <span
                role="group"
                aria-label="Catégorie de l’attaque"
                className="ml-auto inline-flex overflow-hidden rounded-md border-2 border-ink text-xs"
              >
                {(['physical', 'special'] as const).map((category) => {
                  const on = current.category === category;
                  const statName = category === 'physical' ? 'attack' : 'special-attack';
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setMove({ category })}
                      aria-pressed={on}
                      title={`${STAT_LABELS[statName]} ${stats[statName]}`}
                      className={`px-2 py-1 whitespace-nowrap not-first:border-l-2 not-first:border-ink ${
                        on
                          ? 'bg-[#48a8e8] font-bold text-[#10203a]'
                          : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                      }`}
                    >
                      {category === 'physical' ? 'Phys.' : 'Spé.'} {stats[statName]}
                    </button>
                  );
                })}
              </span>
            </div>
          </li>
        );
      })}
    </>
  );
}

/** Adversaire montré dans l'en-tête du choix de l'équipe. */
export interface CombatFoe {
  speciesId: number;
  formId?: number | null;
  level: number;
  types: readonly string[];
  /** Fiche au survol (statistiques, faiblesses…). */
  info?: ReactNode;
  /** Boss d'un donjon : marqué d'une couronne. */
  boss?: boolean;
}

/**
 * Pokémon adverses, dans leur ordre d'entrée, avec leurs types : restent visibles pendant le
 * choix de l'équipe. Au-delà de trois, seuls les sprites et niveaux restent (fiche au survol).
 */
export function CombatFoes({ ctx, foes }: { ctx: GameContext; foes: readonly CombatFoe[] }) {
  const compact = foes.length > 3;
  return (
    <ol className="flex flex-wrap items-center gap-1.5" aria-label="Pokémon adverses">
      {foes.map((f, i) => {
        const name = speciesName(ctx, f.speciesId, f.formId);
        const card = (
          <span className="flex items-center gap-1.5 rounded-md border-2 border-ink bg-win p-0.5 pr-2">
            <span className="sprite-well size-10">
              <PokemonSprite speciesId={f.speciesId} formId={f.formId} size={36} alt={name} />
            </span>
            <span className="flex flex-col gap-0.5 text-xs">
              <span className="font-semibold whitespace-nowrap">
                {f.boss && '👑 '}
                {!compact && `${name} `}
                <span className="font-normal text-slate-500 dark:text-slate-400">N.{f.level}</span>
              </span>
              {!compact && (
                <span className="flex gap-0.5">
                  {f.types.map((t) => (
                    <TypeBadge key={t} type={t} />
                  ))}
                </span>
              )}
            </span>
          </span>
        );
        return (
          <li key={i}>
            {f.info ? (
              <HoverBubble width={232} height={420} content={f.info}>
                {card}
              </HoverBubble>
            ) : (
              card
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Fiche d'un adversaire au survol : statistiques, faiblesses et résistances, attaque. */
export function EnemyInfo({ fighter, note }: { fighter: DungeonFighter; note?: string | null }) {
  const stats = { ...fighter.stats, hp: fighter.maxHp };
  const total = STAT_NAMES.reduce((sum, s) => sum + stats[s], 0);
  const special = fighter.category === 'special';
  return (
    <span className="grid gap-2">
      <span>
        <span className="mb-0.5 block font-semibold">Statistiques</span>
        <StatLines values={stats} total={total} />
        {note && <span className="block text-[10px] text-slate-500">{note}</span>}
      </span>
      <span>
        <span className="mb-0.5 block font-semibold">Faiblesses et résistances</span>
        {matchups(fighter.types).map(([e, list]) => (
          <span key={e} className="mb-0.5 flex items-start gap-1">
            <span className={`w-6 shrink-0 font-semibold ${effectivenessClass(e)}`}>
              {effectivenessLabel(e)}
            </span>
            <span className="flex flex-wrap gap-0.5">
              {list.map((t) => (
                <TypeBadge key={t} type={t} />
              ))}
            </span>
          </span>
        ))}
      </span>
      <span>
        <span className="mb-0.5 block font-semibold">Attaque</span>
        <span className="block">
          {special ? 'Spéciale' : 'Physique'} ({STAT_LABELS[special ? 'special-attack' : 'attack']}{' '}
          {stats[special ? 'special-attack' : 'attack']})
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-0.5">
          {fighter.types.map((t) => (
            <TypeBadge key={t} type={t} />
          ))}
        </span>
        <span className="block text-[10px] text-slate-500">
          {fighter.types.length > 1
            ? 'Choisit le plus efficace de ses types contre le Pokémon en face.'
            : 'Attaque toujours de son type.'}
        </span>
      </span>
    </span>
  );
}
