import type {
  Collection,
  DexMilestone,
  EvolutionMethod,
  EvolutionOverride,
  GameContentData,
  Item,
  ProgressReward,
  LootEntry,
  ShopCategory,
  ShopEntry,
} from './schemas';
import {
  expansionDexMilestones,
  expansionItems,
  expansionRegions,
  expansionShopEntries,
  expansionTrainers,
  expansionZones,
} from './seed-expansion';
import { johtoQuests, johtoRegion, johtoTrainers, johtoZones } from './seed-johto';
import { kantoQuests, kantoTrainers, kantoZones } from './seed-kanto';

/**
 * Contenu de test, importé en base au premier lancement (version 1, publiée).
 * Tout reste modifiable ensuite dans le panneau d'admin. Valeurs : PLAN.md, section 7.
 */

const ALL_DURATIONS = [2, 5, 15, 60, 240, 480];

const loot = (itemId: string, chance: number, min = 1, max = min): LootEntry => ({
  itemId,
  chance,
  min,
  max,
});

/** Aromates proposés dans le contenu de test : nature PokéAPI et nom français. */
const MINTS = [
  ['adamant', 'Rigide'],
  ['modest', 'Modeste'],
  ['jolly', 'Jovial'],
  ['timid', 'Timide'],
  ['bold', 'Assuré'],
  ['calm', 'Calme'],
] as const;

const shopCategories: ShopCategory[] = [
  { id: 'balls', name: 'Balls', icon: null, order: 0 },
  { id: 'baies', name: 'Baies', icon: null, order: 1 },
  { id: 'elevage', name: 'Élevage', icon: null, order: 2 },
  { id: 'evolution', name: 'Évolution', icon: null, order: 3 },
  { id: 'rare', name: 'Rare', icon: null, order: 4 },
];

const article = (
  id: string,
  itemId: string,
  categoryId: string,
  order: number,
  price: number,
  extra: Partial<ShopEntry> = {},
): ShopEntry => ({
  id,
  itemId,
  categoryId,
  order,
  price,
  lotSize: 1,
  unlock: { type: 'always' },
  lockedVisibility: 'locked',
  purchaseLimit: null,
  availableFrom: null,
  availableUntil: null,
  enabled: true,
  ...extra,
});

/** Prix : PLAN.md, section 7. Super / Hyper Balls débloquées par les badges Roche et Cascade. */
const shopEntries: ShopEntry[] = [
  article('poke-ball', 'poke-ball', 'balls', 0, 200),
  article('poke-ball-x10', 'poke-ball', 'balls', 1, 1800, { lotSize: 10 }),
  article('great-ball', 'great-ball', 'balls', 2, 600, {
    unlock: { type: 'trainerDefeated', trainerId: 'pierre' },
  }),
  article('ultra-ball', 'ultra-ball', 'balls', 3, 1200, {
    unlock: { type: 'trainerDefeated', trainerId: 'ondine' },
  }),
  article('razz-berry', 'razz-berry', 'baies', 0, 150),
  article('razz-berry-x5', 'razz-berry', 'baies', 1, 600, { lotSize: 5 }),
  article('everstone', 'everstone', 'elevage', 0, 10_000, {
    unlock: { type: 'badgeCount', count: 1 },
  }),
  article('destiny-knot', 'destiny-knot', 'elevage', 1, 10_000, {
    unlock: { type: 'eggsHatched', count: 10 },
    lockedVisibility: 'hidden',
    purchaseLimit: { lots: 1, period: 'week' },
  }),
  article('moon-stone', 'moon-stone', 'evolution', 0, 3000, {
    unlock: { type: 'regionDexPercent', regionId: 'kanto', percent: 25 },
  }),
  article('water-stone', 'water-stone', 'evolution', 1, 3000, {
    unlock: { type: 'regionDexPercent', regionId: 'kanto', percent: 25 },
  }),
  article('thunder-stone', 'thunder-stone', 'evolution', 2, 3000, {
    unlock: { type: 'regionDexPercent', regionId: 'kanto', percent: 25 },
  }),
  article('fire-stone', 'fire-stone', 'evolution', 3, 3000, {
    unlock: { type: 'regionDexPercent', regionId: 'kanto', percent: 25 },
  }),
  article('leaf-stone', 'leaf-stone', 'evolution', 4, 3000, {
    unlock: { type: 'regionDexPercent', regionId: 'kanto', percent: 25 },
  }),
  article('linking-cord', 'linking-cord', 'evolution', 5, 5000, {
    unlock: { type: 'badgeCount', count: 2 },
  }),
  // Objets endgame : chers, limités, débloqués par le Conseil 4 et le Maître.
  article('bottle-cap', 'bottle-cap', 'rare', 0, 50_000, {
    unlock: { type: 'trainerDefeated', trainerId: 'olga' },
    purchaseLimit: { lots: 1, period: 'week' },
  }),
  article('gold-bottle-cap', 'gold-bottle-cap', 'rare', 1, 300_000, {
    unlock: { type: 'trainerDefeated', trainerId: 'maitre-blue' },
    purchaseLimit: { lots: 1, period: 'total' },
  }),
  ...MINTS.map(([nature], i) =>
    article(`${nature}-mint`, `${nature}-mint`, 'rare', 2 + i, 20_000, {
      unlock: { type: 'badgeCount', count: 2 },
    }),
  ),
  article('ability-capsule', 'ability-capsule', 'rare', 10, 30_000, {
    unlock: { type: 'trainerDefeated', trainerId: 'olga' },
  }),
  article('ability-patch', 'ability-patch', 'rare', 11, 150_000, {
    unlock: { type: 'trainerDefeated', trainerId: 'maitre-blue' },
    purchaseLimit: { lots: 1, period: 'week' },
  }),
];

const method = (m: Partial<EvolutionMethod>): EvolutionMethod => ({
  minLevel: null,
  itemId: null,
  minHappiness: null,
  timeOfDay: null,
  ...m,
});
const evolution = (from: number, to: number, ...methods: EvolutionMethod[]): EvolutionOverride => ({
  id: `${from}-${to}`,
  fromSpeciesId: from,
  toSpeciesId: to,
  enabled: true,
  methods,
});

/**
 * Évolutions dont la condition PokéAPI n'est pas transposable au jeu idle (attaque connue, genre,
 * pas effectués, Pokémon retourné, nature…) : une condition de niveau ou d'objet équivalente.
 */
const evolutionOverrides: EvolutionOverride[] = [
  evolution(108, 463, method({ minLevel: 33 })), // Excelangue → Coudlangue (Roulade)
  evolution(281, 475, method({ itemId: 'dawn-stone' })), // Kirlia → Gallame (mâle)
  evolution(361, 478, method({ itemId: 'dawn-stone' })), // Stalgamin → Momartik (femelle)
  evolution(114, 465, method({ minLevel: 33 })), // Saquedeneu → Bouldeneu (Pouvoir Antique)
  evolution(190, 424, method({ minLevel: 32 })), // Capumain → Capidextre (Coup Double)
  evolution(193, 469, method({ minLevel: 33 })), // Yanma → Yanmega (Pouvoir Antique)
  evolution(221, 473, method({ minLevel: 34 })), // Cochignon → Mammochon (Pouvoir Antique)
  evolution(133, 700, method({ minHappiness: 220 })), // Évoli → Nymphali (attaque Fée)
  evolution(236, 106, method({ minLevel: 20 })), // Debugant : selon Attaque / Défense
  evolution(236, 107, method({ minLevel: 20 })),
  evolution(236, 237, method({ minLevel: 20 })),
  evolution(290, 292, method({ minLevel: 20 })), // Ningale → Munja (place libre)
  evolution(412, 413, method({ minLevel: 20 })), // Cheniti : selon le genre
  evolution(412, 414, method({ minLevel: 20 })),
  evolution(415, 416, method({ minLevel: 21 })), // Apitrini → Apireine (femelle)
  evolution(438, 185, method({ minLevel: 17 })), // Manzaï → Simularbre (Copie)
  evolution(439, 122, method({ minLevel: 18 })), // Mime Jr. → M. Mime (Copie)
  evolution(458, 226, method({ minLevel: 20 })), // Babimanta → Démanta (Rémoraid)
  evolution(588, 589, method({ itemId: 'linking-cord' })), // Carabing ⇄ Escargaume
  evolution(616, 617, method({ itemId: 'linking-cord' })),
  evolution(674, 675, method({ minLevel: 32 })), // Pandespiègle → Pandarbare (Ténèbres)
  evolution(677, 678, method({ minLevel: 25 })), // Psystigri → Mistigrix
  evolution(686, 687, method({ minLevel: 30 })), // Sepiatop → Sepiatroce (console retournée)
  evolution(705, 706, method({ minLevel: 50 })), // Colimucus → Muplodocus (pluie)
  evolution(757, 758, method({ minLevel: 33 })), // Tritox → Malamandre (femelle)
  evolution(762, 763, method({ minLevel: 29 })), // Candine → Sucreine (Écrasement)
  evolution(803, 804, method({ minLevel: 40 })), // Vémini → Mandrillon (Draco-Choc)
  evolution(808, 809, method({ minLevel: 50 })), // Meltan → Melmetal (Bonbons Meltan)
  evolution(848, 849, method({ minLevel: 30 })), // Toxizap → Salarsen (nature)
  evolution(852, 853, method({ minLevel: 35 })), // Poulpaf → Krakos (Provoc)
  evolution(868, 869, method({ itemId: 'strawberry-sweet' })), // Crèmy → Charmilly (pirouette)
  evolution(915, 916, method({ minLevel: 18 })), // Gourmelet → Fragroin
  evolution(922, 923, method({ minLevel: 35 })), // Pohmotte → Pohmarmotte (1 000 pas)
  evolution(946, 947, method({ minLevel: 30 })), // Virovent → Virevorreur (1 000 pas)
  evolution(953, 954, method({ minLevel: 30 })), // Léboulérou → Bérasca (1 000 pas)
  evolution(963, 964, method({ minLevel: 38 })), // Dofin → Superdofin (multijoueur)
  evolution(57, 979, method({ minLevel: 45 })), // Colossinge → Courrousinge (Poing de Colère)
  evolution(203, 981, method({ minLevel: 32 })), // Girafarig → Farigiraf (Double Laser)
  evolution(206, 982, method({ minLevel: 32 })), // Insolourdo → Deusolourdo (Vrille Infernale)
  evolution(217, 901, method({ itemId: 'peat-block', timeOfDay: 'night' })), // Ursaring → Ursaking
  evolution(234, 899, method({ minLevel: 31 })), // Cerfrousse → Cerbyllin (Sprint Bouclier)
  evolution(625, 983, method({ minLevel: 52 })), // Scalproie → Scalpereur (3 Scalproie vaincus)
  evolution(999, 1000, method({ minLevel: 40 })), // Mordudor → Gromago (999 pièces)
  evolution(1011, 1019, method({ minLevel: 40 })), // Pomdramour → Pomdorochi (Cri Draconique)
];

const reward = (r: Partial<ProgressReward>): ProgressReward => ({
  currency: 0,
  items: [],
  expeditionSlots: 0,
  battleSlots: 0,
  daycareSlots: 0,
  bonuses: [],
  ...r,
});

/** Paliers du Pokédex de Kanto : emplacements, Balls, argent (PLAN.md, section 2.8). */
const dexMilestones: DexMilestone[] = [
  {
    id: 'kanto-10',
    order: 0,
    name: 'Apprenti de Kanto',
    regionId: 'kanto',
    shiny: false,
    percent: 10,
    rewards: reward({ expeditionSlots: 1, items: [{ itemId: 'great-ball', quantity: 5 }] }),
  },
  {
    id: 'kanto-25',
    order: 1,
    name: 'Explorateur de Kanto',
    regionId: 'kanto',
    shiny: false,
    percent: 25,
    rewards: reward({ battleSlots: 1, daycareSlots: 1, currency: 3000 }),
  },
  {
    id: 'kanto-50',
    order: 2,
    name: 'Chercheur de Kanto',
    regionId: 'kanto',
    shiny: false,
    percent: 50,
    rewards: reward({
      expeditionSlots: 1,
      items: [
        { itemId: 'ultra-ball', quantity: 5 },
        { itemId: 'linking-cord', quantity: 1 },
      ],
    }),
  },
  {
    id: 'kanto-75',
    order: 3,
    name: 'Expert de Kanto',
    regionId: 'kanto',
    shiny: false,
    percent: 75,
    rewards: reward({ battleSlots: 1, daycareSlots: 1, currency: 10_000 }),
  },
  {
    id: 'kanto-100',
    order: 4,
    name: 'Maître du Pokédex de Kanto',
    regionId: 'kanto',
    shiny: false,
    percent: 100,
    rewards: reward({
      expeditionSlots: 1,
      daycareSlots: 1,
      currency: 50_000,
      items: [{ itemId: 'destiny-knot', quantity: 1 }],
    }),
  },
  {
    id: 'national-100',
    order: 0,
    name: 'Pokédex national complet',
    regionId: null,
    shiny: false,
    percent: 100,
    rewards: reward({ items: [{ itemId: 'shiny-charm', quantity: 1 }] }),
  },
  // Pokédex shiny (PLAN.md, section 2.6) : récompenses à part.
  {
    id: 'kanto-shiny-5',
    order: 10,
    name: 'Premiers éclats de Kanto',
    regionId: 'kanto',
    shiny: true,
    percent: 5,
    rewards: reward({ currency: 20_000, items: [{ itemId: 'ultra-ball', quantity: 10 }] }),
  },
  {
    id: 'kanto-shiny-25',
    order: 11,
    name: 'Chasseur chromatique de Kanto',
    regionId: 'kanto',
    shiny: true,
    percent: 25,
    rewards: reward({ currency: 100_000, bonuses: [{ type: 'capture', percent: 10 }] }),
  },
];

/** Collections thématiques : bonus permanents (PLAN.md, section 2.8). */
const collections: Collection[] = [
  {
    id: 'insectes-de-jade',
    order: 0,
    name: 'Insectes de la Forêt de Jade',
    description: 'Chenipan, Aspicot et toutes leurs évolutions.',
    speciesIds: [10, 11, 12, 13, 14, 15],
    rewards: reward({
      items: [{ itemId: 'poke-ball', quantity: 10 }],
      bonuses: [{ type: 'capture', percent: 5 }],
    }),
  },
  {
    id: 'famille-nidoran',
    order: 1,
    name: 'La famille Nidoran',
    description: 'Les deux lignées de Nidoran, jusqu’à Nidoqueen et Nidoking.',
    speciesIds: [29, 30, 31, 32, 33, 34],
    rewards: reward({ bonuses: [{ type: 'money', percent: 10 }] }),
  },
  {
    id: 'starters-de-kanto',
    order: 2,
    name: 'Starters de Kanto',
    description: 'Bulbizarre, Salamèche, Carapuce et leurs évolutions.',
    speciesIds: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    rewards: reward({ expeditionSlots: 1, bonuses: [{ type: 'xp', percent: 10 }] }),
  },
];

export const seedContent: GameContentData = {
  balance: {
    expeditions: {
      initialSlots: 2,
      maxSlots: 6,
      maxTeamSize: 6,
      durationsMinutes: ALL_DURATIONS,
      encountersPerHour: 20,
      minEncounters: 1,
      lootRollsPerHour: 10,
      minLootRolls: 1,
      durationExponent: 0.9,
    },
    capture: {
      globalMultiplier: 1,
      assumedHpFraction: 0.5,
      affinityBonusPerPokemon: 0.1,
      hiddenAbilityChance: 0.05,
    },
    shiny: {
      baseRateDenominator: 4096,
      chainBonusPerExpedition: 0.25,
      chainMaxMultiplier: 3,
      chainWindowMinutes: 120,
      masudaMultiplier: 4,
    },
    pity: { weightBonusPerMiss: 0.05, maxMultiplier: 3 },
    xp: { multiplier: 1, happinessPerExpedition: 2 },
    breeding: {
      hatchMinutesPerCounter: 2,
      eggMinutes: 20,
      maxEggs: 6,
      inheritedIvCount: 3,
      hiddenAbilityInheritChance: 0.6,
      eggLevel: 1,
    },
    transfer: { candiesPerPokemon: 1, shinyBonusCandies: 10, xpPerCandy: 500 },
    daycare: { initialSlots: 1, maxSlots: 4 },
    museum: { slots: 2 },
    battles: {
      initialSlots: 1,
      maxSlots: 3,
      maxTeamSize: 6,
      defaultDurationMinutes: 10,
      // ln 9 / ln 1,5 : ~90 % à PE × 1,5 et ~10 % à PE × 0,67 (PLAN.md, section 7).
      winCurveSteepness: 5.4,
      minWinChance: 0.05,
      maxWinChance: 0.95,
      typeAdvantageWeight: 0.1,
      defaultTrainerIv: 15,
      koMinutes: 60,
      cooldownMinutes: 240,
      xpMultiplier: 1,
      lossXpFraction: 0.25,
      happinessOnWin: 3,
      happinessOnLoss: -2,
    },
    evolution: { tradeItemId: 'linking-cord', dayStartHour: 6, nightStartHour: 20 },
    newPlayer: {
      starterLevel: 5,
      startingCurrency: 0,
      startingInventory: [
        { itemId: 'poke-ball', quantity: 20 },
        { itemId: 'razz-berry', quantity: 5 },
      ],
    },
  },
  regions: [
    {
      id: 'kanto',
      order: 0,
      name: 'Kanto',
      image: null,
      speciesIds: Array.from({ length: 151 }, (_, i) => i + 1),
      starterSpeciesIds: [1, 4, 7],
      enabled: true,
      unlock: { type: 'always' },
    },
    johtoRegion,
    ...expansionRegions,
  ],
  speciesOverrides: [],
  items: [
    {
      id: 'poke-ball',
      name: 'Poké Ball',
      description: 'La Ball de base.',
      icon: null,
      category: 'ball',
      rarity: 'common',
      effects: [{ type: 'ball', catchMultiplier: 1 }],
    },
    {
      id: 'great-ball',
      name: 'Super Ball',
      description: 'Plus efficace qu’une Poké Ball.',
      icon: null,
      category: 'ball',
      rarity: 'uncommon',
      effects: [{ type: 'ball', catchMultiplier: 1.5 }],
    },
    {
      id: 'ultra-ball',
      name: 'Hyper Ball',
      description: 'Plus efficace qu’une Super Ball.',
      icon: null,
      category: 'ball',
      rarity: 'rare',
      effects: [{ type: 'ball', catchMultiplier: 2 }],
    },
    {
      id: 'razz-berry',
      name: 'Baie Framby',
      description: 'Donnée au Pokémon sauvage avant le lancer : capture plus facile.',
      icon: null,
      category: 'berry',
      rarity: 'common',
      effects: [{ type: 'captureBoost', multiplier: 1.5 }],
    },
    {
      id: 'moon-stone',
      name: 'Pierre Lune',
      description: 'Fait évoluer Nidorina, Nidorino, Mélofée et Rondoudou.',
      icon: null,
      category: 'evolution',
      rarity: 'rare',
      effects: [],
    },
    {
      id: 'water-stone',
      name: 'Pierre Eau',
      description: 'Fait évoluer Têtarte, Kokiyas, Stari et Évoli.',
      icon: null,
      category: 'evolution',
      rarity: 'rare',
      effects: [],
    },
    {
      id: 'thunder-stone',
      name: 'Pierre Foudre',
      description: 'Fait évoluer Pikachu et Évoli.',
      icon: null,
      category: 'evolution',
      rarity: 'rare',
      effects: [],
    },
    {
      id: 'fire-stone',
      name: 'Pierre Feu',
      description: 'Fait évoluer Goupix, Caninos et Évoli.',
      icon: null,
      category: 'evolution',
      rarity: 'rare',
      effects: [],
    },
    {
      id: 'leaf-stone',
      name: 'Pierre Plante',
      description: 'Fait évoluer Ortide, Boustiflor et Noeunoeuf.',
      icon: null,
      category: 'evolution',
      rarity: 'rare',
      effects: [],
    },
    {
      id: 'linking-cord',
      name: 'Câble Link',
      description: 'Remplace l’échange : fait évoluer Kadabra, Machopeur, Gravalanch et Spectrum.',
      icon: null,
      category: 'evolution',
      rarity: 'epic',
      effects: [],
    },
    {
      id: 'everstone',
      name: 'Pierre Stase',
      description: 'Tenue par un parent en pension, elle transmet sa nature à l’œuf.',
      icon: null,
      category: 'breeding',
      rarity: 'rare',
      effects: [{ type: 'breedingNature', chance: 1 }],
    },
    {
      id: 'destiny-knot',
      name: 'Nœud Destin',
      description: 'Tenu par un parent en pension : l’œuf hérite de 5 IV des parents au lieu de 3.',
      icon: null,
      category: 'breeding',
      rarity: 'epic',
      effects: [{ type: 'breedingIvs', count: 5 }],
    },
    {
      id: 'shiny-charm',
      name: 'Charme Chroma',
      description:
        'Il suffit de l’avoir dans son sac : les Pokémon shiny apparaissent 3 fois plus souvent.',
      icon: null,
      category: 'endgame',
      rarity: 'legendary',
      effects: [{ type: 'shinyCharm', multiplier: 3 }],
    },
    ...endgameItems(),
    ...fossilItems(),
    ...expansionItems,
  ],
  lootTables: [
    {
      id: 'butin-route',
      name: 'Butin de route',
      entries: [
        loot('poke-ball', 0.7, 1, 3),
        loot('razz-berry', 0.25, 1, 2),
        loot('great-ball', 0.05),
      ],
    },
    {
      id: 'butin-foret',
      name: 'Butin de forêt',
      entries: [
        loot('poke-ball', 0.7, 1, 3),
        loot('razz-berry', 0.35, 1, 2),
        loot('great-ball', 0.1),
        loot('everstone', 0.02),
      ],
    },
    { id: 'butin-grotte', name: 'Butin de grotte', entries: caveLoot() },
    // Fouilles : butin de grotte, plus des fossiles à restaurer au Musée.
    {
      id: 'butin-fouilles',
      name: 'Butin de fouilles (Kanto)',
      entries: [
        ...caveLoot(),
        loot('helix-fossil', 0.04),
        loot('dome-fossil', 0.04),
        loot('old-amber', 0.015),
      ],
    },
    {
      id: 'butin-fouilles-hoenn',
      name: 'Butin de fouilles (Hoenn)',
      entries: [...caveLoot(), loot('root-fossil', 0.04), loot('claw-fossil', 0.04)],
    },
    {
      id: 'butin-fouilles-sinnoh',
      name: 'Butin de fouilles (Sinnoh)',
      entries: [...caveLoot(), loot('skull-fossil', 0.04), loot('armor-fossil', 0.04)],
    },
    {
      id: 'butin-mer',
      name: 'Butin des berges',
      entries: [
        loot('poke-ball', 0.6, 2, 4),
        loot('great-ball', 0.25, 1, 2),
        loot('ultra-ball', 0.05),
        loot('water-stone', 0.03),
        loot('destiny-knot', 0.02),
      ],
    },
    {
      id: 'butin-elite',
      name: 'Butin d’élite',
      entries: [
        loot('ultra-ball', 0.5, 1, 2),
        loot('great-ball', 0.4, 1, 3),
        loot('bottle-cap', 0.02),
        loot('ability-capsule', 0.01),
        ...MINTS.map(([nature]) => loot(`${nature}-mint`, 0.01)),
      ],
    },
  ],
  zones: [...kantoZones, ...johtoZones, ...expansionZones],
  trainers: [...kantoTrainers, ...johtoTrainers, ...expansionTrainers],
  shopCategories,
  shopEntries: [...shopEntries, ...expansionShopEntries],
  evolutionOverrides,
  dexMilestones: [...dexMilestones, ...expansionDexMilestones],
  collections,
  quests: [...kantoQuests, ...johtoQuests],
};

function caveLoot(): LootEntry[] {
  return [
    loot('poke-ball', 0.6, 1, 3),
    loot('great-ball', 0.2, 1, 2),
    loot('moon-stone', 0.03),
    loot('everstone', 0.04),
  ];
}

/** Fossiles : trouvés en expédition, restaurés au Musée (un Pokémon après quelques heures). */
function fossilItems(): Item[] {
  const fossil = (
    id: string,
    name: string,
    speciesId: number,
    pokemonName: string,
    minutes: number,
    rarity: Item['rarity'],
  ): Item => ({
    id,
    name,
    description: `Un fossile ancien. Le Musée peut en faire renaître un ${pokemonName}.`,
    icon: null,
    category: 'fossil',
    rarity,
    effects: [{ type: 'fossil', speciesId, formId: null, level: 10, minutes }],
  });
  return [
    fossil('helix-fossil', 'Fossile Nautile', 138, 'Amonita', 120, 'rare'),
    fossil('dome-fossil', 'Fossile Dôme', 140, 'Kabuto', 120, 'rare'),
    fossil('old-amber', 'Vieil Ambre', 142, 'Ptéra', 240, 'epic'),
    fossil('root-fossil', 'Fossile Racine', 345, 'Lilia', 180, 'rare'),
    fossil('claw-fossil', 'Fossile Griffe', 347, 'Anorith', 180, 'rare'),
    fossil('skull-fossil', 'Fossile Crâne', 408, 'Kranidos', 180, 'rare'),
    fossil('armor-fossil', 'Fossile Armure', 410, 'Dinoclier', 180, 'rare'),
  ];
}

/** Objets endgame (PLAN.md, section 2.7) : Capsules, Aromates, Pilule et Patch Talent. */
function endgameItems(): Item[] {
  const item = (
    id: string,
    name: string,
    description: string,
    rarity: Item['rarity'],
    effects: Item['effects'],
  ): Item => ({ id, name, description, icon: null, category: 'endgame', rarity, effects });
  return [
    item(
      'bottle-cap',
      'Capsule d’Argent',
      'Utilisée sur un Pokémon : un IV au choix passe à 31.',
      'epic',
      [{ type: 'ivCap', all: false }],
    ),
    item(
      'gold-bottle-cap',
      'Capsule d’Or',
      'Utilisée sur un Pokémon : ses 6 IV passent à 31.',
      'legendary',
      [{ type: 'ivCap', all: true }],
    ),
    ...MINTS.map(([nature, label]) =>
      item(
        `${nature}-mint`,
        `Aromate ${label}`,
        `Utilisé sur un Pokémon : sa nature effective devient ${label}.`,
        'epic',
        [{ type: 'mint', nature }],
      ),
    ),
    item(
      'ability-capsule',
      'Pilule Talent',
      'Utilisée sur un Pokémon : il passe à son autre talent normal.',
      'epic',
      [{ type: 'abilityChange', hidden: false }],
    ),
    item(
      'ability-patch',
      'Patch Talent',
      'Utilisé sur un Pokémon : il obtient son talent caché.',
      'legendary',
      [{ type: 'abilityChange', hidden: true }],
    ),
  ];
}
