import { z } from 'zod';
import { pokemonTypes, types, typeWeaknesses } from '@poke/data';
import { abilitySchema } from './abilities';
import { balanceSettingsSchema } from './balance';
import { collectionSchema } from './collections';
import { dungeonSchema } from './dungeons';
import { chestEntrySchema, guildQuestSchema } from './guilds';
import { itemSchema } from './items';
import { lootTableSchema } from './loot';
import { DEFAULT_LEGENDARY_BATTLE, questSchema } from './quests';
import type { LegendaryBattle } from './quests';
import { regionSchema } from './regions';
import { shopCategorySchema, shopEntrySchema } from './shop';
import { evolutionOverrideSchema, speciesOverrideSchema } from './species';
import { trainerSchema } from './trainers';
import { zoneSchema } from './zones';
import type { Encounter } from './zones';

/**
 * Contenu complet d'une version : toutes les entités réunies.
 */

/** Structure seule : chaque entité est valide, sans vérifier les références croisées. */
export const gameContentStructureSchema = z.object({
  balance: balanceSettingsSchema,
  regions: z.array(regionSchema),
  speciesOverrides: z.array(speciesOverrideSchema),
  abilities: z.array(abilitySchema).default([]),
  items: z.array(itemSchema),
  lootTables: z.array(lootTableSchema),
  zones: z.array(zoneSchema),
  trainers: z.array(trainerSchema),
  dungeons: z.array(dungeonSchema),
  shopCategories: z.array(shopCategorySchema),
  shopEntries: z.array(shopEntrySchema),
  evolutionOverrides: z.array(evolutionOverrideSchema),
  collections: z.array(collectionSchema),
  quests: z.array(questSchema),
  guildQuests: z.array(guildQuestSchema).default([]),
  chestEntries: z.array(chestEntrySchema).default([]),
});

export type GameContentData = z.infer<typeof gameContentStructureSchema>;

/** Contenu chargé depuis une version publiée (ou un brouillon en test). */
export interface GameContent extends GameContentData {
  versionId: number;
}

/** Chances par défaut qu'une rencontre soit le Pokémon fuyard (%), dans la zone où il se trouve. */
export const DEFAULT_ROAMING_CHANCE = 3;

/** Chances par défaut qu'une rencontre soit la rencontre spéciale (%), équipe requise présente. */
export const DEFAULT_SPECIAL_ENCOUNTER_CHANCE = 2;

/**
 * Affinités d'une zone d'expédition : les types super efficaces sur le type le plus présent parmi
 * ses Pokémon. Égalités départagées par le poids de rencontre cumulé ; à égalité parfaite, les
 * faiblesses de tous les types à égalité.
 * Même calcul que la migration 0086 (à garder en phase).
 */
export function zoneAffinityTypes(encounters: readonly Encounter[]): string[] {
  const seen = new Set<string>();
  const stats = new Map<string, { count: number; weight: number }>();
  for (const e of encounters) {
    const key = `${e.speciesId}:${e.formId ?? ''}`;
    for (const type of pokemonTypes(e.speciesId, e.formId)) {
      const stat = stats.get(type) ?? { count: 0, weight: 0 };
      if (!seen.has(key)) stat.count++;
      stat.weight += e.weight;
      stats.set(type, stat);
    }
    seen.add(key);
  }
  const best = [...stats.values()].reduce(
    (b, s) => (s.count > b.count || (s.count === b.count && s.weight > b.weight) ? s : b),
    { count: 0, weight: 0 },
  );
  const tied = [...stats].filter(([, s]) => s.count === best.count && s.weight === best.weight);
  const weak = new Set(tied.flatMap(([type]) => typeWeaknesses([type])));
  return types.map((t) => t.name).filter((t) => weak.has(t));
}

/** Combat légendaire d'une récompense, avec ses réglages par-dessus ceux par défaut. */
export function legendaryBattle(overrides: Partial<LegendaryBattle> = {}): LegendaryBattle {
  return { ...DEFAULT_LEGENDARY_BATTLE, ...overrides };
}
