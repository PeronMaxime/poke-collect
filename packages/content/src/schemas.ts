import { z } from 'zod';
import { pokemonTypes, typeWeaknesses } from '@poke/data';

/**
 * Schémas du contenu configurable (édité dans le panneau d'admin, stocké en base).
 * Les mêmes schémas valident le contenu côté serveur et les formulaires de l'admin.
 */

export const slugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Identifiant attendu en minuscules-avec-tirets');

const nameSchema = z.string().trim().min(1, 'Obligatoire').max(64);
/** URL complète, ou chemin servi par l'API (ex. `/api/sprites/trainers/brock.png`). */
const imageSchema = z
  .string()
  .refine((v) => /^\/[^/]/.test(v) || z.url().safeParse(v).success, 'URL invalide')
  .nullable();
const probabilitySchema = z.number().min(0).max(1);
/**
 * Forme alternative ou régionale (identifiant PokéAPI `pokemon`, ex. Goupix d'Alola) ;
 * null ou absente = forme par défaut. Elle doit appartenir à l'espèce (alertes de cohérence).
 */
const formIdSchema = z.int().positive().nullish();

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
export const raritySchema = z.enum(RARITIES);
export type Rarity = z.infer<typeof raritySchema>;

// --- Réglages d'équilibrage -------------------------------------------------

export const itemStackSchema = z.object({
  itemId: slugSchema,
  quantity: z.int().min(1),
});
export type ItemStack = z.infer<typeof itemStackSchema>;

/** Attaque utilisée en donjon par les Pokémon d'un type (une seule attaque par type). */
export const dungeonAttackSchema = z.object({
  name: nameSchema,
  power: z.int().min(1).max(250),
});
export type DungeonAttack = z.infer<typeof dungeonAttackSchema>;

/** Niveaux de difficulté des donjons, du plus simple au plus dur. */
export const DUNGEON_DIFFICULTIES = ['easy', 'hard', 'veryHard', 'extreme'] as const;
export const dungeonDifficultySchema = z.enum(DUNGEON_DIFFICULTIES);
export type DungeonDifficulty = z.infer<typeof dungeonDifficultySchema>;

/**
 * Niveau de difficulté : une simple information pour le joueur (les niveaux, le temps et la
 * récompense se règlent sur chaque donjon).
 */
export const dungeonDifficultySettingsSchema = z.object({
  name: nameSchema,
});
export type DungeonDifficultySettings = z.infer<typeof dungeonDifficultySettingsSchema>;

/** Réglages des combats de donjon (temps réel). */
export const dungeonSettingsSchema = z.object({
  maxTeamSize: z.int().min(1).max(6),
  /**
   * Délai entre deux attaques = délai de référence × vitesse de référence / Vitesse du Pokémon,
   * borné par le minimum et le maximum.
   */
  baseAttackIntervalMs: z.int().min(100).max(60_000),
  referenceSpeed: z.int().min(1).max(1000),
  minAttackIntervalMs: z.int().min(100).max(60_000),
  maxAttackIntervalMs: z.int().min(100).max(60_000),
  /**
   * Dégâts = ((2 × niveau / 5 + 2) × puissance × Att / Déf / 50 + 2) × bonus de type (STAB)
   * × efficacité × aléa (entre `minDamageRoll` et 1) × multiplicateur.
   */
  damageMultiplier: z.number().positive().max(100),
  stabMultiplier: z.number().min(1).max(5),
  minDamageRoll: probabilitySchema,
  /** IV des adversaires quand l'admin n'en fixe pas. */
  defaultOpponentIv: z.int().min(0).max(31),
  /** Nom affiché de chaque niveau de difficulté. */
  difficulties: z.object({
    easy: dungeonDifficultySettingsSchema,
    hard: dungeonDifficultySettingsSchema,
    veryHard: dungeonDifficultySettingsSchema,
    extreme: dungeonDifficultySettingsSchema,
  }),
  /** Temps de recharge d'un donjon après chaque tentative (surchargeable par donjon). */
  cooldownMinutes: z.int().min(0),
  /** Durée de K.O. des Pokémon mis K.O. dans un donjon (surchargeable par donjon). */
  koMinutes: z.int().min(0),
  /** XP par membre = Σ (XP de base × niveau / 7) des adversaires vaincus × multiplicateur. */
  xpMultiplier: z.number().min(0),
  happinessOnWin: z.int().min(-255).max(255),
  happinessOnLoss: z.int().min(-255).max(255),
  /** Attaque de chaque type (clé : type PokéAPI, ex. `fire`). */
  attacks: z.record(z.string().min(1), dungeonAttackSchema),
  /** Les adversaires ont le premier talent de leur espèce (ou de leur forme Méga). */
  enemyAbilities: z.boolean().default(false),
});
export type DungeonSettings = z.infer<typeof dungeonSettingsSchema>;

// --- Menu du jeu ---------------------------------------------------------------

/** Onglets du jeu (l'identifiant est aussi l'ancre de l'URL : `#pc`). */
export const MENU_TABS = [
  { id: 'expeditions', label: 'Expéditions' },
  { id: 'battles', label: 'Combats' },
  { id: 'dungeons', label: 'Donjons' },
  { id: 'quests', label: 'Quêtes' },
  { id: 'daycare', label: 'Pension' },
  { id: 'museum', label: 'Musée' },
  { id: 'pc', label: 'PC' },
  { id: 'teams', label: 'Équipe Pkmn' },
  { id: 'pokedex', label: 'Pokédex' },
  { id: 'shop', label: 'Boutique' },
  { id: 'bag', label: 'Sac' },
  { id: 'trainer', label: 'Fiche Dresseur' },
  { id: 'leaderboard', label: 'Classement' },
] as const;
export type MenuTabId = (typeof MENU_TABS)[number]['id'];

/** Groupes du menu quand l'admin n'en a pas défini. */
export const DEFAULT_MENU_GROUPS: MenuTabId[][] = [
  ['expeditions', 'battles', 'dungeons', 'quests'],
  ['daycare', 'museum'],
  ['pc', 'teams', 'pokedex', 'shop', 'bag'],
  ['trainer', 'leaderboard'],
];

/**
 * Groupes d'onglets du menu, séparés par un trait (sans titre). Identifiants libres : un onglet
 * retiré du code est ignoré, un onglet absent est ajouté à la fin (voir `normalizeMenuGroups`).
 */
export const menuSettingsSchema = z.object({
  groups: z.array(z.array(z.string())),
});
export type MenuSettings = z.infer<typeof menuSettingsSchema>;

/** Groupes prêts à afficher : onglets inconnus et doublons retirés, oubliés ajoutés, vides retirés. */
export function normalizeMenuGroups(groups: readonly (readonly string[])[] | undefined) {
  const known = new Set<string>(MENU_TABS.map((t) => t.id));
  const seen = new Set<string>();
  const result = (groups ?? DEFAULT_MENU_GROUPS).map((g) =>
    g.filter((id) => known.has(id) && !seen.has(id) && seen.add(id)),
  ) as MenuTabId[][];
  // Onglet oublié (souvent ajouté au jeu après le réglage de l'admin) : placé après son voisin
  // dans les groupes par défaut s'il est affiché, sinon dans un groupe final.
  const missing: MenuTabId[] = [];
  for (const id of MENU_TABS.map((t) => t.id).filter((id) => !seen.has(id))) {
    const defaults = DEFAULT_MENU_GROUPS.find((g) => g.includes(id)) ?? [];
    const before = defaults.slice(0, defaults.indexOf(id)).reverse();
    const anchor = before.find((other) => seen.has(other));
    const group = anchor && result.find((g) => g.includes(anchor));
    if (group) group.splice(group.indexOf(anchor) + 1, 0, id);
    else missing.push(id);
    seen.add(id);
  }
  if (missing.length) result.push(missing);
  return result.filter((g) => g.length > 0);
}

export const balanceSettingsSchema = z.object({
  expeditions: z.object({
    initialSlots: z.int().min(1).max(6),
    maxSlots: z.int().min(1).max(6),
    maxTeamSize: z.int().min(1).max(6),
    durationsMinutes: z.array(z.int().positive()).min(1),
    encountersPerHour: z.number().positive(),
    minEncounters: z.int().min(0),
    lootRollsPerHour: z.number().min(0),
    minLootRolls: z.int().min(0),
    /**
     * Rendements décroissants : quantité = (durée en h) ^ exposant × taux horaire.
     * 1 = linéaire ; < 1 = les expéditions longues rapportent moins par heure.
     */
    durationExponent: z.number().min(0.1).max(1),
  }),
  capture: z.object({
    /** Multiplicateur global de la probabilité de capture. */
    globalMultiplier: z.number().positive(),
    /** PV restants supposés du Pokémon sauvage (1 = pleine santé), comme dans la formule officielle. */
    assumedHpFraction: z.number().min(0).max(1),
    /** Bonus de capture par membre de l'équipe ayant un type en affinité avec la zone. */
    affinityBonusPerPokemon: z.number().min(0),
    hiddenAbilityChance: probabilitySchema,
  }),
  shiny: z.object({
    /** Taux de base = 1 / baseRateDenominator (rencontres et éclosions). */
    baseRateDenominator: z.int().min(1),
    /**
     * Chaîne de zone : bonus par expédition relancée de suite dans la même zone
     * (0.25 = +25 % par maillon), plafonné par `chainMaxMultiplier`.
     */
    chainBonusPerExpedition: z.number().min(0),
    chainMaxMultiplier: z.number().min(1),
    /** Délai pour relancer la zone après avoir récupéré l'expédition précédente. */
    chainWindowMinutes: z.int().min(1),
    /**
     * Maillons à atteindre pour garantir des IV parfaits aux Pokémon sauvages de la zone :
     * le n-ième palier (ordre croissant) garantit n IV à 31.
     */
    chainPerfectIvThresholds: z
      .array(z.int().positive())
      .max(6, 'Six paliers au plus (un par statistique)')
      .refine(
        (t) => t.every((v, i) => i === 0 || v > t[i - 1]!),
        'Paliers croissants et distincts',
      ),
    /** Élevage : parents d'origines différentes (régions de capture), comme la méthode Masuda. */
    masudaMultiplier: z.number().min(1),
  }),
  pity: z.object({
    /** Bonus de poids de rencontre par échec (0.05 = +5 %). */
    weightBonusPerMiss: z.number().min(0),
    maxMultiplier: z.number().min(1),
  }),
  xp: z.object({
    /** XP par rencontre = XP de base de l'espèce × niveau / 7 × multiplicateur. */
    multiplier: z.number().min(0),
    happinessPerExpedition: z.int().min(0).max(255),
  }),
  breeding: z.object({
    /** Temps d'éclosion = cycles d'éclosion de l'espèce (`hatch_counter`) × cette durée. */
    hatchMinutesPerCounter: z.number().positive(),
    /** Un couple en pension pond un œuf toutes les `eggMinutes` minutes. */
    eggMinutes: z.number().positive(),
    /** Capacité de la couveuse : œufs en attente d'éclosion au maximum. */
    maxEggs: z.int().min(1).max(30),
    /** IV transmis par les parents sans objet (3 dans les jeux récents). */
    inheritedIvCount: z.int().min(0).max(6),
    /** Chance de transmettre le talent caché de la mère (ou du parent non Métamorph). */
    hiddenAbilityInheritChance: probabilitySchema,
    eggLevel: z.int().min(1).max(100),
  }),
  transfer: z.object({
    /** Bonbons de lignée reçus par Pokémon transféré. */
    candiesPerPokemon: z.int().min(0),
    /** Bonus pour un Pokémon shiny (s'ajoute). */
    shinyBonusCandies: z.int().min(0),
    /** XP donnée par un Bonbon de lignée. */
    xpPerCandy: z.int().min(0),
  }),
  daycare: z.object({
    initialSlots: z.int().min(0),
    maxSlots: z.int().min(1),
  }),
  museum: z.object({
    /** Fossiles en cours de restauration au Musée au maximum (en même temps). */
    slots: z.int().min(1).max(20),
  }),
  battles: z.object({
    initialSlots: z.int().min(1).max(6),
    maxSlots: z.int().min(1).max(6),
    maxTeamSize: z.int().min(1).max(6),
    /** Durée d'un combat quand le dresseur n'en fixe pas. */
    defaultDurationMinutes: z.int().positive(),
    /**
     * Probabilité de victoire = r^pente / (1 + r^pente), r = PE effective du joueur / PE du
     * dresseur (sigmoïde sur le log du rapport : 50 % à PE égale), bornée par plancher et plafond.
     */
    winCurveSteepness: z.number().positive().max(50),
    minWinChance: probabilitySchema,
    maxWinChance: probabilitySchema,
    /** Effet maximal de l'avantage de types sur la PE effective (0.1 = ±10 %). */
    typeAdvantageWeight: z.number().min(0).max(1),
    /** IV des Pokémon des dresseurs quand l'admin n'en fixe pas. */
    defaultTrainerIv: z.int().min(0).max(31),
    /** Durée de K.O. après une défaite (surchargeable par dresseur). */
    koMinutes: z.int().min(0),
    /** Temps de recharge d'un dresseur répétable après une victoire (surchargeable). */
    cooldownMinutes: z.int().min(0),
    /** XP par membre = Σ (XP de base × niveau / 7) de l'équipe adverse × multiplicateur. */
    xpMultiplier: z.number().min(0),
    /** Part de cette XP gagnée malgré une défaite (0 = aucune). */
    lossXpFraction: probabilitySchema,
    happinessOnWin: z.int().min(-255).max(255),
    happinessOnLoss: z.int().min(-255).max(255),
  }),
  dungeons: dungeonSettingsSchema,
  evolution: z.object({
    /** Objet qui remplace l'échange (Câble Link) ; null = évolutions par échange impossibles. */
    tradeItemId: slugSchema.nullable(),
    /** Heure locale du joueur (0 à 23) où commence le jour, puis la nuit. */
    dayStartHour: z.int().min(0).max(23),
    nightStartHour: z.int().min(0).max(23),
  }),
  newPlayer: z.object({
    starterLevel: z.int().min(1).max(100),
    startingCurrency: z.int().min(0),
    startingInventory: z.array(itemStackSchema),
  }),
  /** Menu du jeu ; absent = `DEFAULT_MENU_GROUPS`. */
  menu: menuSettingsSchema.optional(),
});
export type BalanceSettings = z.infer<typeof balanceSettingsSchema>;

// --- Conditions de déblocage (briques génériques) ----------------------------

const baseUnlockConditions = [
  z.object({ type: z.literal('always') }),
  z.object({
    type: z.literal('regionDexPercent'),
    regionId: slugSchema,
    percent: z.number().min(0).max(100),
  }),
  /** Avoir battu un dresseur donné au moins une fois. */
  z.object({ type: z.literal('trainerDefeated'), trainerId: slugSchema }),
  /**
   * Posséder au moins N badges (victoires contre des dresseurs qui en donnent un), ceux d'une
   * région donnée ou de toutes les régions.
   */
  z.object({
    type: z.literal('badgeCount'),
    count: z.int().min(1).max(100),
    regionId: slugSchema.optional(),
  }),
  /** Avoir capturé au moins N espèces différentes (Pokédex national). */
  z.object({ type: z.literal('speciesCaught'), count: z.int().min(1).max(10_000) }),
  /** Avoir fait éclore au moins N œufs. */
  z.object({ type: z.literal('eggsHatched'), count: z.int().min(1).max(100_000) }),
  /** Avoir validé au moins N étapes d'une quête (ex. zone ouverte pendant une quête). */
  z.object({
    type: z.literal('questStepsDone'),
    questId: slugSchema,
    count: z.int().min(1).max(20),
  }),
  /** Avoir validé toutes les étapes d'une quête. */
  z.object({ type: z.literal('questCompleted'), questId: slugSchema }),
] as const;

/** Condition simple (une seule brique). */
export const baseUnlockConditionSchema = z.discriminatedUnion('type', [...baseUnlockConditions]);
export type BaseUnlockCondition = z.infer<typeof baseUnlockConditionSchema>;

export const unlockConditionSchema = z.discriminatedUnion('type', [
  ...baseUnlockConditions,
  /** Toutes les conditions de la liste à la fois (ex. 5 badges et 50 espèces capturées). */
  z.object({
    type: z.literal('allOf'),
    conditions: z.array(baseUnlockConditionSchema).min(2, 'Au moins deux conditions').max(5),
  }),
]);
export type UnlockCondition = z.infer<typeof unlockConditionSchema>;

// --- Régions ----------------------------------------------------------------

export const regionSchema = z.object({
  id: slugSchema,
  order: z.int().min(0),
  name: nameSchema,
  image: imageSchema,
  speciesIds: z.array(z.int().positive()),
  /** Starters proposés aux nouveaux joueurs (seule la première région en a besoin). */
  starterSpeciesIds: z.array(z.int().positive()),
  /** Désactivée : la région, ses zones, ses dresseurs et ses quêtes sont cachés aux joueurs. */
  enabled: z.boolean().default(true),
  unlock: unlockConditionSchema,
});
export type Region = z.infer<typeof regionSchema>;

// --- Espèces (surcharges de la base PokéAPI) ------------------------------------

export const speciesOverrideSchema = z.object({
  speciesId: z.int().positive(),
  /** Une espèce désactivée n'apparaît plus en rencontre. */
  enabled: z.boolean(),
  nameFr: z.string().trim().min(1).max(64).nullable(),
  /** Habitat maison (indispensable pour la Gen IV et suivantes). */
  habitat: z.string().nullable(),
  rarity: raritySchema.nullable(),
  breedable: z.boolean().nullable(),
});
export type SpeciesOverride = z.infer<typeof speciesOverrideSchema>;

// --- Météo et statuts -------------------------------------------------------------

/** Météo d'une zone ou d'un donjon (Soleil, Pluie, Tempête de sable, Grêle). */
export const WEATHERS = ['sun', 'rain', 'sand', 'hail'] as const;
export const weatherSchema = z.enum(WEATHERS);
export type Weather = z.infer<typeof weatherSchema>;
/** Météo facultative d'un lieu : null (colonne vide en base) devient absente. */
const optionalWeatherSchema = z.preprocess((w) => w ?? undefined, weatherSchema.optional());

/** Statuts des combats de donjon. */
export const STATUSES = ['paralysis', 'burn', 'poison', 'sleep', 'freeze'] as const;
export const statusSchema = z.enum(STATUSES);
export type Status = z.infer<typeof statusSchema>;

// --- Talents ---------------------------------------------------------------------

/**
 * Paramètres du jeu qu'un talent peut modifier (voir le catalogue `ABILITY_PARAMS` de game-core
 * pour l'unité, la portée et les activités concernées).
 */
export const ABILITY_PARAM_IDS = [
  // Général
  'xp',
  'happiness',
  'money',
  // Expéditions et combats de dresseurs
  'power',
  'expeditionDuration',
  'encounters',
  'lootRolls',
  'capture',
  'wildLevel',
  'shinyChance',
  'opponentPower',
  'typeAdvantage',
  'battleDuration',
  'koDuration',
  // Donjons
  'hp',
  'attack',
  'defense',
  'specialAttack',
  'specialDefense',
  'speed',
  'damageDealt',
  'damageTaken',
  'stab',
  // Élevage, couveuse, Musée et transfert
  'eggSpeed',
  'inheritedIvs',
  'hiddenAbility',
  'perfectIvs',
  'hatchTime',
  'restoreTime',
  'candies',
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
  /** Donjon : PV du Pokémon sous cette fraction (Brasier, Torrent : 1/3). */
  z.object({ type: z.literal('hpBelow'), fraction: z.number().gt(0).max(1) }),
  /** Donjon : PV du Pokémon au maximum (Multiécaille). */
  z.object({ type: z.literal('fullHp') }),
  /** Donjon : l'attaque donnée ou reçue est de l'un de ces types (Isograisse, Brasier). */
  z.object({ type: z.literal('attackType'), types: z.array(z.string().min(1)).min(1) }),
  /** Météo de la zone ou du donjon (ou imposée par un talent) : Chlorophylle, Glissade. */
  z.object({ type: z.literal('weather'), weathers: z.array(weatherSchema).min(1) }),
  /** Donjon : le Pokémon a un statut (Cran, Écaille Spéciale). */
  z.object({ type: z.literal('statused') }),
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
   * Donjon : insensible aux attaques d'un type, et soigne `heal` de ses PV max à chaque attaque
   * absorbée (Lévitation, Absorbe-Eau, Absorbe-Volt, Torche).
   */
  z.object({
    type: z.literal('immunity'),
    attackType: z.string().min(1),
    heal: probabilitySchema,
    conditions: abilityConditionsSchema,
  }),
  /** Donjon : survit à 1 PV à un coup fatal reçu PV au maximum, une fois (Fermeté). */
  z.object({ type: z.literal('sturdy'), conditions: abilityConditionsSchema }),
  /** Donjon : soigne cette fraction de ses PV max quand le joueur le rappelle (Régé-Force). */
  z.object({
    type: z.literal('regenerator'),
    fraction: probabilitySchema,
    conditions: abilityConditionsSchema,
  }),
  /** Donjon : Vitesse augmentée de ce pourcentage après chacune de ses attaques (Turbo). */
  z.object({
    type: z.literal('speedBoost'),
    percent: z.number().positive().max(100),
    conditions: abilityConditionsSchema,
  }),
  /** Donjon : Attaque et Attaque Spéciale augmentées après chaque K.O. infligé (Impudence). */
  z.object({
    type: z.literal('moxie'),
    percent: z.number().positive().max(100),
    conditions: abilityConditionsSchema,
  }),
  /** Donjon : à son entrée, baisse l'Attaque et l'Attaque Spéciale du Pokémon en face (Intimidation). */
  z.object({
    type: z.literal('intimidate'),
    percent: z.number().positive().max(90),
    conditions: abilityConditionsSchema,
  }),
  /** Donjon : l'attaquant perd cette fraction de ses PV max à chaque attaque physique reçue (Peau Dure). */
  z.object({
    type: z.literal('contactDamage'),
    fraction: probabilitySchema,
    conditions: abilityConditionsSchema,
  }),
  /** Impose sa météo à l'expédition ou au donjon (Sécheresse, Crachin, Sable Volant, Alerte Neige). */
  z.object({
    type: z.literal('setWeather'),
    weather: weatherSchema,
    conditions: abilityConditionsSchema,
  }),
  /**
   * Donjon : chance d'infliger un statut. `contact` : à l'attaquant qui le frappe d'une attaque
   * physique (Statik, Point Poison, Corps Ardent) ; `attack` : au Pokémon qu'il frappe (Toxitouche).
   */
  z.object({
    type: z.literal('inflictStatus'),
    status: statusSchema,
    chance: probabilitySchema,
    trigger: z.enum(['contact', 'attack']),
    conditions: abilityConditionsSchema,
  }),
  /** Donjon : insensible à ces statuts (Insomnia, Vaccin, Échauffement, Ignifu-Voile). */
  z.object({
    type: z.literal('statusImmunity'),
    statuses: z.array(statusSchema).min(1),
    conditions: abilityConditionsSchema,
  }),
  /** Donjon : guéri de son statut quand le joueur le rappelle (Médic Nature). */
  z.object({ type: z.literal('naturalCure'), conditions: abilityConditionsSchema }),
  /** Donjon : insensible aux dégâts de la tempête de sable et de la grêle (Envelocape, Voile Sable). */
  z.object({ type: z.literal('weatherImmunity'), conditions: abilityConditionsSchema }),
  /** Donjon : mis K.O. par une attaque physique, inflige cette fraction de ses PV max à l'attaquant (Boom Final). */
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

// --- Objets ---------------------------------------------------------------------

export const ITEM_CATEGORIES = [
  'ball',
  'berry',
  'evolution',
  'breeding',
  'endgame',
  'fossil',
  'megaStone',
  'misc',
] as const;
export const itemCategorySchema = z.enum(ITEM_CATEGORIES);
export type ItemCategory = z.infer<typeof itemCategorySchema>;

/** Effets d'objets : briques génériques paramétrées dans l'admin. */
export const itemEffectSchema = z.discriminatedUnion('type', [
  /** Utilisable comme Ball : multiplie la probabilité de capture. */
  z.object({ type: z.literal('ball'), catchMultiplier: z.number().positive() }),
  /** Consommé à chaque tentative de capture : multiplie la probabilité de capture. */
  z.object({ type: z.literal('captureBoost'), multiplier: z.number().positive() }),
  /** Tenu par un parent en pension : nombre d'IV transmis (Nœud Destin : 5). */
  z.object({ type: z.literal('breedingIvs'), count: z.int().min(0).max(6) }),
  /** Tenu par un parent en pension : chance de transmettre sa nature (Pierre Stase : 100 %). */
  z.object({ type: z.literal('breedingNature'), chance: probabilitySchema }),
  /** Possédé dans le sac (non consommé) : multiplie le taux shiny (Charme Chroma). */
  z.object({ type: z.literal('shinyCharm'), multiplier: z.number().min(1).max(100) }),
  /** Utilisé sur un Pokémon : met un IV au choix à 31, ou les 6 (Capsules d'Argent / d'Or). */
  z.object({ type: z.literal('ivCap'), all: z.boolean() }),
  /** Utilisé sur un Pokémon : change sa nature effective (Aromates). */
  z.object({ type: z.literal('mint'), nature: z.string().min(1) }),
  /**
   * Utilisé sur un Pokémon : passe à un autre talent normal (Pilule Talent) ou au talent caché
   * (Patch Talent).
   */
  z.object({ type: z.literal('abilityChange'), hidden: z.boolean() }),
  /**
   * Déposé au Musée : redonne vie à un Pokémon (Fossile Nautile → Amonita) après `minutes`.
   * Consommé au dépôt.
   */
  z.object({
    type: z.literal('fossil'),
    speciesId: z.int().positive(),
    formId: formIdSchema,
    level: z.int().min(1).max(100),
    minutes: z.int().min(1).max(10_080),
  }),
  /**
   * Méga-Gemme : tenue par un Pokémon de l'espèce, le fait passer dans sa forme Méga (`formId`).
   * Retirée de l'inventaire à la Méga-Évolution, rendue quand le Pokémon redevient normal.
   */
  z.object({ type: z.literal('megaEvolution'), formId: z.int().positive() }),
]);
export type ItemEffect = z.infer<typeof itemEffectSchema>;
export type ItemEffectType = ItemEffect['type'];

export const itemSchema = z.object({
  /** Identique au nom PokéAPI pour un objet officiel (le sprite en découle). */
  id: slugSchema,
  name: nameSchema,
  description: z.string().max(500),
  /** Icône personnalisée ; si absente, sprite PokéAPI de l'objet. */
  icon: imageSchema,
  category: itemCategorySchema,
  rarity: raritySchema,
  /** Prix de revente unitaire à la boutique, en Poké Dollars ; null = invendable. */
  sellPrice: z.int().min(0).max(100_000_000).nullable(),
  effects: z.array(itemEffectSchema),
});
export type Item = z.infer<typeof itemSchema>;

/** Prix de revente par défaut d'un objet absent de la boutique ; null = invendable. */
export const DEFAULT_SELL_PRICES: Record<Rarity, number | null> = {
  common: 50,
  uncommon: 150,
  rare: 1000,
  epic: 3000,
  legendary: null,
};

/** Prix unitaire le plus bas d'un objet en boutique (articles actifs), ou null. */
export function lowestUnitPrice(
  entries: readonly Pick<ShopEntry, 'itemId' | 'price' | 'lotSize' | 'enabled'>[],
  itemId: string,
): number | null {
  let lowest: number | null = null;
  for (const e of entries) {
    if (e.itemId !== itemId || !e.enabled) continue;
    const unit = e.price / e.lotSize;
    if (lowest === null || unit < lowest) lowest = unit;
  }
  return lowest;
}

/**
 * Prix de revente suggéré : la moitié du prix unitaire en boutique (comme dans les jeux), sinon
 * selon la rareté.
 */
export function suggestedSellPrice(
  item: Pick<Item, 'id' | 'rarity'>,
  entries: readonly Pick<ShopEntry, 'itemId' | 'price' | 'lotSize' | 'enabled'>[],
): number | null {
  const unit = lowestUnitPrice(entries, item.id);
  return unit === null ? DEFAULT_SELL_PRICES[item.rarity] : Math.floor(unit / 2);
}

// --- Tables de butin ----------------------------------------------------------------

export const lootEntrySchema = z
  .object({
    itemId: slugSchema,
    /** Probabilité que l'entrée tombe à chaque tirage (0 à 1). */
    chance: probabilitySchema,
    min: z.int().min(1),
    max: z.int().min(1),
  })
  .refine((e) => e.max >= e.min, { message: 'max doit être ≥ min', path: ['max'] });
export type LootEntry = z.infer<typeof lootEntrySchema>;

export const lootTableSchema = z.object({
  id: slugSchema,
  name: nameSchema,
  entries: z.array(lootEntrySchema),
});
export type LootTable = z.infer<typeof lootTableSchema>;

// --- Zones d'expédition -------------------------------------------------------------

export const encounterSchema = z
  .object({
    speciesId: z.int().positive(),
    formId: formIdSchema,
    weight: z.number().positive(),
    minLevel: z.int().min(1).max(100),
    maxLevel: z.int().min(1).max(100),
  })
  .refine((e) => e.maxLevel >= e.minLevel, {
    message: 'Niveau max doit être ≥ niveau min',
    path: ['maxLevel'],
  });
export type Encounter = z.infer<typeof encounterSchema>;

export const zoneSchema = z.object({
  id: slugSchema,
  regionId: slugSchema,
  order: z.int().min(0),
  name: nameSchema,
  description: z.string().max(500),
  image: imageSchema,
  habitat: z.string().nullable(),
  /** Puissance d'expédition (PE) totale minimale de l'équipe. */
  /** Désactivée : cachée aux joueurs, plus aucune expédition ne peut y partir. */
  enabled: z.boolean().default(true),
  minPower: z.int().min(0),
  /** Exemple : 2 Pokémon de type Eau pour une zone sous-marine. */
  requiredTypes: z.array(z.object({ type: z.string().min(1), count: z.int().min(1).max(6) })),
  affinityTypes: z.array(z.string().min(1)),
  durationsMinutes: z.array(z.int().positive()).min(1, 'Au moins une durée'),
  encounters: z.array(encounterSchema).min(1, 'Au moins une rencontre'),
  lootTableId: slugSchema.nullable(),
  unlock: unlockConditionSchema,
  /** Météo de la zone (talents qui en dépendent) ; absente = temps clair. */
  weather: optionalWeatherSchema,
});
export type Zone = z.infer<typeof zoneSchema>;

// --- Dresseurs -------------------------------------------------------------------------

export const trainerPokemonSchema = z.object({
  speciesId: z.int().positive(),
  formId: formIdSchema,
  level: z.int().min(1).max(100),
  /** IV appliqués aux 6 statistiques ; null = valeur par défaut de l'équilibrage. */
  iv: z.int().min(0).max(31).nullable(),
  /** Nature PokéAPI ; null = neutre. */
  nature: z.string().min(1).nullable(),
});
export type TrainerPokemon = z.infer<typeof trainerPokemonSchema>;

export const battleRulesSchema = z.object({
  /** Nombre exact de Pokémon imposé ; null = libre (jusqu'à la taille maximale). */
  teamSize: z.int().min(1).max(6).nullable(),
  /** Niveau maximal des Pokémon engagés ; null = aucun. */
  maxLevel: z.int().min(1).max(100).nullable(),
  requiredTypes: z.array(z.object({ type: z.string().min(1), count: z.int().min(1).max(6) })),
  forbiddenTypes: z.array(z.string().min(1)),
  /** PE totale minimale pour pouvoir lancer le combat. */
  minPower: z.int().min(0),
});
export type BattleRules = z.infer<typeof battleRulesSchema>;

export const trainerSchema = z.object({
  id: slugSchema,
  regionId: slugSchema,
  /** Zone (ou ville) de rattachement, pour l'affichage. */
  zoneId: slugSchema.nullable(),
  order: z.int().min(0),
  name: nameSchema,
  /** Classe : Gamin, Montagnard, Champion d'arène… */
  trainerClass: nameSchema,
  sprite: imageSchema,
  team: z.array(trainerPokemonSchema).min(1, 'Au moins un Pokémon').max(6),
  /** Durée du combat ; null = durée par défaut de l'équilibrage. */
  durationMinutes: z.int().positive().nullable(),
  rules: battleRulesSchema,
  /** Poké Dollars gagnés en cas de victoire. */
  money: z.int().min(0),
  lootTableId: slugSchema.nullable(),
  lootRolls: z.int().min(0).max(20),
  /** Badge obtenu à la première victoire (Champions d'arène). */
  badge: z.object({ name: nameSchema, image: imageSchema }).nullable(),
  /** Unique : une seule victoire possible. Répétable : temps de recharge après une victoire. */
  repeatable: z.boolean(),
  /** Temps de recharge ; null = valeur de l'équilibrage. */
  cooldownMinutes: z.int().min(0).nullable(),
  /** Durée de K.O. après une défaite ; null = valeur de l'équilibrage. */
  koMinutes: z.int().min(0).nullable(),
  /** Désactivé : caché aux joueurs, plus aucun combat ne peut être lancé contre lui. */
  enabled: z.boolean().default(true),
  unlock: unlockConditionSchema,
});
export type Trainer = z.infer<typeof trainerSchema>;

// --- Donjons ------------------------------------------------------------------------------

/**
 * Donjon : combats en temps réel contre une suite de Pokémon, jusqu'au boss (une Méga-Évolution).
 * Visible dès qu'une espèce de la lignée est capturée, ouvert quand toute la lignée l'est.
 */
export const dungeonSchema = z.object({
  id: slugSchema,
  regionId: slugSchema,
  order: z.int().min(0),
  name: nameSchema,
  description: z.string().max(500),
  /** Difficulté affichée au joueur (aucun effet sur le combat). */
  difficulty: dungeonDifficultySchema.default('easy'),
  /** Boss final : en général la forme Méga de l'espèce du donjon. */
  boss: trainerPokemonSchema,
  /** PV du boss multipliés (1 = normaux). */
  bossHpMultiplier: z.number().min(0.1).max(20),
  /** Espèces à avoir toutes capturées pour entrer (la lignée du boss). */
  familySpeciesIds: z.array(z.int().positive()).min(1, 'Au moins une espèce').max(10),
  /** Adversaires affrontés dans l'ordre, avant le boss. */
  opponents: z.array(trainerPokemonSchema).max(30),
  /** Temps imparti pour vaincre le boss. */
  timeLimitSeconds: z.int().min(10).max(3600),
  /** Temps de recharge après une tentative ; null = valeur de l'équilibrage. */
  cooldownMinutes: z.int().min(0).nullable(),
  /** Durée de K.O. des Pokémon mis K.O. ; null = valeur de l'équilibrage. */
  koMinutes: z.int().min(0).nullable(),
  /** Poké Dollars gagnés en cas de victoire. */
  money: z.int().min(0),
  lootTableId: slugSchema.nullable(),
  lootRolls: z.int().min(0).max(20),
  /** Méga-Gemme que le boss peut laisser (null = aucune), avec sa probabilité. */
  gemItemId: slugSchema.nullable(),
  gemChance: probabilitySchema,
  /** Désactivé : caché aux joueurs, plus aucune tentative ne peut être lancée. */
  enabled: z.boolean().default(true),
  /** Condition supplémentaire (en plus de la lignée capturée). */
  unlock: unlockConditionSchema,
  /** Météo du donjon (Soleil : Feu ×1,5 et Eau ×0,5…) ; absente = temps clair. */
  weather: optionalWeatherSchema,
});
export type Dungeon = z.infer<typeof dungeonSchema>;

// --- Boutique ---------------------------------------------------------------------------

export const shopCategorySchema = z.object({
  id: slugSchema,
  /** Nom de l'onglet : Balls, Soins, Élevage, Évolution, Rare… */
  name: nameSchema,
  /** Icône de l'onglet ; si absente, icône du premier article. */
  icon: imageSchema,
  order: z.int().min(0),
});
export type ShopCategory = z.infer<typeof shopCategorySchema>;

export const PURCHASE_PERIODS = ['total', 'day', 'week'] as const;
export type PurchasePeriod = (typeof PURCHASE_PERIODS)[number];

/** Limite d'achat par joueur, en lots : au total, ou sur les dernières 24 h / 7 jours. */
export const purchaseLimitSchema = z.object({
  lots: z.int().min(1).max(10_000),
  period: z.enum(PURCHASE_PERIODS),
});
export type PurchaseLimit = z.infer<typeof purchaseLimitSchema>;

/** Objet offert avec un achat : `quantity` objets tous les `every` objets achetés d'un coup. */
export const shopGiftSchema = z.object({
  itemId: slugSchema,
  every: z.int().min(1).max(999),
  quantity: z.int().min(1).max(99),
});
export type ShopGift = z.infer<typeof shopGiftSchema>;

export const shopEntrySchema = z
  .object({
    id: slugSchema,
    itemId: slugSchema,
    categoryId: slugSchema,
    order: z.int().min(0),
    /** Prix d'un lot, en Poké Dollars. */
    price: z.int().min(0).max(100_000_000),
    /** Nombre d'objets par lot (ex. 10 Poké Balls). */
    lotSize: z.int().min(1).max(999),
    /** Condition d'apparition. */
    unlock: unlockConditionSchema,
    /** Avant déblocage : caché, ou verrouillé (visible, grisé, condition affichée). */
    lockedVisibility: z.enum(['hidden', 'locked']),
    /** Limite d'achat par joueur ; null = illimité. */
    purchaseLimit: purchaseLimitSchema.nullable(),
    /** Disponibilité dans le temps (dates ISO) ; null = sans borne. */
    availableFrom: z.iso.datetime({ offset: true }).nullable(),
    availableUntil: z.iso.datetime({ offset: true }).nullable(),
    enabled: z.boolean(),
    /** Objet offert selon la quantité achetée (ex. une Honor Ball par 10 Poké Balls) ; null = aucun. */
    gift: shopGiftSchema.nullable(),
  })
  .refine(
    (e) =>
      !e.availableFrom ||
      !e.availableUntil ||
      Date.parse(e.availableFrom) < Date.parse(e.availableUntil),
    { message: 'La fin doit être après le début', path: ['availableUntil'] },
  );
export type ShopEntry = z.infer<typeof shopEntrySchema>;

// --- Évolutions (surcharges des conditions PokéAPI) --------------------------------

export const TIMES_OF_DAY = ['day', 'night'] as const;
export type TimeOfDay = (typeof TIMES_OF_DAY)[number];

/**
 * Une façon d'évoluer : toutes les conditions renseignées doivent être remplies.
 * L'objet est consommé (pierre, Câble Link…).
 */
export const evolutionMethodSchema = z
  .object({
    minLevel: z.int().min(1).max(100).nullable(),
    itemId: slugSchema.nullable(),
    minHappiness: z.int().min(0).max(255).nullable(),
    timeOfDay: z.enum(TIMES_OF_DAY).nullable(),
  })
  .refine((m) => m.minLevel !== null || m.itemId !== null || m.minHappiness !== null, {
    message: 'Au moins une condition : niveau, objet ou bonheur',
    path: ['minLevel'],
  });
export type EvolutionMethod = z.infer<typeof evolutionMethodSchema>;

export const evolutionOverrideId = (fromSpeciesId: number, toSpeciesId: number) =>
  `${fromSpeciesId}-${toSpeciesId}`;

/**
 * Remplace les conditions PokéAPI d'une évolution (ou en ajoute une) ; `enabled: false` la
 * supprime. Identifiant : `<espèce de départ>-<espèce d'arrivée>`.
 */
export const evolutionOverrideSchema = z
  .object({
    id: slugSchema,
    fromSpeciesId: z.int().positive(),
    toSpeciesId: z.int().positive(),
    enabled: z.boolean(),
    /** Au moins une méthode suffit. */
    methods: z.array(evolutionMethodSchema).max(10),
  })
  .refine((o) => o.id === evolutionOverrideId(o.fromSpeciesId, o.toSpeciesId), {
    message: 'Identifiant attendu : <départ>-<arrivée>',
    path: ['id'],
  })
  .refine((o) => o.fromSpeciesId !== o.toSpeciesId, {
    message: 'Une espèce ne peut pas évoluer en elle-même',
    path: ['toSpeciesId'],
  })
  .refine((o) => !o.enabled || o.methods.length > 0, {
    message: 'Au moins une méthode (ou désactiver l’évolution)',
    path: ['methods'],
  });
export type EvolutionOverride = z.infer<typeof evolutionOverrideSchema>;

// --- Progression : paliers du Pokédex et collections ------------------------------------

/** Bonus permanents (briques génériques), cumulés tant que la récompense est réclamée. */
export const permanentBonusSchema = z.discriminatedUnion('type', [
  /** Probabilité de capture en expédition. */
  z.object({ type: z.literal('capture'), percent: z.number().positive().max(1000) }),
  /** XP gagnée en expédition et en combat. */
  z.object({ type: z.literal('xp'), percent: z.number().positive().max(1000) }),
  /** Poké Dollars gagnés en combat. */
  z.object({ type: z.literal('money'), percent: z.number().positive().max(1000) }),
]);
export type PermanentBonus = z.infer<typeof permanentBonusSchema>;
export type PermanentBonusType = PermanentBonus['type'];

/** Récompense d'un palier ou d'une collection, accordée quand le joueur la réclame. */
export const progressRewardSchema = z.object({
  currency: z.int().min(0).max(100_000_000),
  items: z.array(itemStackSchema),
  /** Emplacements supplémentaires (le total reste plafonné par le maximum de l'équilibrage). */
  expeditionSlots: z.int().min(0).max(6),
  battleSlots: z.int().min(0).max(6),
  daycareSlots: z.int().min(0).max(10),
  bonuses: z.array(permanentBonusSchema),
});
export type ProgressReward = z.infer<typeof progressRewardSchema>;

export const dexMilestoneSchema = z.object({
  id: slugSchema,
  order: z.int().min(0),
  name: nameSchema,
  /** Région ; null = Pokédex national (espèces de toutes les régions). */
  regionId: slugSchema.nullable(),
  /** Pokédex shiny : ne compte que les espèces capturées en version shiny. */
  shiny: z.boolean(),
  /** Part du Pokédex capturée (en %). */
  percent: z.number().positive().max(100),
  rewards: progressRewardSchema,
});
export type DexMilestone = z.infer<typeof dexMilestoneSchema>;

/** Collection thématique : capturer toutes les espèces de la liste. */
export const collectionSchema = z.object({
  id: slugSchema,
  order: z.int().min(0),
  name: nameSchema,
  description: z.string().max(500),
  speciesIds: z.array(z.int().positive()).min(1, 'Au moins une espèce'),
  rewards: progressRewardSchema,
});
export type Collection = z.infer<typeof collectionSchema>;

// --- Quêtes (légendaires) --------------------------------------------------------------

/** Conditions d'étape propres aux quêtes, comptées à partir du début de l'étape. */
const questActionConditions = [
  /** Capturer N Pokémon en expédition (filtrés par type et / ou espèce). */
  z.object({
    type: z.literal('catchPokemon'),
    count: z.int().min(1).max(10_000),
    pokemonType: z.string().min(1).nullable(),
    speciesId: z.int().positive().nullable(),
  }),
  /**
   * Réussir N expéditions dans une zone, avec au moins `memberCount` Pokémon (du type demandé,
   * le cas échéant) de PE individuelle ≥ `minMemberPower`.
   */
  z.object({
    type: z.literal('expedition'),
    zoneId: slugSchema,
    count: z.int().min(1).max(1000),
    memberType: z.string().min(1).nullable(),
    memberCount: z.int().min(0).max(6),
    minMemberPower: z.int().min(0),
  }),
] as const;

/**
 * Condition d'une étape : une condition de déblocage (état du joueur, évaluée à tout moment) ou
 * une action à accomplir pendant l'étape (captures, expédition réussie).
 */
export const questConditionSchema = z.discriminatedUnion('type', [
  ...unlockConditionSchema.options,
  ...questActionConditions,
]);
export type QuestCondition = z.infer<typeof questConditionSchema>;
export type QuestActionCondition = Extract<QuestCondition, { type: 'catchPokemon' | 'expedition' }>;

/** Briques d'une condition : celles d'un « toutes ces conditions », ou la condition elle-même. */
export function unlockParts(condition: UnlockCondition): BaseUnlockCondition[];
export function unlockParts(
  condition: QuestCondition,
): Exclude<QuestCondition, { type: 'allOf' }>[];
export function unlockParts(condition: QuestCondition) {
  return condition.type === 'allOf' ? condition.conditions : [condition];
}

export const questStepSchema = z.object({
  name: nameSchema,
  description: z.string().max(500),
  condition: questConditionSchema,
});
export type QuestStep = z.infer<typeof questStepSchema>;

/**
 * Expédition légendaire : une fois la récompense réclamée, le Pokémon se capture lors d'une
 * expédition dédiée (lancée depuis les quêtes) où une seule Ball est lancée. Les membres de
 * l'équipe du type d'affinité (par défaut, les faiblesses du Pokémon) augmentent la capture.
 */
export const legendaryExpeditionSchema = z.object({
  durationMinutes: z
    .int()
    .positive()
    .max(7 * 24 * 60),
  minPower: z.int().min(0),
  requiredTypes: z.array(z.object({ type: z.string().min(1), count: z.int().min(1).max(6) })),
  affinityTypes: z.array(z.string().min(1)),
});
export type LegendaryExpedition = z.infer<typeof legendaryExpeditionSchema>;

/** Pokémon offert (légendaire…) : IV aléatoires, dont au moins `perfectIvs` à 31. */
export const questPokemonSchema = z.object({
  speciesId: z.int().positive(),
  formId: formIdSchema,
  level: z.int().min(1).max(100),
  perfectIvs: z.int().min(0).max(6),
  expedition: legendaryExpeditionSchema,
});
export type QuestPokemon = z.infer<typeof questPokemonSchema>;

export const questRewardSchema = progressRewardSchema.extend({
  pokemon: z.array(questPokemonSchema).max(6),
});
export type QuestReward = z.infer<typeof questRewardSchema>;

/** Chaîne de quêtes : étapes ordonnées, validées l'une après l'autre, puis récompense. */
export const questSchema = z.object({
  id: slugSchema,
  order: z.int().min(0),
  name: nameSchema,
  description: z.string().max(1000),
  /** Illustration ; si absente, artwork du premier Pokémon offert. */
  image: imageSchema,
  /** Région de rattachement (affichage, origine des Pokémon offerts) ; null = aucune. */
  regionId: slugSchema.nullable(),
  /** Désactivée : cachée aux joueurs, elle ne progresse plus et sa récompense n'est plus réclamable. */
  enabled: z.boolean().default(true),
  /** Condition d'apparition de la quête. */
  unlock: unlockConditionSchema,
  steps: z.array(questStepSchema).min(1, 'Au moins une étape').max(20),
  rewards: questRewardSchema,
});
export type Quest = z.infer<typeof questSchema>;

// --- Contenu complet d'une version -------------------------------------------

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
  dexMilestones: z.array(dexMilestoneSchema),
  collections: z.array(collectionSchema),
  quests: z.array(questSchema),
});
export type GameContentData = z.infer<typeof gameContentStructureSchema>;

/** Contenu chargé depuis une version publiée (ou un brouillon en test). */
export interface GameContent extends GameContentData {
  versionId: number;
}

/** Durée par défaut d'une expédition légendaire. */
export const DEFAULT_LEGENDARY_EXPEDITION_MINUTES = 240;

/** Expédition légendaire par défaut : 4 h, les faiblesses du Pokémon en affinité. */
export function defaultLegendaryExpedition(
  speciesId: number,
  formId?: number | null,
  minPower = 0,
): LegendaryExpedition {
  return {
    durationMinutes: DEFAULT_LEGENDARY_EXPEDITION_MINUTES,
    minPower,
    requiredTypes: [],
    affinityTypes: typeWeaknesses(pokemonTypes(speciesId, formId)),
  };
}
