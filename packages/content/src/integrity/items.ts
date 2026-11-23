import { getForm, getSpecies } from '@poke/data';
import { lowestUnitPrice } from '../schemas';
import { KNOWN_NATURES, formError } from './context';
import type { IntegrityCheck } from './context';

/**
 * Objets : effets cohérents (formes des Méga-Gemmes et des objets de forme), revente jamais plus
 * chère que l'achat.
 */
export function checkItems(check: IntegrityCheck): void {
  const { content, add } = check;
  for (const item of content.items) {
    const types = item.effects.map((e) => e.type);
    if (new Set(types).size !== types.length) {
      add('warning', 'item', item.id, 'Plusieurs effets du même type');
    }
    for (const effect of item.effects) {
      if (effect.type === 'mint' && !KNOWN_NATURES.has(effect.nature)) {
        add('error', 'item', item.id, `Aromate : nature « ${effect.nature} » inconnue`);
      }
      if (effect.type === 'fossil') {
        if (!getSpecies(effect.speciesId)) {
          add('error', 'item', item.id, `Fossile : espèce ${effect.speciesId} inconnue`);
        }
        const form = formError(effect);
        if (form) add('error', 'item', item.id, `Fossile : ${form}`);
      }
      if (effect.type === 'berryPlant' && effect.minYield > effect.maxYield) {
        add(
          'error',
          'item',
          item.id,
          `Plante : récolte minimale (${effect.minYield}) supérieure à la maximale (${effect.maxYield})`,
        );
      }
      if (effect.type === 'megaEvolution' && getForm(effect.formId)?.kind !== 'mega') {
        add('error', 'item', item.id, `Méga-Gemme : ${effect.formId} n'est pas une forme Méga`);
      }
      if (effect.type === 'formChange') {
        const kind = getForm(effect.formId)?.kind;
        if (!kind)
          add('error', 'item', item.id, `Objet de forme : forme ${effect.formId} inconnue`);
        else if (kind === 'mega' || kind === 'regional') {
          add(
            'error',
            'item',
            item.id,
            `Objet de forme : ${effect.formId} est une forme ${kind === 'mega' ? 'Méga (effet Méga-Évolution)' : 'régionale'}`,
          );
        }
      }
    }
    if (item.category === 'formItem' && !types.includes('formChange')) {
      add('warning', 'item', item.id, 'Objet de forme sans effet « Changement de forme »');
    }
    // Revendre plus cher qu'on achète ferait de l'argent à l'infini.
    const unitPrice = lowestUnitPrice(content.shopEntries, item.id);
    if (item.sellPrice !== null && unitPrice !== null && item.sellPrice > unitPrice) {
      add(
        'error',
        'item',
        item.id,
        `Prix de revente (${item.sellPrice} ₽) supérieur au prix d’achat en boutique (${Math.floor(unitPrice)} ₽ l’unité)`,
      );
    }
  }
}
