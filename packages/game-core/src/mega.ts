import { getForm, speciesForms } from '@poke/data';
import type { PokemonForm } from '@poke/data';
import type { GameContext } from './context';
import type { PokemonInstance } from './pokemon';

/**
 * Méga-Évolution au PC : le Pokémon tient une Méga-Gemme (retirée du sac) et passe dans la forme
 * Méga de l'effet `megaEvolution` de la gemme ; la lui retirer le rend à sa forme normale et rend
 * la gemme. Un seul Pokémon Méga-Évolué par équipe (expédition, combat, donjon).
 */

/** Forme Méga (Méga-Dracaufeu X…). */
export function isMegaForm(formId: number | null | undefined): boolean {
  return formId != null && getForm(formId)?.kind === 'mega';
}

/** Nombre de Pokémon Méga-Évolués dans une équipe. */
export function megaCount(team: readonly Pick<PokemonInstance, 'formId'>[]): number {
  return team.filter((m) => isMegaForm(m.formId)).length;
}

/** Une équipe ne peut compter qu'un seul Pokémon Méga-Évolué. */
export const MAX_MEGAS_PER_TEAM = 1;

/** Forme Méga obtenue avec une gemme, ou undefined si l'objet n'est pas une Méga-Gemme. */
export function megaStoneForm(ctx: GameContext, itemId: string): PokemonForm | undefined {
  const effect = ctx.itemEffect(itemId, 'megaEvolution');
  const form = effect ? getForm(effect.formId) : undefined;
  return form?.kind === 'mega' ? form : undefined;
}

export interface MegaOption {
  form: PokemonForm;
  /** Méga-Gemmes qui donnent cette forme (en général une seule). */
  itemIds: string[];
}

/** Méga-Évolutions possibles d'une espèce : ses formes Méga qui ont une gemme dans le contenu. */
export function megaOptions(ctx: GameContext, speciesId: number): MegaOption[] {
  return speciesForms(speciesId)
    .filter((f) => f.kind === 'mega')
    .map((form) => ({
      form,
      itemIds: ctx.content.items
        .filter((i) => megaStoneForm(ctx, i.id)?.id === form.id)
        .map((i) => i.id),
    }))
    .filter((o) => o.itemIds.length > 0);
}

export type MegaError = 'NOT_A_MEGA_STONE' | 'WRONG_MEGA_STONE' | 'ALREADY_MEGA' | 'NOT_MEGA';

/**
 * Méga-Évolution d'un Pokémon avec une gemme : la forme Méga, ou l'erreur. Seule la forme normale
 * de l'espèce peut Méga-Évoluer (pas une forme régionale).
 */
export function checkMegaEvolution(
  ctx: GameContext,
  pokemon: Pick<PokemonInstance, 'speciesId' | 'formId'> & { megaStone: string | null },
  itemId: string,
): { form: PokemonForm } | { error: MegaError } {
  if (pokemon.megaStone !== null || isMegaForm(pokemon.formId)) return { error: 'ALREADY_MEGA' };
  const form = megaStoneForm(ctx, itemId);
  if (!form) return { error: 'NOT_A_MEGA_STONE' };
  if (form.speciesId !== pokemon.speciesId || pokemon.formId != null) {
    return { error: 'WRONG_MEGA_STONE' };
  }
  return { form };
}
