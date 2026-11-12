/**
 * Équipe du joueur sous l'arène : un appui envoie un Pokémon au combat.
 */
import { dungeonAttack, dungeonStatChanges } from '@poke/game-core';
import type { DungeonFighter } from '@poke/game-core';
import { PokemonSprite, ShinyStar, TypeBadge } from '../../../components/ui';
import { abilityLabel, errorText } from '../../../lib/labels';
import { Notice, StateTag } from '../../buildings/BuildingParts';
import { SECTION_TITLE, SELECTED_CELL, SLOT_CLASS } from '../dialogParts';
import { dungeonAbilityText, fighterName, suppressorAbility } from './texts';
import { HpBar, StatChanges } from './FighterCard';
import type { CombatModel } from './useDungeonCombat';

/** L'équipe, puis les erreurs des ordres envoyés (changement, baie, résultat, fuite). */
export function CombatTeam({ d }: { d: CombatModel }) {
  const { setup, switchMember, giveItem, claim, flee } = d;
  return (
    <div className="space-y-2 p-3 sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className={SECTION_TITLE}>Ton équipe</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Appuie sur un Pokémon pour l’envoyer au combat.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 min-[25rem]:grid-cols-2 sm:grid-cols-3">
        {setup.team.map((f, i) => (
          <TeamMember key={i} d={d} f={f} i={i} />
        ))}
      </div>
      {(switchMember.error || giveItem.error) && (
        <Notice tone="bad">{errorText(switchMember.error ?? giveItem.error)}</Notice>
      )}
      {(claim.error || flee.error) && (
        <Notice tone="bad">
          <span className="flex flex-wrap items-center gap-2">
            {errorText(claim.error ?? flee.error)}
            {claim.error && (
              <button className="btn-ghost px-2.5 py-1.5" onClick={() => claim.mutate()}>
                Réessayer
              </button>
            )}
          </span>
        </Notice>
      )}
    </div>
  );
}

/** Un membre de l'équipe : PV, attaque, talent ; grisé K.O., au combat ou tout juste rappelé. */
function TeamMember({ d, f, i }: { d: CombatModel; f: DungeonFighter; i: number }) {
  const { ctx, setup, shown, outcome, displayMs, enemy, send } = d;
  const hp = shown.hp[i] ?? 0;
  const isActive = shown.active === i;
  const ko = hp === 0;
  // Rappelé récemment : secondes avant qu'il puisse revenir.
  const recallLeft = Math.ceil(((shown.recallReadyAt[i] ?? 0) - displayMs) / 1000);
  const recalled = !ko && !isActive && recallLeft > 0;
  const attack = f.attackType ? dungeonAttack(setup.settings, f.attackType) : null;
  const neutralizedBy = isActive ? suppressorAbility(enemy) : null;
  return (
    <button
      key={i}
      type="button"
      disabled={ko || isActive || recalled || outcome !== null}
      onClick={() => send(i)}
      title={
        ko
          ? 'K.O.'
          : isActive
            ? 'Au combat'
            : recalled
              ? `Rappelé : de retour possible dans ${recallLeft} s`
              : 'Envoyer au combat'
      }
      className={`${SLOT_CLASS} relative flex items-start gap-2 p-1.5 text-left text-xs transition ${
        isActive
          ? SELECTED_CELL
          : ko
            ? 'border-well-line opacity-50 grayscale'
            : recalled
              ? 'border-well-line opacity-70'
              : 'border-well-line enabled:hover:border-slate-500 enabled:hover:bg-white dark:enabled:hover:border-slate-400 dark:enabled:hover:bg-slate-900'
      }`}
    >
      <span className="sprite-well relative size-12 shrink-0">
        <PokemonSprite
          speciesId={f.speciesId}
          formId={f.formId}
          shiny={f.isShiny}
          size={44}
          className="-scale-x-100"
        />
        {recalled && (
          <span className="absolute inset-0 grid place-items-center rounded-[3px] bg-slate-900/70 font-pixel text-[10px] text-white">
            {recallLeft}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1">
          <span className="min-w-0 truncate font-semibold">
            {fighterName(ctx, f)} {f.isShiny && <ShinyStar />}
          </span>
          {isActive && (
            <span className="ml-auto">
              <StateTag tone="ready">Au combat</StateTag>
            </span>
          )}
        </span>
        <HpBar hp={hp} max={f.maxHp} className="my-1" />
        <span className="flex items-center justify-between gap-1 text-[10px] text-slate-500 dark:text-slate-400">
          <span className="font-mono">{ko ? 'K.O.' : `${hp} / ${f.maxHp}`}</span>
          {f.attackType && (
            <span title={attack?.name}>
              <TypeBadge type={f.attackType} />
            </span>
          )}
        </span>
        <StatChanges changes={dungeonStatChanges(setup, shown, 'player', i)} className="mt-0.5" />
        {f.ability && (
          <span className="mt-0.5 block text-[10px] leading-snug text-slate-600 dark:text-slate-300">
            <span
              className={`font-semibold text-violet-700 dark:text-violet-300 ${
                neutralizedBy ? 'line-through opacity-60' : ''
              }`}
            >
              {abilityLabel(f.ability)}
            </span>{' '}
            : {dungeonAbilityText(ctx, f.ability)}
            {neutralizedBy && (
              <span className="text-red-600 dark:text-red-400">
                {' '}
                (neutralisé par {abilityLabel(neutralizedBy)})
              </span>
            )}
          </span>
        )}
      </span>
    </button>
  );
}
