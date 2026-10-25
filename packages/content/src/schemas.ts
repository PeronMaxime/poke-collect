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

/** Attaque utilisée en combat (donjons et dresseurs) par les Pokémon d'un type (une seule attaque par type). */
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

/**
 * Réglages communs aux combats en temps réel (donjons et dresseurs). Un combat garde ceux de son
 * départ : une modification n'affecte pas un combat en cours.
 */
export const combatSettingsSchema = z.object({
  /**
   * Délai entre deux attaques, linéaire selon la Vitesse : `maxAttackIntervalMs` à Vitesse 0,
   * `baseAttackIntervalMs` à la Vitesse de référence, au plus court `minAttackIntervalMs`.
   */
  baseAttackIntervalMs: z.int().min(100).max(60_000),
  referenceSpeed: z.int().min(1).max(1000),
  minAttackIntervalMs: z.int().min(100).max(60_000),
  maxAttackIntervalMs: z.int().min(100).max(60_000),
  /**
   * Dégâts = ((2 × niveau / 5 + 2) × puissance × Att / Déf / 50 + 2) × bonus de type (STAB)
   * × efficacité × aléa (entre `minDamageRoll` et 1) × multiplicateur × coup critique.
   */
  damageMultiplier: z.number().positive().max(100),
  stabMultiplier: z.number().min(1).max(5),
  minDamageRoll: probabilitySchema,
  /** Chance de coup critique de chaque attaque (0 = aucun). */
  critChance: probabilitySchema,
  /** Dégâts d'un coup critique, qui ignore aussi les baisses d'Attaque (Intimidation). */
  critMultiplier: z.number().min(1).max(5),
  /** Délai avant qu'un Pokémon rappelé par le joueur puisse revenir au combat. */
  recallCooldownSeconds: z.number().min(0).max(60),
  /** Attaque de chaque type (clé : type PokéAPI, ex. `fire`). */
  attacks: z.record(z.string().min(1), dungeonAttackSchema),
  /** Les adversaires ont le premier talent de leur espèce (ou de leur forme). */
  enemyAbilities: z.boolean(),
});
export type CombatSettings = z.infer<typeof combatSettingsSchema>;

/** Réglages propres aux donjons (le combat suit `combatSettingsSchema`). */
export const dungeonSettingsSchema = z.object({
  maxTeamSize: z.int().min(1).max(6),
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
  /** XP par membre = Σ (XP de base × niveau / 7) des adversaires vaincus × multiplicateur. */
  xpMultiplier: z.number().min(0),
  happinessOnWin: z.int().min(-255).max(255),
  happinessOnLoss: z.int().min(-255).max(255),
});
export type DungeonSettings = z.infer<typeof dungeonSettingsSchema>;

// --- Menu du jeu ---------------------------------------------------------------

/** Onglets du jeu (l'identifiant est aussi l'ancre de l'URL : `#pc`). */
export const MENU_TABS = [
  { id: 'expeditions', label: 'Expéditions' },
  { id: 'battles', label: 'Combats' },
  { id: 'dungeons', label: 'Donjons' },
  { id: 'quests', label: 'Quêtes' },
  { id: 'center', label: 'Centre Pokémon' },
  { id: 'daycare', label: 'Pension' },
  { id: 'museum', label: 'Musée' },
  { id: 'farm', label: 'Ferme à baies' },
  { id: 'pc', label: 'PC' },
  { id: 'teams', label: 'Équipe Pkmn' },
  { id: 'pokedex', label: 'Pokédex' },
  { id: 'shop', label: 'Boutique' },
  { id: 'bag', label: 'Sac' },
  { id: 'trainer', label: 'Fiche Dresseur' },
  { id: 'guild', label: 'Guilde' },
  { id: 'leaderboard', label: 'Classement' },
] as const;
export type MenuTabId = (typeof MENU_TABS)[number]['id'];

/** Groupes du menu quand l'admin n'en a pas défini. */
export const DEFAULT_MENU_GROUPS: MenuTabId[][] = [
  ['expeditions', 'battles', 'dungeons', 'quests'],
  ['center', 'daycare', 'museum', 'farm'],
  ['pc', 'teams', 'pokedex', 'shop', 'bag'],
  ['trainer', 'guild', 'leaderboard'],
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
  // Onglet oublié (souvent ajouté au jeu après le réglage de l'admin) : placé à côté de son voisin
  // dans les groupes par défaut (celui d'avant, sinon celui d'après) s'il est affiché, sinon dans
  // un groupe final.
  const missing: MenuTabId[] = [];
  for (const id of MENU_TABS.map((t) => t.id).filter((id) => !seen.has(id))) {
    const defaults = DEFAULT_MENU_GROUPS.find((g) => g.includes(id)) ?? [];
    const before = defaults.slice(0, defaults.indexOf(id)).reverse();
    const after = defaults.slice(defaults.indexOf(id) + 1);
    const previous = before.find((other) => seen.has(other));
    const anchor = previous ?? after.find((other) => seen.has(other));
    const group = anchor && result.find((g) => g.includes(anchor));
    if (group && anchor) group.splice(group.indexOf(anchor) + (previous ? 1 : 0), 0, id);
    else missing.push(id);
    seen.add(id);
  }
  if (missing.length) result.push(missing);
  return result.filter((g) => g.length > 0);
}

/** Un nombre par rareté de coffre de guilde (bronze, argent, or). */
const perChestRaritySchema = (min: number, max: number) =>
  z.object({
    bronze: z.int().min(min).max(max),
    silver: z.int().min(min).max(max),
    gold: z.int().min(min).max(max),
  });

/** Réglages des guildes par défaut (aussi utilisés pour les versions de contenu antérieures). */
export const DEFAULT_GUILD_SETTINGS = {
  creationCost: 100_000,
  maxMembers: 30,
  rejoinCooldownHours: 24,
  weeklyQuests: { bronze: 2, silver: 2, gold: 1 },
  chestRolls: { bronze: 1, silver: 2, gold: 3 },
};

export const guildSettingsSchema = z.object({
  /** Prix de création d'une guilde, en Poké Dollars. */
  creationCost: z.int().min(0).max(100_000_000),
  maxMembers: z.int().min(2).max(200),
  /** Délai après avoir quitté une guilde avant d'en rejoindre (ou d'en créer) une autre. */
  rejoinCooldownHours: z.int().min(0).max(720),
  /** Quêtes tirées chaque semaine, par rareté de coffre (difficulté). */
  weeklyQuests: perChestRaritySchema(0, 10),
  /** Lots tirés à l'ouverture d'un coffre, par rareté. */
  chestRolls: perChestRaritySchema(1, 10),
});
export type GuildSettings = z.infer<typeof guildSettingsSchema>;

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
  /** Centre Pokémon : les Pokémon mis K.O. y sont soignés. */
  center: z.object({
    /** Pokémon en soins au maximum (en même temps). */
    slots: z.int().min(1).max(30),
    /** Durée des soins (talents compris : Médic Nature, Cœur Soin…). */
    healMinutes: z.int().min(1),
  }),
  /** Combats de dresseurs (le combat suit `combat`). */
  battles: z.object({
    maxTeamSize: z.int().min(1).max(6),
    /** IV des Pokémon des dresseurs quand l'admin n'en fixe pas. */
    defaultTrainerIv: z.int().min(0).max(31),
    /** Temps de recharge d'un dresseur répétable après chaque combat (surchargeable). */
    cooldownMinutes: z.int().min(0),
    /** XP par membre = Σ (XP de base × niveau / 7) des Pokémon adverses vaincus × multiplicateur. */
    xpMultiplier: z.number().min(0),
    happinessOnWin: z.int().min(-255).max(255),
    happinessOnLoss: z.int().min(-255).max(255),
  }),
  /** Réglages communs aux combats en temps réel (donjons et dresseurs). */
  combat: combatSettingsSchema,
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
  /** Guildes : création, membres, quêtes hebdomadaires et coffres. */
  guilds: guildSettingsSchema.default(DEFAULT_GUILD_SETTINGS),
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
/** Météo qu'un talent peut imposer : une météo, ou le temps clair (annule celle du lieu). */
export const IMPOSED_WEATHERS = [...WEATHERS, 'clear'] as const;
export const imposedWeatherSchema = z.enum(IMPOSED_WEATHERS);
export type ImposedWeather = z.infer<typeof imposedWeatherSchema>;
/** Météo facultative d'un lieu : null (colonne vide en base) devient absente. */
const optionalWeatherSchema = z.preprocess((w) => w ?? undefined, weatherSchema.optional());

/** Météo possible d'une zone (temps clair compris) et son poids au tirage. */
export const zoneWeatherSchema = z.object({
  weather: imposedWeatherSchema,
  weight: z.int().min(1),
});
export type ZoneWeather = z.infer<typeof zoneWeatherSchema>;

/** Statuts des combats (donjons et dresseurs). */
export const STATUSES = ['paralysis', 'burn', 'poison', 'sleep', 'freeze'] as const;
export const statusSchema = z.enum(STATUSES);
export type Status = z.infer<typeof statusSchema>;

/** Statistiques qu'un talent peut faire varier en combat (Intimidation). */
export const DUNGEON_STATS = [
  'attack',
  'defense',
  'special-attack',
  'special-defense',
  'speed',
] as const;
export const dungeonStatSchema = z.enum(DUNGEON_STATS);
export type DungeonStat = z.infer<typeof dungeonStatSchema>;

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

// --- Objets ---------------------------------------------------------------------

export const ITEM_CATEGORIES = [
  'ball',
  'berry',
  'evolution',
  'breeding',
  'endgame',
  'fossil',
  'megaStone',
  'chest',
  'misc',
] as const;
export const itemCategorySchema = z.enum(ITEM_CATEGORIES);
export type ItemCategory = z.infer<typeof itemCategorySchema>;

/** Raretés des coffres de guilde, de la plus courante à la plus précieuse. */
export const CHEST_RARITIES = ['bronze', 'silver', 'gold'] as const;
export const chestRaritySchema = z.enum(CHEST_RARITIES);
export type ChestRarity = z.infer<typeof chestRaritySchema>;
export const CHEST_RARITY_LABELS: Record<ChestRarity, string> = {
  bronze: 'Bronze',
  silver: 'Argent',
  gold: 'Or',
};

/** Effets d'objets : briques génériques paramétrées dans l'admin. */
export const itemEffectSchema = z.discriminatedUnion('type', [
  /**
   * Utilisable comme Ball : multiplie la probabilité de capture ; `guaranteed` = capture assurée
   * (Master Ball).
   */
  z.object({
    type: z.literal('ball'),
    catchMultiplier: z.number().positive(),
    guaranteed: z.boolean().optional(),
  }),
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
   * Utilisé sur un Pokémon (qui arrive sans talent) : donne un talent normal au hasard, puis l'autre
   * (Pilule Talent), ou le talent caché (Patch Talent).
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
  /** Utilisé sur un Pokémon K.O. : il est aussitôt soigné, sans passer par le Centre (Rappel). */
  z.object({ type: z.literal('revive') }),
  /**
   * Plantée à la ferme (consommée) : pousse `minutes` tant que le champ est arrosé, puis donne
   * de `minYield` à `maxYield` baies de la même espèce.
   */
  z.object({
    type: z.literal('berryPlant'),
    minutes: z.int().min(1).max(10_080),
    minYield: z.int().min(1).max(99),
    maxYield: z.int().min(1).max(99),
  }),
  /**
   * En combat (donjon, dresseur) : soigne le Pokémon actif de `fraction` de ses PV max (Baie
   * Sitrus), au plus une fois toutes les `cooldownSeconds` secondes.
   */
  z.object({
    type: z.literal('battleHeal'),
    fraction: z.number().gt(0).max(1),
    cooldownSeconds: z.int().min(0).max(3600).default(10),
  }),
  /** Utilisé sur un Pokémon : son bonheur augmente de `amount` (Baie Grena). */
  z.object({ type: z.literal('happiness'), amount: z.int().min(1).max(255) }),
  /** Utilisé sur un Pokémon : il gagne `levels` niveaux, sans dépasser 100 (Super Bonbon). */
  z.object({ type: z.literal('levelUp'), levels: z.int().min(1).max(99) }),
  /**
   * Emportée en expédition à la place d'une baie de capture : multiplie les rencontres (Baie
   * Nanana). Une baie par heure d'expédition, au moins une.
   */
  z.object({ type: z.literal('encounterBoost'), multiplier: z.number().min(1).max(10) }),
  /** Coffre de guilde : ouvert depuis le sac, il donne des lots tirés parmi ceux de sa rareté. */
  z.object({ type: z.literal('guildChest'), rarity: chestRaritySchema }),
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
  /**
   * Météo variable (talents qui en dépendent) : temps clair au départ, puis à chaque heure pile,
   * `weatherChangeChance` % de chances d'en changer pour une autre de `weathers`, tirée selon
   * les poids. Aucune météo = toujours temps clair.
   */
  weatherChangeChance: z.number().min(0).max(100).default(0),
  weathers: z
    .array(zoneWeatherSchema)
    .default([])
    .refine((list) => new Set(list.map((w) => w.weather)).size === list.length, 'Météo en double'),
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
  /** Temps imparti pour vaincre toute l'équipe du dresseur. */
  timeLimitSeconds: z.int().min(10).max(3600),
  rules: battleRulesSchema,
  /** Poké Dollars gagnés en cas de victoire. */
  money: z.int().min(0),
  lootTableId: slugSchema.nullable(),
  lootRolls: z.int().min(0).max(20),
  /** Badge obtenu à la première victoire (Champions d'arène). */
  badge: z.object({ name: nameSchema, image: imageSchema }).nullable(),
  /** Unique : une seule victoire possible. Répétable : temps de recharge après chaque combat. */
  repeatable: z.boolean(),
  /** Temps de recharge ; null = valeur de l'équilibrage. */
  cooldownMinutes: z.int().min(0).nullable(),
  /** Désactivé : caché aux joueurs, plus aucun combat ne peut être lancé contre lui. */
  enabled: z.boolean().default(true),
  unlock: unlockConditionSchema,
});
export type Trainer = z.infer<typeof trainerSchema>;

/** Temps imparti proposé pour un dresseur : 1 min, plus 30 s par Pokémon de son équipe. */
export const defaultTrainerTimeLimitSeconds = (teamSize: number) => 60 + 30 * teamSize;

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

/**
 * Zone où peuvent fuir les Pokémon fuyards : active, et ordinaire, c'est-à-dire ni zone de quête
 * (ouverte par une quête) ni zone spéciale (plusieurs conditions de déblocage).
 */
export function isRoamingZone(zone: Pick<Zone, 'enabled' | 'unlock'>): boolean {
  const { unlock } = zone;
  return (
    zone.enabled &&
    unlock.type !== 'allOf' &&
    unlock.type !== 'questStepsDone' &&
    unlock.type !== 'questCompleted'
  );
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
  /**
   * Pokémon fuyard : pas d'expédition légendaire ; une fois la récompense réclamée, il change de
   * zone à chaque heure (zones ordinaires débloquées de la région de la quête) et chaque rencontre
   * d'une expédition dans sa zone a `roaming` % de chances d'être lui (une fois au plus).
   * null = expédition légendaire.
   */
  roaming: z.number().gt(0).max(100).nullable().default(null),
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

// --- Guildes : quêtes hebdomadaires et coffres ---------------------------------------

/** Objectif d'une quête de guilde : ce que chaque action des membres fait avancer. */
export const guildObjectiveSchema = z.discriminatedUnion('type', [
  /** Pokémon capturés (expéditions, quêtes), d'un type donné ou de tous types. */
  z.object({ type: z.literal('catchPokemon'), pokemonType: z.string().min(1).nullable() }),
  /** Expéditions récupérées (hors expéditions légendaires). */
  z.object({ type: z.literal('expeditions') }),
  /** Combats de dresseurs gagnés. */
  z.object({ type: z.literal('battlesWon') }),
  /** Donjons réussis. */
  z.object({ type: z.literal('dungeonsWon') }),
  /** Œufs éclos. */
  z.object({ type: z.literal('eggsHatched') }),
  /** Poké Dollars gagnés en combat de dresseur et en donjon. */
  z.object({ type: z.literal('moneyEarned') }),
]);
export type GuildObjective = z.infer<typeof guildObjectiveSchema>;
export type GuildObjectiveType = GuildObjective['type'];

/**
 * Modèle de quête de guilde : chaque semaine, des modèles sont tirés au hasard pour chaque guilde
 * (nombre par rareté dans l'équilibrage). La quête terminée donne un coffre de sa rareté à chaque
 * membre qui l'a fait avancer.
 */
export const guildQuestSchema = z.object({
  id: slugSchema,
  name: nameSchema,
  description: z.string().max(500),
  /** Difficulté = rareté du coffre gagné. */
  rarity: chestRaritySchema,
  objective: guildObjectiveSchema,
  /** Objectif = ce nombre × membres de la guilde au tirage, sans descendre sous `minCount`. */
  countPerMember: z.int().min(1).max(1_000_000),
  minCount: z.int().min(1).max(10_000_000),
  enabled: z.boolean(),
});
export type GuildQuest = z.infer<typeof guildQuestSchema>;

/**
 * Lot d'un coffre de guilde (comme un article de boutique) : à l'ouverture, chaque tirage choisit
 * un lot parmi ceux de la rareté du coffre que le joueur a débloqués, selon leur poids.
 */
export const chestEntrySchema = z.object({
  id: slugSchema,
  rarity: chestRaritySchema,
  itemId: slugSchema,
  /** Nombre d'objets du lot (ex. 100 Poké Balls). */
  lotSize: z.int().min(1).max(999),
  /** Poids relatif dans le tirage (les lots débloqués de la rareté se partagent le total). */
  weight: z.number().positive().max(1_000_000),
  /** Condition pour que le lot puisse sortir (progression du joueur). */
  unlock: unlockConditionSchema,
  enabled: z.boolean(),
});
export type ChestEntry = z.infer<typeof chestEntrySchema>;

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
  guildQuests: z.array(guildQuestSchema).default([]),
  chestEntries: z.array(chestEntrySchema).default([]),
});
export type GameContentData = z.infer<typeof gameContentStructureSchema>;

/** Contenu chargé depuis une version publiée (ou un brouillon en test). */
export interface GameContent extends GameContentData {
  versionId: number;
}

/** Chances par défaut qu'une rencontre soit le Pokémon fuyard (%), dans la zone où il se trouve. */
export const DEFAULT_ROAMING_CHANCE = 3;

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
