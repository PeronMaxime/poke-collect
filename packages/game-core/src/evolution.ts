import type { EvolutionMethod, TimeOfDay } from '@poke/content';
import { evolutionChains } from '@poke/data';
import type { EvolutionDetail, EvolutionNode, Species } from '@poke/data';
import type { GameContext } from './context';
import { xpForLevel } from './pokemon';
import type { PokemonInstance } from './pokemon';

/**
 * Évolutions : conditions PokéAPI (`evolution_details`) adaptées au contexte idle, surchargeables
 * dans l'admin. L'échange est remplacé par un objet (Câble Link), l'heure du jour vient de l'heure
 * locale du joueur.
 */

const nodesBySpecies = new Map<number, EvolutionNode>();
const visit = (node: EvolutionNode) => {
  nodesBySpecies.set(node.speciesId, node);
  node.evolvesTo.forEach(visit);
};
for (const chain of evolutionChains) visit(chain.chain);

/** Champs PokéAPI que le jeu sait gérer ; un détail qui en utilise d'autres est ignoré. */
const SUPPORTED_FIELDS = new Set([
  'trigger',
  'minLevel',
  'item',
  'heldItem',
  'minHappiness',
  'timeOfDay',
]);

/**
 * Traduit un détail PokéAPI en méthode d'évolution, ou null s'il n'est pas transposable
 * (lieu, attaque connue, coups critiques…) : ces cas passent par une surcharge dans l'admin.
 */
export function methodFromDetail(
  detail: EvolutionDetail,
  tradeItemId: string | null,
): EvolutionMethod | null {
  if (Object.keys(detail).some((key) => !SUPPORTED_FIELDS.has(key))) return null;
  if (detail.timeOfDay && detail.timeOfDay !== 'day' && detail.timeOfDay !== 'night') return null;
  let itemId: string | null;
  switch (detail.trigger) {
    case 'level-up':
      itemId = detail.heldItem ?? null;
      break;
    case 'use-item':
      itemId = detail.item ?? null;
      if (!itemId) return null;
      break;
    case 'trade':
      // Échange (avec ou sans objet tenu) : l'objet tenu, sinon l'objet de remplacement.
      itemId = detail.heldItem ?? tradeItemId;
      if (!itemId) return null;
      break;
    default:
      return null;
  }
  const method: EvolutionMethod = {
    minLevel: detail.minLevel ?? null,
    itemId,
    minHappiness: detail.minHappiness ?? null,
    timeOfDay: (detail.timeOfDay as TimeOfDay | undefined) ?? null,
  };
  const hasCondition =
    method.minLevel !== null || method.itemId !== null || method.minHappiness !== null;
  return hasCondition ? method : null;
}

function dedupe(methods: readonly EvolutionMethod[]): EvolutionMethod[] {
  const seen = new Set<string>();
  return methods.filter((m) => {
    const key = JSON.stringify([m.minLevel, m.itemId, m.minHappiness, m.timeOfDay]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface EvolutionOption {
  toSpeciesId: number;
  /** Au moins une méthode suffit ; liste vide = évolution impossible en l'état. */
  methods: EvolutionMethod[];
  /** Conditions issues de PokéAPI, ou d'une surcharge de l'admin. */
  source: 'pokeapi' | 'override';
  /** Détails PokéAPI non transposables (à surcharger dans l'admin). */
  unsupported: EvolutionDetail[];
}

/** Méthodes déduites de PokéAPI pour une évolution (sans les surcharges). */
export function pokeApiEvolutions(
  ctx: GameContext,
  fromSpeciesId: number,
): Omit<EvolutionOption, 'source'>[] {
  const node = nodesBySpecies.get(fromSpeciesId);
  if (!node) return [];
  const { tradeItemId } = ctx.balance.evolution;
  return node.evolvesTo.map((child) => {
    const methods: EvolutionMethod[] = [];
    const unsupported: EvolutionDetail[] = [];
    for (const detail of child.details) {
      const method = methodFromDetail(detail, tradeItemId);
      if (method) methods.push(method);
      else unsupported.push(detail);
    }
    return { toSpeciesId: child.speciesId, methods: dedupe(methods), unsupported };
  });
}

/**
 * Évolutions possibles d'une espèce : PokéAPI, puis surcharges de l'admin (qui remplacent les
 * méthodes, désactivent l'évolution ou en ajoutent une). Les espèces d'arrivée inconnues du
 * jeu (générations non importées) sont ignorées.
 */
export function evolutionOptions(ctx: GameContext, fromSpeciesId: number): EvolutionOption[] {
  const options = new Map<number, EvolutionOption>(
    pokeApiEvolutions(ctx, fromSpeciesId).map((o) => [
      o.toSpeciesId,
      { ...o, source: 'pokeapi' as const },
    ]),
  );
  for (const override of ctx.content.evolutionOverrides) {
    if (override.fromSpeciesId !== fromSpeciesId) continue;
    if (!override.enabled) {
      options.delete(override.toSpeciesId);
      continue;
    }
    options.set(override.toSpeciesId, {
      toSpeciesId: override.toSpeciesId,
      methods: override.methods,
      source: 'override',
      unsupported: [],
    });
  }
  return [...options.values()].filter((o) => ctx.species(o.toSpeciesId));
}

// --- Vérification ---------------------------------------------------------------------------

/** Moment de la journée à une heure locale donnée (0 à 23). */
export function timeOfDayAt(ctx: GameContext, hour: number): TimeOfDay {
  const { dayStartHour, nightStartHour } = ctx.balance.evolution;
  const inDay =
    dayStartHour < nightStartHour
      ? hour >= dayStartHour && hour < nightStartHour
      : hour >= dayStartHour || hour < nightStartHour;
  return inDay ? 'day' : 'night';
}

/** Heure locale du joueur, à partir de son décalage par rapport à UTC (en minutes). */
export function localHour(now: Date | number, utcOffsetMinutes: number): number {
  const local = new Date(new Date(now).getTime() + utcOffsetMinutes * 60_000);
  return local.getUTCHours();
}

export interface EvolutionEnvironment {
  /** Quantité d'un objet dans le sac. */
  itemQuantity: (itemId: string) => number;
  /** Heure locale du joueur (0 à 23). */
  hour: number;
}

export type EvolutionRequirement =
  | { type: 'level'; required: number; current: number }
  | { type: 'item'; itemId: string }
  | { type: 'happiness'; required: number; current: number }
  | { type: 'timeOfDay'; required: TimeOfDay };

/** Conditions d'une méthode encore manquantes (liste vide = méthode utilisable). */
export function missingRequirements(
  ctx: GameContext,
  pokemon: Pick<PokemonInstance, 'level' | 'happiness'>,
  method: EvolutionMethod,
  env: EvolutionEnvironment,
): EvolutionRequirement[] {
  const missing: EvolutionRequirement[] = [];
  if (method.minLevel !== null && pokemon.level < method.minLevel) {
    missing.push({ type: 'level', required: method.minLevel, current: pokemon.level });
  }
  if (method.itemId !== null && env.itemQuantity(method.itemId) < 1) {
    missing.push({ type: 'item', itemId: method.itemId });
  }
  if (method.minHappiness !== null && pokemon.happiness < method.minHappiness) {
    missing.push({ type: 'happiness', required: method.minHappiness, current: pokemon.happiness });
  }
  if (method.timeOfDay !== null && timeOfDayAt(ctx, env.hour) !== method.timeOfDay) {
    missing.push({ type: 'timeOfDay', required: method.timeOfDay });
  }
  return missing;
}

export interface EvolutionCheck {
  option: EvolutionOption;
  /** Méthode retenue si l'évolution est possible (de préférence sans consommer d'objet). */
  method: EvolutionMethod | null;
  /** Méthodes et leurs conditions manquantes (pour l'affichage). */
  methods: { method: EvolutionMethod; missing: EvolutionRequirement[] }[];
}

export function checkEvolution(
  ctx: GameContext,
  pokemon: Pick<PokemonInstance, 'speciesId' | 'level' | 'happiness'>,
  option: EvolutionOption,
  env: EvolutionEnvironment,
): EvolutionCheck {
  const methods = option.methods.map((method) => ({
    method,
    missing: missingRequirements(ctx, pokemon, method, env),
  }));
  const ready = methods.filter((m) => m.missing.length === 0).map((m) => m.method);
  const method = ready.find((m) => m.itemId === null) ?? ready[0] ?? null;
  return { option, method, methods };
}

/** Évolutions d'un Pokémon avec leur état (prêtes ou non). */
export function pokemonEvolutions(
  ctx: GameContext,
  pokemon: Pick<PokemonInstance, 'speciesId' | 'level' | 'happiness'>,
  env: EvolutionEnvironment,
): EvolutionCheck[] {
  return evolutionOptions(ctx, pokemon.speciesId).map((option) =>
    checkEvolution(ctx, pokemon, option, env),
  );
}

// --- Application ------------------------------------------------------------------------------

/** Talent après évolution : même emplacement (talent 1, 2 ou caché) dans la nouvelle espèce. */
export function evolvedAbility(from: Species, to: Species, ability: string): string {
  const current = from.abilities.find((a) => a.name === ability);
  if (!current) return ability;
  const sameKind = (list: Species['abilities'], hidden: boolean) =>
    list.filter((a) => a.isHidden === hidden);
  const index = sameKind(from.abilities, current.isHidden).indexOf(current);
  const candidates = sameKind(to.abilities, current.isHidden);
  const fallback = sameKind(to.abilities, false);
  return (
    candidates[index]?.name ??
    candidates[0]?.name ??
    fallback[0]?.name ??
    to.abilities[0]?.name ??
    ability
  );
}

/** Pokémon après évolution : espèce et talent changent, niveau, IV, nature et bonheur restent. */
export function evolvePokemon<T extends PokemonInstance>(
  ctx: GameContext,
  pokemon: T,
  toSpeciesId: number,
): T {
  const from = ctx.species(pokemon.speciesId);
  const to = ctx.species(toSpeciesId);
  if (!from || !to) throw new Error(`Évolution inconnue : ${pokemon.speciesId} → ${toSpeciesId}`);
  // Courbe d'XP différente (rare) : on garde le niveau, l'XP repart du début de ce niveau.
  const xp =
    from.growthRate === to.growthRate ? pokemon.xp : xpForLevel(to.growthRate, pokemon.level);
  return {
    ...pokemon,
    speciesId: toSpeciesId,
    ability: evolvedAbility(from, to, pokemon.ability),
    xp,
  };
}
