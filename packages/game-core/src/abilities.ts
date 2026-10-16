import type {
  AbilityCondition,
  AbilityEffect,
  AbilityEffectType,
  AbilityParam,
  Status,
  Weather,
} from '@poke/content';
import { natures, types as typeData } from '@poke/data';
import type { GameContext } from './context';
import { timeOfDayAt } from './evolution';
import { pokemonPower } from './pokemon';
import type { Gender, PokemonInstance } from './pokemon';
import type { PlayerBonuses } from './progression';
import type { Rng } from './rng';

/**
 * Talents : leurs effets (réglés dans l'admin) ne jouent que pour les Pokémon qui participent à
 * l'activité (équipe envoyée). Un talent sans entrée dans le contenu n'a aucun effet.
 */

// --- Catalogue des paramètres -----------------------------------------------------------------

/**
 * Activités où un talent peut agir. `breeding` : parents en pension et assistant de la Pension ;
 * `incubator` : assistant de la couveuse ; `museum` : assistant du Musée ; `transfer` : Pokémon
 * transféré.
 */
export type AbilityActivity =
  'expedition' | 'quest' | 'battle' | 'dungeon' | 'breeding' | 'incubator' | 'museum' | 'transfer';

export const ABILITY_ACTIVITY_LABELS: Record<AbilityActivity, string> = {
  expedition: 'expéditions',
  quest: 'légendaires',
  battle: 'combats de dresseurs',
  dungeon: 'donjons',
  breeding: 'pension (parents et assistant)',
  incubator: 'couveuse (assistant)',
  museum: 'Musée (assistant)',
  transfer: 'transfert',
};

/** Postes d'assistant : un Pokémon affecté à un bâtiment y apporte les effets de son talent. */
export const ASSISTANT_POSTS = ['daycare', 'incubator', 'museum'] as const;
export type AssistantPost = (typeof ASSISTANT_POSTS)[number];

export const ASSISTANT_POST_INFO: Record<
  AssistantPost,
  { label: string; activity: AbilityActivity; help: string }
> = {
  daycare: {
    label: 'Assistant de la Pension',
    activity: 'breeding',
    help: 'Son talent agit sur la ponte et sur les œufs de toutes les pensions.',
  },
  incubator: {
    label: 'Assistant de la couveuse',
    activity: 'incubator',
    help: 'Son talent agit sur la durée d’éclosion des œufs ramassés (Corps Ardent, Armumagma).',
  },
  museum: {
    label: 'Assistant du Musée',
    activity: 'museum',
    help: 'Son talent agit sur la restauration des fossiles déposés et sur les Pokémon ranimés.',
  },
};

export interface AbilityParamInfo {
  /** Groupe d'affichage dans l'admin. */
  group: string;
  label: string;
  /** `percent` : multiplicateur (+10 = ×1,1) ; `flat` : valeur ajoutée (`unit`). */
  kind: 'percent' | 'flat';
  unit: string;
  /** `self` possible : le bonus peut ne viser que le Pokémon qui a le talent. */
  selfScope: boolean;
  activities: readonly AbilityActivity[];
  help: string;
}

const ALL: readonly AbilityActivity[] = ['expedition', 'quest', 'battle', 'dungeon'];

export const ABILITY_PARAMS: Record<AbilityParam, AbilityParamInfo> = {
  xp: {
    group: 'Général',
    label: 'XP gagnée',
    kind: 'percent',
    unit: '%',
    selfScope: false,
    activities: ALL,
    help: 'XP gagnée par toute l’équipe, partout.',
  },
  happiness: {
    group: 'Général',
    label: 'Bonheur gagné',
    kind: 'percent',
    unit: '%',
    selfScope: false,
    activities: ALL,
    help: 'Bonheur gagné par l’équipe au retour (les pertes ne sont pas modifiées).',
  },
  money: {
    group: 'Général',
    label: 'Poké Dollars gagnés',
    kind: 'percent',
    unit: '%',
    selfScope: false,
    activities: ['battle', 'dungeon'],
    help: 'Poké Dollars gagnés en combat de dresseur et en donjon.',
  },
  power: {
    group: 'Expéditions',
    label: 'PE',
    kind: 'percent',
    unit: '%',
    selfScope: true,
    activities: ['expedition', 'quest', 'battle'],
    help: 'Puissance d’expédition, comptée en expédition, en combat de dresseur et pour les conditions des quêtes.',
  },
  expeditionDuration: {
    group: 'Expéditions',
    label: 'Durée d’expédition',
    kind: 'percent',
    unit: '%',
    selfScope: false,
    activities: ['expedition', 'quest'],
    help: 'Temps avant le retour (−20 = 20 % plus court) ; les rencontres et le butin restent ceux de la durée choisie.',
  },
  encounters: {
    group: 'Expéditions',
    label: 'Nombre de rencontres',
    kind: 'percent',
    unit: '%',
    selfScope: false,
    activities: ['expedition'],
    help: 'Rencontres d’une expédition (Lumiattirance, Puanteur…).',
  },
  lootRolls: {
    group: 'Expéditions',
    label: 'Jets de butin',
    kind: 'percent',
    unit: '%',
    selfScope: false,
    activities: ['expedition', 'battle', 'dungeon'],
    help: 'Tirages de butin des expéditions, combats et donjons (arrondis au plus proche).',
  },
  capture: {
    group: 'Expéditions',
    label: 'Probabilité de capture',
    kind: 'percent',
    unit: '%',
    selfScope: false,
    activities: ['expedition', 'quest'],
    help: 'Probabilité de capture en expédition et face aux légendaires.',
  },
  wildLevel: {
    group: 'Expéditions',
    label: 'Niveau des sauvages',
    kind: 'flat',
    unit: 'niv.',
    selfScope: false,
    activities: ['expedition'],
    help: 'Niveaux ajoutés aux Pokémon rencontrés (Agitation, Pression, Esprit Vital) ; plus d’XP, captures plus fortes.',
  },
  shinyChance: {
    group: 'Expéditions',
    label: 'Chance shiny',
    kind: 'percent',
    unit: '%',
    selfScope: false,
    activities: ['expedition', 'breeding', 'museum'],
    help: 'Probabilité qu’une rencontre, un œuf ou un fossile ranimé soit shiny.',
  },
  opponentPower: {
    group: 'Combats de dresseurs',
    label: 'PE de l’adversaire',
    kind: 'percent',
    unit: '%',
    selfScope: false,
    activities: ['battle'],
    help: 'PE de l’équipe du dresseur (Intimidation : négatif).',
  },
  typeAdvantage: {
    group: 'Combats de dresseurs',
    label: 'Poids de l’avantage de types',
    kind: 'percent',
    unit: '%',
    selfScope: false,
    activities: ['battle'],
    help: 'Effet de l’avantage (ou du désavantage) de types sur la PE effective (Adaptabilité).',
  },
  battleDuration: {
    group: 'Combats de dresseurs',
    label: 'Durée du combat',
    kind: 'percent',
    unit: '%',
    selfScope: false,
    activities: ['battle'],
    help: 'Temps avant le résultat du combat.',
  },
  koDuration: {
    group: 'Combats de dresseurs',
    label: 'Durée de K.O.',
    kind: 'percent',
    unit: '%',
    selfScope: true,
    activities: ['battle', 'dungeon'],
    help: 'Durée d’indisponibilité après une défaite ou un K.O. (Médic Nature, Régé-Force : négatif).',
  },
  hp: {
    group: 'Donjons',
    label: 'PV',
    kind: 'percent',
    unit: '%',
    selfScope: true,
    activities: ['dungeon'],
    help: 'PV maximum en donjon.',
  },
  attack: {
    group: 'Donjons',
    label: 'Attaque',
    kind: 'percent',
    unit: '%',
    selfScope: true,
    activities: ['dungeon'],
    help: 'Attaque en donjon (Coloforce : +100).',
  },
  defense: {
    group: 'Donjons',
    label: 'Défense',
    kind: 'percent',
    unit: '%',
    selfScope: true,
    activities: ['dungeon'],
    help: 'Défense en donjon (Toison Épaisse : +100).',
  },
  specialAttack: {
    group: 'Donjons',
    label: 'Attaque Spéciale',
    kind: 'percent',
    unit: '%',
    selfScope: true,
    activities: ['dungeon'],
    help: 'Attaque Spéciale en donjon.',
  },
  specialDefense: {
    group: 'Donjons',
    label: 'Défense Spéciale',
    kind: 'percent',
    unit: '%',
    selfScope: true,
    activities: ['dungeon'],
    help: 'Défense Spéciale en donjon.',
  },
  speed: {
    group: 'Donjons',
    label: 'Vitesse',
    kind: 'percent',
    unit: '%',
    selfScope: true,
    activities: ['dungeon'],
    help: 'Vitesse en donjon : attaques plus rapprochées (Chlorophylle, Glissade).',
  },
  damageDealt: {
    group: 'Donjons',
    label: 'Dégâts infligés',
    kind: 'percent',
    unit: '%',
    selfScope: true,
    activities: ['dungeon'],
    help: 'Dégâts des attaques du Pokémon ; avec les conditions « type d’attaque », « PV sous » (Brasier, Torrent, Technicien).',
  },
  damageTaken: {
    group: 'Donjons',
    label: 'Dégâts reçus',
    kind: 'percent',
    unit: '%',
    selfScope: true,
    activities: ['dungeon'],
    help: 'Dégâts reçus par le Pokémon (Isograisse : −50 contre Feu et Glace ; Multiécaille : −50 PV au maximum).',
  },
  eggSpeed: {
    group: 'Élevage et Musée',
    label: 'Vitesse de ponte',
    kind: 'percent',
    unit: '%',
    selfScope: false,
    activities: ['breeding'],
    help: 'Rythme de ponte de la pension (+100 = deux fois plus d’œufs).',
  },
  inheritedIvs: {
    group: 'Élevage et Musée',
    label: 'IV hérités',
    kind: 'flat',
    unit: 'IV',
    selfScope: false,
    activities: ['breeding'],
    help: 'IV transmis par les parents en plus (6 au plus).',
  },
  hiddenAbility: {
    group: 'Élevage et Musée',
    label: 'Chance de talent caché',
    kind: 'flat',
    unit: 'pts',
    selfScope: false,
    activities: ['breeding', 'museum'],
    help: 'Points de % ajoutés à la chance du talent caché (héritage de la mère, fossile ranimé).',
  },
  perfectIvs: {
    group: 'Élevage et Musée',
    label: 'IV parfaits garantis',
    kind: 'flat',
    unit: 'IV',
    selfScope: false,
    activities: ['expedition', 'breeding', 'museum'],
    help: 'IV à 31 garantis aux sauvages, aux œufs ou aux fossiles ranimés (en plus de la chaîne).',
  },
  hatchTime: {
    group: 'Élevage et Musée',
    label: 'Durée d’éclosion',
    kind: 'percent',
    unit: '%',
    selfScope: false,
    activities: ['incubator'],
    help: 'Durée d’éclosion des œufs ramassés (Corps Ardent : −50).',
  },
  restoreTime: {
    group: 'Élevage et Musée',
    label: 'Durée de restauration',
    kind: 'percent',
    unit: '%',
    selfScope: false,
    activities: ['museum'],
    help: 'Durée de restauration des fossiles déposés.',
  },
  candies: {
    group: 'Élevage et Musée',
    label: 'Bonbons au transfert',
    kind: 'percent',
    unit: '%',
    selfScope: false,
    activities: ['transfer'],
    help: 'Bonbons de lignée reçus en transférant ce Pokémon.',
  },
  stab: {
    group: 'Donjons',
    label: 'Bonus de même type (STAB)',
    kind: 'percent',
    unit: '%',
    selfScope: true,
    activities: ['dungeon'],
    help: 'Bonus des attaques du même type que le Pokémon (Adaptabilité : +33).',
  },
};

// --- Environnement et conditions --------------------------------------------------------------

/** Pokémon dont le talent agit (membre d'équipe, parent, assistant). */
export type AbilityHolder = Pick<PokemonInstance, 'speciesId' | 'formId' | 'ability'> &
  Partial<Pick<PokemonInstance, 'nature' | 'gender'>>;

/** Ce qu'il faut garder d'un assistant pour rejouer plus tard l'effet de son talent. */
export function abilityHolder(pokemon: AbilityHolder): AbilityHolder {
  const { speciesId, formId, ability, nature, gender } = pokemon;
  return { speciesId, formId: formId ?? null, ability, nature, gender };
}

/** Contexte d'une activité : qui participe, et contre quoi. */
export interface AbilityEnv {
  activity: AbilityActivity;
  /** Équipe, dans l'ordre (le premier est en tête). */
  team: readonly AbilityHolder[];
  /** Types en affinité de la zone (expéditions). */
  zoneTypes?: readonly string[];
  /** Types de l'adversaire (équipe du dresseur, ou Pokémon en face). */
  opponentTypes?: readonly string[];
  /** Heure locale du joueur au départ (0 à 23) ; inconnue = conditions jour/nuit fausses. */
  hour?: number | null;
  /** Météo du lieu (zone, donjon) ; un talent de l'équipe peut en imposer une autre. */
  weather?: Weather | null;
  /** Météo déjà résolue (talents compris) : ne plus la recalculer. */
  weatherResolved?: boolean;
}

export const WEATHER_LABELS: Record<Weather, string> = {
  sun: 'Soleil',
  rain: 'Pluie',
  sand: 'Tempête de sable',
  hail: 'Grêle',
};

export const STATUS_LABELS: Record<Status, string> = {
  paralysis: 'Paralysie',
  burn: 'Brûlure',
  poison: 'Poison',
  sleep: 'Sommeil',
  freeze: 'Gel',
};

/**
 * Météo de l'activité : celle imposée par le premier Pokémon de l'équipe dont le talent en
 * impose une (Sécheresse…), sinon celle du lieu.
 */
export function resolveWeather(ctx: GameContext, env: AbilityEnv): Weather | null {
  if (env.weatherResolved) return env.weather ?? null;
  for (const [holder, member] of env.team.entries()) {
    for (const effect of ctx.ability(effectiveAbility(ctx, member))?.effects ?? []) {
      if (effect.type !== 'setWeather') continue;
      // Une condition de météo sur un effet qui impose la météo n'aurait pas de sens : ignorée.
      const ok = effect.conditions.every(
        (c) => c.type === 'weather' || conditionMet(ctx, env, holder, c),
      );
      if (ok) return effect.weather;
    }
  }
  return env.weather ?? null;
}

/** Environnement dont la météo est résolue (talents compris). */
export function withResolvedWeather(ctx: GameContext, env: AbilityEnv): AbilityEnv {
  return env.weatherResolved
    ? env
    : { ...env, weather: resolveWeather(ctx, env), weatherResolved: true };
}

/** Talent en vigueur : celui de la forme Méga pendant une Méga-Évolution, sinon le sien. */
export function effectiveAbility(
  ctx: GameContext,
  pokemon: Pick<PokemonInstance, 'speciesId' | 'formId' | 'ability'>,
): string {
  const species = ctx.species(pokemon.speciesId, pokemon.formId);
  return (species?.form?.kind === 'mega' && species.abilities[0]?.name) || pokemon.ability;
}

function conditionMet(
  ctx: GameContext,
  env: AbilityEnv,
  holder: number,
  condition: AbilityCondition,
): boolean {
  const any = (list: readonly string[] | undefined, wanted: readonly string[]) =>
    !!list && list.some((t) => wanted.includes(t));
  switch (condition.type) {
    case 'zoneType':
      return any(env.zoneTypes, condition.types);
    case 'opponentType':
      return any(env.opponentTypes, condition.types);
    case 'teamHasType':
      return env.team.some((m) => any(ctx.species(m.speciesId, m.formId)?.types, condition.types));
    case 'timeOfDay':
      return env.hour != null && timeOfDayAt(ctx, env.hour) === condition.time;
    case 'leader':
      return holder === 0;
    case 'solo':
      return env.team.length === 1;
    case 'weather':
      return !!env.weather && condition.weathers.includes(env.weather);
    // Conditions de l'instant (donjon) : seulement pour les dégâts, voir `deferredAbilityEffects`.
    case 'hpBelow':
    case 'fullHp':
    case 'attackType':
    case 'statused':
      return false;
  }
}

export interface ActiveAbilityEffect {
  /** Index du Pokémon qui a le talent dans l'équipe. */
  holder: number;
  effect: AbilityEffect;
}

/**
 * Effets des talents de l'équipe dont les conditions sont remplies, sauf celles des types
 * `deferred`, renvoyées pour être évaluées plus tard (en donjon, à chaque attaque).
 */
export function deferredAbilityEffects(
  ctx: GameContext,
  env: AbilityEnv,
  deferred: ReadonlySet<AbilityCondition['type']>,
): (ActiveAbilityEffect & { deferred: AbilityCondition[] })[] {
  const active: (ActiveAbilityEffect & { deferred: AbilityCondition[] })[] = [];
  env = withResolvedWeather(ctx, env);
  env.team.forEach((member, holder) => {
    for (const effect of ctx.ability(effectiveAbility(ctx, member))?.effects ?? []) {
      const later = effect.conditions.filter((c) => deferred.has(c.type));
      const now = effect.conditions.filter((c) => !deferred.has(c.type));
      if (now.every((c) => conditionMet(ctx, env, holder, c))) {
        active.push({ holder, effect, deferred: later });
      }
    }
  });
  return active;
}

/** Effets des talents de l'équipe dont les conditions sont remplies. */
export function activeAbilityEffects(ctx: GameContext, env: AbilityEnv): ActiveAbilityEffect[] {
  const active: ActiveAbilityEffect[] = [];
  env = withResolvedWeather(ctx, env);
  env.team.forEach((member, holder) => {
    for (const effect of ctx.ability(effectiveAbility(ctx, member))?.effects ?? []) {
      if (effect.conditions.every((c) => conditionMet(ctx, env, holder, c))) {
        active.push({ holder, effect });
      }
    }
  });
  return active;
}

// --- Modificateurs ---------------------------------------------------------------------------

/**
 * Somme des valeurs d'un paramètre pour l'activité. Avec `self`, compte aussi les effets
 * réservés au Pokémon d'index `self` ; sans, seulement ceux qui visent toute l'équipe.
 */
export function abilityModifier(
  ctx: GameContext,
  env: AbilityEnv,
  param: AbilityParam,
  self?: number,
): number {
  const info = ABILITY_PARAMS[param];
  if (!info.activities.includes(env.activity)) return 0;
  let total = 0;
  for (const { holder, effect } of activeAbilityEffects(ctx, env)) {
    if (effect.type !== 'modifier' || effect.param !== param) continue;
    if (info.selfScope && effect.scope === 'self' && holder !== self) continue;
    total += effect.value;
  }
  return total;
}

/** Multiplicateur d'un paramètre en % (+10 → ×1,1), jamais négatif. */
export function abilityMultiplier(
  ctx: GameContext,
  env: AbilityEnv,
  param: AbilityParam,
  self?: number,
): number {
  return Math.max(0, 1 + abilityModifier(ctx, env, param, self) / 100);
}

/** Bonus du joueur augmentés des bonus de capture, d'XP et d'argent des talents de l'équipe. */
export function abilityBonuses(
  ctx: GameContext,
  env: AbilityEnv,
  bonuses: PlayerBonuses,
): PlayerBonuses {
  const result = { ...bonuses };
  for (const type of ['capture', 'xp', 'money'] as const) {
    result[type] = Math.max(0, result[type] + abilityModifier(ctx, env, type) / 100);
  }
  return result;
}

/** Bonheur gagné (les pertes ne sont pas modifiées). */
export function abilityHappiness(ctx: GameContext, env: AbilityEnv, delta: number): number {
  return delta > 0 ? Math.round(delta * abilityMultiplier(ctx, env, 'happiness')) : delta;
}

/** Quantité entière multipliée par un paramètre (arrondie au plus proche). */
export function scaledByAbility(
  ctx: GameContext,
  env: AbilityEnv,
  param: AbilityParam,
  count: number,
): number {
  return Math.max(0, Math.round(count * abilityMultiplier(ctx, env, param)));
}

/** Valeur fixe d'un paramètre (IV, niveaux, points de %), arrondie et bornée. */
export function abilityFlat(
  ctx: GameContext,
  env: AbilityEnv,
  param: AbilityParam,
  min: number,
  max: number,
): number {
  return Math.min(max, Math.max(min, Math.round(abilityModifier(ctx, env, param))));
}

/** Durée en minutes multipliée par un paramètre (au moins une minute si elle était positive). */
export function durationWithAbility(
  ctx: GameContext,
  env: AbilityEnv,
  param: AbilityParam,
  minutes: number,
  self?: number,
): number {
  if (minutes <= 0) return minutes;
  return Math.max(1, Math.round(minutes * abilityMultiplier(ctx, env, param, self)));
}

// --- PE ----------------------------------------------------------------------------------------

type PowerHolder = Pick<
  PokemonInstance,
  'speciesId' | 'formId' | 'level' | 'ivs' | 'nature' | 'ability'
>;

/**
 * PE d'un Pokémon, bonus de PE de son talent compris. Sans environnement (affichage au PC),
 * seuls les effets sans condition comptent.
 */
export function memberPower(
  ctx: GameContext,
  pokemon: PowerHolder,
  env?: AbilityEnv,
  index = 0,
): number {
  const species = ctx.species(pokemon.speciesId, pokemon.formId);
  if (!species) return 0;
  const power = pokemonPower(species, pokemon);
  let percent = 0;
  if (env) {
    percent = abilityModifier(ctx, env, 'power', index);
  } else {
    for (const effect of ctx.ability(effectiveAbility(ctx, pokemon))?.effects ?? []) {
      if (effect.type === 'modifier' && effect.param === 'power' && effect.conditions.length === 0)
        percent += effect.value;
    }
  }
  return percent ? Math.max(0, Math.round(power * (1 + percent / 100))) : power;
}

/** PE de chaque membre dans l'activité (talents de toute l'équipe compris). */
export function teamMemberPowers(
  ctx: GameContext,
  team: readonly PowerHolder[],
  env: AbilityEnv,
): number[] {
  return team.map((m, i) => memberPower(ctx, m, env, i));
}

// --- Rencontres (expéditions) ------------------------------------------------------------------

/** Multiplicateur de poids des rencontres par type (Magnépiège, Statik…). */
export function attractedTypes(ctx: GameContext, env: AbilityEnv): Map<string, number> {
  const percents = new Map<string, number>();
  for (const { effect } of activeAbilityEffects(ctx, env)) {
    if (effect.type !== 'attractType') continue;
    percents.set(effect.pokemonType, (percents.get(effect.pokemonType) ?? 0) + effect.percent);
  }
  return new Map([...percents].map(([t, p]) => [t, Math.max(0, 1 + p / 100)]));
}

/**
 * Synchro et Joli Sourire : appliqués à un Pokémon sauvage tout juste généré. Aucun tirage sans
 * effet actif (les seeds des équipes sans ces talents restent inchangés).
 */
export function applyWildAbilities(
  ctx: GameContext,
  env: AbilityEnv,
  rng: Rng,
  wild: PokemonInstance,
): void {
  for (const { holder, effect } of activeAbilityEffects(ctx, env)) {
    const member = env.team[holder]!;
    if (effect.type === 'syncNature' && member.nature) {
      if (rng.chance(effect.chance)) wild.nature = member.nature;
    } else if (effect.type === 'attractGender' && wild.gender !== 'genderless') {
      const opposite: Gender | null =
        member.gender === 'male' ? 'female' : member.gender === 'female' ? 'male' : null;
      const species = ctx.species(wild.speciesId, wild.formId);
      // Espèces exclusivement mâles ou femelles : pas de changement possible.
      const mixed = species && species.genderRate > 0 && species.genderRate < 8;
      if (opposite && mixed && rng.chance(effect.chance)) wild.gender = opposite;
    }
  }
}

// --- Textes ----------------------------------------------------------------------------------

const typeNames = new Map(typeData.map((t) => [t.name, t.nameFr]));
const natureCount = natures.length;
export const typeNameFr = (type: string) => typeNames.get(type) ?? type;
const typeList = (types: readonly string[]) => types.map(typeNameFr).join('/');

export const ABILITY_CONDITION_LABELS: Record<AbilityCondition['type'], string> = {
  zoneType: 'Zone de type',
  opponentType: 'Adversaire de type',
  teamHasType: 'Équipe avec un Pokémon de type',
  timeOfDay: 'Moment de la journée',
  leader: 'En tête d’équipe',
  solo: 'Seul dans l’équipe',
  hpBelow: 'PV sous (donjon)',
  fullHp: 'PV au maximum (donjon)',
  attackType: 'Attaque de type (donjon)',
  weather: 'Météo',
  statused: 'A un statut (donjon)',
};

export function abilityConditionText(condition: AbilityCondition): string {
  switch (condition.type) {
    case 'zoneType':
      return `en zone ${typeList(condition.types)}`;
    case 'opponentType':
      return `contre ${typeList(condition.types)}`;
    case 'teamHasType':
      return `avec un Pokémon ${typeList(condition.types)} dans l’équipe`;
    case 'timeOfDay':
      return condition.time === 'day' ? 'de jour' : 'de nuit';
    case 'leader':
      return 'en tête d’équipe';
    case 'solo':
      return 'seul dans l’équipe';
    case 'hpBelow':
      return `PV sous ${Math.round(condition.fraction * 100)} %`;
    case 'fullHp':
      return 'PV au maximum';
    case 'attackType':
      return `attaques ${typeList(condition.types)}`;
    case 'weather':
      return `par ${condition.weathers.map((w) => WEATHER_LABELS[w].toLowerCase()).join(' ou ')}`;
    case 'statused':
      return 'avec un statut';
  }
}

export const ABILITY_EFFECT_LABELS: Record<AbilityEffectType, string> = {
  modifier: 'Modificateur',
  attractType: 'Attire un type',
  syncNature: 'Synchro (nature)',
  attractGender: 'Genre opposé',
  immunity: 'Immunité à un type',
  sturdy: 'Fermeté',
  regenerator: 'Soin au rappel',
  speedBoost: 'Vitesse croissante',
  moxie: 'Attaque après un K.O.',
  intimidate: 'Intimidation',
  contactDamage: 'Dégâts au contact',
  aftermath: 'Explosion au K.O.',
  setWeather: 'Impose une météo',
  inflictStatus: 'Inflige un statut',
  statusImmunity: 'Immunité à des statuts',
  naturalCure: 'Guéri au rappel',
  weatherImmunity: 'Insensible à la météo',
};

const signed = (n: number, unit: string) =>
  `${n < 0 ? '−' : '+'}${Math.abs(n).toLocaleString('fr-FR')}${unit === '%' ? ' %' : ` ${unit}`}`;
const percentOf = (chance: number) => `${Math.round(chance * 100)} %`;

/** « +10 % PE (soi) de nuit », « 50 % de sauvages de la même nature ». */
export function abilityEffectText(effect: AbilityEffect): string {
  let text: string;
  switch (effect.type) {
    case 'modifier': {
      const info = ABILITY_PARAMS[effect.param];
      const target = info.selfScope ? (effect.scope === 'self' ? ' (lui)' : ' (équipe)') : '';
      text = `${signed(effect.value, info.unit)} ${info.label}${target}`;
      break;
    }
    case 'attractType':
      text = `${signed(effect.percent, '%')} de rencontres ${typeNameFr(effect.pokemonType)}`;
      break;
    case 'syncNature':
      text = `${percentOf(effect.chance)} de sauvages de même nature (au lieu de 1/${natureCount})`;
      break;
    case 'attractGender':
      text = `${percentOf(effect.chance)} de sauvages du genre opposé`;
      break;
    case 'immunity':
      text = `Insensible aux attaques ${typeNameFr(effect.attackType)}${
        effect.heal > 0 ? ` (soigne ${percentOf(effect.heal)} de ses PV)` : ''
      }`;
      break;
    case 'sturdy':
      text = 'Survit à 1 PV à un coup fatal quand ses PV sont au maximum';
      break;
    case 'regenerator':
      text = `Récupère ${percentOf(effect.fraction)} de ses PV quand il est rappelé`;
      break;
    case 'speedBoost':
      text = `+${effect.percent} % de Vitesse après chaque attaque`;
      break;
    case 'moxie':
      text = `+${effect.percent} % d’Attaque après chaque K.O. infligé`;
      break;
    case 'intimidate':
      text = `−${effect.percent} % d’Attaque à l’adversaire en face, à son entrée`;
      break;
    case 'contactDamage':
      text = `L’attaquant perd ${percentOf(effect.fraction)} de ses PV à chaque attaque physique`;
      break;
    case 'aftermath':
      text = `Mis K.O. par une attaque physique, inflige ${percentOf(effect.fraction)} des PV de l’attaquant`;
      break;
    case 'setWeather':
      text = `Impose : ${WEATHER_LABELS[effect.weather].toLowerCase()}`;
      break;
    case 'inflictStatus':
      text = `${percentOf(effect.chance)} de ${STATUS_LABELS[effect.status].toLowerCase()} ${
        effect.trigger === 'contact' ? 'à qui le frappe (attaque physique)' : 'au Pokémon frappé'
      }`;
      break;
    case 'statusImmunity':
      text = `Insensible : ${effect.statuses.map((st) => STATUS_LABELS[st].toLowerCase()).join(', ')}`;
      break;
    case 'naturalCure':
      text = 'Guéri de son statut quand il est rappelé';
      break;
    case 'weatherImmunity':
      text = 'Insensible aux dégâts de la tempête de sable et de la grêle';
      break;
  }
  const conditions = effect.conditions.map(abilityConditionText);
  return conditions.length ? `${text}, ${conditions.join(', ')}` : text;
}

/** Effet d'un talent expliqué au joueur : texte de l'admin, sinon liste des effets ; null = aucun. */
export function abilityEffectSummary(ctx: GameContext, ability: string): string | null {
  const entry = ctx.ability(ability);
  if (!entry) return null;
  return entry.description.trim() || entry.effects.map(abilityEffectText).join(' · ') || null;
}
