import type { Stats } from '@poke/data';
import type { DungeonMove, Gender } from '@poke/game-core';

/**
 * Pokémon du joueur, Pokédex et sac.
 */

export type PokemonOrigin = 'starter' | 'capture' | 'egg' | 'quest' | 'fossil' | 'admin';

export interface PokemonDto {
  id: string;
  speciesId: number;
  /** Forme alternative ou régionale ; null = forme par défaut. */
  formId: number | null;
  level: number;
  xp: number;
  ivs: Stats;
  nature: string;
  ability: string;
  isShiny: boolean;
  gender: Gender;
  happiness: number;
  /** Nature d'origine, quand un Aromate a changé la nature effective (`nature`). */
  originalNature: string | null;
  origin: PokemonOrigin;
  originRegion: string | null;
  caughtAt: string;
  locked: boolean;
  /** Occupé (expédition, combat, pension) : indisponible pour une autre activité. */
  busy: boolean;
  activity: PokemonActivity | null;
  /** K.O. après une défaite : indisponible tant qu'il n'est pas soigné au Centre Pokémon. */
  knockedOut: boolean;
  /** En soins au Centre Pokémon jusqu'à cette date (comparer à l'heure du serveur). */
  healUntil: string | null;
  /** Place du Centre Pokémon occupée pendant les soins. */
  healSlot: number | null;
  /** Étiquettes du joueur (identifiants de `PokemonTagDto`). */
  tagIds: string[];
  /** Attaque enregistrée pour les donjons ; null = choix par défaut. */
  dungeonMove: DungeonMove | null;
  /** Méga-Gemme tenue : le Pokémon est Méga-Évolué (`formId` = sa forme Méga). */
  megaStone: string | null;
}

export type PokemonActivity = 'expedition' | 'battle' | 'daycare' | 'dungeon' | 'assistant';

export interface PokedexEntryDto {
  speciesId: number;
  seen: boolean;
  caught: boolean;
  caughtShiny: boolean;
  /** Version shiny déjà rencontrée (capturée ou non). */
  seenShiny: boolean;
  /** Formes de l'espèce déjà rencontrées (capturées ou non). */
  seenFormIds: number[];
  /** Formes déjà rencontrées en version shiny. */
  seenShinyFormIds: number[];
  firstCaughtAt: string | null;
}

/** Forme capturée (régionale, Méga, Gigamax…). */
export interface PokedexFormEntryDto {
  formId: number;
  caughtShiny: boolean;
  firstCaughtAt: string;
}

export interface InventoryEntryDto {
  itemId: string;
  quantity: number;
}
