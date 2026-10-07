import type {
  BalanceSettings,
  GameContent,
  Item,
  ItemEffect,
  ItemEffectType,
  LootTable,
  Region,
  ShopCategory,
  ShopEntry,
  SpeciesOverride,
  Trainer,
  Zone,
} from '@poke/content';
import { getSpecies } from '@poke/data';
import type { Species } from '@poke/data';

/** Espèce PokéAPI, avec les surcharges de l'admin appliquées. */
export interface GameSpecies extends Species {
  enabled: boolean;
  override: SpeciesOverride | null;
}

/**
 * Point d'entrée de la logique de jeu : `game-core` ne connaît aucune valeur de contenu
 * à l'avance, il reçoit le contenu publié (chargé depuis la base) en paramètre.
 */
export interface GameContext {
  readonly content: GameContent;
  readonly balance: BalanceSettings;
  /** Régions triées selon leur ordre d'affichage. */
  readonly regions: readonly Region[];
  /** Zones triées par région puis par ordre. */
  readonly zones: readonly Zone[];
  /** Dresseurs triés par région puis par ordre. */
  readonly trainers: readonly Trainer[];
  /** Catégories de la boutique triées selon leur ordre. */
  readonly shopCategories: readonly ShopCategory[];
  /** Articles triés par catégorie puis par ordre. */
  readonly shopEntries: readonly ShopEntry[];
  region(id: string): Region | undefined;
  zone(id: string): Zone | undefined;
  trainer(id: string): Trainer | undefined;
  shopEntry(id: string): ShopEntry | undefined;
  item(id: string): Item | undefined;
  lootTable(id: string): LootTable | undefined;
  species(id: number): GameSpecies | undefined;
  /** Premier effet du type demandé porté par l'objet. */
  itemEffect<T extends ItemEffectType>(
    itemId: string,
    type: T,
  ): Extract<ItemEffect, { type: T }> | undefined;
}

export function createGameContext(content: GameContent): GameContext {
  const regions = [...content.regions].sort((a, b) => a.order - b.order);
  const regionOrder = new Map(regions.map((r, i) => [r.id, i]));
  const byRegionThenOrder = (
    a: { regionId: string; order: number },
    b: { regionId: string; order: number },
  ) =>
    (regionOrder.get(a.regionId) ?? Infinity) - (regionOrder.get(b.regionId) ?? Infinity) ||
    a.order - b.order;
  const zones = [...content.zones].sort(byRegionThenOrder);
  const trainers = [...content.trainers].sort(byRegionThenOrder);
  const shopCategories = [...content.shopCategories].sort((a, b) => a.order - b.order);
  const categoryOrder = new Map(shopCategories.map((c, i) => [c.id, i]));
  const shopEntries = [...content.shopEntries].sort(
    (a, b) =>
      (categoryOrder.get(a.categoryId) ?? Infinity) -
        (categoryOrder.get(b.categoryId) ?? Infinity) || a.order - b.order,
  );
  const shopEntriesById = new Map(shopEntries.map((e) => [e.id, e]));
  const regionsById = new Map(regions.map((r) => [r.id, r]));
  const zonesById = new Map(zones.map((z) => [z.id, z]));
  const trainersById = new Map(trainers.map((t) => [t.id, t]));
  const itemsById = new Map(content.items.map((i) => [i.id, i]));
  const lootById = new Map(content.lootTables.map((t) => [t.id, t]));
  const overrides = new Map(content.speciesOverrides.map((o) => [o.speciesId, o]));
  const speciesCache = new Map<number, GameSpecies>();

  return {
    content,
    balance: content.balance,
    regions,
    zones,
    trainers,
    shopCategories,
    shopEntries,
    region: (id) => regionsById.get(id),
    zone: (id) => zonesById.get(id),
    trainer: (id) => trainersById.get(id),
    shopEntry: (id) => shopEntriesById.get(id),
    item: (id) => itemsById.get(id),
    lootTable: (id) => lootById.get(id),
    species(id) {
      const cached = speciesCache.get(id);
      if (cached) return cached;
      const base = getSpecies(id);
      if (!base) return undefined;
      const override = overrides.get(id) ?? null;
      const merged: GameSpecies = {
        ...base,
        nameFr: override?.nameFr ?? base.nameFr,
        habitat: override?.habitat ?? base.habitat,
        enabled: override?.enabled ?? true,
        override,
      };
      speciesCache.set(id, merged);
      return merged;
    },
    itemEffect(itemId, type) {
      return itemsById.get(itemId)?.effects.find((e) => e.type === type) as
        Extract<ItemEffect, { type: typeof type }> | undefined;
    },
  };
}

/** Probabilité de base qu'une rencontre ou une éclosion soit shiny. */
export function baseShinyProbability(ctx: GameContext): number {
  return 1 / ctx.balance.shiny.baseRateDenominator;
}
