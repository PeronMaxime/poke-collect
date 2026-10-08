import { getForm, getSpecies, speciesForms } from '@poke/data';
import type { FormKind } from '@poke/data';

/**
 * Formes (PokéAPI `varieties` et formes d'apparence) : elles se transmettent le long d'une lignée
 * par leur suffixe (Rattata d'Alola → Rattatac d'Alola, Lépidonille Toundra → Prismillon Toundra,
 * Goupix d'Alola en œuf).
 */

/**
 * Formes qui n'évoluent qu'en une forme de même suffixe : une forme régionale garde sa région, et
 * une Méga-Évolution, un Gigamax ou une forme de combat n'évolue pas (Pikachu Gigamax).
 */
const STRICT_KINDS: ReadonlySet<FormKind> = new Set([
  'regional',
  'mega',
  'primal',
  'gmax',
  'battle',
  'totem',
]);

/** Forme de même suffixe chez une autre espèce, ou null (forme par défaut). */
export function counterpartFormId(
  formId: number | null | undefined,
  toSpeciesId: number,
): number | null {
  const form = formId != null ? getForm(formId) : undefined;
  if (!form) return null;
  return speciesForms(toSpeciesId).find((f) => f.formName === form.formName)?.id ?? null;
}

/**
 * Évolution permise par la seule correspondance des suffixes : Miaouss de Galar n'évolue pas en
 * Persian (il évolue en Berserkatt, par une condition PokéAPI propre à sa forme).
 */
export function canEvolveInForm(formId: number | null | undefined, toSpeciesId: number): boolean {
  const form = formId != null ? getForm(formId) : undefined;
  return !form || !STRICT_KINDS.has(form.kind) || counterpartFormId(formId, toSpeciesId) !== null;
}

/**
 * Forme d'une espèce désignée par son nom PokéAPI `pokemon-form` (conditions d'évolution) :
 * identifiant de la forme, null pour la forme par défaut (`toxtricity-amped`), undefined si le nom
 * appartient à une autre espèce.
 */
export function formIdByName(speciesId: number, name: string): number | null | undefined {
  const form = speciesForms(speciesId).find((f) => f.name === name);
  if (form) return form.id;
  const species = getSpecies(speciesId);
  return species && (name === species.name || name.startsWith(`${species.name}-`))
    ? null
    : undefined;
}
