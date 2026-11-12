import type { ItemStack, LootTable, Zone } from '@poke/content';
import type { GameContext } from '../context';
import type { AbilityEnv } from '../abilities';
import type { Rng } from '../rng';
import { expeditionPlan } from './team';

/**
 * Butin : tirage dans une table, et probabilités affichées au joueur.
 */

export function addStacks(into: Map<string, number>, stacks: readonly ItemStack[]): void {
  for (const s of stacks) into.set(s.itemId, (into.get(s.itemId) ?? 0) + s.quantity);
}

/** Un tirage : chaque entrée tombe indépendamment selon sa probabilité. */
export function rollLoot(rng: Rng, table: LootTable): ItemStack[] {
  const drops: ItemStack[] = [];
  for (const entry of table.entries) {
    if (rng.chance(entry.chance)) {
      drops.push({ itemId: entry.itemId, quantity: rng.int(entry.min, entry.max) });
    }
  }
  return drops;
}

/**
 * Butin possible d'une expédition (pour l'affichage) : probabilité d'obtenir chaque objet au
 * moins une fois sur l'ensemble des tirages, et quantité par tirage réussi.
 */
export function lootProbabilities(
  ctx: GameContext,
  zone: Zone,
  minutes: number,
  env?: AbilityEnv,
): { itemId: string; probability: number; min: number; max: number }[] {
  const table = zone.lootTableId ? ctx.lootTable(zone.lootTableId) : undefined;
  if (!table) return [];
  const rolls = expeditionPlan(ctx, minutes, env).lootRolls;
  return table.entries.map((e) => ({
    itemId: e.itemId,
    probability: 1 - (1 - e.chance) ** rolls,
    min: e.min,
    max: e.max,
  }));
}
