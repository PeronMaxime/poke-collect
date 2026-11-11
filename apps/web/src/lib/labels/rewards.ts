import type { PermanentBonus, ProgressReward, RegionBonus } from '@poke/content';
import { formatMoney } from './format';

/**
 * Récompenses et bonus en toutes lettres.
 */

const BONUS_LABELS: Record<PermanentBonus['type'], string> = {
  capture: 'capture en expédition',
  xp: 'XP gagnée',
  money: 'Poké Dollars gagnés en combat',
  shiny: 'chance de chromatique',
};

const bonusText = (b: PermanentBonus) => `+${b.percent} % ${BONUS_LABELS[b.type]}`;

const REGION_BONUS_LABELS: Record<RegionBonus['type'], string> = { xp: 'd’XP' };

/**
 * Bonus de région d'une complétion : « +2 % d’XP pour les Pokémon de Kanto ». `where` complète
 * « les Pokémon … » (« de Kanto », « de la région de l’expédition »).
 */
export const regionBonusText = (b: RegionBonus, where: string) =>
  `+${b.percent} % ${REGION_BONUS_LABELS[b.type]} pour les Pokémon ${where}`;

/** Lignes d'une récompense de progression (objets à part, avec leur icône). */
export function rewardLines(r: ProgressReward): string[] {
  const plural = (n: number, word: string) => `+${n} ${word}${n > 1 ? 's' : ''}`;
  return [
    r.currency > 0 && formatMoney(r.currency),
    r.expeditionSlots > 0 && plural(r.expeditionSlots, 'emplacement') + ' d’expédition',
    r.daycareSlots > 0 && plural(r.daycareSlots, 'pension'),
    r.incubators > 0 && plural(r.incubators, 'couveuse'),
    ...r.bonuses.map(bonusText),
  ].filter((line): line is string => typeof line === 'string');
}
