import { getForm, getSpecies } from '@poke/data';
import type { IntegrityCheck } from './context';
import { obtainableItemIds } from './item-uses';

/** Lignée d'une espèce (chaîne d'évolution PokéAPI), ou null si l'espèce est inconnue. */
const chainOf = (speciesId: number) => getSpecies(speciesId)?.evolutionChainId ?? null;

/**
 * Ce que le jeu permet d'obtenir : les lignées dont un Pokémon s'obtient (rencontres et rencontres
 * spéciales des zones en jeu, starters, Pokémon offerts par les quêtes en jeu, fossiles), et les
 * formes obtenues, par identifiant et par « lignée + suffixe » (une forme se transmet le long de sa
 * lignée, en évoluant comme en œuf : Lépidonille Toundra → Prismillon Toundra), y compris celles
 * que donne un objet tenu obtenable (Méga-Gemme, objet de forme). Approximation : une évolution
 * ajoutée dans l'admin d'une lignée à une autre relie les deux.
 */
function obtainable(check: IntegrityCheck) {
  const { content, activeZoneIds, isActive, disabled } = check;
  const chains = new Set<number>();
  const forms = new Set<number>();
  const suffixes = new Set<string>();
  const give = (speciesId: number, formId?: number | null) => {
    const chain = chainOf(speciesId);
    if (chain === null) return;
    chains.add(chain);
    const form = formId != null ? getForm(formId) : undefined;
    if (!form) return;
    forms.add(form.id);
    suffixes.add(`${chain}:${form.formName}`);
  };
  for (const zone of content.zones) {
    if (!activeZoneIds.has(zone.id)) continue;
    for (const e of zone.encounters) if (!disabled.has(e.speciesId)) give(e.speciesId, e.formId);
    for (const e of zone.specialEncounters) give(e.speciesId, e.formId);
  }
  for (const region of content.regions) {
    if (isActive('region', region.id)) for (const id of region.starterSpeciesIds) give(id);
  }
  for (const quest of content.quests) {
    if (isActive('quest', quest.id))
      for (const p of quest.rewards.pokemon) give(p.speciesId, p.formId);
  }
  for (const item of content.items) {
    for (const e of item.effects) if (e.type === 'fossil') give(e.speciesId, e.formId);
  }
  // Évolutions ajoutées dans l'admin : elles relient deux lignées (dans un seul sens).
  for (let changed = true; changed;) {
    changed = false;
    for (const o of content.evolutionOverrides) {
      const from = chainOf(o.fromSpeciesId);
      const to = chainOf(o.toSpeciesId);
      if (!o.enabled || from === null || to === null || !chains.has(from) || chains.has(to))
        continue;
      chains.add(to);
      changed = true;
    }
  }
  // Formes tenues : l'objet s'obtient (butin, récompense, boutique, donjon) et l'espèce aussi.
  const items = obtainableItemIds(content);
  for (const d of content.dungeons) if (d.gemItemId) items.add(d.gemItemId);
  for (const item of content.items) {
    if (!items.has(item.id)) continue;
    for (const e of item.effects) {
      const form = e.type === 'megaEvolution' || e.type === 'formChange' ? getForm(e.formId) : null;
      if (form && chains.has(chainOf(form.speciesId) ?? -1)) give(form.speciesId, form.id);
    }
  }
  return {
    species: (speciesId: number) => chains.has(chainOf(speciesId) ?? -1),
    form: (formId: number) => {
      const form = getForm(formId);
      return (
        !!form && (forms.has(formId) || suffixes.has(`${chainOf(form.speciesId)}:${form.formName}`))
      );
    },
  };
}

/** Collections : espèces, formes et région connues, Pokémon obtenables, récompense valide. */
export function checkCollections(check: IntegrityCheck): void {
  const { content, add, checkReward, regionIds } = check;
  const can = obtainable(check);
  for (const c of content.collections) {
    // Une collection d'une région à venir n'est pas encore visible.
    const visible = !c.regionId || check.isActive('region', c.regionId);
    const unknown = c.speciesIds.filter((id) => !getSpecies(id));
    if (unknown.length > 0) {
      add('error', 'collection', c.id, `Espèces inconnues : ${unknown.join(', ')}`);
    }
    if (new Set(c.speciesIds).size !== c.speciesIds.length) {
      add('warning', 'collection', c.id, 'Espèce en double dans la liste');
    }
    const unknownForms = c.formIds.filter((id) => !getForm(id));
    if (unknownForms.length > 0) {
      add('error', 'collection', c.id, `Formes inconnues : ${unknownForms.join(', ')}`);
    }
    if (new Set(c.formIds).size !== c.formIds.length) {
      add('warning', 'collection', c.id, 'Forme en double dans la liste');
    }
    if (c.regionId && !regionIds.has(c.regionId)) {
      add('error', 'collection', c.id, `Région « ${c.regionId} » inconnue`);
    }
    const missing = [
      ...c.speciesIds
        .filter((id) => getSpecies(id) && !can.species(id))
        .map((id) => getSpecies(id)!.nameFr),
      ...c.formIds.filter((id) => getForm(id) && !can.form(id)).map((id) => getForm(id)!.nameFr),
    ];
    if (visible && missing.length > 0) {
      add(
        'warning',
        'collection',
        c.id,
        `Introuvable en jeu (ni rencontre, ni starter, ni quête, ni fossile pour sa lignée, ni objet tenu) : ${missing.join(', ')}`,
      );
    }
    checkReward('collection', c.id, c.rewards);
  }
}
