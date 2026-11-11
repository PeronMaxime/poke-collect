import { getForm, getSpecies } from '@poke/data';
import { CHEST_RARITY_LABELS } from '@poke/content';
import type { ItemEffect } from '@poke/content';
import { formatDuration } from './format';
import { natureLabel } from './names';

/**
 * Effet d'un objet en une phrase, et mise en forme des bonus (pourcentages, multiplicateurs, taux chromatique).
 */

export function effectText(effect: ItemEffect): string {
  switch (effect.type) {
    case 'ball':
      return effect.guaranteed ? 'Capture assurée' : `Capture × ${effect.catchMultiplier}`;
    case 'captureBoost':
      return `Capture × ${effect.multiplier} (consommée à chaque tentative)`;
    case 'breedingIvs':
      return `Pension : ${effect.count} IV transmis`;
    case 'breedingNature':
      return `Pension : transmet la nature${effect.chance < 1 ? ` (${Math.round(effect.chance * 100)} %)` : ''}`;
    case 'shinyCharm':
      return `Dans le sac : chromatique × ${effect.multiplier}`;
    case 'ivCap':
      return effect.all ? 'Sur un Pokémon : 6 IV à 31' : 'Sur un Pokémon : 1 IV au choix à 31';
    case 'mint':
      return `Sur un Pokémon : nature ${natureLabel(effect.nature)}`;
    case 'abilityChange':
      return effect.hidden
        ? 'Sur un Pokémon : donne son talent caché'
        : 'Sur un Pokémon : donne un talent normal au hasard, puis l’autre';
    case 'fossil':
      return `Musée : ${getSpecies(effect.speciesId)?.nameFr ?? `#${effect.speciesId}`} en ${formatDuration(effect.minutes)}`;
    case 'megaEvolution':
      return `Au PC : Méga-Évolution en ${getForm(effect.formId)?.nameFr ?? `forme ${effect.formId}`}`;
    case 'revive':
      return 'Ranime un Pokémon K.O.';
    case 'battleHeal':
      return `En combat : soigne ${Math.round(effect.fraction * 100)} % des PV du Pokémon actif${
        effect.cooldownSeconds > 0 ? ` (une fois toutes les ${effect.cooldownSeconds} s)` : ''
      }`;
    case 'happiness':
      return `Sur un Pokémon : bonheur +${effect.amount}`;
    case 'levelUp':
      return `Sur un Pokémon : +${effect.levels} niveau${effect.levels > 1 ? 'x' : ''}`;
    case 'encounterBoost':
      return `Expédition : rencontres ${formatMultiplier(effect.multiplier)} le temps de son effet`;
    case 'guildChest':
      return `Coffre ${CHEST_RARITY_LABELS[effect.rarity]} : à ouvrir`;
    case 'farmPlot':
      return `Ferme : une parcelle de plus, aussitôt (prix ${formatMultiplier(effect.priceGrowth)} à chaque achat)`;
    case 'berryPlant':
      return `Ferme : pousse en ${formatDuration(effect.minutes)}, donne ${yieldRange(effect)} baies`;
  }
}

/** Baies récoltées d'une plantation : « 1 à 3 ». */
export const yieldRange = (effect: { minYield: number; maxYield: number }) =>
  effect.maxYield > effect.minYield
    ? `${effect.minYield} à ${effect.maxYield}`
    : `${effect.minYield}`;

/** Probabilité shiny lisible : « 1 / 4 096 ». */
/** Bonus d'un multiplicateur : 1.01 → « 1 % », 1.255 → « 25,5 % ». */
export const formatPercentBonus = (multiplier: number) =>
  `${(Math.round((multiplier - 1) * 1000) / 10).toLocaleString('fr-FR')} %`;

export function formatShinyRate(probability: number): string {
  if (probability >= 1) return '100 %';
  if (probability <= 0) return '0';
  return `1 / ${Math.round(1 / probability).toLocaleString('fr-FR')}`;
}

/** Multiplicateur lisible : « × 1,5 ». */
export const formatMultiplier = (m: number) =>
  `× ${m.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}`;
