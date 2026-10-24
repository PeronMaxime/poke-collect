import type { ItemEffect } from '@poke/content';
import { abilityFlat, abilityMultiplier } from './abilities';
import type { AbilityHolder } from './abilities';
import type { GameContext } from './context';
import type { Rng } from './rng';

/**
 * Ferme à baies : un champ de 3 × 3 parcelles où le joueur plante des baies (consommées). Une baie
 * ne pousse que si elle est arrosée, c'est-à-dire tant qu'un assistant de type Eau est au poste de
 * la ferme ; mûre, elle rapporte quelques baies de la même espèce.
 */

/** Parcelles du champ (3 × 3). */
export const FARM_PLOTS = 9;

export type BerryPlantEffect = Extract<ItemEffect, { type: 'berryPlant' }>;

/** Effet « plantation » de l'objet ; absent si l'objet ne se plante pas à la ferme. */
export function berryPlantEffect(ctx: GameContext, itemId: string): BerryPlantEffect | undefined {
  return ctx.itemEffect(itemId, 'berryPlant');
}

/** Baies récoltées à maturité (tirées à la plantation). */
export const rollBerryYield = (effect: BerryPlantEffect, rng: Rng) =>
  rng.int(effect.minYield, Math.max(effect.minYield, effect.maxYield));

/** Baies en plus par parcelle récoltée, selon le talent de l'assistant de récolte. */
export const harvestBonus = (ctx: GameContext, helper: AbilityHolder | null | undefined) =>
  helper ? abilityFlat(ctx, { activity: 'farm', team: [helper] }, 'berryYield', 0, 99) : 0;

/**
 * Vitesse de pousse du champ selon le talent de l'assistant qui l'arrose (1 = normale ; sans
 * assistant, la pousse est en pause et la vitesse ne compte pas).
 */
export const berryGrowthSpeed = (ctx: GameContext, waterer: AbilityHolder | null | undefined) =>
  waterer
    ? Math.max(0.1, abilityMultiplier(ctx, { activity: 'farm', team: [waterer] }, 'berryGrowth'))
    : 1;

/** Parcelle plantée : pousse en cours (`readyAt`), en pause (`readyAt` null) ou mûre. */
export interface PlotGrowth {
  /** Durée totale de pousse, en millisecondes. */
  growMs: number;
  /** Pousse restante au dernier arrêt de l'arrosage (vaut tant que `readyAt` est null). */
  remainingMs: number;
  /** Maturité prévue tant que le champ est arrosé ; null = pousse en pause. */
  readyAt: Date | null;
}

/** Pousse restante (0 = mûre). */
export const plotRemainingMs = (plot: PlotGrowth, now: Date) =>
  plot.readyAt ? Math.max(0, plot.readyAt.getTime() - now.getTime()) : plot.remainingMs;

export const isPlotRipe = (plot: PlotGrowth, now: Date) => plotRemainingMs(plot, now) === 0;
