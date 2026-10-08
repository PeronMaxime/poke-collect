import type {
  BattleRules,
  Collection,
  DexMilestone,
  EvolutionMethod,
  EvolutionOverride,
  GameContentData,
  Item,
  ProgressReward,
  LootEntry,
  Quest,
  QuestCondition,
  QuestPokemon,
  QuestStep,
  ShopCategory,
  ShopEntry,
  Trainer,
  TrainerPokemon,
  Zone,
} from './schemas';
import {
  expansionDexMilestones,
  expansionItems,
  expansionRegions,
  expansionShopEntries,
  expansionTrainers,
  expansionZones,
} from './seed-expansion';

/**
 * Contenu de test, importé en base au premier lancement (version 1, publiée).
 * Tout reste modifiable ensuite dans le panneau d'admin. Valeurs : PLAN.md, section 7.
 */

const ALL_DURATIONS = [15, 60, 240, 480];

const enc = (speciesId: number, weight: number, minLevel: number, maxLevel: number) => ({
  speciesId,
  weight,
  minLevel,
  maxLevel,
});
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

const zones: Zone[] = [
  {
    id: 'route-1',
    regionId: 'kanto',
    order: 0,
    name: 'Route 1',
    description: 'Les hautes herbes entre Bourg Palette et Jadielle. Idéal pour débuter.',
    image: null,
    habitat: 'grassland',
    minPower: 0,
    requiredTypes: [],
    affinityTypes: ['normal', 'flying'],
    durationsMinutes: ALL_DURATIONS,
    encounters: [
      enc(19, 30, 2, 4),
      enc(16, 30, 2, 4),
      enc(21, 15, 3, 5),
      enc(29, 10, 3, 5),
      enc(32, 10, 3, 5),
      enc(43, 5, 4, 6),
    ],
    lootTableId: 'butin-route',
    unlock: { type: 'always' },
  },
  {
    id: 'foret-de-jade',
    regionId: 'kanto',
    order: 1,
    name: 'Forêt de Jade',
    description: 'Une forêt dense où grouillent les insectes. On y aperçoit parfois un Pikachu.',
    image: null,
    habitat: 'forest',
    minPower: 100,
    requiredTypes: [],
    affinityTypes: ['bug', 'grass'],
    durationsMinutes: ALL_DURATIONS,
    encounters: [
      enc(10, 30, 3, 6),
      enc(13, 30, 3, 6),
      enc(11, 10, 5, 7),
      enc(14, 10, 5, 7),
      enc(69, 12, 5, 8),
      enc(25, 3, 5, 8),
    ],
    lootTableId: 'butin-foret',
    unlock: { type: 'regionDexPercent', regionId: 'kanto', percent: 3 },
  },
  {
    id: 'mont-selenite',
    regionId: 'kanto',
    order: 2,
    name: 'Mont Sélénite',
    description: 'Une grotte sombre, réputée pour ses météorites… et ses Mélofée.',
    image: null,
    habitat: 'cave',
    minPower: 180,
    requiredTypes: [],
    affinityTypes: ['rock', 'ground'],
    durationsMinutes: ALL_DURATIONS,
    encounters: [
      enc(41, 40, 6, 10),
      enc(74, 30, 7, 10),
      enc(46, 15, 8, 11),
      enc(27, 10, 8, 11),
      enc(35, 5, 8, 12),
    ],
    lootTableId: 'butin-grotte',
    unlock: { type: 'regionDexPercent', regionId: 'kanto', percent: 6 },
  },
  {
    id: 'cap-azuria',
    regionId: 'kanto',
    order: 3,
    name: 'Cap Azuria',
    description: 'Les berges au nord d’Azuria. Il faut au moins un Pokémon Eau pour s’y aventurer.',
    image: null,
    habitat: 'waters-edge',
    minPower: 250,
    requiredTypes: [{ type: 'water', count: 1 }],
    affinityTypes: ['water'],
    durationsMinutes: [60, 240, 480],
    encounters: [
      enc(129, 35, 8, 15),
      enc(118, 20, 10, 15),
      enc(60, 20, 10, 15),
      enc(54, 12, 12, 16),
      enc(72, 10, 12, 16),
      enc(120, 3, 14, 18),
    ],
    lootTableId: 'butin-mer',
    unlock: { type: 'regionDexPercent', regionId: 'kanto', percent: 10 },
  },
  // Haut niveau (phase 7) : après les badges, puis zones ouvertes par les quêtes légendaires.
  {
    id: 'route-victoire',
    regionId: 'kanto',
    order: 4,
    name: 'Route Victoire',
    description: 'La grotte qui mène à la Ligue Pokémon. Seuls les dresseurs aguerris en sortent.',
    image: null,
    habitat: 'cave',
    minPower: 1200,
    requiredTypes: [],
    affinityTypes: ['fighting', 'rock', 'ground'],
    durationsMinutes: [60, 240, 480],
    encounters: [
      enc(67, 20, 40, 44),
      enc(75, 20, 40, 44),
      enc(95, 15, 40, 46),
      enc(42, 15, 40, 44),
      enc(105, 10, 42, 46),
      enc(49, 10, 42, 46),
    ],
    lootTableId: 'butin-elite',
    unlock: { type: 'badgeCount', count: 2 },
  },
  {
    id: 'iles-ecume',
    regionId: 'kanto',
    order: 5,
    name: 'Îles Écume',
    description: 'Deux îles glacées au large de Parmanie. Un oiseau légendaire y aurait son nid.',
    image: null,
    habitat: 'sea',
    minPower: 800,
    requiredTypes: [{ type: 'water', count: 1 }],
    affinityTypes: ['ice', 'water'],
    durationsMinutes: [60, 240, 480],
    encounters: [
      enc(86, 30, 30, 35),
      enc(87, 15, 32, 38),
      enc(90, 20, 30, 35),
      enc(91, 5, 34, 38),
      enc(124, 10, 32, 36),
      enc(79, 15, 30, 35),
      enc(131, 3, 35, 40),
    ],
    lootTableId: 'butin-mer',
    unlock: { type: 'questStepsDone', questId: 'artikodin', count: 1 },
  },
  {
    id: 'centrale',
    regionId: 'kanto',
    order: 6,
    name: 'Centrale',
    description: 'Une centrale électrique abandonnée où crépitent les Pokémon Électrik.',
    image: null,
    habitat: 'urban',
    minPower: 800,
    requiredTypes: [],
    affinityTypes: ['electric'],
    durationsMinutes: [60, 240, 480],
    encounters: [
      enc(100, 30, 30, 35),
      enc(81, 30, 30, 35),
      enc(25, 15, 30, 34),
      enc(82, 8, 34, 38),
      enc(101, 7, 34, 38),
      enc(125, 5, 35, 38),
      enc(88, 5, 30, 34),
    ],
    lootTableId: 'butin-grotte',
    unlock: { type: 'questStepsDone', questId: 'electhor', count: 1 },
  },
  {
    id: 'mont-braise',
    regionId: 'kanto',
    order: 7,
    name: 'Mont Braise',
    description: 'Un volcan des Îles Sevii. La lave y garde au chaud un oiseau de feu.',
    image: null,
    habitat: 'mountain',
    minPower: 800,
    requiredTypes: [],
    affinityTypes: ['fire', 'rock'],
    durationsMinutes: [60, 240, 480],
    encounters: [
      enc(77, 30, 30, 35),
      enc(37, 20, 30, 35),
      enc(74, 20, 30, 34),
      enc(75, 10, 33, 37),
      enc(78, 8, 34, 38),
      enc(126, 5, 35, 38),
      enc(58, 7, 30, 35),
    ],
    lootTableId: 'butin-grotte',
    unlock: { type: 'questStepsDone', questId: 'sulfura', count: 1 },
  },
  {
    id: 'grotte-azuree',
    regionId: 'kanto',
    order: 8,
    name: 'Grotte Azurée',
    description: 'La caverne interdite d’Azuria, peuplée de Pokémon redoutables.',
    image: null,
    habitat: 'cave',
    minPower: 2000,
    requiredTypes: [],
    affinityTypes: ['psychic', 'ground'],
    durationsMinutes: [240, 480],
    encounters: [
      enc(64, 15, 50, 55),
      enc(47, 15, 50, 55),
      enc(112, 15, 52, 58),
      enc(101, 15, 50, 55),
      enc(113, 8, 52, 58),
      enc(132, 12, 50, 55),
      enc(55, 10, 52, 56),
      enc(82, 10, 50, 55),
    ],
    lootTableId: 'butin-elite',
    unlock: { type: 'questStepsDone', questId: 'mewtwo', count: 2 },
  },
  {
    id: 'ile-lointaine',
    regionId: 'kanto',
    order: 9,
    name: 'Île Lointaine',
    description: 'Une île couverte de hautes herbes, absente des cartes. Quelque chose y joue…',
    image: null,
    habitat: 'grassland',
    minPower: 800,
    requiredTypes: [],
    affinityTypes: ['grass', 'bug', 'psychic'],
    durationsMinutes: [60, 240, 480],
    encounters: [
      enc(114, 20, 30, 35),
      enc(102, 20, 30, 35),
      enc(48, 20, 30, 34),
      enc(46, 15, 30, 34),
      enc(123, 8, 33, 37),
      enc(127, 8, 33, 37),
      enc(103, 4, 35, 38),
    ],
    lootTableId: 'butin-foret',
    unlock: { type: 'questStepsDone', questId: 'mew', count: 2 },
  },
];

const mon = (speciesId: number, level: number): TrainerPokemon => ({
  speciesId,
  level,
  iv: null,
  nature: null,
});
const noRules = (): BattleRules => ({
  teamSize: null,
  maxLevel: null,
  requiredTypes: [],
  forbiddenTypes: [],
  minPower: 0,
});
const TRAINER_SPRITES = 'https://play.pokemonshowdown.com/sprites/trainers';

const trainers: Trainer[] = [
  {
    id: 'gamin-tom',
    regionId: 'kanto',
    zoneId: 'route-1',
    order: 0,
    name: 'Tom',
    trainerClass: 'Gamin',
    sprite: `${TRAINER_SPRITES}/youngster.png`,
    team: [mon(19, 4)],
    durationMinutes: 10,
    rules: noRules(),
    money: 80,
    lootTableId: 'butin-route',
    lootRolls: 1,
    badge: null,
    repeatable: true,
    cooldownMinutes: null,
    koMinutes: null,
    unlock: { type: 'always' },
  },
  {
    id: 'fillette-lise',
    regionId: 'kanto',
    zoneId: 'route-1',
    order: 1,
    name: 'Lise',
    trainerClass: 'Fillette',
    sprite: `${TRAINER_SPRITES}/lass.png`,
    team: [mon(16, 4), mon(29, 5)],
    durationMinutes: 15,
    rules: noRules(),
    money: 120,
    lootTableId: 'butin-route',
    lootRolls: 1,
    badge: null,
    repeatable: true,
    cooldownMinutes: null,
    koMinutes: null,
    unlock: { type: 'trainerDefeated', trainerId: 'gamin-tom' },
  },
  {
    id: 'scout-rick',
    regionId: 'kanto',
    zoneId: 'foret-de-jade',
    order: 2,
    name: 'Rick',
    trainerClass: 'Scout',
    sprite: `${TRAINER_SPRITES}/bugcatcher.png`,
    team: [mon(10, 6), mon(13, 6), mon(14, 7)],
    durationMinutes: 20,
    rules: noRules(),
    money: 180,
    lootTableId: 'butin-foret',
    lootRolls: 2,
    badge: null,
    repeatable: true,
    cooldownMinutes: null,
    koMinutes: null,
    unlock: { type: 'regionDexPercent', regionId: 'kanto', percent: 3 },
  },
  {
    id: 'pierre',
    regionId: 'kanto',
    zoneId: null,
    order: 3,
    name: 'Pierre',
    trainerClass: 'Champion d’arène',
    sprite: `${TRAINER_SPRITES}/brock.png`,
    team: [mon(74, 12), mon(95, 14)],
    durationMinutes: 60,
    rules: noRules(),
    money: 1200,
    lootTableId: 'butin-grotte',
    lootRolls: 3,
    badge: { name: 'Badge Roche', image: null },
    repeatable: false,
    cooldownMinutes: null,
    koMinutes: null,
    unlock: { type: 'trainerDefeated', trainerId: 'scout-rick' },
  },
  {
    id: 'campeur-leo',
    regionId: 'kanto',
    zoneId: 'mont-selenite',
    order: 4,
    name: 'Léo',
    trainerClass: 'Campeur',
    sprite: `${TRAINER_SPRITES}/camper.png`,
    team: [mon(27, 10), mon(23, 11)],
    durationMinutes: 30,
    rules: { ...noRules(), maxLevel: 15 },
    money: 300,
    lootTableId: 'butin-grotte',
    lootRolls: 2,
    badge: null,
    repeatable: true,
    cooldownMinutes: null,
    koMinutes: null,
    unlock: { type: 'badgeCount', count: 1 },
  },
  {
    id: 'ondine',
    regionId: 'kanto',
    zoneId: null,
    order: 5,
    name: 'Ondine',
    trainerClass: 'Championne d’arène',
    sprite: `${TRAINER_SPRITES}/misty.png`,
    team: [mon(120, 18), mon(121, 21)],
    durationMinutes: 60,
    rules: { ...noRules(), minPower: 250 },
    money: 2100,
    lootTableId: 'butin-mer',
    lootRolls: 3,
    badge: { name: 'Badge Cascade', image: null },
    repeatable: false,
    cooldownMinutes: null,
    koMinutes: 120,
    unlock: { type: 'badgeCount', count: 1 },
  },
  ...eliteFour(),
];

/** Conseil 4 puis Maître de la Ligue : uniques, à affronter dans l'ordre, IV élevés. */
function eliteFour(): Trainer[] {
  const ace = (speciesId: number, level: number, iv: number): TrainerPokemon => ({
    speciesId,
    level,
    iv,
    nature: null,
  });
  const league = (
    id: string,
    order: number,
    name: string,
    sprite: string,
    team: TrainerPokemon[],
    previous: string | null,
    extra: Partial<Trainer> = {},
  ): Trainer => ({
    id,
    regionId: 'kanto',
    zoneId: null,
    order,
    name,
    trainerClass: 'Conseil 4',
    sprite: `${TRAINER_SPRITES}/${sprite}.png`,
    team,
    durationMinutes: 120,
    rules: noRules(),
    money: 6000,
    lootTableId: 'butin-elite',
    lootRolls: 3,
    badge: null,
    repeatable: false,
    cooldownMinutes: null,
    koMinutes: 240,
    unlock: previous
      ? { type: 'trainerDefeated', trainerId: previous }
      : { type: 'badgeCount', count: 2 },
    ...extra,
  });
  return [
    league(
      'olga',
      6,
      'Olga',
      'lorelei',
      [ace(87, 54, 25), ace(91, 53, 25), ace(80, 54, 25), ace(124, 56, 25), ace(131, 56, 25)],
      null,
    ),
    league(
      'aldo',
      7,
      'Aldo',
      'bruno',
      [ace(95, 53, 25), ace(107, 55, 25), ace(106, 55, 25), ace(95, 56, 25), ace(68, 58, 25)],
      'olga',
    ),
    league(
      'agatha',
      8,
      'Agatha',
      'agatha',
      [ace(94, 56, 25), ace(42, 56, 25), ace(93, 55, 25), ace(24, 58, 25), ace(94, 60, 25)],
      'aldo',
    ),
    league(
      'peter',
      9,
      'Peter',
      'lance',
      [ace(130, 56, 25), ace(148, 54, 25), ace(148, 54, 25), ace(142, 58, 25), ace(149, 60, 25)],
      'agatha',
    ),
    league(
      'maitre-blue',
      10,
      'Blue',
      'blue',
      [
        ace(18, 61, 31),
        ace(65, 59, 31),
        ace(112, 61, 31),
        ace(103, 61, 31),
        ace(130, 63, 31),
        ace(6, 65, 31),
      ],
      'peter',
      { trainerClass: 'Maître de la Ligue', durationMinutes: 180, money: 15_000, lootRolls: 5 },
    ),
  ];
}

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

/** Pokémon offert par une quête : au moins 3 IV parfaits, comme dans les jeux récents. */
const legendary = (speciesId: number, level: number): QuestPokemon => ({
  speciesId,
  level,
  perfectIvs: 3,
});
const step = (name: string, description: string, condition: QuestCondition): QuestStep => ({
  name,
  description,
  condition,
});
/** Expédition réussie dans une zone de quête, avec des Pokémon d'un type et d'une PE donnés. */
const questExpedition = (
  zoneId: string,
  memberType: string | null,
  memberCount: number,
  minMemberPower: number,
  count = 1,
): QuestCondition => ({
  type: 'expedition',
  zoneId,
  count,
  memberType,
  memberCount,
  minMemberPower,
});

/** Quêtes des légendaires de Kanto (PLAN.md, section 2.7). */
const quests: Quest[] = [
  {
    id: 'artikodin',
    order: 0,
    name: 'L’oiseau des glaces',
    description: 'Un oiseau légendaire ferait tomber la neige sur les Îles Écume.',
    image: null,
    regionId: 'kanto',
    unlock: { type: 'badgeCount', count: 2 },
    steps: [
      step('Les pieds dans l’eau', 'Capture 10 Pokémon Eau pour préparer la traversée.', {
        type: 'catchPokemon',
        count: 10,
        pokemonType: 'water',
        speciesId: null,
      }),
      step('Le froid des îles', 'Capture 5 Pokémon Glace aux Îles Écume.', {
        type: 'catchPokemon',
        count: 5,
        pokemonType: 'ice',
        speciesId: null,
      }),
      step(
        'Le nid d’Artikodin',
        'Réussis une expédition aux Îles Écume avec 2 Pokémon Glace de PE 400 ou plus.',
        questExpedition('iles-ecume', 'ice', 2, 400),
      ),
    ],
    rewards: {
      ...reward({ currency: 10_000, items: [{ itemId: 'bottle-cap', quantity: 1 }] }),
      pokemon: [legendary(144, 50)],
    },
  },
  {
    id: 'electhor',
    order: 1,
    name: 'L’oiseau de foudre',
    description: 'Des éclairs zèbrent le ciel au-dessus de la Centrale abandonnée.',
    image: null,
    regionId: 'kanto',
    unlock: { type: 'badgeCount', count: 2 },
    steps: [
      step('Prouver sa valeur', 'Bats la Championne Ondine.', {
        type: 'trainerDefeated',
        trainerId: 'ondine',
      }),
      step('Courts-circuits', 'Capture 8 Pokémon Électrik à la Centrale.', {
        type: 'catchPokemon',
        count: 8,
        pokemonType: 'electric',
        speciesId: null,
      }),
      step(
        'Le cœur de la Centrale',
        'Réussis une expédition à la Centrale avec 2 Pokémon Électrik de PE 400 ou plus.',
        questExpedition('centrale', 'electric', 2, 400),
      ),
    ],
    rewards: {
      ...reward({ currency: 10_000, items: [{ itemId: 'bottle-cap', quantity: 1 }] }),
      pokemon: [legendary(145, 50)],
    },
  },
  {
    id: 'sulfura',
    order: 2,
    name: 'L’oiseau de feu',
    description: 'Le Mont Braise gronde : un oiseau de flammes y aurait été aperçu.',
    image: null,
    regionId: 'kanto',
    unlock: { type: 'badgeCount', count: 2 },
    steps: [
      step('Explorateur', 'Capture 40 espèces différentes.', { type: 'speciesCaught', count: 40 }),
      step('Coulées de lave', 'Capture 8 Pokémon Feu au Mont Braise.', {
        type: 'catchPokemon',
        count: 8,
        pokemonType: 'fire',
        speciesId: null,
      }),
      step(
        'Le sommet du volcan',
        'Réussis une expédition au Mont Braise avec 2 Pokémon Feu de PE 400 ou plus.',
        questExpedition('mont-braise', 'fire', 2, 400),
      ),
    ],
    rewards: {
      ...reward({ currency: 10_000, items: [{ itemId: 'bottle-cap', quantity: 1 }] }),
      pokemon: [legendary(146, 50)],
    },
  },
  {
    id: 'mewtwo',
    order: 3,
    name: 'Le Pokémon génétique',
    description:
      'Une créature née d’expériences interdites se cacherait au fond de la Grotte Azurée.',
    image: null,
    regionId: 'kanto',
    unlock: { type: 'badgeCount', count: 2 },
    steps: [
      step('Chercheur', 'Capture 60 % du Pokédex de Kanto.', {
        type: 'regionDexPercent',
        regionId: 'kanto',
        percent: 60,
      }),
      step('Maître de la Ligue', 'Bats le Maître de la Ligue Pokémon.', {
        type: 'trainerDefeated',
        trainerId: 'maitre-blue',
      }),
      step(
        'La Grotte Azurée',
        'Réussis une expédition dans la Grotte Azurée avec 3 Pokémon de PE 700 ou plus.',
        questExpedition('grotte-azuree', null, 3, 700),
      ),
    ],
    rewards: {
      ...reward({ currency: 50_000, items: [{ itemId: 'gold-bottle-cap', quantity: 1 }] }),
      pokemon: [legendary(150, 70)],
    },
  },
  {
    id: 'mew',
    order: 4,
    name: 'Le Pokémon fabuleux',
    description: 'Mewtwo n’est qu’une copie. L’original jouerait sur une île absente des cartes.',
    image: null,
    regionId: 'kanto',
    unlock: { type: 'questCompleted', questId: 'mewtwo' },
    steps: [
      step('Origines', 'Fais éclore 20 œufs.', { type: 'eggsHatched', count: 20 }),
      step('Grand collectionneur', 'Capture 30 Pokémon.', {
        type: 'catchPokemon',
        count: 30,
        pokemonType: null,
        speciesId: null,
      }),
      step(
        'Les hautes herbes',
        'Réussis 3 expéditions sur l’Île Lointaine.',
        questExpedition('ile-lointaine', null, 0, 0, 3),
      ),
    ],
    rewards: {
      ...reward({ items: [{ itemId: 'ability-patch', quantity: 1 }] }),
      pokemon: [legendary(151, 30)],
    },
  },
];

export const seedContent: GameContentData = {
  balance: {
    expeditions: {
      initialSlots: 2,
      maxSlots: 6,
      maxTeamSize: 6,
      durationsMinutes: ALL_DURATIONS,
      encountersPerHour: 3,
      minEncounters: 1,
      lootRollsPerHour: 2,
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
      unlock: { type: 'always' },
    },
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
    {
      id: 'butin-grotte',
      name: 'Butin de grotte',
      entries: [
        loot('poke-ball', 0.6, 1, 3),
        loot('great-ball', 0.2, 1, 2),
        loot('moon-stone', 0.03),
        loot('everstone', 0.04),
      ],
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
  zones: [...zones, ...expansionZones],
  trainers: [...trainers, ...expansionTrainers],
  shopCategories,
  shopEntries: [...shopEntries, ...expansionShopEntries],
  evolutionOverrides,
  dexMilestones: [...dexMilestones, ...expansionDexMilestones],
  collections,
  quests,
};

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
