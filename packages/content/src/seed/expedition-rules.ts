import { evolutionChains, getSpecies, species } from '@poke/data';
import type { EvolutionDetail, EvolutionNode } from '@poke/data';
import type { Zone } from '../schemas';

/**
 * Règles des Pokémon évolués en expédition, que suit le contenu de test de chaque région écrite à
 * la main (Kanto, Johto, Hoenn, puis les suivantes) : évoluer ses Pokémon doit rester nécessaire
 * pour remplir le Pokédex. `seed.test.ts` les vérifie ; une nouvelle région s'écrit en les
 * respectant (voir « Ajouter une région » dans docs/RECETTES.md).
 *
 * - aucun troisième stade d'une lignée (0143) ;
 * - aucun Pokémon qui ne s'obtient qu'en évoluant avec un objet : pierre, objet tenu, échange,
 *   remplacé par le Câble Link (0142) ;
 * - une forme finale dans une seule zone de la région, une forme intermédiaire dans deux au plus
 *   (0145, 0146) ;
 * - et, non vérifiable ici, des poids bas : environ la moitié de ce qu'aurait la forme de base,
 *   2 au moins ; une partie des formes finales n'apparaît nulle part.
 *
 * Les bébés ne comptent pas comme un stade : Ronflex, Lippoutou ou Éoko, évolutions d'un bébé, se
 * traitent comme des formes de base. Seules les rencontres sans forme sont contrôlées : les Méga,
 * Gigamax, Zarbi et formes régionales ne s'obtiennent pas en évoluant ou suivent leurs propres
 * règles.
 */

/** Zones d'une région où peut apparaître une forme finale. */
const MAX_ZONES_FINAL_FORM = 1;
/** Zones d'une région où peut apparaître une forme intermédiaire. */
const MAX_ZONES_MIDDLE_FORM = 2;

/**
 * Écarts acceptés à la règle des zones, choisis par l'utilisateur dans l'admin (23 nov. 2026) :
 * espèce et région, avec le nombre de zones toléré. Ne pas en ajouter sans qu'il le demande.
 */
export const EXPEDITION_RULE_EXCEPTIONS: { regionId: string; speciesId: number; zones: number }[] =
  [
    { regionId: 'kanto', speciesId: 17, zones: 4 }, // Roucoups
    { regionId: 'kanto', speciesId: 67, zones: 3 }, // Machopeur
    { regionId: 'johto', speciesId: 20, zones: 2 }, // Rattatac
    { regionId: 'johto', speciesId: 22, zones: 2 }, // Rapasdepic
    { regionId: 'johto', speciesId: 73, zones: 2 }, // Tentacruel
    { regionId: 'johto', speciesId: 87, zones: 2 }, // Lamantine
  ];

/** Conditions PokéAPI de l'évolution qui mène à chaque espèce. */
const evolutionDetails = (() => {
  const details = new Map<number, EvolutionDetail[]>();
  const walk = (node: EvolutionNode) => {
    for (const next of node.evolvesTo) {
      details.set(next.speciesId, next.details);
      walk(next);
    }
  };
  for (const chain of evolutionChains) walk(chain.chain);
  return details;
})();

const hasEvolution = new Set(species.flatMap((s) => s.evolvesFromSpeciesId ?? []));

/** Stade d'une espèce dans sa lignée, bébés non comptés : 1 pour une forme de base. */
export function evolutionStage(speciesId: number): number {
  const from = getSpecies(speciesId)?.evolvesFromSpeciesId;
  if (!from || getSpecies(from)?.isBaby) return 1;
  return 1 + evolutionStage(from);
}

/** Vrai si toutes les façons d'obtenir l'espèce en évoluant demandent un objet ou un échange. */
export function evolvesOnlyWithItem(speciesId: number): boolean {
  const details = evolutionDetails.get(speciesId) ?? [];
  return (
    evolutionStage(speciesId) > 1 &&
    details.length > 0 &&
    details.every((d) => d.trigger === 'use-item' || d.trigger === 'trade' || !!d.heldItem)
  );
}

/**
 * Manquements aux règles dans les zones d'une région, une phrase par manquement (vide si tout
 * va bien). `regionId` sert aux exceptions.
 */
export function expeditionRuleIssues(regionId: string, zones: readonly Zone[]): string[] {
  const issues: string[] = [];
  const zonesBySpecies = new Map<number, string[]>();
  for (const zone of zones) {
    for (const e of zone.encounters) {
      if (e.formId || evolutionStage(e.speciesId) === 1) continue;
      const name = `${getSpecies(e.speciesId)?.nameFr ?? e.speciesId} (${zone.id})`;
      if (evolutionStage(e.speciesId) >= 3) issues.push(`${name} : troisième stade`);
      if (evolvesOnlyWithItem(e.speciesId)) issues.push(`${name} : évolution par objet`);
      zonesBySpecies.set(e.speciesId, [...(zonesBySpecies.get(e.speciesId) ?? []), zone.id]);
    }
  }
  for (const [speciesId, zoneIds] of zonesBySpecies) {
    const exception = EXPEDITION_RULE_EXCEPTIONS.find(
      (x) => x.regionId === regionId && x.speciesId === speciesId,
    );
    const final = !hasEvolution.has(speciesId);
    const max = exception?.zones ?? (final ? MAX_ZONES_FINAL_FORM : MAX_ZONES_MIDDLE_FORM);
    if (zoneIds.length > max) {
      const kind = final ? 'forme finale' : 'forme intermédiaire';
      const name = getSpecies(speciesId)?.nameFr ?? speciesId;
      issues.push(`${name} : ${kind} dans ${zoneIds.length} zones (${zoneIds.join(', ')})`);
    }
  }
  return issues;
}
