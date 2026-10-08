import { STAT_NAMES } from '@poke/data';
import type { StatName, Stats } from '@poke/data';
import type { ItemEffect } from '@poke/content';
import type { GameContext } from './context';
import { MAX_IV } from './pokemon';
import type { PokemonInstance } from './pokemon';

/**
 * Objets endgame utilisés sur un Pokémon (PLAN.md, section 2.7) : Capsules (IV à 31), Aromates
 * (nature effective), Pilule et Patch Talent (talent). L'objet est consommé.
 */

export type PokemonItemEffect = Extract<ItemEffect, { type: 'ivCap' | 'mint' | 'abilityChange' }>;

const POKEMON_EFFECTS = new Set<ItemEffect['type']>(['ivCap', 'mint', 'abilityChange']);

/** Effet utilisable sur un Pokémon porté par l'objet (le premier). */
export function pokemonItemEffect(ctx: GameContext, itemId: string): PokemonItemEffect | undefined {
  return ctx.item(itemId)?.effects.find((e): e is PokemonItemEffect => POKEMON_EFFECTS.has(e.type));
}

/** Pokémon visé : nature d'origine (avant Aromate) en plus de la nature effective. */
export interface ItemTarget extends Pick<
  PokemonInstance,
  'speciesId' | 'formId' | 'ivs' | 'nature' | 'ability'
> {
  originalNature: string;
}

/** Choix possibles pour un objet sur un Pokémon ; vides si l'objet serait sans effet. */
export interface ItemUseOptions {
  effect: PokemonItemEffect;
  /** Capsule d'Argent : statistiques dont l'IV n'est pas encore à 31. */
  stats: StatName[];
  /** Pilule / Patch Talent : talents accessibles. */
  abilities: string[];
  /** L'objet aurait un effet. */
  usable: boolean;
}

export function itemUseOptions(
  ctx: GameContext,
  target: ItemTarget,
  itemId: string,
): ItemUseOptions | undefined {
  const effect = pokemonItemEffect(ctx, itemId);
  if (!effect) return undefined;
  const species = ctx.species(target.speciesId, target.formId);
  const stats = STAT_NAMES.filter((s) => target.ivs[s] < MAX_IV);
  switch (effect.type) {
    case 'ivCap':
      return { effect, stats: effect.all ? [] : stats, abilities: [], usable: stats.length > 0 };
    case 'mint':
      return { effect, stats: [], abilities: [], usable: target.nature !== effect.nature };
    case 'abilityChange': {
      const all = species?.abilities ?? [];
      const current = all.find((a) => a.name === target.ability);
      // Comme dans les jeux : la Pilule ne touche pas au talent caché, le Patch le donne.
      const abilities =
        current?.isHidden === true
          ? []
          : all.filter((a) => a.isHidden === effect.hidden && a.name !== target.ability);
      const names = [...new Set(abilities.map((a) => a.name))];
      return { effect, stats: [], abilities: names, usable: names.length > 0 };
    }
  }
}

export interface ItemUseChoice {
  stat?: StatName;
  ability?: string;
}

/** Modifications à appliquer au Pokémon. */
export interface PokemonPatch {
  ivs?: Stats;
  /** Nature effective ; null = retour à la nature d'origine. */
  natureOverride?: string | null;
  ability?: string;
}

export type ItemUseError = 'NOT_USABLE_ON_POKEMON' | 'NO_EFFECT' | 'CHOICE_REQUIRED';

export function applyItemToPokemon(
  ctx: GameContext,
  target: ItemTarget,
  itemId: string,
  choice: ItemUseChoice,
): { patch: PokemonPatch } | { error: ItemUseError } {
  const options = itemUseOptions(ctx, target, itemId);
  if (!options) return { error: 'NOT_USABLE_ON_POKEMON' };
  if (!options.usable) return { error: 'NO_EFFECT' };
  const { effect } = options;
  switch (effect.type) {
    case 'ivCap': {
      const stats = effect.all ? STAT_NAMES : choice.stat ? [choice.stat] : [];
      if (stats.length === 0) return { error: 'CHOICE_REQUIRED' };
      if (!effect.all && !options.stats.includes(choice.stat!)) return { error: 'NO_EFFECT' };
      const ivs = { ...target.ivs };
      for (const s of stats) ivs[s] = MAX_IV;
      return { patch: { ivs } };
    }
    case 'mint':
      return {
        patch: { natureOverride: effect.nature === target.originalNature ? null : effect.nature },
      };
    case 'abilityChange': {
      const ability =
        choice.ability ?? (options.abilities.length === 1 ? options.abilities[0] : undefined);
      if (!ability) return { error: 'CHOICE_REQUIRED' };
      if (!options.abilities.includes(ability)) return { error: 'NO_EFFECT' };
      return { patch: { ability } };
    }
  }
}
