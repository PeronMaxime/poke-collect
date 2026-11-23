import { obtainableItemIds } from '@poke/content';
import type { ContentIssue } from '@poke/content';
import { getForm, getSpecies, speciesForms } from '@poke/data';
import type { GameContext } from './context';
import { evolutionOptions } from './evolution';

/**
 * Alertes de cohérence qui demandent les règles du jeu, en plus de `contentIssues` de
 * `@poke/content` (qui ne dépend pas de `game-core`). Réunies pour le tableau de bord de l'admin
 * par `loadContentWithIssues` (`@poke/db`).
 */

/**
 * Objets d'évolution menant à une espèce dans une forme, si toutes ses évolutions en demandent un
 * (pierre, objet tenu, Câble Link à la place de l'échange) ; null si l'une s'en passe ou si
 * aucune n'y mène. Pré-évolutions : celle de PokéAPI et celles des surcharges de l'admin.
 */
function evolutionItems(ctx: GameContext, speciesId: number, formId: number | null) {
  const parents = new Set<number>();
  const from = getSpecies(speciesId)?.evolvesFromSpeciesId;
  if (from) parents.add(from);
  for (const o of ctx.content.evolutionOverrides) {
    if (o.enabled && o.toSpeciesId === speciesId) parents.add(o.fromSpeciesId);
  }
  const items = new Set<string>();
  let reached = false;
  for (const parent of parents) {
    for (const parentForm of [null, ...speciesForms(parent).map((f) => f.id)]) {
      for (const option of evolutionOptions(ctx, parent, parentForm)) {
        if (option.toSpeciesId !== speciesId || option.toFormId !== formId) continue;
        for (const method of option.methods) {
          if (method.itemId === null) return null;
          items.add(method.itemId);
          reached = true;
        }
      }
    }
  }
  return reached ? items : null;
}

/**
 * Rencontres d'expédition d'un Pokémon qui ne s'obtient qu'en évoluant avec un objet que le
 * joueur peut se procurer : la rencontre court-circuite l'objet (docs/DECISIONS.md, « Pas
 * d'évolution par objet en expédition »). Un objet introuvable (Pierre Ovale pour Leveinard) ne
 * déclenche rien. Les zones désactivées sont ignorées.
 */
function itemEvolutionEncounterIssues(ctx: GameContext): ContentIssue[] {
  const obtainable = obtainableItemIds(ctx.content);
  const cache = new Map<string, string[]>();
  const issues: ContentIssue[] = [];
  for (const zone of ctx.zones) {
    if (!zone.enabled) continue;
    for (const e of zone.encounters) {
      const formId = e.formId ?? null;
      const key = `${e.speciesId}:${formId}`;
      let items = cache.get(key);
      if (!items) {
        const all = evolutionItems(ctx, e.speciesId, formId);
        items = all ? [...all].filter((id) => obtainable.has(id)) : [];
        cache.set(key, items);
      }
      if (items.length === 0) continue;
      const species = getSpecies(e.speciesId)?.nameFr ?? `Espèce ${e.speciesId}`;
      const form = formId !== null ? getForm(formId)?.formNameFr : undefined;
      const names = items.map((id) => ctx.item(id)?.name ?? id).join(', ');
      issues.push({
        severity: 'warning',
        entity: 'zone',
        entityId: zone.id,
        message: `${form ? `${species} (${form})` : species} s’obtient en évoluant avec un objet (${names}) : à retirer des rencontres`,
      });
    }
  }
  return issues;
}

/** Alertes de cohérence issues des règles du jeu, dans l'ordre des zones. */
export function ruleIssues(ctx: GameContext): ContentIssue[] {
  return itemEvolutionEncounterIssues(ctx);
}
