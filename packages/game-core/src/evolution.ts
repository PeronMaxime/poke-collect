import type { EvolutionMethod, TimeOfDay } from '@poke/content';
import { evolutionChains, getForm } from '@poke/data';
import type { EvolutionDetail, EvolutionNode, Species } from '@poke/data';
import type { GameContext } from './context';
import { canEvolveInForm, counterpartFormId, formIdByName } from './forms';
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

/**
 * Champs PokéAPI que le jeu sait gérer ; un détail qui en utilise d'autres est ignoré. Les formes
 * de départ et d'arrivée choisissent l'évolution, elles ne sont pas des conditions.
 */
const SUPPORTED_FIELDS = new Set([
  'trigger',
  'minLevel',
  'item',
  'heldItem',
  'minHappiness',
  'timeOfDay',
  'requiredForm',
  'evolvedForm',
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
    case 'in-battle-level-up':
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
  /** Forme obtenue ; null = forme par défaut. */
  toFormId: number | null;
  /** Au moins une méthode suffit ; liste vide = évolution impossible en l'état. */
  methods: EvolutionMethod[];
  /** Conditions issues de PokéAPI, ou d'une surcharge de l'admin. */
  source: 'pokeapi' | 'override';
  /** Détails PokéAPI non transposables (à surcharger dans l'admin). */
  unsupported: EvolutionDetail[];
}

interface DetailGroup {
  toFormId: number | null;
  details: EvolutionDetail[];
  /**
   * Évolution « générale » de la lignée (même suffixe, sans condition propre à la forme) : c'est
   * elle que remplacent les surcharges de l'admin.
   */
  generic: boolean;
}

/** Détails PokéAPI qui valent pour une forme de départ, regroupés par forme d'arrivée. */
function detailsByTargetForm(
  fromSpeciesId: number,
  formId: number | null,
  child: EvolutionNode,
): DetailGroup[] {
  // Détails propres à la forme de départ (Miaouss d'Alola → Persian d'Alola par le bonheur) ;
  // sinon les détails généraux, si la forme peut suivre la lignée.
  const own = child.details.filter(
    (d) => d.requiredForm !== undefined && formIdByName(fromSpeciesId, d.requiredForm) === formId,
  );
  const details =
    own.length > 0
      ? own
      : canEvolveInForm(formId, child.speciesId)
        ? child.details.filter((d) => d.requiredForm === undefined)
        : [];
  const counterpart = counterpartFormId(formId, child.speciesId);
  const groups = new Map<number | null, DetailGroup>();
  for (const detail of details) {
    // Forme d'arrivée imposée (Pikachu → Raichu d'Alola), sinon même suffixe.
    const target = detail.evolvedForm
      ? formIdByName(child.speciesId, detail.evolvedForm)
      : counterpart;
    if (target === undefined) continue;
    const group = groups.get(target) ?? {
      toFormId: target,
      details: [],
      generic: target === counterpart && (formId === null || own.length === 0),
    };
    group.details.push(detail);
    groups.set(target, group);
  }
  return [...groups.values()];
}

type PokeApiOption = Omit<EvolutionOption, 'source'> & { generic: boolean };

function pokeApiOptions(
  ctx: GameContext,
  fromSpeciesId: number,
  formId: number | null,
): PokeApiOption[] {
  const node = nodesBySpecies.get(fromSpeciesId);
  if (!node) return [];
  const { tradeItemId } = ctx.balance.evolution;
  return node.evolvesTo.flatMap((child) => {
    const options = detailsByTargetForm(fromSpeciesId, formId, child).map(
      ({ toFormId, details, generic }): PokeApiOption => {
        const methods: EvolutionMethod[] = [];
        const unsupported: EvolutionDetail[] = [];
        for (const detail of details) {
          const method = methodFromDetail(detail, tradeItemId);
          if (method) methods.push(method);
          else unsupported.push(detail);
        }
        return {
          toSpeciesId: child.speciesId,
          toFormId,
          methods: dedupe(methods),
          unsupported,
          generic,
        };
      },
    );
    // Formes d'arrivée impossibles à obtenir (Crèmy → 63 Charmilly) : une seule ligne par espèce,
    // de préférence l'évolution générale, et aucune si une autre forme est accessible.
    const possible = options.filter((o) => o.methods.length > 0);
    if (possible.length > 0) return possible;
    const fallback = options.find((o) => o.generic) ?? options[0];
    return fallback ? [fallback] : [];
  });
}

/** Méthodes déduites de PokéAPI pour les évolutions d'une espèce, dans une forme (sans surcharges). */
export function pokeApiEvolutions(
  ctx: GameContext,
  fromSpeciesId: number,
  formId: number | null = null,
): Omit<EvolutionOption, 'source'>[] {
  return pokeApiOptions(ctx, fromSpeciesId, formId).map(({ generic: _generic, ...o }) => o);
}

/**
 * Évolutions possibles d'une espèce dans une forme : PokéAPI, puis surcharges de l'admin. Une
 * surcharge remplace les méthodes de l'évolution générale vers l'espèce d'arrivée (les évolutions
 * propres à une forme, comme Pikachu → Raichu d'Alola, gardent leurs conditions PokéAPI),
 * désactive toutes les évolutions vers cette espèce, ou en ajoute une. Les espèces d'arrivée
 * inconnues du jeu sont ignorées.
 */
export function evolutionOptions(
  ctx: GameContext,
  fromSpeciesId: number,
  formId?: number | null,
): EvolutionOption[] {
  const from = formId != null && getForm(formId)?.speciesId === fromSpeciesId ? formId : null;
  let options = pokeApiOptions(ctx, fromSpeciesId, from).map(
    (o): EvolutionOption & { generic: boolean } => ({ ...o, source: 'pokeapi' }),
  );
  for (const override of ctx.content.evolutionOverrides) {
    if (override.fromSpeciesId !== fromSpeciesId) continue;
    const target = (o: { toSpeciesId: number }) => o.toSpeciesId === override.toSpeciesId;
    if (!override.enabled) {
      options = options.filter((o) => !target(o));
      continue;
    }
    const overridden = {
      methods: override.methods,
      source: 'override' as const,
      unsupported: [],
    };
    if (options.some((o) => target(o) && o.generic)) {
      options = options.map((o) => (target(o) && o.generic ? { ...o, ...overridden } : o));
    } else if (canEvolveInForm(from, override.toSpeciesId)) {
      // Pas d'évolution générale (ou seulement des formes impossibles) : la surcharge la crée.
      const toFormId = counterpartFormId(from, override.toSpeciesId);
      options = [
        ...options.filter((o) => !(target(o) && o.methods.length === 0)),
        { toSpeciesId: override.toSpeciesId, toFormId, generic: true, ...overridden },
      ];
    }
  }
  return options.filter((o) => ctx.species(o.toSpeciesId)).map(({ generic: _generic, ...o }) => o);
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
  pokemon: Pick<PokemonInstance, 'speciesId' | 'formId' | 'level' | 'happiness'>,
  env: EvolutionEnvironment,
): EvolutionCheck[] {
  return evolutionOptions(ctx, pokemon.speciesId, pokemon.formId).map((option) =>
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

/**
 * Pokémon après évolution : espèce, forme (celle de l'évolution choisie, sinon même suffixe) et
 * talent changent ; niveau, IV, nature et bonheur restent.
 */
export function evolvePokemon<T extends PokemonInstance>(
  ctx: GameContext,
  pokemon: T,
  toSpeciesId: number,
  toFormId: number | null = counterpartFormId(pokemon.formId, toSpeciesId),
): T {
  const formId = toFormId;
  const from = ctx.species(pokemon.speciesId, pokemon.formId);
  const to = ctx.species(toSpeciesId, formId);
  if (!from || !to) throw new Error(`Évolution inconnue : ${pokemon.speciesId} → ${toSpeciesId}`);
  // Courbe d'XP différente (rare) : on garde le niveau, l'XP repart du début de ce niveau.
  const xp =
    from.growthRate === to.growthRate ? pokemon.xp : xpForLevel(to.growthRate, pokemon.level);
  return {
    ...pokemon,
    speciesId: toSpeciesId,
    formId,
    ability: evolvedAbility(from, to, pokemon.ability),
    xp,
  };
}
