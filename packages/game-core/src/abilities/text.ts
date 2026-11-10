import type {
  AbilityCondition,
  AbilityEffect,
  AbilityEffectType,
  DungeonStat,
  ImposedWeather,
  Status,
} from '@poke/content';
import { natures, types as typeData } from '@poke/data';
import type { GameContext } from '../context';
import type { AbilityActivity } from './activities';
import { helpsAsAssistant } from './effects';
import { ABILITY_PARAMS, effectActivities } from './params';

/**
 * Libellés et phrases : conditions et effets des talents décrits en clair, pour le jeu, le wiki
 * et l'admin.
 */

export const WEATHER_LABELS: Record<ImposedWeather, string> = {
  clear: 'Temps clair',
  sun: 'Soleil',
  rain: 'Pluie',
  sand: 'Tempête de sable',
  hail: 'Grêle',
};

/** Nom de chaque statut. */
export const STATUS_LABELS: Record<Status, string> = {
  paralysis: 'Paralysie',
  burn: 'Brûlure',
  poison: 'Poison',
  sleep: 'Sommeil',
  freeze: 'Gel',
};

/** Statistiques modifiables en combat (Intimidation). */
export const DUNGEON_STAT_LABELS: Record<DungeonStat, string> = {
  attack: 'Attaque',
  defense: 'Défense',
  'special-attack': 'Attaque Spéciale',
  'special-defense': 'Défense Spéciale',
  speed: 'Vitesse',
};

/** « l’Attaque et la Vitesse ». */
function dungeonStatsText(stats: readonly DungeonStat[]): string {
  const names = stats.map(
    (st) =>
      `${st === 'attack' || st === 'special-attack' ? 'l’' : 'la '}${DUNGEON_STAT_LABELS[st]}`,
  );
  return names.length > 1
    ? `${names.slice(0, -1).join(', ')} et ${names.at(-1)}`
    : (names[0] ?? '');
}

const typeNames = new Map(typeData.map((t) => [t.name, t.nameFr]));

const natureCount = natures.length;

/** Nom français d'un type (le nom PokéAPI s'il est inconnu). */
const typeNameFr = (type: string) => typeNames.get(type) ?? type;

const typeList = (types: readonly string[]) => types.map(typeNameFr).join('/');

/** Nom de chaque type de condition, pour les formulaires de l'admin. */
export const ABILITY_CONDITION_LABELS: Record<AbilityCondition['type'], string> = {
  zoneType: 'Zone de type',
  opponentType: 'Adversaire de type',
  teamHasType: 'Équipe avec un Pokémon de type',
  timeOfDay: 'Moment de la journée',
  leader: 'En tête d’équipe',
  solo: 'Seul dans l’équipe',
  hpBelow: 'PV sous (combat)',
  fullHp: 'PV au maximum (combat)',
  attackType: 'Attaque de type (combat)',
  attackCategory: 'Attaque physique / spéciale (combat)',
  weather: 'Météo',
  statused: 'A un statut (combat)',
  superEffective: 'Attaque super efficace (combat)',
  notVeryEffective: 'Attaque peu efficace (combat)',
};

/**
 * Une condition en clair, telle qu'elle se lit dans une phrase (« en zone Eau », « contre Feu »).
 */
function abilityConditionText(condition: AbilityCondition): string {
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
    case 'attackCategory':
      return condition.category === 'physical' ? 'attaques physiques' : 'attaques spéciales';
    case 'weather':
      return `par ${condition.weathers.map((w) => WEATHER_LABELS[w].toLowerCase()).join(' ou ')}`;
    case 'statused':
      return 'avec un statut';
    case 'superEffective':
      return 'attaques super efficaces';
    case 'notVeryEffective':
      return 'attaques peu efficaces';
  }
}

/** Nom de chaque type d'effet, pour les formulaires de l'admin. */
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
  critImmunity: 'Immunité aux critiques',
  weatherImmunity: 'Insensible à la météo',
  copyZoneAffinity: 'Copie l’affinité de la zone',
  suppressAbility: 'Neutralise le talent adverse',
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
    case 'critImmunity':
      text = 'Ne subit jamais de coup critique';
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
      text = `À son entrée, baisse de ${effect.percent} % ${dungeonStatsText(effect.stats)} du Pokémon en face`;
      break;
    case 'contactDamage':
      text = `L’attaquant perd ${percentOf(effect.fraction)} de ses PV à chaque attaque physique`;
      break;
    case 'aftermath':
      text = `Mis K.O. par une attaque physique, inflige ${percentOf(effect.fraction)} des PV de l’attaquant`;
      break;
    case 'setWeather':
      text =
        effect.weather === 'clear'
          ? 'Annule la météo (temps clair)'
          : `Impose : ${WEATHER_LABELS[effect.weather].toLowerCase()}`;
      break;
    case 'inflictStatus':
      text = `${percentOf(effect.chance)} de ${STATUS_LABELS[effect.status].toLowerCase()} ${
        effect.trigger === 'contact' ? 'à qui le frappe (attaque physique)' : 'au Pokémon frappé'
      }`;
      break;
    case 'statusImmunity':
      text = `Insensible : ${effect.statuses.map((st) => STATUS_LABELS[st].toLowerCase()).join(', ')}${
        effect.scope === 'team' ? ' (équipe)' : ' (lui)'
      }`;
      break;
    case 'naturalCure':
      text = 'Guéri de son statut quand il est rappelé';
      break;
    case 'weatherImmunity':
      text = 'Insensible aux dégâts de la tempête de sable et de la grêle';
      break;
    case 'copyZoneAffinity':
      text = 'Compte comme ayant le type d’affinité de la zone (bonus de capture)';
      break;
    case 'suppressAbility':
      text = 'Tant qu’il est sur le terrain, le talent du Pokémon en face ne joue plus';
      break;
  }
  const conditions = effect.conditions.map(abilityConditionText);
  return conditions.length ? `${text}, ${conditions.join(', ')}` : text;
}

/**
 * Effet d'un talent expliqué au joueur : texte de l'admin, sinon liste des effets ; null = aucun.
 * Avec `activities` (Pokémon occupé, assistant, parent en pension), seulement les effets qui y
 * agissent (le texte de l'admin, qui décrit tout le talent, n'est alors pas repris).
 */
export function abilityEffectSummary(
  ctx: GameContext,
  ability: string,
  activities?: readonly AbilityActivity[],
  /** Seulement les effets qui agissent chez l'assistant (voir `helpsAsAssistant`). */
  assistant = false,
): string | null {
  const entry = ctx.ability(ability);
  if (!entry) return null;
  if (activities) {
    const effects = entry.effects.filter((e) =>
      activities.some((a) =>
        assistant ? helpsAsAssistant(e, a) : effectActivities(e).includes(a),
      ),
    );
    return effects.map(abilityEffectText).join(' · ') || null;
  }
  return entry.description.trim() || entry.effects.map(abilityEffectText).join(' · ') || null;
}
