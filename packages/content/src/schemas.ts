import { z } from 'zod';

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

// --- Objets ---------------------------------------------------------------------

export const ITEM_CATEGORIES = [
  'ball',
  'berry',
  'evolution',
  'breeding',
  'endgame',
  'fossil',
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
  effects: z.array(itemEffectSchema),
});
export type Item = z.infer<typeof itemSchema>;

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

/** Pokémon offert (légendaire…) : IV aléatoires, dont au moins `perfectIvs` à 31. */
export const questPokemonSchema = z.object({
  speciesId: z.int().positive(),
  formId: formIdSchema,
  level: z.int().min(1).max(100),
  perfectIvs: z.int().min(0).max(6),
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
  items: z.array(itemSchema),
  lootTables: z.array(lootTableSchema),
  zones: z.array(zoneSchema),
  trainers: z.array(trainerSchema),
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
