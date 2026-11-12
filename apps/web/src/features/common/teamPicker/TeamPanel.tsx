/**
 * Colonne de l'équipe du choix d'équipe : ses cases (en combat, ordre d'entrée et attaques), ses
 * talents actifs et les conditions de départ.
 */
import { Reorder } from 'motion/react';
import type { AbilityEffect } from '@poke/content';
import { abilityEffectText, effectiveAbility, memberPower } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';
import type { PokemonDto } from '@poke/shared';
import { PokemonSprite, ShinyStar } from '../../../components/ui';
import { abilityLabel, speciesName } from '../../../lib/labels';
import { CombatTeamOrder } from '../CombatTeamOrder';
import {
  CrossIcon,
  ExpandableLine,
  PowerGauge,
  SECTION_TITLE,
  SLOT_BUTTON,
  SLOT_CLASS,
} from '../dialogParts';
import { SortableSlot, swapped, withOrder } from './SortableSlot';
import type { TeamPickerModel } from './useTeamPickerView';

/** L'équipe choisie, ses talents qui agissent ici et les conditions remplies ou non. */
export function TeamPanel({ v }: { v: TeamPickerModel }) {
  const {
    setTeam,
    members,
    ctx,
    zone,
    power,
    maxTeamSize,
    combat,
    view,
    remove,
    effectsOf,
    holders,
    met,
    failed,
    teamTitle,
  } = v;
  const ids = members.map((p) => p.id);
  const reorder = (order: readonly string[]) => setTeam((t) => withOrder(t, order));
  const moveBy = (index: number, delta: -1 | 1) => reorder(swapped(ids, index, delta));
  return (
    <aside
      className={`tile flex min-w-0 flex-col gap-2.5 p-3 lg:min-h-0 ${view === 'box' ? 'max-lg:hidden' : ''}`}
    >
      <div className="flex items-center gap-2">
        <h3 className={SECTION_TITLE}>
          {teamTitle} {members.length} / {maxTeamSize}
        </h3>
        <span
          className={`ml-auto text-sm font-bold whitespace-nowrap ${
            zone.minPower === 0
              ? 'text-slate-600 dark:text-slate-300'
              : power >= zone.minPower
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400'
          }`}
        >
          PE {power}
          {zone.minPower > 0 && ` / ${zone.minPower}`}
        </span>
      </div>
      {zone.minPower > 0 && <PowerGauge power={power} minPower={zone.minPower} />}
      {combat && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Le n° 1 entre en premier ; au K.O., le suivant prend le relais. Choisis l’attaque de
          chacun : un de ses types, physique ou spéciale.
        </p>
      )}
      <div className="flex flex-col gap-1.5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        <Reorder.Group
          as="ol"
          axis="y"
          values={ids}
          onReorder={reorder}
          className="flex flex-col gap-1.5"
        >
          {combat ? (
            <CombatTeamOrder
              ctx={ctx}
              members={members}
              effectsOf={effectsOf}
              moves={combat.moves}
              setMoves={combat.setMoves}
              setTeam={setTeam}
              targets={combat.targets}
              onMove={moveBy}
            />
          ) : (
            members.map((p, i) => (
              <TeamSlotRow
                key={p.id}
                ctx={ctx}
                pokemon={p}
                n={i + 1}
                effects={effectsOf(i)}
                onMove={(delta) => moveBy(i, delta)}
                onRemove={() => remove(p.id)}
              />
            ))
          )}
        </Reorder.Group>
        {members.length > 1 && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Glisse une case pour changer l’ordre.
          </p>
        )}
        <ol className="flex flex-col gap-1.5">
          {Array.from({ length: Math.max(0, maxTeamSize - members.length) }, (_, i) => (
            <FreeSlot key={`free-${i}`} n={members.length + i + 1} />
          ))}
        </ol>
      </div>
      {members.length > 0 && (
        <p className="text-sm font-semibold">
          {holders > 0 ? (
            <span className="text-emerald-700 dark:text-emerald-400">
              ✦ {holders} talent{holders > 1 ? 's' : ''} actif{holders > 1 ? 's' : ''}
              <span className="font-normal text-slate-500 dark:text-slate-400">
                {' '}
                · détail au survol des cases
              </span>
            </span>
          ) : (
            <span className="font-normal text-slate-500 dark:text-slate-400">
              Aucun talent de l’équipe n’agit ici.
            </span>
          )}
        </p>
      )}
      {(met.length > 0 || failed.length > 0) && (
        <div className="border-t-2 border-well-line pt-2.5">
          <h3 className={SECTION_TITLE}>Conditions</h3>
          <ul className="mt-1.5 space-y-1 text-sm">
            {met.map((m) => (
              <li key={m.key} className="flex items-start gap-2">
                <CheckMark ok />
                {m.text}
              </li>
            ))}
            {failed.map((e) => (
              <li
                key={e}
                className="flex items-start gap-2 font-medium text-red-600 dark:text-red-400"
              >
                <CheckMark ok={false} />
                {e}
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}

/** Case cochée (✓) ou non (✗) d'une condition de départ. */
function CheckMark({ ok }: { ok: boolean }) {
  return (
    <span
      aria-hidden
      className={`mt-px grid size-[18px] shrink-0 place-items-center rounded border-2 border-ink text-[11px] font-bold ${
        ok
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
          : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
      }`}
    >
      {ok ? '✓' : '✗'}
    </span>
  );
}

/** Case libre de l'équipe. */
function FreeSlot({ n }: { n: number }) {
  return (
    <li className="flex min-h-14 items-center gap-2 rounded-md border-2 border-dashed border-well-line px-1.5 text-sm text-slate-500 dark:text-slate-400">
      <span className="w-5 text-center font-pixel text-[10px]">{n}</span>
      Case libre : touche un Pokémon
    </li>
  );
}

/**
 * Case d'un membre de l'équipe (expédition) : numéro, sprite, niveau et PE, puis son talent avec
 * l'effet qu'il a ici (coupé, en entier au survol), la poignée pour changer l'ordre et le bouton
 * pour le retirer.
 */
function TeamSlotRow({
  ctx,
  pokemon: p,
  n,
  effects,
  onMove,
  onRemove,
}: {
  ctx: GameContext;
  pokemon: PokemonDto;
  n: number;
  /** Effets de son talent qui agissent ici. */
  effects: readonly AbilityEffect[];
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const name = speciesName(ctx, p.speciesId, p.formId);
  const ability = abilityLabel(effectiveAbility(ctx, p));
  const effectText = effects.map(abilityEffectText).join(' · ');
  return (
    <SortableSlot
      id={p.id}
      label={`${n}. ${name}`}
      onMove={onMove}
      className={`${SLOT_CLASS} grid min-h-14 grid-cols-[1.25rem_3.25rem_minmax(0,1fr)_auto_auto] items-center gap-2 p-1.5 ${
        effects.length > 0 ? 'border-emerald-500 dark:border-emerald-400' : 'border-well-line'
      }`}
    >
      {(grip) => (
        <>
          <span className="text-center font-pixel text-[10px] text-slate-500 dark:text-slate-400">
            {n}
          </span>
          <span className={`sprite-well size-13 ${p.isShiny ? 'shiny-well' : ''}`}>
            <PokemonSprite speciesId={p.speciesId} formId={p.formId} shiny={p.isShiny} size={48} />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold">
              {name} {p.isShiny && <ShinyStar />}{' '}
              <span className="font-normal text-slate-500 dark:text-slate-400">
                N.{p.level} · PE {memberPower(ctx, p)}
              </span>
            </span>
            {effects.length > 0 ? (
              <ExpandableLine
                className="text-xs text-emerald-700 dark:text-emerald-400"
                title={`${name} · ${ability} : ${effectText}`}
              >
                ✦ {ability} : {effectText}
              </ExpandableLine>
            ) : (
              <span className="truncate text-xs text-slate-500 dark:text-slate-400">
                {ability} · n’agit pas ici
              </span>
            )}
          </span>
          {grip}
          <button
            type="button"
            className={SLOT_BUTTON}
            onClick={onRemove}
            aria-label={`Retirer ${name}`}
          >
            <CrossIcon className="size-2.5" />
          </button>
        </>
      )}
    </SortableSlot>
  );
}
