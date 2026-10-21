import type { Dispatch, SetStateAction } from 'react';
import { STAT_NAMES, types } from '@poke/data';
import {
  computeStats,
  dungeonAttack,
  dungeonTypeEffectiveness,
  effectiveDungeonMove,
} from '@poke/game-core';
import type { DungeonFighter, DungeonMove, GameContext } from '@poke/game-core';
import type { PokemonDto } from '@poke/shared';
import { PokemonSprite, ShinyStar, StatLines, TypeBadge } from '../../components/ui';
import { STAT_LABELS } from '../../lib/labels';
import { pillClass } from './TeamPicker';

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
 * Ordre d'entrée de l'équipe et attaque de chaque Pokémon (un de ses types, physique ou
 * spéciale), avec son efficacité contre chaque adversaire de `targets`.
 */
export function CombatTeamOrder({
  ctx,
  members,
  moves,
  setMoves,
  setTeam,
  targets,
}: {
  ctx: GameContext;
  members: readonly PokemonDto[];
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
    <section className="mt-5">
      <h3 className="text-sm font-semibold">Ordre d’entrée et attaques</h3>
      <p className="text-xs text-slate-500">
        Le premier entre en combat ; quand un Pokémon est K.O., le suivant prend le relais. Chaque
        Pokémon attaque avec un de ses types, en physique (Attaque) ou en spécial (Atq. Spé.).
      </p>
      <ol className="mt-2 space-y-2">
        {members.map((p, i) => {
          const species = ctx.species(p.speciesId, p.formId)!;
          const stats = computeStats(species, p);
          const current = combatMove(ctx, p, moves);
          const setMove = (patch: Partial<DungeonMove>) =>
            setMoves((m) => ({ ...m, [p.id]: { ...current, ...patch } }));
          return (
            <li
              key={p.id}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-2 dark:border-slate-800"
            >
              <span className="w-5 text-center font-mono text-sm text-slate-400">{i + 1}</span>
              <PokemonSprite
                speciesId={p.speciesId}
                formId={p.formId}
                shiny={p.isShiny}
                size={40}
              />
              <span className="w-28 min-w-0 text-sm">
                <span className="block truncate font-medium">
                  {species.nameFr} {p.isShiny && <ShinyStar />}
                </span>
                <span className="text-xs text-slate-500">N.{p.level}</span>
              </span>
              <span className="flex flex-wrap items-center gap-1">
                {species.types.map((t) => {
                  const factors = targets.map((target) => ({
                    name: target.name,
                    e: dungeonTypeEffectiveness(t, target.types),
                  }));
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setMove({ type: t })}
                      title={`${dungeonAttack(ctx.balance.combat, t).name} : ${factors
                        .map((f) => `${effectivenessLabel(f.e)} contre ${f.name}`)
                        .join(', ')}`}
                      className={`flex items-center gap-1 rounded-full p-0.5 pr-1.5 text-[11px] transition ${
                        current.type === t
                          ? 'ring-2 ring-brand-500 ring-offset-1 dark:ring-offset-slate-900'
                          : 'opacity-50 hover:opacity-100'
                      }`}
                    >
                      <TypeBadge type={t} />
                      {factors.map((f, j) => (
                        <span key={j} className={`font-semibold ${effectivenessClass(f.e)}`}>
                          {effectivenessLabel(f.e)}
                        </span>
                      ))}
                    </button>
                  );
                })}
              </span>
              <span className="flex items-center gap-1 text-xs">
                <button
                  type="button"
                  className={pillClass(current.category === 'physical')}
                  onClick={() => setMove({ category: 'physical' })}
                  title={`${STAT_LABELS.attack} ${stats.attack}`}
                >
                  Physique {stats.attack}
                </button>
                <button
                  type="button"
                  className={pillClass(current.category === 'special')}
                  onClick={() => setMove({ category: 'special' })}
                  title={`${STAT_LABELS['special-attack']} ${stats['special-attack']}`}
                >
                  Spécial {stats['special-attack']}
                </button>
              </span>
              <span className="ml-auto flex gap-1">
                <button
                  type="button"
                  className="btn-ghost px-2 py-0.5"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  aria-label="Monter"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn-ghost px-2 py-0.5"
                  disabled={i === members.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label="Descendre"
                >
                  ↓
                </button>
              </span>
            </li>
          );
        })}
      </ol>
      {targets.length > 1 && (
        <p className="mt-1 text-xs text-slate-500">
          Efficacité de chaque type contre les Pokémon adverses, dans leur ordre d’entrée.
        </p>
      )}
    </section>
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
