import { abilities, evolutionChains, itemSpriteUrl, natures, types } from '@poke/data';
import type { StatName } from '@poke/data';
import type { Rarity } from '@poke/content';
import type { GameContext } from '@poke/game-core';

/**
 * Noms et libellés : espèces, objets, types, natures, talents, statistiques, raretés, Bonbons.
 */

export { TYPE_COLORS } from '@poke/data';

const typeNames = new Map(types.map((t) => [t.name, t.nameFr]));

const natureNames = new Map(natures.map((n) => [n.name, n.nameFr]));

const abilityNames = new Map(abilities.map((a) => [a.name, a.nameFr]));

export const typeLabel = (type: string) => typeNames.get(type) ?? type;

export const natureLabel = (nature: string) => natureNames.get(nature) ?? nature;

/** Les Pokémon du joueur arrivent sans talent (`NO_ABILITY`, chaîne vide). */
export const abilityLabel = (ability: string) =>
  ability ? (abilityNames.get(ability) ?? ability) : 'Aucun talent';

export const STAT_LABELS: Record<StatName, string> = {
  hp: 'PV',
  attack: 'Attaque',
  defense: 'Défense',
  'special-attack': 'Atq. Spé.',
  'special-defense': 'Déf. Spé.',
  speed: 'Vitesse',
};

export const RARITY_STYLES: Record<Rarity, string> = {
  common: 'text-slate-500',
  uncommon: 'text-emerald-600 dark:text-emerald-400',
  rare: 'text-sky-600 dark:text-sky-400',
  epic: 'text-violet-600 dark:text-violet-400',
  legendary: 'text-amber-600 dark:text-amber-400',
};

export const RARITY_LABELS: Record<Rarity, string> = {
  common: 'Commun',
  uncommon: 'Peu commun',
  rare: 'Rare',
  epic: 'Épique',
  legendary: 'Légendaire',
};

export function itemIcon(ctx: GameContext | undefined, itemId: string): string {
  return ctx?.item(itemId)?.icon ?? itemSpriteUrl(itemId);
}

export const itemName = (ctx: GameContext | undefined, itemId: string) =>
  ctx?.item(itemId)?.name ?? itemId;

/** Nom de l'espèce, ou de la forme (« Goupix d’Alola ») quand elle est indiquée. */
export const speciesName = (
  ctx: GameContext | undefined,
  speciesId: number,
  formId?: number | null,
) => ctx?.species(speciesId, formId)?.nameFr ?? `#${speciesId}`;

const lineageBase = new Map(evolutionChains.map((c) => [c.id, c.chain.speciesId]));

/** Espèce de base d'une lignée (chaîne d'évolution), pour nommer ses Bonbons. */
export const lineageSpeciesId = (lineageId: number) => lineageBase.get(lineageId);

export const candyName = (ctx: GameContext | undefined, lineageId: number) => {
  const base = lineageSpeciesId(lineageId);
  return `Bonbon ${base ? speciesName(ctx, base) : `#${lineageId}`}`;
};
