import type { CombatSettings, DungeonAttack } from '@poke/content';
import { types as typeData } from '@poke/data';
import type { Stats } from '@poke/data';
import type { GameSpecies } from '../context';
import { computeStats } from '../pokemon';
import type { PokemonInstance } from '../pokemon';

/**
 * L'attaque d'un combattant : chacun n'en a qu'une, d'un de ses types, physique ou spéciale.
 */

export const MOVE_CATEGORIES = ['physical', 'special'] as const;

export type MoveCategory = (typeof MOVE_CATEGORIES)[number];

/** Attaque choisie par le joueur pour un Pokémon : un de ses types, physique ou spéciale. */
export interface DungeonMove {
  type: string;
  category: MoveCategory;
}

/** Puissance d'une attaque sans réglage pour son type. */
export const DEFAULT_DUNGEON_ATTACK_POWER = 60;

const typeNamesFr = new Map(typeData.map((t) => [t.name, t.nameFr]));

/** Attaque d'un type (celle de l'équilibrage, sinon une attaque par défaut). */
export function dungeonAttack(
  settings: Pick<CombatSettings, 'attacks'>,
  type: string,
): DungeonAttack {
  return (
    settings.attacks[type] ?? {
      name: `Attaque ${typeNamesFr.get(type) ?? type}`,
      power: DEFAULT_DUNGEON_ATTACK_POWER,
    }
  );
}

/** Catégorie par défaut : celle de la meilleure statistique offensive (Attaque à égalité). */
export function bestCategory(stats: Pick<Stats, 'attack' | 'special-attack'>): MoveCategory {
  return stats['special-attack'] > stats.attack ? 'special' : 'physical';
}

/** Attaque par défaut : premier type de l'espèce, meilleure catégorie. */
export function defaultDungeonMove(
  species: Pick<GameSpecies, 'types' | 'baseStats'>,
  pokemon: Pick<PokemonInstance, 'level' | 'ivs' | 'nature'>,
): DungeonMove {
  return {
    type: species.types[0] ?? 'normal',
    category: bestCategory(computeStats(species, pokemon)),
  };
}

/** L'attaque enregistrée si elle reste valable (type de l'espèce, après une évolution), sinon celle par défaut. */
export function effectiveDungeonMove(
  species: Pick<GameSpecies, 'types' | 'baseStats'>,
  pokemon: Pick<PokemonInstance, 'level' | 'ivs' | 'nature'>,
  saved: DungeonMove | null | undefined,
): DungeonMove {
  const fallback = defaultDungeonMove(species, pokemon);
  if (!saved) return fallback;
  return {
    type: species.types.includes(saved.type) ? saved.type : fallback.type,
    category: MOVE_CATEGORIES.includes(saved.category) ? saved.category : fallback.category,
  };
}
