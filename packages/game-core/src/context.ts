import type {
  BalanceSettings,
  GameContent,
  Item,
  ItemEffect,
  ItemEffectType,
  LootTable,
  Quest,
  Region,
  ShopCategory,
  ShopEntry,
  SpeciesOverride,
  Trainer,
  Zone,
} from '@poke/content';
import { getForm, getSpecies } from '@poke/data';
import type { PokemonForm, Species } from '@poke/data';

/**
 * Espèce PokéAPI, avec les surcharges de l'admin appliquées. Avec une forme (alternative ou
 * régionale), ses types, statistiques, talents et XP de base remplacent ceux de l'espèce.
 */
export interface GameSpecies extends Species {
  enabled: boolean;
  override: SpeciesOverride | null;
  /** Forme appliquée ; null = forme par défaut. */
  form: PokemonForm | null;
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
  /** Quêtes triées selon leur ordre. */
  readonly quests: readonly Quest[];
  quest(id: string): Quest | undefined;
  region(id: string): Region | undefined;
  zone(id: string): Zone | undefined;
  trainer(id: string): Trainer | undefined;
  shopEntry(id: string): ShopEntry | undefined;
  item(id: string): Item | undefined;
  lootTable(id: string): LootTable | undefined;
  /** Espèce, éventuellement dans une forme donnée (ignorée si elle n'appartient pas à l'espèce). */
  species(id: number, formId?: number | null): GameSpecies | undefined;
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
  const speciesCache = new Map<string, GameSpecies>();
  const quests = [...content.quests].sort((a, b) => a.order - b.order);
  const questsById = new Map(quests.map((q) => [q.id, q]));

  return {
    content,
    balance: content.balance,
    regions,
    zones,
    trainers,
    shopCategories,
    shopEntries,
    quests,
    quest: (id) => questsById.get(id),
    region: (id) => regionsById.get(id),
    zone: (id) => zonesById.get(id),
    trainer: (id) => trainersById.get(id),
    shopEntry: (id) => shopEntriesById.get(id),
    item: (id) => itemsById.get(id),
    lootTable: (id) => lootById.get(id),
    species(id, formId) {
      const form = formId != null ? getForm(formId) : undefined;
      const key = form?.speciesId === id ? `${id}:${form.id}` : `${id}`;
      const cached = speciesCache.get(key);
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
        form: null,
      };
      if (form?.speciesId === id) {
        Object.assign(merged, {
          nameFr: form.nameFr,
          types: form.types,
          baseStats: form.baseStats,
          abilities: form.abilities,
          baseExperience: form.baseExperience ?? base.baseExperience,
          form,
        });
      }
      speciesCache.set(key, merged);
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
