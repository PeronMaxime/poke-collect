import type {
  AbilityCondition,
  AbilityEffect,
  AbilityEffectType,
  AbilityParam,
} from '@poke/content';
import type { AbilityActivity } from './activities';

/**
 * Catalogue des paramètres qu'un talent peut modifier : libellé, unité, activités concernées.
 * L'admin s'en sert pour proposer les réglages, le jeu pour les décrire. Et, pour les autres
 * effets (mécaniques), les activités où chacun agit.
 */

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

/** Combats en temps réel : donjons et dresseurs. */
const COMBAT: readonly AbilityActivity[] = ['battle', 'dungeon'];

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
    activities: COMBAT,
    help: 'Poké Dollars gagnés en combat de dresseur et en donjon.',
  },
  power: {
    group: 'Expéditions',
    label: 'PE',
    kind: 'percent',
    unit: '%',
    selfScope: true,
    activities: ['expedition', 'quest', 'battle'],
    help: 'Puissance d’expédition, comptée en expédition, pour la PE minimale des dresseurs et pour les conditions des quêtes.',
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
    help: 'Tirages de butin des expéditions, combats de dresseurs et donjons (arrondis au plus proche).',
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
    label: 'Chance chromatique',
    kind: 'percent',
    unit: '%',
    selfScope: false,
    activities: ['expedition', 'breeding', 'museum'],
    help: 'Probabilité qu’une rencontre, un œuf ou un fossile ranimé soit chromatique.',
  },
  koDuration: {
    group: 'Combats',
    label: 'Durée de K.O.',
    kind: 'percent',
    unit: '%',
    selfScope: true,
    activities: ['center'],
    help: 'Durée des soins au Centre Pokémon d’un Pokémon mis K.O. (Médic Nature, Attention : négatif ; Cœur Soin agit aussi chez l’assistant du Centre).',
  },
  hp: {
    group: 'Combats',
    label: 'PV',
    kind: 'percent',
    unit: '%',
    selfScope: true,
    activities: COMBAT,
    help: 'PV maximum en combat.',
  },
  attack: {
    group: 'Combats',
    label: 'Attaque',
    kind: 'percent',
    unit: '%',
    selfScope: true,
    activities: COMBAT,
    help: 'Attaque en combat (Coloforce : +100).',
  },
  defense: {
    group: 'Combats',
    label: 'Défense',
    kind: 'percent',
    unit: '%',
    selfScope: true,
    activities: COMBAT,
    help: 'Défense en combat (Toison Épaisse : +100).',
  },
  specialAttack: {
    group: 'Combats',
    label: 'Attaque Spéciale',
    kind: 'percent',
    unit: '%',
    selfScope: true,
    activities: COMBAT,
    help: 'Attaque Spéciale en combat.',
  },
  specialDefense: {
    group: 'Combats',
    label: 'Défense Spéciale',
    kind: 'percent',
    unit: '%',
    selfScope: true,
    activities: COMBAT,
    help: 'Défense Spéciale en combat.',
  },
  speed: {
    group: 'Combats',
    label: 'Vitesse',
    kind: 'percent',
    unit: '%',
    selfScope: true,
    activities: COMBAT,
    help: 'Vitesse en combat : attaques plus rapprochées (Chlorophylle, Glissade).',
  },
  damageDealt: {
    group: 'Combats',
    label: 'Dégâts infligés',
    kind: 'percent',
    unit: '%',
    selfScope: true,
    activities: COMBAT,
    help: 'Dégâts des attaques du Pokémon ; avec les conditions « type d’attaque », « PV sous » (Brasier, Torrent, Technicien).',
  },
  damageTaken: {
    group: 'Combats',
    label: 'Dégâts reçus',
    kind: 'percent',
    unit: '%',
    selfScope: true,
    activities: COMBAT,
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
  berryYield: {
    group: 'Ferme à baies',
    label: 'Baies récoltées',
    kind: 'flat',
    unit: 'baie(s)',
    selfScope: false,
    activities: ['farm'],
    help: 'Baies en plus par parcelle récoltée, chez l’assistant de récolte de la ferme (seuls les Pokémon dont le talent l’augmente peuvent tenir ce poste).',
  },
  berryGrowth: {
    group: 'Ferme à baies',
    label: 'Vitesse de pousse',
    kind: 'percent',
    unit: '%',
    selfScope: false,
    activities: ['farm'],
    help: 'Vitesse de pousse des baies, chez l’assistant de la ferme qui arrose le champ (+100 = deux fois plus vite).',
  },
  critChance: {
    group: 'Combats',
    label: 'Taux de critique',
    kind: 'percent',
    unit: '%',
    selfScope: true,
    activities: COMBAT,
    help: 'Chance de coup critique en combat, relative au taux de l’équilibrage (Super Chance : +100, soit ×2).',
  },
  stab: {
    group: 'Combats',
    label: 'Bonus de même type (STAB)',
    kind: 'percent',
    unit: '%',
    selfScope: true,
    activities: COMBAT,
    help: 'Bonus des attaques du même type que le Pokémon (Adaptabilité : +33).',
  },
};

/** Activités touchées par chaque type d'effet (hors modificateur : voir son paramètre). */
const EFFECT_ACTIVITIES: Record<Exclude<AbilityEffectType, 'modifier'>, AbilityActivity[]> = {
  attractType: ['expedition'],
  syncNature: ['expedition'],
  attractGender: ['expedition'],
  copyZoneAffinity: ['expedition', 'quest'],
  setWeather: ['expedition', ...COMBAT],
  immunity: [...COMBAT],
  sturdy: [...COMBAT],
  regenerator: [...COMBAT],
  speedBoost: [...COMBAT],
  moxie: [...COMBAT],
  intimidate: [...COMBAT],
  contactDamage: [...COMBAT],
  aftermath: [...COMBAT],
  inflictStatus: [...COMBAT],
  statusImmunity: [...COMBAT],
  naturalCure: [...COMBAT],
  critImmunity: [...COMBAT],
  weatherImmunity: [...COMBAT],
  suppressAbility: [...COMBAT],
};

/** Activités où un effet de talent agit. */
export const effectActivities = (effect: AbilityEffect): readonly AbilityActivity[] =>
  effect.type === 'modifier'
    ? ABILITY_PARAMS[effect.param].activities
    : EFFECT_ACTIVITIES[effect.type];

/** Conditions sur l'état du Pokémon (combat) : aussi évaluées en continu pour ses statistiques. */
export const STATE_CONDITION_TYPES: ReadonlySet<AbilityCondition['type']> = new Set([
  'hpBelow',
  'fullHp',
  'statused',
]);

/** Statistiques de combat que l'état du Pokémon peut conditionner (pas les PV max). */
export const STATE_STAT_PARAMS: ReadonlySet<AbilityParam> = new Set([
  'attack',
  'defense',
  'specialAttack',
  'specialDefense',
  'speed',
]);
