import { getForm } from '@poke/data';
import { baseSpeciesId, encounterProbabilities, isBreedable, megaOptions } from '@poke/game-core';
import type { GameContext } from '@poke/game-core';

/**
 * Façons d'obtenir un Pokémon (ou l'une de ses formes) : zones d'expédition, rencontres spéciales,
 * quêtes, fossiles, Méga-Évolution, évolution, œufs. Partagé par le Wiki et la fiche du Pokédex.
 */
export function pokemonSources(ctx: GameContext, speciesId: number, formId: number | null) {
  const species = ctx.species(speciesId, formId);
  const same = (p: { speciesId: number; formId?: number | null }) =>
    p.speciesId === speciesId && (p.formId ?? null) === formId;
  const zones = ctx.zones.flatMap((zone) => {
    const probability = encounterProbabilities(ctx, zone).find(same)?.probability;
    const encounters = zone.encounters.filter(same);
    if (!probability || encounters.length === 0) return [];
    const minLevel = Math.min(...encounters.map((e) => e.minLevel));
    const maxLevel = Math.max(...encounters.map((e) => e.maxLevel));
    return [{ zone, probability, minLevel, maxLevel }];
  });
  const specials = ctx.zones.flatMap((zone) =>
    zone.specialEncounters.filter(same).map((special) => ({ zone, special })),
  );
  const quests = ctx.quests.flatMap((q) =>
    q.rewards.pokemon
      .filter(same)
      .map((p) => ({ quest: q, level: p.level, roaming: p.roaming != null })),
  );
  const fossils = ctx.content.items.filter((i) => {
    const effect = ctx.itemEffect(i.id, 'fossil');
    return !!effect && same(effect);
  });
  const form = formId !== null ? getForm(formId) : undefined;
  const megaOf =
    form?.kind === 'mega'
      ? megaOptions(ctx, speciesId).find((o) => o.form.id === formId)
      : undefined;
  // Les œufs contiennent la première espèce de la lignée (forme régionale comprise).
  const fromEgg =
    !!species &&
    isBreedable(species) &&
    baseSpeciesId(ctx, speciesId) === speciesId &&
    (form === undefined || form.kind === 'regional');
  // Une Méga-Évolution ou une forme de combat ne s'obtient pas par évolution.
  const parent =
    species?.evolvesFromSpeciesId != null && (form === undefined || form.kind === 'regional')
      ? ctx.species(species.evolvesFromSpeciesId)
      : undefined;
  return { zones, specials, quests, fossils, megaOf, parent, fromEgg };
}

/** Niveaux d'une rencontre : « N.12 » ou « N.10–12 ». */
export function levelRange(minLevel: number, maxLevel: number): string {
  return minLevel === maxLevel ? `N.${minLevel}` : `N.${minLevel}–${maxLevel}`;
}
