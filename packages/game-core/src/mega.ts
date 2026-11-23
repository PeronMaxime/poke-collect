import { getForm, speciesForms } from '@poke/data';
import type { FormKind, PokemonForm } from '@poke/data';
import type { GameContext } from './context';
import type { PokemonInstance } from './pokemon';

/**
 * Méga-Évolution et objets de forme au PC : le Pokémon tient une Méga-Gemme (effet
 * `megaEvolution`) ou un objet de forme (effet `formChange` : Orbe Bleu, Météorites…), retiré du
 * sac, et passe dans la forme de l'effet ; le lui retirer le rend à sa forme normale et rend
 * l'objet. Un seul Pokémon Méga-Évolué par équipe (expédition, combat, donjon) ; les autres
 * formes tenues (Primo-Résurgence…) n'entrent pas dans cette limite.
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

/**
 * Forme obtenue avec un objet de forme (effet `formChange`), ou undefined. Une forme Méga passe
 * par une Méga-Gemme et une forme régionale n'est pas une forme tenue : elles sont ignorées.
 */
export function formItemForm(ctx: GameContext, itemId: string): PokemonForm | undefined {
  const effect = ctx.itemEffect(itemId, 'formChange');
  const form = effect ? getForm(effect.formId) : undefined;
  return form && form.kind !== 'mega' && form.kind !== 'regional' ? form : undefined;
}

/** Forme que donne l'objet tenu : Méga-Gemme ou objet de forme ; undefined pour tout autre objet. */
export function heldItemForm(ctx: GameContext, itemId: string): PokemonForm | undefined {
  return megaStoneForm(ctx, itemId) ?? formItemForm(ctx, itemId);
}

/** Formes qui prennent le talent de la forme tant que l'objet est tenu (comme dans la série). */
const FORM_ABILITY_KINDS: ReadonlySet<FormKind> = new Set(['mega', 'primal']);

/**
 * La forme impose-t-elle son talent (Méga-Évolution, Primo-Résurgence : Mer Primaire…) ? Les
 * autres formes (Deoxys Attaque…) gardent le talent du Pokémon.
 */
export function usesFormAbility(form: Pick<PokemonForm, 'kind'> | null | undefined): boolean {
  return !!form && FORM_ABILITY_KINDS.has(form.kind);
}

/** Une forme tenue possible d'une espèce, et les objets qui y mènent. */
export interface HeldFormOption {
  form: PokemonForm;
  /** Objets qui donnent cette forme (en général un seul). */
  itemIds: string[];
}

/** Formes d'une espèce que donne un objet du contenu, selon la règle `formOf`. */
function heldFormOptions(
  ctx: GameContext,
  speciesId: number,
  formOf: (ctx: GameContext, itemId: string) => PokemonForm | undefined,
): HeldFormOption[] {
  return speciesForms(speciesId)
    .map((form) => ({
      form,
      itemIds: ctx.content.items.filter((i) => formOf(ctx, i.id)?.id === form.id).map((i) => i.id),
    }))
    .filter((o) => o.itemIds.length > 0);
}

/** Méga-Évolutions possibles d'une espèce : ses formes Méga qui ont une gemme dans le contenu. */
export function megaOptions(ctx: GameContext, speciesId: number): HeldFormOption[] {
  return heldFormOptions(ctx, speciesId, megaStoneForm);
}

/** Formes d'une espèce qu'un objet de forme du contenu donne (Primo-Kyogre, Deoxys Attaque…). */
export function formItemOptions(ctx: GameContext, speciesId: number): HeldFormOption[] {
  return heldFormOptions(ctx, speciesId, formItemForm);
}

/** Refus d'une Méga-Évolution ou d'un objet de forme, ou du retrait de l'objet tenu. */
export type MegaError = 'NOT_A_MEGA_STONE' | 'WRONG_MEGA_STONE' | 'ALREADY_MEGA' | 'NOT_MEGA';

/**
 * Objet tenu par un Pokémon (Méga-Gemme ou objet de forme) : la forme qu'il prend, ou l'erreur.
 * Seule la forme normale de l'espèce peut le tenir (pas une forme régionale ni une autre forme
 * tenue) ; `megaStone` est l'objet qu'il tient déjà.
 */
export function checkHeldItemForm(
  ctx: GameContext,
  pokemon: Pick<PokemonInstance, 'speciesId' | 'formId'> & { megaStone: string | null },
  itemId: string,
): { form: PokemonForm } | { error: MegaError } {
  if (pokemon.megaStone !== null || isMegaForm(pokemon.formId)) return { error: 'ALREADY_MEGA' };
  const form = heldItemForm(ctx, itemId);
  if (!form) return { error: 'NOT_A_MEGA_STONE' };
  if (form.speciesId !== pokemon.speciesId || pokemon.formId != null) {
    return { error: 'WRONG_MEGA_STONE' };
  }
  return { form };
}
