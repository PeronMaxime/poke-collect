import { z } from 'zod';
import { slugSchema } from './common';
import { probabilitySchema } from './internal';
import { dungeonStatSchema, imposedWeatherSchema, statusSchema, weatherSchema } from './weather';

/**
 * Talents : conditions et effets.
 */

/**
 * Paramètres du jeu qu'un talent peut modifier (voir le catalogue `ABILITY_PARAMS` de game-core
 * pour l'unité, la portée et les activités concernées).
 */
export const ABILITY_PARAM_IDS = [
  // Général
  'xp',
  'happiness',
  'money',
  // Expéditions
  'power',
  'expeditionDuration',
  'encounters',
  'lootRolls',
  'capture',
  'wildLevel',
  'shinyChance',
  // Combats (donjons et dresseurs)
  'koDuration',
  'hp',
  'attack',
  'defense',
  'specialAttack',
  'specialDefense',
  'speed',
  'damageDealt',
  'damageTaken',
  'stab',
  'critChance',
  // Élevage, couveuse, Musée et transfert
  'eggSpeed',
  'inheritedIvs',
  'perfectIvs',
  'hatchTime',
  'restoreTime',
  'candies',
  // Ferme à baies
  'berryYield',
  'berryGrowth',
] as const;

export const abilityParamSchema = z.enum(ABILITY_PARAM_IDS);

export type AbilityParam = z.infer<typeof abilityParamSchema>;

/** Condition d'un effet de talent, évaluée pour le Pokémon qui a le talent. */
export const abilityConditionSchema = z.discriminatedUnion('type', [
  /** La zone d'expédition a l'un de ces types en affinité. */
  z.object({ type: z.literal('zoneType'), types: z.array(z.string().min(1)).min(1) }),
  /** L'adversaire (équipe du dresseur, ou Pokémon en face) a l'un de ces types. */
  z.object({ type: z.literal('opponentType'), types: z.array(z.string().min(1)).min(1) }),
  /** L'équipe compte au moins un Pokémon de l'un de ces types (lui compris). */
  z.object({ type: z.literal('teamHasType'), types: z.array(z.string().min(1)).min(1) }),
  /** Moment de la journée (heure locale du joueur au départ). */
  z.object({ type: z.literal('timeOfDay'), time: z.enum(['day', 'night']) }),
  /** Le Pokémon est en tête d'équipe. */
  z.object({ type: z.literal('leader') }),
  /** Le Pokémon est seul dans l'équipe. */
  z.object({ type: z.literal('solo') }),
  /** Combat : PV du Pokémon sous cette fraction (Brasier, Torrent : 1/3). */
  z.object({ type: z.literal('hpBelow'), fraction: z.number().gt(0).max(1) }),
  /** Combat : PV du Pokémon au maximum (Multiécaille). */
  z.object({ type: z.literal('fullHp') }),
  /** Combat : l'attaque donnée ou reçue est de l'un de ces types (Isograisse, Brasier). */
  z.object({ type: z.literal('attackType'), types: z.array(z.string().min(1)).min(1) }),
  /** Combat : l'attaque donnée ou reçue est physique ou spéciale (Écaille Spéciale, Toison Épaisse). */
  z.object({ type: z.literal('attackCategory'), category: z.enum(['physical', 'special']) }),
  /** Météo de la zone, du dresseur ou du donjon (ou imposée par un talent) : Chlorophylle, Glissade. */
  z.object({ type: z.literal('weather'), weathers: z.array(weatherSchema).min(1) }),
  /** Combat : le Pokémon a un statut (Cran, Écaille Spéciale). */
  z.object({ type: z.literal('statused') }),
  /** Combat : l'attaque donnée ou reçue est super efficace (Filtre, Solide Roc, Ceinture Pro). */
  z.object({ type: z.literal('superEffective') }),
  /** Combat : l'attaque donnée ou reçue est peu efficace (Lentille Teintée). */
  z.object({ type: z.literal('notVeryEffective') }),
]);

export type AbilityCondition = z.infer<typeof abilityConditionSchema>;

export type AbilityConditionType = AbilityCondition['type'];

const abilityConditionsSchema = z.array(abilityConditionSchema).default([]);

/**
 * Effets de talent, actifs tant que le Pokémon qui a le talent participe (équipe envoyée).
 * Les valeurs d'un même paramètre s'additionnent entre membres et avec les bonus du joueur.
 */
export const abilityEffectSchema = z.discriminatedUnion('type', [
  /**
   * Modifie un paramètre du jeu, en % ou en valeur fixe selon le paramètre. `self` : seulement
   * pour le Pokémon qui a le talent ; `team` : pour toute l'équipe.
   */
  z.object({
    type: z.literal('modifier'),
    param: abilityParamSchema,
    value: z.number().min(-1000).max(1000),
    scope: z.enum(['self', 'team']).default('self'),
    conditions: abilityConditionsSchema,
  }),
  /** Expédition : les Pokémon de ce type apparaissent plus souvent (Magnépiège, Statik…). */
  z.object({
    type: z.literal('attractType'),
    pokemonType: z.string().min(1),
    percent: z.number().min(-90).max(1000),
    conditions: abilityConditionsSchema,
  }),
  /** Expédition : chance que les sauvages aient la nature du Pokémon (Synchro). */
  z.object({
    type: z.literal('syncNature'),
    chance: probabilitySchema,
    conditions: abilityConditionsSchema,
  }),
  /** Expédition : chance que les sauvages soient du genre opposé (Joli Sourire). */
  z.object({
    type: z.literal('attractGender'),
    chance: probabilitySchema,
    conditions: abilityConditionsSchema,
  }),
  /**
   * Combat : insensible aux attaques d'un type, et soigne `heal` de ses PV max à chaque attaque
   * absorbée (Lévitation, Absorbe-Eau, Absorbe-Volt, Torche).
   */
  z.object({
    type: z.literal('immunity'),
    attackType: z.string().min(1),
    heal: probabilitySchema,
    conditions: abilityConditionsSchema,
  }),
  /** Combat : survit à 1 PV à un coup fatal reçu PV au maximum, une fois (Fermeté). */
  z.object({ type: z.literal('sturdy'), conditions: abilityConditionsSchema }),
  /** Combat : soigne cette fraction de ses PV max quand le joueur le rappelle (Régé-Force). */
  z.object({
    type: z.literal('regenerator'),
    fraction: probabilitySchema,
    conditions: abilityConditionsSchema,
  }),
  /** Combat : Vitesse augmentée de ce pourcentage après chacune de ses attaques (Turbo). */
  z.object({
    type: z.literal('speedBoost'),
    percent: z.number().positive().max(100),
    conditions: abilityConditionsSchema,
  }),
  /** Combat : Attaque et Attaque Spéciale augmentées après chaque K.O. infligé (Impudence). */
  z.object({
    type: z.literal('moxie'),
    percent: z.number().positive().max(100),
    conditions: abilityConditionsSchema,
  }),
  /** Combat : à son entrée, baisse ces statistiques du Pokémon en face (Intimidation). */
  z.object({
    type: z.literal('intimidate'),
    percent: z.number().positive().max(90),
    /** Absent (contenu antérieur) = Attaque et Attaque Spéciale. */
    stats: z.array(dungeonStatSchema).min(1).default(['attack', 'special-attack']),
    conditions: abilityConditionsSchema,
  }),
  /** Combat : l'attaquant perd cette fraction de ses PV max à chaque attaque physique reçue (Peau Dure). */
  z.object({
    type: z.literal('contactDamage'),
    fraction: probabilitySchema,
    conditions: abilityConditionsSchema,
  }),
  /** Impose sa météo à l'expédition ou au combat (Sécheresse, Crachin, Sable Volant, Alerte Neige). */
  z.object({
    type: z.literal('setWeather'),
    weather: imposedWeatherSchema,
    conditions: abilityConditionsSchema,
  }),
  /**
   * Combat : chance d'infliger un statut. `contact` : à l'attaquant qui le frappe d'une attaque
   * physique (Statik, Point Poison, Corps Ardent) ; `attack` : au Pokémon qu'il frappe (Toxitouche).
   */
  z.object({
    type: z.literal('inflictStatus'),
    status: statusSchema,
    chance: probabilitySchema,
    trigger: z.enum(['contact', 'attack']),
    conditions: abilityConditionsSchema,
  }),
  /**
   * Combat : insensible à ces statuts (Insomnia, Vaccin, Échauffement, Ignifu-Voile). `team` :
   * toute l'équipe en profite (Voile Aroma, Voile Pastel).
   */
  z.object({
    type: z.literal('statusImmunity'),
    statuses: z.array(statusSchema).min(1),
    scope: z.enum(['self', 'team']).default('self'),
    conditions: abilityConditionsSchema,
  }),
  /** Expédition : compte comme ayant le type d'affinité de la zone (Calque). */
  z.object({ type: z.literal('copyZoneAffinity'), conditions: abilityConditionsSchema }),
  /** Combat : tant qu'il est sur le terrain, le talent du Pokémon en face ne joue plus (Gaz Inhibiteur). */
  z.object({ type: z.literal('suppressAbility'), conditions: abilityConditionsSchema }),
  /** Combat : guéri de son statut quand le joueur le rappelle (Médic Nature). */
  z.object({ type: z.literal('naturalCure'), conditions: abilityConditionsSchema }),
  /** Combat : insensible aux dégâts de la tempête de sable et de la grêle (Envelocape, Voile Sable). */
  z.object({ type: z.literal('weatherImmunity'), conditions: abilityConditionsSchema }),
  /** Combat : ne subit jamais de coup critique (Armurbaston, Coque Armure). */
  z.object({ type: z.literal('critImmunity'), conditions: abilityConditionsSchema }),
  /** Combat : mis K.O. par une attaque physique, inflige cette fraction de ses PV max à l'attaquant (Boom Final). */
  z.object({
    type: z.literal('aftermath'),
    fraction: probabilitySchema,
    conditions: abilityConditionsSchema,
  }),
]);

export type AbilityEffect = z.infer<typeof abilityEffectSchema>;

export type AbilityEffectType = AbilityEffect['type'];

export const ABILITY_EFFECT_TYPES: readonly AbilityEffectType[] = abilityEffectSchema.options.map(
  (o) => o.shape.type.value,
);

/** Effet en jeu d'un talent PokéAPI ; un talent sans entrée n'a aucun effet. */
export const abilitySchema = z.object({
  /** Nom PokéAPI du talent (`intimidate`). */
  id: slugSchema,
  /** Effet expliqué au joueur (vide = texte déduit des effets). */
  description: z.string().max(500),
  effects: z.array(abilityEffectSchema),
});

export type GameAbility = z.infer<typeof abilitySchema>;
