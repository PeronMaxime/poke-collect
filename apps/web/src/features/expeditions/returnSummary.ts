/**
 * Retour d'une expédition : ce que la fenêtre du résultat montre, résume ou passe sous silence.
 * Fonctions pures, à partir du résultat calculé par le serveur.
 */
import type { ExpeditionDto } from '@poke/shared';
import { newInDexTracker } from '../../lib/queries';

/** Résultat d'une expédition revenue. */
export type ExpeditionResult = NonNullable<ExpeditionDto['result']>;

// Secondes entre deux rencontres : on accélère quand il y en a beaucoup, pour que
// l'apparition dure au plus ~REVEAL_BUDGET secondes (sans descendre sous MIN_STEP).
const MAX_STEP = 0.45;
const MIN_STEP = 0.06;
const REVEAL_BUDGET = 6;

/** Secondes entre l'apparition de deux rencontres, pour `count` rencontres à montrer. */
export function revealStep(count: number): number {
  return Math.max(MIN_STEP, Math.min(MAX_STEP, REVEAL_BUDGET / Math.max(1, count)));
}

/**
 * Tri des rencontres d'un retour. `shown` sont celles montrées une à une : ni les captures
 * transférées automatiquement (résumées par leurs Bonbons), ni les échappés déjà au Pokédex
 * (comptés dans `escapedCount`), ni les Pokémon observés sans Ball ou ignorés. `firstNew` donne
 * les positions dans `shown` qui portent « Nouveau ! » : la première capture de chaque espèce ou
 * forme nouvelle seulement. `captured` compte aussi les captures transférées.
 */
export function returnSummary(result: ExpeditionResult) {
  // Captures transférées automatiquement : pas affichées une à une, résumées sous la grille.
  const encounters = result.encounters.filter((e) => !e.transferred);
  const transferred = result.autoTransferred;
  // Échappés déjà au Pokédex (ni chromatiques ni fuyards) : pas affichés non plus, résumés en
  // une ligne.
  const escapedCount = encounters.filter((e) => e.filtered).length;
  // Observés sans Ball et ignorés : comptés dans les rencontres, pas affichés.
  const shown = encounters.filter(
    (e) => !e.filtered && e.outcome !== 'noBall' && e.outcome !== 'ignored',
  );
  // Captures gardées et transférées automatiquement.
  const captured = result.encounters.filter((e) => e.outcome === 'captured').length;
  // « Nouveau ! » sur la première capture de chaque nouvelle espèce ou forme seulement.
  const isFirstNew = newInDexTracker(result);
  const firstNew = new Set<number>();
  shown.forEach((e, i) => {
    if (e.outcome === 'captured' && isFirstNew(e)) firstNew.add(i);
  });
  return {
    encounters,
    transferred,
    escapedCount,
    shown,
    captured,
    shinies: shown.filter((e) => e.isShiny).length,
    /** Position du premier chromatique dans `shown` (-1 : aucun). */
    firstShiny: shown.findIndex((e) => e.isShiny),
    firstNew,
    /** Baies de capture et de rencontres entamées. */
    berriesUsed: result.berriesUsed + (result.encounterBerriesUsed ?? 0),
  };
}
