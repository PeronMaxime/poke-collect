/**
 * Petites pièces de la fenêtre de dépôt à la pension : libellés, pastille de compatibilité, case
 * d'un parent.
 */
import type { ReactNode } from 'react';
import { eggGroups } from '@poke/data';
import type { BreedingError, GameContext } from '@poke/game-core';
import type { DaycareDto, PokemonDto } from '@poke/shared';
import { IvHover, PokemonSprite, ShinyStar } from '../../../components/ui';
import { speciesName } from '../../../lib/labels';
import { AbilityLine } from '../../buildings/AssistantCard';
import { SLOT_CLASS } from '../../common/dialogParts';

/** Symbole du sexe d'un Pokémon ; rien pour un asexué. */
export const GENDER_LABELS = { male: '♂', female: '♀', genderless: '' } as const;

const EGG_GROUP_NAMES = new Map(eggGroups.map((g) => [g.name, g.nameFr]));
/** Nom français d'un groupe d'œufs. */
export const eggGroupName = (name: string) => EGG_GROUP_NAMES.get(name) ?? name;
/** Phrase affichée pour une raison qui empêche un couple d'avoir un œuf. */
export function breedingErrorText(ctx: GameContext, e: BreedingError): string {
  switch (e.code) {
    case 'SAME_POKEMON':
      return 'Choisis deux Pokémon différents.';
    case 'NOT_BREEDABLE':
      return `${speciesName(ctx, e.speciesId)} ne peut pas avoir d’œuf.`;
    case 'TWO_DITTOS':
      return 'Deux Métamorph ne peuvent pas avoir d’œuf ensemble.';
    case 'NO_COMMON_EGG_GROUP':
      return 'Aucun groupe d’œufs en commun.';
    case 'INCOMPATIBLE_GENDERS':
      return 'Il faut un mâle et une femelle (ou un Métamorph).';
  }
}
/** Objet tenu d'un parent de la pension (0 : parent A, 1 : parent B). */
export const heldOf = (pension: DaycareDto | undefined, side: 0 | 1) =>
  pension ? (side === 0 ? pension.heldItemAId : pension.heldItemBId) : null;
/** Pastille verte (un œuf) d'un Pokémon compatible avec le partenaire. */
export function CompatMark({ className = 'size-5' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`grid place-items-center rounded border-2 border-ink bg-emerald-400 ${className}`}
    >
      <svg viewBox="0 0 10 10" className="size-2.5">
        <ellipse cx="5" cy="5.4" rx="3.2" ry="4" fill="#10203a" />
      </svg>
    </span>
  );
}

/**
 * Case d'un parent dans la colonne de la pension : le Pokémon (ou la place libre), puis `children`.
 */
export function ParentSlot({
  ctx,
  pokemon: p,
  label,
  children,
}: {
  ctx: GameContext;
  pokemon: PokemonDto | undefined;
  label: string;
  children?: ReactNode;
}) {
  const name = (q: PokemonDto) => speciesName(ctx, q.speciesId, q.formId);
  return (
    <div
      className={`${SLOT_CLASS} ${p ? 'border-well-line' : 'border-dashed border-well-line'} flex flex-col gap-2 p-2`}
    >
      <h4 className="pixel-label text-[8px] text-slate-500 uppercase dark:text-slate-400">
        {label}
      </h4>
      <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-2">
        {p ? (
          <IvHover ivs={p.ivs}>
            <span className={`sprite-well size-13 ${p.isShiny ? 'shiny-well' : ''}`}>
              <PokemonSprite
                speciesId={p.speciesId}
                formId={p.formId}
                shiny={p.isShiny}
                size={48}
              />
            </span>
          </IvHover>
        ) : (
          <span className="grid size-13 place-items-center rounded-md border-2 border-dashed border-well-line font-pixel text-[10px] text-slate-500 dark:text-slate-400">
            ?
          </span>
        )}
        <span className="flex min-w-0 flex-col">
          {p ? (
            <>
              <span className="truncate text-sm font-semibold">
                {name(p)} {GENDER_LABELS[p.gender]} {p.isShiny && <ShinyStar />}{' '}
                <span className="font-normal text-slate-500 dark:text-slate-400">N.{p.level}</span>
              </span>
              <span className="truncate text-xs text-slate-500 dark:text-slate-400">
                {ctx.species(p.speciesId, p.formId)!.eggGroups.map(eggGroupName).join(' · ')}
              </span>
              <AbilityLine ctx={ctx} p={p} activities={['breeding']} />
            </>
          ) : (
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {label === 'Partenaire' ? 'Place libre' : 'Case libre : touche un Pokémon'}
            </span>
          )}
        </span>
      </div>
      {children}
    </div>
  );
}
