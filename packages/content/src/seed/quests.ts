import {
  DEFAULT_ROAMING_CHANCE,
  defaultTrainerTimeLimitSeconds,
  legendaryBattle,
} from '../schemas';
import type {
  ImposedWeather,
  Item,
  LegendaryBattle,
  ProgressReward,
  Quest,
  QuestCondition,
  QuestPokemon,
  QuestStep,
  Trainer,
  TrainerPokemon,
  UnlockCondition,
} from '../schemas';

/**
 * Quêtes des légendaires de Kanto, Johto et Hoenn : une petite histoire par légendaire. Les
 * étapes mêlent progression (quêtes, Pokédex), captures, expéditions aux conditions précises
 * (Pokémon exact dans l'équipe, météo ou moment du départ) et objets de quête, trouvés au fil des
 * rencontres. Chaque étape validée dévoile son dénouement ; la dernière fait apparaître le
 * légendaire, à affronter en combat (les fuyards, eux, s'enfuient à travers la région).
 */

// --- Objets de quête --------------------------------------------------------------------------

const questItem = (id: string, name: string, description: string, sprite: string): Item => ({
  id,
  name,
  description,
  icon: `/api/sprites/items/${sprite}.png`,
  category: 'quest',
  rarity: 'rare',
  sellPrice: null,
  effects: [],
});

export const questItems: Item[] = [
  questItem(
    'fragment-magnetique',
    'Fragment magnétique',
    'Éclat de métal aimanté arraché aux machines de la Centrale. Il pointe toujours vers le ciel.',
    'magnet',
  ),
  questItem(
    'plume-foudre',
    'Plume Foudre',
    'Plume jaune qui grésille au moindre contact. Elle sent l’orage.',
    'health-wing',
  ),
  questItem(
    'eclat-de-givre',
    'Éclat de givre',
    'Cristal de glace tombé des ailes d’Artikodin. Il ne fond jamais.',
    'never-melt-ice',
  ),
  questItem(
    'cendre-ardente',
    'Cendre ardente',
    'Plume consumée par les flammes de Sulfura, encore brûlante des heures après sa chute.',
    'heat-rock',
  ),
  questItem(
    'page-du-journal',
    'Page du journal',
    'Page arrachée au journal d’un scientifique du Manoir Pokémon.',
    'journal',
  ),
  questItem(
    'echantillon-adn',
    'Échantillon d’ADN',
    'Trace génétique laissée par Mewtwo au fond de la Grotte Azurée.',
    'dna-splicers',
  ),
  questItem(
    'vieille-carte-marine',
    'Vieille carte marine',
    'Carte jaunie qui indique une île absente de toutes les cartes modernes.',
    'old-sea-map',
  ),
  questItem(
    'poil-soyeux',
    'Poil soyeux',
    'Poil rose d’une douceur incroyable, retrouvé dans les hautes herbes de l’Île Lointaine.',
    'fluffy-tail',
  ),
  questItem(
    'plume-psychique',
    'Plume psychique',
    'Plume violette qui plonge celui qui la regarde dans une légère torpeur.',
    'clever-wing',
  ),
  questItem(
    'plume-martiale',
    'Plume martiale',
    'Plume rouge et dure comme l’acier, perdue lors d’une course effrénée.',
    'muscle-wing',
  ),
  questItem(
    'plume-sombre',
    'Plume sombre',
    'Plume aux reflets noirs, chargée de rancœur.',
    'resist-wing',
  ),
  questItem(
    'eclat-de-tonnerre',
    'Éclat de tonnerre',
    'Cristal tombé là où la foudre a frappé. On y entend gronder Raikou.',
    'electric-gem',
  ),
  questItem(
    'braise-eternelle',
    'Braise éternelle',
    'Braise qui ne s’éteint jamais, née du rugissement d’Entei.',
    'fire-gem',
  ),
  questItem(
    'eau-purifiee',
    'Eau purifiée',
    'Eau d’une pureté parfaite, puisée là où Suicune a couru.',
    'mystic-water',
  ),
  questItem(
    'clochette-oceane',
    'Clochette Océane',
    'Cloche ancienne qui tinte au rythme des vagues. Elle apaise les courants des Tourb’Îles.',
    'tidal-bell',
  ),
  questItem(
    'argentaile',
    'Argentaile',
    'Plume argentée qui brille comme la lune. Elle appartient au gardien des mers.',
    'silver-wing',
  ),
  questItem(
    'arcenciaile',
    'Arcenci’aile',
    'Plume aux sept couleurs, tombée des ailes de l’oiseau sacré.',
    'rainbow-wing',
  ),
  questItem(
    'statuette-de-l-autel',
    'Statuette de l’autel',
    'Statuette d’un petit Pokémon ailé. Au revers : « Rends-moi à l’autel. »',
    'relic-statue',
  ),
  questItem(
    'rosee-du-voile-rouge',
    'Rosée du voile rouge',
    'Goutte de rosée qui reflète la lumière en rouge, laissée par Latias.',
    'soul-dew',
  ),
  questItem(
    'ticket-eon',
    'Ticket Éon',
    'Ticket mystérieux qui porte le dessin d’un Pokémon bleu aux ailes de jet.',
    'eon-ticket',
  ),
  questItem(
    'tablette-de-roche',
    'Tablette de roche',
    'Tablette couverte d’inscriptions en relief, sortie des sables du désert.',
    'stone-plate',
  ),
  questItem(
    'tablette-d-acier',
    'Tablette d’acier',
    'Tablette métallique qui bourdonne doucement, comme si elle était vivante.',
    'iron-plate',
  ),
  questItem(
    'tablette-de-glace',
    'Tablette de glace',
    'Tablette de glace éternelle, gravée de points en relief.',
    'icicle-plate',
  ),
  questItem(
    'orbe-bleu',
    'Orbe Bleu',
    'Orbe qui renferme le pouvoir des océans. Il pulse quand la pluie tombe.',
    'blue-orb',
  ),
  questItem(
    'orbe-rouge',
    'Orbe Rouge',
    'Orbe qui renferme le pouvoir des continents. Il brûle quand le soleil tape.',
    'red-orb',
  ),
  questItem(
    'orbe-de-jade',
    'Orbe de Jade',
    'Orbe qui vibre au rythme du vent, lié au gardien du ciel.',
    'jade-orb',
  ),
  questItem(
    'poussiere-d-etoile',
    'Poussière d’étoile',
    'Poussière scintillante tombée du ciel les nuits où passe la comète.',
    'stardust',
  ),
  questItem(
    'fragment-de-meteorite',
    'Fragment de météorite',
    'Fragment encore tiède, qui pulse d’une énergie venue de l’espace.',
    'meteorite',
  ),
  questItem(
    'cristal-aurore',
    'Cristal aurore',
    'Cristal qui s’illumine en présence d’ondes psychiques venues de l’espace.',
    'psychic-gem',
  ),
];

// --- Briques ----------------------------------------------------------------------------------

const reward = (r: Partial<ProgressReward>): ProgressReward => ({
  currency: 0,
  items: [],
  expeditionSlots: 0,
  daycareSlots: 0,
  incubators: 0,
  bonuses: [],
  ...r,
});

/**
 * Combats légendaires : chance de capture selon le rang du légendaire. Le renfort (niveau, PV,
 * statistiques) est réglé légendaire par légendaire, d'après des simulations contre des équipes
 * de 6 Pokémon de la région (à ajuster dans l'admin).
 */
const TIERS = {
  /** Oiseaux, colosses : premiers légendaires après la Ligue. */
  guardian: { captureChance: 35 },
  /** Fabuleux (Mew, Celebi, Jirachi). */
  mythical: { captureChance: 30 },
  /** Légendaires majeurs (Mewtwo, Lugia, Ho-Oh, Kyogre, Groudon) : PV ×8. */
  major: { captureChance: 25, hpMultiplier: 8 },
  /** Rayquaza, Deoxys. */
  apex: { captureChance: 20 },
} satisfies Record<string, Partial<LegendaryBattle>>;

/** Renfort par défaut des combats légendaires. */
const BOOST = {
  level: 70,
  hpMultiplier: 5,
  statMultiplier: 1.2,
} satisfies Partial<LegendaryBattle>;

/** Légendaire à combattre : 3 IV parfaits une fois capturé. */
const legendary = (
  speciesId: number,
  level: number,
  tier: keyof typeof TIERS,
  boost: Partial<LegendaryBattle> = {},
): QuestPokemon => ({
  speciesId,
  level,
  perfectIvs: 3,
  battle: legendaryBattle({ ...BOOST, ...boost, ...TIERS[tier] }),
  roaming: null,
});
/** Fuyard : pas de combat, il change de zone à chaque heure dans la région de la quête. */
const roamer = (speciesId: number, level: number, formId?: number): QuestPokemon => ({
  speciesId,
  ...(formId !== undefined && { formId }),
  level,
  perfectIvs: 3,
  battle: legendaryBattle(),
  roaming: DEFAULT_ROAMING_CHANCE,
});

const step = (
  name: string,
  description: string,
  condition: QuestCondition,
  outcome: string,
): QuestStep => ({ name, description, condition, outcome });

const catchOf = (
  count: number,
  pokemonType: string | null,
  zoneId: string | null = null,
  speciesId: number | null = null,
): QuestCondition => ({ type: 'catchPokemon', count, pokemonType, speciesId, zoneId });

interface Requirements {
  memberType?: string | null;
  memberCount?: number;
  minMemberPower?: number;
  speciesIds?: number[];
  weathers?: ImposedWeather[];
  timeOfDay?: 'day' | 'night' | null;
}
const requirements = (r: Requirements) => ({
  memberType: r.memberType ?? null,
  memberCount: r.memberCount ?? 0,
  minMemberPower: r.minMemberPower ?? 0,
  speciesIds: r.speciesIds ?? [],
  weathers: r.weathers ?? [],
  timeOfDay: r.timeOfDay ?? null,
});
/** Expédition(s) réussie(s) dans une zone, aux conditions de départ données. */
const expedition = (zoneId: string, r: Requirements = {}, count = 1): QuestCondition => ({
  type: 'expedition',
  zoneId,
  count,
  ...requirements(r),
});
/** Objet(s) de quête à trouver en expédition (`chance` % par tirage de butin). */
const find = (
  itemId: string,
  count: number,
  zoneId: string,
  chance: number,
  r: Requirements = {},
): QuestCondition => ({ type: 'questItem', itemId, count, zoneId, chance, ...requirements(r) });

const defeated = (trainerId: string): UnlockCondition => ({ type: 'trainerDefeated', trainerId });
const completed = (...questIds: string[]): UnlockCondition =>
  questIds.length === 1
    ? { type: 'questCompleted', questId: questIds[0]! }
    : {
        type: 'allOf',
        conditions: questIds.map((questId) => ({ type: 'questCompleted', questId })),
      };

const BIRD_REWARD = reward({ currency: 10_000, items: [{ itemId: 'bottle-cap', quantity: 1 }] });
const ROAMER_REWARD = reward({ currency: 15_000, items: [{ itemId: 'bottle-cap', quantity: 1 }] });
const MAJOR_REWARD = reward({
  currency: 50_000,
  items: [{ itemId: 'gold-bottle-cap', quantity: 1 }],
});

/**
 * Étape de chaque quête après laquelle sa zone s'ouvre (`questStepsDone`), à garder en phase avec
 * les zones (seeds des régions et migration 0123).
 */
export const QUEST_ZONE_STEPS: Record<string, { zoneId: string; count: number }> = {
  electhor: { zoneId: 'centrale', count: 1 },
  artikodin: { zoneId: 'iles-ecume', count: 1 },
  sulfura: { zoneId: 'mont-braise', count: 1 },
  mewtwo: { zoneId: 'grotte-azuree', count: 2 },
  mew: { zoneId: 'ile-lointaine', count: 2 },
  lugia: { zoneId: 'tourb-iles', count: 2 },
  'ho-oh': { zoneId: 'tour-carillon', count: 2 },
  celebi: { zoneId: 'autel-bois-aux-chenes', count: 2 },
  kyogre: { zoneId: 'grotte-sous-marine', count: 2 },
  groudon: { zoneId: 'grotte-originelle', count: 2 },
  rayquaza: { zoneId: 'pilier-celeste', count: 2 },
  deoxys: { zoneId: 'ile-aurore', count: 1 },
};

// --- Dresseurs de quêtes ------------------------------------------------------------------------

const questMon = (speciesId: number, level: number): TrainerPokemon => ({
  speciesId,
  formId: null,
  level,
  iv: 31,
  nature: null,
});

/**
 * Dresseur de quête : réservé à l'étape de sa quête qui demande de le battre, il n'apparaît qu'une
 * fois cette étape atteinte et ne se bat qu'une fois. Les quêtes s'ouvrent après la Ligue : ses
 * Pokémon (IV parfaits) sont au niveau du Maître de la région, ou un peu au-dessus.
 */
const questTrainer = (
  t: Pick<Trainer, 'id' | 'questId' | 'regionId' | 'zoneId' | 'name' | 'trainerClass' | 'team'> & {
    order: number;
    spriteName: string;
    money: number;
  },
): Trainer => {
  const { spriteName, ...rest } = t;
  return {
    sprite: `/api/sprites/trainers/${spriteName}.png`,
    timeLimitSeconds: defaultTrainerTimeLimitSeconds(rest.team.length),
    rules: { teamSize: null, maxLevel: null, requiredTypes: [], forbiddenTypes: [], minPower: 0 },
    lootTableId: null,
    lootRolls: 0,
    badge: null,
    repeatable: false,
    cooldownMinutes: null,
    enabled: true,
    unlock: { type: 'always' },
    ...rest,
  };
};

/** Dresseurs de quêtes (après les dresseurs de leur région dans l'ordre d'affichage). */
export const questTrainers: Trainer[] = [
  questTrainer({
    id: 'quete-electhor-volt',
    questId: 'electhor',
    regionId: 'kanto',
    zoneId: 'centrale',
    order: 100,
    name: 'Volt',
    trainerClass: 'Scientifique Rocket',
    spriteName: 'scientist',
    team: [
      questMon(82, 75),
      questMon(101, 76),
      questMon(137, 75),
      questMon(125, 77),
      questMon(135, 77),
      questMon(26, 78),
    ],
    money: 15_000,
  }),
  questTrainer({
    id: 'quete-artikodin-neige',
    questId: 'artikodin',
    regionId: 'kanto',
    zoneId: 'iles-ecume',
    order: 101,
    name: 'Neige',
    trainerClass: 'Skieuse',
    spriteName: 'skier',
    team: [
      questMon(87, 75),
      questMon(91, 76),
      questMon(124, 76),
      questMon(55, 75),
      questMon(121, 76),
      questMon(131, 78),
    ],
    money: 15_000,
  }),
  questTrainer({
    id: 'quete-sulfura-pyros',
    questId: 'sulfura',
    regionId: 'kanto',
    zoneId: 'mont-braise',
    order: 102,
    name: 'Pyros',
    trainerClass: 'Cracheur de feu',
    spriteName: 'biker',
    team: [
      questMon(78, 75),
      questMon(38, 75),
      questMon(136, 76),
      questMon(76, 76),
      questMon(126, 77),
      questMon(59, 78),
    ],
    money: 15_000,
  }),
  questTrainer({
    id: 'quete-mewtwo-kessler',
    questId: 'mewtwo',
    regionId: 'kanto',
    zoneId: 'grotte-azuree',
    order: 103,
    name: 'Kessler',
    trainerClass: 'Généticien',
    spriteName: 'supernerd',
    team: [
      questMon(65, 77),
      questMon(97, 76),
      questMon(110, 76),
      questMon(103, 77),
      questMon(122, 76),
      questMon(132, 78),
    ],
    money: 15_000,
  }),
  questTrainer({
    id: 'quete-mew-celia',
    questId: 'mew',
    regionId: 'kanto',
    zoneId: 'ile-lointaine',
    order: 104,
    name: 'Célia',
    trainerClass: 'Exploratrice',
    spriteName: 'picnicker-gen3',
    team: [
      questMon(149, 78),
      questMon(143, 76),
      questMon(59, 76),
      questMon(121, 75),
      questMon(65, 76),
      questMon(115, 75),
    ],
    money: 15_000,
  }),
  questTrainer({
    id: 'quete-artikodin-galar-selene',
    questId: 'artikodin-galar',
    regionId: 'galar',
    zoneId: null,
    order: 105,
    name: 'Sélène',
    trainerClass: 'Médium',
    spriteName: 'medium',
    team: [
      questMon(858, 78),
      questMon(826, 77),
      questMon(876, 77),
      questMon(866, 76),
      questMon(869, 76),
      questMon(884, 78),
    ],
    money: 15_000,
  }),
  questTrainer({
    id: 'quete-electhor-galar-kenzo',
    questId: 'electhor-galar',
    regionId: 'galar',
    zoneId: null,
    order: 106,
    name: 'Kenzo',
    trainerClass: 'Karatéka',
    spriteName: 'blackbelt',
    team: [
      questMon(853, 77),
      questMon(865, 78),
      questMon(870, 76),
      questMon(812, 76),
      questMon(823, 76),
      questMon(879, 79),
    ],
    money: 15_000,
  }),
  questTrainer({
    id: 'quete-sulfura-galar-ambre',
    questId: 'sulfura-galar',
    regionId: 'galar',
    zoneId: null,
    order: 107,
    name: 'Ambre',
    trainerClass: 'Exorciste',
    spriteName: 'channeler-gen3',
    team: [
      questMon(887, 79),
      questMon(855, 77),
      questMon(864, 76),
      questMon(867, 77),
      questMon(851, 76),
      questMon(861, 76),
    ],
    money: 15_000,
  }),
  questTrainer({
    id: 'quete-raikou-kanji',
    questId: 'raikou',
    regionId: 'johto',
    zoneId: 'tour-cendree',
    order: 108,
    name: 'Kanji',
    trainerClass: 'Chasseur de légendes',
    spriteName: 'acetrainer-gen4',
    team: [
      questMon(181, 76),
      questMon(171, 74),
      questMon(229, 75),
      questMon(212, 75),
      questMon(248, 77),
      questMon(197, 74),
    ],
    money: 15_000,
  }),
  questTrainer({
    id: 'quete-entei-roc',
    questId: 'entei',
    regionId: 'johto',
    zoneId: 'mont-creuset',
    order: 109,
    name: 'Roc',
    trainerClass: 'Montagnard',
    spriteName: 'hiker-gen3',
    team: [
      questMon(157, 77),
      questMon(229, 75),
      questMon(219, 74),
      questMon(232, 75),
      questMon(208, 76),
      questMon(185, 74),
    ],
    money: 15_000,
  }),
  questTrainer({
    id: 'quete-suicune-ruben',
    questId: 'suicune',
    regionId: 'johto',
    zoneId: 'lac-colere',
    order: 110,
    name: 'Ruben',
    trainerClass: 'Pêcheur',
    spriteName: 'fisherman-gen3',
    team: [
      questMon(160, 76),
      questMon(171, 74),
      questMon(199, 75),
      questMon(195, 74),
      questMon(224, 74),
      questMon(230, 77),
    ],
    money: 15_000,
  }),
  questTrainer({
    id: 'quete-lugia-corbin',
    questId: 'lugia',
    regionId: 'johto',
    zoneId: 'tourb-iles',
    order: 111,
    name: 'Corbin',
    trainerClass: 'Admin Rocket',
    spriteName: 'rocketgrunt',
    team: [
      questMon(229, 76),
      questMon(198, 74),
      questMon(169, 75),
      questMon(215, 74),
      questMon(197, 75),
      questMon(248, 78),
    ],
    money: 15_000,
  }),
  questTrainer({
    id: 'quete-ho-oh-ho',
    questId: 'ho-oh',
    regionId: 'johto',
    zoneId: 'tour-carillon',
    order: 112,
    name: 'Hô',
    trainerClass: 'Grand Sage',
    spriteName: 'sage',
    team: [
      questMon(178, 75),
      questMon(164, 74),
      questMon(196, 76),
      questMon(203, 74),
      questMon(227, 75),
      questMon(242, 77),
    ],
    money: 15_000,
  }),
  questTrainer({
    id: 'quete-celebi-vasco',
    questId: 'celebi',
    regionId: 'johto',
    zoneId: 'autel-bois-aux-chenes',
    order: 113,
    name: 'Vasco',
    trainerClass: 'Braconnier',
    spriteName: 'camper-gen3',
    team: [
      questMon(214, 76),
      questMon(212, 76),
      questMon(168, 74),
      questMon(169, 74),
      questMon(189, 74),
      questMon(205, 75),
    ],
    money: 15_000,
  }),
  questTrainer({
    id: 'quete-latias-marina',
    questId: 'latias',
    regionId: 'hoenn',
    zoneId: 'routes-124-128',
    order: 114,
    name: 'Marina',
    trainerClass: 'Nageuse',
    spriteName: 'swimmerf-gen3',
    team: [
      questMon(370, 74),
      questMon(340, 75),
      questMon(272, 75),
      questMon(369, 75),
      questMon(368, 76),
      questMon(350, 77),
    ],
    money: 15_000,
  }),
  questTrainer({
    id: 'quete-latios-faucon',
    questId: 'latios',
    regionId: 'hoenn',
    zoneId: 'routes-119-120',
    order: 115,
    name: 'Faucon',
    trainerClass: 'Ornithologue',
    spriteName: 'birdkeeper-gen3',
    team: [
      questMon(277, 75),
      questMon(279, 74),
      questMon(357, 75),
      questMon(334, 76),
      questMon(373, 77),
      questMon(330, 76),
    ],
    money: 15_000,
  }),
  questTrainer({
    id: 'quete-regirock-basalte',
    questId: 'regirock',
    regionId: 'hoenn',
    zoneId: 'desert-hoenn',
    order: 116,
    name: 'Basalte',
    trainerClass: 'Archéologue',
    spriteName: 'hiker-gen4',
    team: [
      questMon(306, 76),
      questMon(348, 76),
      questMon(346, 75),
      questMon(344, 75),
      questMon(324, 74),
      questMon(297, 75),
    ],
    money: 15_000,
  }),
  questTrainer({
    id: 'quete-registeel-ferrine',
    questId: 'registeel',
    regionId: 'hoenn',
    zoneId: 'routes-119-120',
    order: 117,
    name: 'Ferrine',
    trainerClass: 'Topdresseuse',
    spriteName: 'acetrainerf-gen3',
    team: [
      questMon(303, 75),
      questMon(375, 75),
      questMon(308, 75),
      questMon(302, 74),
      questMon(317, 74),
      questMon(376, 78),
    ],
    money: 15_000,
  }),
  questTrainer({
    id: 'quete-regice-boree',
    questId: 'regice',
    regionId: 'hoenn',
    zoneId: 'routes-124-128',
    order: 118,
    name: 'Borée',
    trainerClass: 'Loup de mer',
    spriteName: 'sailor',
    team: [
      questMon(365, 77),
      questMon(362, 76),
      questMon(260, 76),
      questMon(364, 75),
      questMon(319, 75),
      questMon(321, 75),
    ],
    money: 15_000,
  }),
  questTrainer({
    id: 'quete-kyogre-abysse',
    questId: 'kyogre',
    regionId: 'hoenn',
    zoneId: 'grotte-sous-marine',
    order: 119,
    name: 'Abysse',
    trainerClass: 'Admin Aqua',
    spriteName: 'aquagruntf',
    team: [
      questMon(319, 77),
      questMon(342, 76),
      questMon(262, 75),
      questMon(367, 75),
      questMon(279, 75),
      questMon(321, 76),
    ],
    money: 15_000,
  }),
  questTrainer({
    id: 'quete-groudon-fumerol',
    questId: 'groudon',
    regionId: 'hoenn',
    zoneId: 'grotte-originelle',
    order: 120,
    name: 'Fumerol',
    trainerClass: 'Admin Magma',
    spriteName: 'magmagrunt',
    team: [
      questMon(323, 77),
      questMon(324, 76),
      questMon(262, 75),
      questMon(330, 76),
      questMon(336, 75),
      questMon(344, 75),
    ],
    money: 15_000,
  }),
  questTrainer({
    id: 'quete-rayquaza-zephyra',
    questId: 'rayquaza',
    regionId: 'hoenn',
    zoneId: 'pilier-celeste',
    order: 121,
    name: 'Zéphyra',
    trainerClass: 'Gardienne du Pilier',
    spriteName: 'acetrainerf',
    team: [
      questMon(373, 79),
      questMon(334, 77),
      questMon(330, 77),
      questMon(350, 76),
      questMon(357, 76),
      questMon(376, 78),
    ],
    money: 20_000,
  }),
  questTrainer({
    id: 'quete-jirachi-stella',
    questId: 'jirachi',
    regionId: 'hoenn',
    zoneId: 'chutes-meteore',
    order: 122,
    name: 'Stella',
    trainerClass: 'Astronome',
    spriteName: 'lass-gen4',
    team: [
      questMon(282, 77),
      questMon(344, 75),
      questMon(337, 75),
      questMon(338, 75),
      questMon(358, 76),
      questMon(376, 78),
    ],
    money: 15_000,
  }),
  questTrainer({
    id: 'quete-deoxys-orion',
    questId: 'deoxys',
    regionId: 'hoenn',
    zoneId: 'ile-aurore',
    order: 123,
    name: 'Orion',
    trainerClass: 'Chercheur spatial',
    spriteName: 'scientist',
    team: [
      questMon(359, 80),
      questMon(302, 79),
      questMon(344, 79),
      questMon(282, 80),
      questMon(373, 81),
      questMon(376, 82),
    ],
    money: 20_000,
  }),
];

// --- Kanto --------------------------------------------------------------------------------------

export const kantoQuests: Quest[] = [
  {
    id: 'electhor',
    order: 0,
    name: 'L’oiseau de foudre',
    description:
      'Depuis quelques nuits, Céladopole est plongée dans le noir. Quelque chose aspire l’électricité de tout Kanto.',
    image: null,
    regionId: 'kanto',
    enabled: true,
    unlock: defeated('maitre-blue'),
    steps: [
      step(
        'Coupures de courant',
        'Réussis une expédition sur les Routes 9 et 10 avec un Pikachu dans l’équipe.',
        expedition('routes-9-10', { speciesIds: [25] }),
        'Les joues de ton Pikachu crépitent dès que vous longez la rivière. Un pêcheur t’indique un bâtiment oublié en amont : la Centrale. Ses portes rouillées viennent de s’ouvrir.',
      ),
      step(
        'Courants vagabonds',
        'Trouve 3 Fragments magnétiques à la Centrale, avec 2 Pokémon Électrik dans l’équipe.',
        find('fragment-magnetique', 3, 'centrale', 4, { memberType: 'electric', memberCount: 2 }),
        'Posés côte à côte, les fragments s’orientent tous vers le toit de la Centrale, comme attirés par un orage qui ne finit jamais.',
      ),
      step(
        'Le saboteur du toit',
        'Sur le toit de la Centrale, un scientifique de la Team Rocket détourne le courant de Kanto vers ses machines : bats Volt (quête).',
        defeated('quete-electhor-volt'),
        '« Mes machines n’y suffiront jamais… Électhor ne descend recharger ses ailes que sous l’orage ! » Volt s’enfuit en abandonnant ses câbles, et les lumières de Céladopole se rallument. Il ne reste plus qu’à attendre la pluie.',
      ),
      step(
        'Plume d’orage',
        'Trouve une Plume Foudre à la Centrale, lors d’une expédition lancée sous la pluie.',
        find('plume-foudre', 1, 'centrale', 6, { weathers: ['rain'] }),
        'La plume grésille entre tes doigts. Un cri strident déchire le ciel au-dessus de la Centrale : Électhor est là, et il n’aime pas les visiteurs.',
      ),
    ],
    rewards: {
      ...BIRD_REWARD,
      pokemon: [legendary(145, 50, 'guardian', { hpMultiplier: 4, statMultiplier: 1.1 })],
    },
  },
  {
    id: 'artikodin',
    order: 1,
    name: 'L’oiseau des glaces',
    description:
      'Les pêcheurs de Cramois’Île jurent avoir vu la mer geler en plein été autour des Îles Écume.',
    image: null,
    regionId: 'kanto',
    enabled: true,
    unlock: defeated('maitre-blue'),
    steps: [
      step(
        'Traversée glacée',
        'Réussis une expédition sur les Routes maritimes avec 2 Pokémon Eau de PE 600 ou plus.',
        expedition('routes-maritimes', {
          memberType: 'water',
          memberCount: 2,
          minMemberPower: 600,
        }),
        'Au large de Parmanie, l’eau se couvre de givre. Tes Pokémon Eau ouvrent un passage jusqu’aux Îles Écume, perdues dans la brume.',
      ),
      step(
        'Givre éternel',
        'Trouve 3 Éclats de givre aux Îles Écume, lors d’expéditions lancées de nuit.',
        find('eclat-de-givre', 3, 'iles-ecume', 4, { timeOfDay: 'night' }),
        'Les éclats ne fondent pas, même au soleil. Un vieux pêcheur murmure qu’ils tombent des ailes d’un oiseau qui ne se montre que par grand froid.',
      ),
      step(
        'La skieuse des glaces',
        'Une skieuse garde l’entrée de la grotte gelée des Îles Écume et repousse les curieux : bats Neige (quête).',
        defeated('quete-artikodin-neige'),
        '« Tu as du cran, pour venir jusqu’ici. » Neige caresse son Lokhlass : « Lui seul retrouve l’oiseau dans le blizzard : son chant porte jusqu’au cœur de la tempête. Capture le tien, et écoute-le. »',
      ),
      step(
        'Le chant de Lokhlass',
        'Capture un Lokhlass aux Îles Écume.',
        catchOf(1, null, 'iles-ecume', 131),
        'Ton Lokhlass entonne un chant mélancolique. Au loin, au cœur du blizzard, quelque chose lui répond.',
      ),
      step(
        'Dans la tempête',
        'Réussis une expédition aux Îles Écume sous la grêle, avec Lokhlass et 2 Pokémon Glace dans l’équipe.',
        expedition('iles-ecume', {
          speciesIds: [131],
          memberType: 'ice',
          memberCount: 2,
          weathers: ['hail'],
        }),
        'Guidé par le chant de Lokhlass, tu atteins le cœur de la tempête. Artikodin déploie ses ailes de cristal et pousse un cri glacial : il te défie.',
      ),
    ],
    rewards: { ...BIRD_REWARD, pokemon: [legendary(144, 50, 'guardian', { hpMultiplier: 4.5 })] },
  },
  {
    id: 'sulfura',
    order: 2,
    name: 'L’oiseau de feu',
    description: 'Le Mont Braise gronde à nouveau. La nuit, une lueur vole au-dessus du cratère.',
    image: null,
    regionId: 'kanto',
    enabled: true,
    unlock: defeated('maitre-blue'),
    steps: [
      step(
        'Lueur dans la nuit',
        'Réussis une expédition au Manoir Pokémon, lancée de nuit, avec 2 Pokémon Feu dans l’équipe.',
        expedition('manoir-pokemon', { memberType: 'fire', memberCount: 2, timeOfDay: 'night' }),
        'Depuis les ruines du Manoir, tu vois une traînée de flammes filer vers le volcan voisin. Le chemin du Mont Braise s’ouvre devant toi.',
      ),
      step(
        'Coulées de lave',
        'Capture 5 Pokémon Feu au Mont Braise.',
        catchOf(5, 'fire', 'mont-braise'),
        'Les Pokémon du volcan sont agités, presque froids : quelque chose, au sommet, leur vole leur chaleur.',
      ),
      step(
        'Le cracheur de feu',
        'Un cracheur de feu s’est installé sur les pentes du Mont Braise et prétend que le volcan lui appartient : bats Pyros (quête).',
        defeated('quete-sulfura-pyros'),
        '« Le volcan n’a jamais été aussi froid… même mes flammes faiblissent. » Pyros lève les yeux vers le cratère : « Les jours de grand soleil, des cendres brûlantes tombent du sommet. Ramasse-les, elles te diront qui vit là-haut. »',
      ),
      step(
        'Cendres ardentes',
        'Trouve 3 Cendres ardentes au Mont Braise, lors d’expéditions lancées sous un grand soleil.',
        find('cendre-ardente', 3, 'mont-braise', 5, { weathers: ['sun'] }),
        'Les cendres brûlent encore des heures plus tard. Ce sont des plumes consumées : Sulfura est en train de muer au sommet.',
      ),
      step(
        'Le sommet du volcan',
        'Réussis une expédition au Mont Braise avec 3 Pokémon Feu de PE 700 ou plus.',
        expedition('mont-braise', { memberType: 'fire', memberCount: 3, minMemberPower: 700 }),
        'Au bord du cratère, une colonne de flammes s’élève et prend la forme d’un oiseau immense. Sulfura t’a repéré.',
      ),
    ],
    rewards: { ...BIRD_REWARD, pokemon: [legendary(146, 50, 'guardian')] },
  },
  {
    id: 'mewtwo',
    order: 3,
    name: 'Le Pokémon génétique',
    description:
      'Dans les décombres du Manoir Pokémon, un journal raconte la création d’une créature aux pouvoirs terrifiants, qui se serait enfuie.',
    image: null,
    regionId: 'kanto',
    enabled: true,
    unlock: defeated('maitre-blue'),
    steps: [
      step(
        'Le journal du Manoir',
        'Trouve 2 Pages du journal au Manoir Pokémon, avec un Pokémon Psy dans l’équipe.',
        find('page-du-journal', 2, 'manoir-pokemon', 4, { memberType: 'psychic', memberCount: 1 }),
        '« 5 février. Mew a donné naissance à un petit. Nous l’avons appelé Mewtwo. » Plus loin : « Il est bien trop puissant. Nous ne pouvons plus le contrôler… » La suite est arrachée.',
      ),
      step(
        'La confiance des légendes',
        'Termine les quêtes d’Artikodin, d’Électhor et de Sulfura, et capture 80 % du Pokédex de Kanto.',
        {
          type: 'allOf',
          conditions: [
            { type: 'questCompleted', questId: 'artikodin' },
            { type: 'questCompleted', questId: 'electhor' },
            { type: 'questCompleted', questId: 'sulfura' },
            { type: 'regionDexPercent', regionId: 'kanto', percent: 80 },
          ],
        },
        'Le Prof. Chen lit les pages, l’air grave : « Seul un dresseur respecté des trois oiseaux pourrait approcher une telle créature. » Le garde de la Grotte Azurée s’écarte sur ton passage.',
      ),
      step(
        'Ondes hostiles',
        'Réussis une expédition dans la Grotte Azurée avec 2 Pokémon Spectre de PE 800 ou plus.',
        expedition('grotte-azuree', { memberType: 'ghost', memberCount: 2, minMemberPower: 800 }),
        'Les parois de la grotte vibrent. Une pression mentale écrasante te fait vaciller ; seuls tes Pokémon Spectre semblent y résister.',
      ),
      step(
        'Le créateur',
        'Au fond de la Grotte Azurée, un ancien chercheur du Manoir Pokémon veut reprendre sa créature : bats Kessler (quête).',
        defeated('quete-mewtwo-kessler'),
        '« Je voulais seulement le ramener… Il ne m’a jamais pardonné. » Kessler te tend un flacon vide : « Mewtwo ne se montre à personne, mais il ne résiste pas à sa propre image. Un Métamorph pourrait la lui renvoyer. »',
      ),
      step(
        'Le reflet',
        'Trouve un Échantillon d’ADN dans la Grotte Azurée, avec un Métamorph dans l’équipe.',
        find('echantillon-adn', 1, 'grotte-azuree', 4, { speciesIds: [132] }),
        'Ton Métamorph se fige, puis prend une forme qu’il n’avait jamais prise : une silhouette mauve à la longue queue. Une voix résonne dans ta tête : « Pourquoi me cherches-tu ? » Mewtwo se dresse devant toi.',
      ),
    ],
    rewards: {
      ...MAJOR_REWARD,
      pokemon: [legendary(150, 70, 'major', { level: 68, statMultiplier: 1.1 })],
    },
  },
  {
    id: 'mew',
    order: 4,
    name: 'Le Pokémon fabuleux',
    description:
      'Mewtwo n’est qu’une copie. Le journal du Manoir parle d’une île des tropiques où l’original aurait été trouvé.',
    image: null,
    regionId: 'kanto',
    enabled: true,
    unlock: completed('mewtwo'),
    steps: [
      step(
        'La page blanche',
        'Fais éclore 500 œufs et capture 95 % du Pokédex de Kanto.',
        {
          type: 'allOf',
          conditions: [
            { type: 'eggsHatched', count: 500 },
            { type: 'regionDexPercent', regionId: 'kanto', percent: 95 },
          ],
        },
        'Le Prof. Chen feuillette ton Pokédex : il n’y manque presque rien… sauf une page, celle d’un Pokémon qu’aucun dresseur n’a jamais enregistré.',
      ),
      step(
        'La carte du vieux marin',
        'Trouve la Vieille carte marine sur les Routes maritimes, avec 2 Pokémon Eau dans l’équipe.',
        find('vieille-carte-marine', 1, 'routes-maritimes', 3, {
          memberType: 'water',
          memberCount: 2,
        }),
        'La carte indique une île au sud de Kanto, absente de toutes les cartes modernes : l’Île Lointaine. Tu embarques aussitôt.',
      ),
      step(
        'Les hautes herbes',
        'Réussis 3 expéditions sur l’Île Lointaine, lancées de jour.',
        expedition('ile-lointaine', { timeOfDay: 'day' }, 3),
        'Une bulle rose flotte au-dessus des herbes et disparaît en riant. Quelque chose joue à cache-cache avec toi.',
      ),
      step(
        'La rivale de l’île',
        'Une exploratrice a suivi la bulle rose jusqu’ici et compte bien la capturer la première : bats Célia (quête) sur l’Île Lointaine.',
        defeated('quete-mew-celia'),
        '« Elle m’a filé entre les doigts trois fois… Elle adore qu’on joue avec elle, pas qu’on la chasse. » Célia rembarque bredouille. La bulle rose, elle, revient flotter près de toi.',
      ),
      step(
        'Jeu de miroirs',
        'Trouve 3 Poils soyeux sur l’Île Lointaine, avec un Métamorph dans l’équipe.',
        find('poil-soyeux', 3, 'ile-lointaine', 3, { speciesIds: [132] }),
        'Ton Métamorph s’amuse à imiter la bulle rose… qui s’arrête, intriguée. Mew se dévoile, ravi d’avoir trouvé un compagnon de jeu — à sa façon.',
      ),
    ],
    rewards: {
      ...reward({ currency: 75_000, items: [{ itemId: 'gold-bottle-cap', quantity: 1 }] }),
      pokemon: [legendary(151, 50, 'mythical')],
    },
  },
  // Oiseaux de Galar : fuyards de fin de partie, venus d'une région lointaine.
  {
    id: 'artikodin-galar',
    order: 5,
    name: 'L’oiseau au regard glacial',
    description:
      'Des dresseurs de Kanto tombent dans une étrange torpeur. Tous disent avoir croisé un oiseau aux ailes violettes.',
    image: null,
    regionId: 'galar',
    enabled: true,
    unlock: completed('artikodin'),
    steps: [
      step(
        'Ondes étranges',
        'Capture 15 Pokémon Psy à Kanto.',
        catchOf(15, 'psychic'),
        'Tes Pokémon Psy captent des ondes qui ne ressemblent à rien de connu à Kanto.',
      ),
      step(
        'Plumes violettes',
        'Trouve 2 Plumes psychiques sur la Route Victoire, avec 2 Pokémon Psy dans l’équipe.',
        find('plume-psychique', 2, 'route-victoire', 4, { memberType: 'psychic', memberCount: 2 }),
        'Les plumes émettent un faible halo violet. Leur propriétaire n’est pas loin, mais il ne tient jamais en place.',
      ),
      step(
        'La médium hypnotisée',
        'Sur la Route Victoire, une médium tombée sous l’emprise de l’oiseau attaque tous ceux qui approchent : bats Sélène (quête).',
        defeated('quete-artikodin-galar-selene'),
        'Sélène vacille, puis rouvre des yeux clairs : « Il m’a plongée dans un rêve… » Elle frissonne : « Il ne chasse que la nuit, et seuls les esprits solides lui résistent. »',
      ),
      step(
        'Sur sa piste',
        'Réussis une expédition sur la Route Victoire, lancée de nuit, avec 2 Pokémon Psy de PE 800 ou plus.',
        expedition('route-victoire', {
          memberType: 'psychic',
          memberCount: 2,
          minMemberPower: 800,
          timeOfDay: 'night',
        }),
        'Il était là, au bout du tunnel. Il t’a fixé de ses yeux rougeoyants, puis s’est envolé. Il rôde désormais au loin : à toi de le traquer.',
      ),
    ],
    rewards: { ...ROAMER_REWARD, pokemon: [roamer(144, 70, 10169)] },
  },
  {
    id: 'electhor-galar',
    order: 6,
    name: 'L’oiseau aux pas de feu',
    description:
      'Des traces de pas fumantes parcourent les routes de Kanto, comme si quelqu’un courait plus vite que l’éclair.',
    image: null,
    regionId: 'galar',
    enabled: true,
    unlock: completed('mewtwo'),
    steps: [
      step(
        'Coups de pied',
        'Capture 15 Pokémon Combat à Kanto.',
        catchOf(15, 'fighting'),
        'Au Dojo Karaté, on ne parle que de ça : un oiseau aurait battu tous les élèves à la course.',
      ),
      step(
        'Plumes martiales',
        'Trouve 2 Plumes martiales au Dojo Karaté, avec 2 Pokémon Combat dans l’équipe.',
        find('plume-martiale', 2, 'dojo-karate', 4, { memberType: 'fighting', memberCount: 2 }),
        'Les plumes sont dures comme l’acier. Le maître du dojo te conseille de lancer son meilleur coureur à sa poursuite.',
      ),
      step(
        'Le meilleur élève',
        'Au Dojo Karaté, le meilleur élève veut rattraper l’oiseau lui-même et refuse de te laisser passer : bats Kenzo (quête).',
        defeated('quete-electhor-galar-kenzo'),
        '« Je ne l’ai jamais rattrapé… ses pas brûlent le sol. » Kenzo s’incline : « Il ne court qu’après les plus rapides. Le Kicklee du dojo, peut-être… »',
      ),
      step(
        'La course',
        'Réussis une expédition au Dojo Karaté avec Kicklee dans l’équipe.',
        expedition('dojo-karate', { speciesIds: [106] }),
        'Kicklee s’élance à sa poursuite sans parvenir à le rattraper. L’oiseau file désormais à travers les terres lointaines.',
      ),
    ],
    rewards: { ...ROAMER_REWARD, pokemon: [roamer(145, 70, 10170)] },
  },
  {
    id: 'sulfura-galar',
    order: 7,
    name: 'L’oiseau aux flammes sombres',
    description:
      'À Lavanville, les Pokémon Spectre s’agitent : une flamme noire tourne autour de la Tour Pokémon.',
    image: null,
    regionId: 'galar',
    enabled: true,
    unlock: completed('mewtwo'),
    steps: [
      step(
        'Rancœur',
        'Capture 12 Pokémon Spectre à Kanto.',
        catchOf(12, 'ghost'),
        'Plus tu captures de Pokémon Spectre, plus la flamme noire semble s’intéresser à toi.',
      ),
      step(
        'Plumes sombres',
        'Trouve 2 Plumes sombres à la Tour Pokémon, lors d’expéditions lancées de nuit.',
        find('plume-sombre', 2, 'tour-pokemon', 4, { timeOfDay: 'night' }),
        'Les plumes sont glacées et pleines de rancœur. Elles tombent toujours au même endroit : le sommet de la tour.',
      ),
      step(
        'L’exorciste de la tour',
        'L’exorciste de la Tour Pokémon veut chasser elle-même la flamme noire de Lavanville et voit en toi une rivale : bats Ambre (quête).',
        defeated('quete-sulfura-galar-ambre'),
        '« Mes prières ne l’atteignent pas… » Ambre soupire : « La flamme noire se nourrit de la rancœur des nuits de pluie. C’est là qu’elle se montrera. »',
      ),
      step(
        'La flamme noire',
        'Réussis une expédition à la Tour Pokémon, lancée de nuit sous la pluie, avec 2 Pokémon Spectre de PE 800 ou plus.',
        expedition('tour-pokemon', {
          memberType: 'ghost',
          memberCount: 2,
          minMemberPower: 800,
          weathers: ['rain'],
          timeOfDay: 'night',
        }),
        'La flamme noire se dresse face à toi, puis s’enfuit dans la nuit. Elle hante désormais des terres lointaines.',
      ),
    ],
    rewards: { ...ROAMER_REWARD, pokemon: [roamer(146, 70, 10171)] },
  },
];

// --- Johto --------------------------------------------------------------------------------------

export const johtoQuests: Quest[] = [
  {
    id: 'raikou',
    order: 0,
    name: 'La bête du tonnerre',
    description:
      'Selon la légende d’Écorcia, trois Pokémon périrent dans l’incendie de la Tour Cendrée, et Ho-Oh les ramena à la vie.',
    image: null,
    regionId: 'johto',
    enabled: true,
    unlock: defeated('maitre-peter'),
    steps: [
      step(
        'Orage d’été',
        'Capture 10 Pokémon Électrik à Johto.',
        catchOf(10, 'electric'),
        'Les Pokémon Électrik de Johto sont nerveux, comme avant un gros orage. Pourtant, le ciel est clair.',
      ),
      step(
        'Là où frappe la foudre',
        'Trouve 2 Éclats de tonnerre sur les Routes 42 à 44, lors d’expéditions lancées sous la pluie.',
        find('eclat-de-tonnerre', 2, 'routes-42-44', 6, { weathers: ['rain'] }),
        'À chaque coup de tonnerre, un rugissement répond au loin. La bête ne s’arrête jamais de courir.',
      ),
      step(
        'Le chasseur de légendes',
        'Un chasseur de légendes a posé ses pièges autour de la Tour Cendrée et ne veut pas de concurrent : bats Kanji (quête).',
        defeated('quete-raikou-kanji'),
        '« Trop lent, encore une fois… » Kanji montre les traces calcinées au pied de la tour : « Il revient toujours là où il est né. Mais pour l’approcher, il te faudra des Pokémon aussi vifs que la foudre. »',
      ),
      step(
        'Le sous-sol de la tour',
        'Réussis une expédition à la Tour Cendrée avec 2 Pokémon Électrik de PE 700 ou plus.',
        expedition('tour-cendree', { memberType: 'electric', memberCount: 2, minMemberPower: 700 }),
        'Dans les ruines de la Tour Cendrée, Raikou se dresse un instant devant toi… puis file comme l’éclair. Il parcourt désormais Johto.',
      ),
    ],
    rewards: { ...ROAMER_REWARD, pokemon: [roamer(243, 50)] },
  },
  {
    id: 'entei',
    order: 1,
    name: 'La bête du volcan',
    description:
      'Chaque fois qu’Entei rugit, dit-on, un volcan entre en éruption quelque part dans le monde.',
    image: null,
    regionId: 'johto',
    enabled: true,
    unlock: defeated('maitre-peter'),
    steps: [
      step(
        'Braises',
        'Capture 10 Pokémon Feu à Johto.',
        catchOf(10, 'fire'),
        'Des feux de broussaille éclatent ici et là, sans raison. Les anciens d’Écorcia parlent de la bête du volcan.',
      ),
      step(
        'Le rugissement',
        'Trouve 2 Braises éternelles à la Tour Cendrée, lors d’expéditions lancées sous un grand soleil.',
        find('braise-eternelle', 2, 'tour-cendree', 6, { weathers: ['sun'] }),
        'Les braises brûlent sans jamais s’éteindre. La terre tremble sous la Tour Cendrée.',
      ),
      step(
        'Le gardien du Mont Creuset',
        'Un montagnard qui vit au pied du Mont Creuset barre la route aux dresseurs trop peu préparés : bats Roc (quête).',
        defeated('quete-entei-roc'),
        '« Pas mal, pour quelqu’un d’en bas. » Roc essuie la suie de son front : « La montagne gronde depuis des jours. Si tu montes, prends des Pokémon Feu : eux seuls supporteront la chaleur du brasier. »',
      ),
      step(
        'Le brasier',
        'Réussis une expédition au Mont Creuset avec 2 Pokémon Feu de PE 700 ou plus.',
        expedition('mont-creuset', { memberType: 'fire', memberCount: 2, minMemberPower: 700 }),
        'Au cœur du Mont Creuset, Entei surgit des flammes, rugit, et disparaît dans un nuage de cendres. Il parcourt désormais Johto.',
      ),
    ],
    rewards: { ...ROAMER_REWARD, pokemon: [roamer(244, 50)] },
  },
  {
    id: 'suicune',
    order: 2,
    name: 'La bête des aurores',
    description:
      'Suicune court sur l’eau et purifie tout ce qu’il touche. On l’a aperçu près du Lac Colère.',
    image: null,
    regionId: 'johto',
    enabled: true,
    unlock: defeated('maitre-peter'),
    steps: [
      step(
        'Eaux troubles',
        'Capture 10 Pokémon Eau à Johto.',
        catchOf(10, 'water'),
        'Les rivières de Johto sont troubles depuis des semaines. Seul le Lac Colère reste d’une pureté étonnante.',
      ),
      step(
        'Eau purifiée',
        'Trouve 2 Eaux purifiées au Lac Colère, lors d’expéditions lancées sous la pluie.',
        find('eau-purifiee', 2, 'lac-colere', 6, { weathers: ['rain'] }),
        'Sous la pluie, l’eau du lac devient limpide comme du cristal. Des traces de pattes courent à sa surface.',
      ),
      step(
        'Le pêcheur du lac',
        'Depuis que l’eau du Lac Colère est redevenue pure, un pêcheur la protège farouchement : bats Ruben (quête).',
        defeated('quete-suicune-ruben'),
        '« Tu n’es pas venu salir le lac, je le vois bien. » Ruben range sa canne : « La bête court sur l’eau les nuits de lune. Viens avec des Pokémon Eau solides : ils sentiront sa trace. »',
      ),
      step(
        'Sur le lac',
        'Réussis une expédition au Lac Colère, lancée de nuit, avec 2 Pokémon Eau de PE 700 ou plus.',
        expedition('lac-colere', {
          memberType: 'water',
          memberCount: 2,
          minMemberPower: 700,
          timeOfDay: 'night',
        }),
        'Sous la lune, Suicune court sur le lac, s’arrête… et te regarde. Puis le vent du nord l’emporte. Il parcourt désormais Johto.',
      ),
    ],
    rewards: { ...ROAMER_REWARD, pokemon: [roamer(245, 50)] },
  },
  {
    id: 'lugia',
    order: 3,
    name: 'Le gardien des mers',
    description:
      'Les tourbillons des Tourb’Îles cacheraient un Pokémon aux ailes d’argent, qui dort au fond de la mer.',
    image: null,
    regionId: 'johto',
    enabled: true,
    unlock: defeated('maitre-peter'),
    steps: [
      step(
        'Les trois bêtes',
        'Termine les quêtes de Raikou, Entei et Suicune.',
        completed('raikou', 'entei', 'suicune'),
        'Les trois bêtes ont croisé ta route. Un vieil homme d’Oliville t’arrête : « Toi, tu as vu les bêtes de Ho-Oh. Alors écoute : le gardien des mers dort aux Tourb’Îles, mais les courants en interdisent l’accès. »',
      ),
      step(
        'La lumière du phare',
        'Trouve la Clochette Océane au Phare d’Oliville, avec Pharamp dans l’équipe.',
        find('clochette-oceane', 1, 'phare-oliville', 4, { speciesIds: [181] }),
        'Pharamp rallume la lanterne ; sur son rebord, une cloche ancienne tinte au rythme des vagues. Au loin, les courants des Tourb’Îles s’apaisent : le passage est ouvert.',
      ),
      step(
        'Une plume argentée',
        'Trouve l’Argentaile aux Tourb’Îles, lors d’une expédition lancée sous la pluie.',
        find('argentaile', 1, 'tourb-iles', 5, { weathers: ['rain'] }),
        'La plume brille comme la lune, même au fond des grottes. La Clochette Océane se met à tinter toute seule.',
      ),
      step(
        'Les pillards des tourbillons',
        'La Team Rocket veut capturer le gardien des mers pendant son sommeil : bats l’Admin Corbin (quête) aux Tourb’Îles.',
        defeated('quete-lugia-corbin'),
        'Corbin bat en retraite en jurant : « Le boss voulait cette cloche pour réveiller la bête une nuit, quand personne ne regarde. » Au fond de la grotte, les tourbillons grondent : à toi de le faire avant eux.',
      ),
      step(
        'Les profondeurs',
        'Réussis une expédition aux Tourb’Îles, lancée de nuit, avec 3 Pokémon de PE 900 ou plus.',
        expedition('tourb-iles', { memberCount: 3, minMemberPower: 900, timeOfDay: 'night' }),
        'La cloche résonne dans toute la grotte. Les eaux s’ouvrent : Lugia s’éveille, et sa colère soulève la mer.',
      ),
    ],
    rewards: { ...MAJOR_REWARD, pokemon: [legendary(249, 70, 'major')] },
  },
  {
    id: 'ho-oh',
    order: 4,
    name: 'L’oiseau arc-en-ciel',
    description:
      'Il y a cent cinquante ans, la foudre frappa la Tour Cendrée et Ho-Oh quitta Johto. Il ne reviendra que pour un dresseur au cœur pur.',
    image: null,
    regionId: 'johto',
    enabled: true,
    unlock: defeated('maitre-peter'),
    steps: [
      step(
        'Les trois bêtes',
        'Termine les quêtes de Raikou, Entei et Suicune.',
        completed('raikou', 'entei', 'suicune'),
        'Les bêtes ressuscitées par Ho-Oh t’ont jugé digne. Les sages d’Écorcia acceptent de te recevoir.',
      ),
      step(
        'Les cendres de la tour',
        'Réussis une expédition à la Tour Cendrée avec 2 Pokémon Feu de PE 700 ou plus.',
        expedition('tour-cendree', { memberType: 'fire', memberCount: 2, minMemberPower: 700 }),
        'Dans les cendres, tu retrouves les cloches brisées de l’ancienne tour. Les sages t’ouvrent alors les portes de la Tour Carillon, où Ho-Oh se posait jadis.',
      ),
      step(
        'Une plume aux sept couleurs',
        'Trouve l’Arcenci’aile à la Tour Carillon, lors d’une expédition lancée sous un grand soleil.',
        find('arcenciaile', 1, 'tour-carillon', 5, { weathers: ['sun'] }),
        'Sous le soleil, la plume s’illumine de sept couleurs. Au sommet de la tour, quelque chose répond à sa lumière.',
      ),
      step(
        'L’épreuve du Grand Sage',
        'Avant de te laisser monter au sommet, le Grand Sage de la Tour Carillon veut éprouver ton cœur : bats Hô (quête).',
        defeated('quete-ho-oh-ho'),
        '« Ton cœur est pur, et tes Pokémon te suivent sans crainte. » Le Grand Sage s’incline : « Ho-Oh se pose sur le toit les jours de soleil. Monte, la tour t’est ouverte. »',
      ),
      step(
        'Le sommet de la tour',
        'Réussis une expédition à la Tour Carillon, lancée de jour, avec 3 Pokémon de PE 900 ou plus.',
        expedition('tour-carillon', { memberCount: 3, minMemberPower: 900, timeOfDay: 'day' }),
        'Un arc-en-ciel se dessine au-dessus de la tour. Ho-Oh se pose sur le toit et t’observe : il veut savoir si ton cœur est aussi pur qu’on le dit.',
      ),
    ],
    rewards: { ...MAJOR_REWARD, pokemon: [legendary(250, 70, 'major')] },
  },
  {
    id: 'celebi',
    order: 5,
    name: 'Le voyageur du temps',
    description:
      'Lugia et Ho-Oh apaisés, le vieux charbonnier du Bois aux Chênes parle d’un petit Pokémon qui protège la forêt… et voyage dans le temps.',
    image: null,
    regionId: 'johto',
    enabled: true,
    unlock: completed('lugia', 'ho-oh'),
    steps: [
      step(
        'Presque complet',
        'Capture 95 % du Pokédex de Johto.',
        { type: 'regionDexPercent', regionId: 'johto', percent: 95 },
        'Le charbonnier hoche la tête : « Tu connais la forêt et ses Pokémon. Alors peut-être qu’il acceptera de se montrer. »',
      ),
      step(
        'La statuette',
        'Trouve la Statuette de l’autel au Bois aux Chênes, lors d’une expédition lancée de nuit avec 2 Pokémon Plante.',
        find('statuette-de-l-autel', 1, 'bois-aux-chenes', 3, {
          memberType: 'grass',
          memberCount: 2,
          timeOfDay: 'night',
        }),
        'La statuette représente un petit Pokémon ailé. Au revers, une inscription : « Rends-moi à l’autel. » Un sentier que tu n’avais jamais vu s’ouvre entre les arbres.',
      ),
      step(
        'La forêt s’éveille',
        'Capture 5 Pokémon Plante à l’Autel du Bois aux Chênes.',
        catchOf(5, 'grass', 'autel-bois-aux-chenes'),
        'La forêt reprend vie autour de l’autel. Des feuilles tournoient sans le moindre vent.',
      ),
      step(
        'Le braconnier',
        'Un braconnier a tendu des filets autour de l’autel pour attraper le protecteur de la forêt : bats Vasco (quête).',
        defeated('quete-celebi-vasco'),
        'Vasco s’enfuit en abandonnant ses filets. Les arbres semblent soupirer de soulagement, et le charbonnier te souffle : « Il ne revient que les jours de pluie, quand la forêt boit. »',
      ),
      step(
        'L’autel',
        'Réussis une expédition à l’Autel du Bois aux Chênes, lancée sous la pluie, avec 3 Pokémon de PE 900 ou plus.',
        expedition('autel-bois-aux-chenes', {
          memberCount: 3,
          minMemberPower: 900,
          weathers: ['rain'],
        }),
        'Sous la pluie, l’autel s’illumine. Une petite silhouette verte apparaît, venue d’une autre époque — et elle n’a pas l’air de vouloir repartir sans t’avoir mis à l’épreuve.',
      ),
    ],
    rewards: {
      ...reward({ currency: 75_000, items: [{ itemId: 'gold-bottle-cap', quantity: 1 }] }),
      pokemon: [legendary(251, 50, 'mythical')],
    },
  },
];

// --- Hoenn --------------------------------------------------------------------------------------

const REGI_REWARD = BIRD_REWARD;
const regis = completed('regirock', 'registeel', 'regice');

export const hoennQuests: Quest[] = [
  {
    id: 'latias',
    order: 0,
    name: 'L’éon au voile rouge',
    description:
      'Des voyageurs parlent d’un Pokémon rouge qui se rend invisible en reflétant la lumière, au-dessus de la mer de Hoenn.',
    image: null,
    regionId: 'hoenn',
    enabled: true,
    unlock: defeated('maitre-marc'),
    steps: [
      step(
        'Ondes psychiques',
        'Capture 10 Pokémon Psy à Hoenn.',
        catchOf(10, 'psychic'),
        'Tes Pokémon Psy perçoivent une présence douce et joueuse, qui t’observe sans se montrer.',
      ),
      step(
        'Un reflet rouge',
        'Trouve 2 Rosées du voile rouge sur les Routes 105 à 108, lors d’expéditions lancées de jour.',
        find('rosee-du-voile-rouge', 2, 'routes-105-108', 4, { timeOfDay: 'day' }),
        'Chaque goutte reflète un éclat rouge. Quelque chose plane au-dessus des vagues, invisible, et semble s’amuser de te voir chercher.',
      ),
      step(
        'La nageuse du large',
        'Une nageuse des Routes 124 à 128 a aperçu le reflet rouge et défie quiconque s’en approche : bats Marina (quête).',
        defeated('quete-latias-marina'),
        '« D’accord, tu nages mieux que moi… » Marina sourit : « Ce reflet adore les Lovdisc, il les suit partout au-dessus des vagues. Emmènes-en un, et il viendra peut-être jouer avec toi. »',
      ),
      step(
        'Au-dessus des vagues',
        'Réussis une expédition sur les Routes 124 à 128 avec Lovdisc dans l’équipe.',
        expedition('routes-124-128', { speciesIds: [370] }),
        'Lovdisc saute hors de l’eau, et un reflet rouge s’arrête net pour le regarder. Latias se dévoile… puis repart d’un battement d’ailes. Elle parcourt désormais Hoenn.',
      ),
    ],
    rewards: { ...ROAMER_REWARD, pokemon: [roamer(380, 50)] },
  },
  {
    id: 'latios',
    order: 1,
    name: 'L’éon au voile bleu',
    description:
      'Un Pokémon bleu fend le ciel de Hoenn plus vite qu’un avion de ligne. Il ne se montre qu’aux cœurs sincères.',
    image: null,
    regionId: 'hoenn',
    enabled: true,
    unlock: defeated('maitre-marc'),
    steps: [
      step(
        'Courants marins',
        'Capture 10 Pokémon Eau à Hoenn.',
        catchOf(10, 'water'),
        'Un capitaine de Poivressel te montre un ticket trouvé dans ses filets, frappé d’un Pokémon bleu aux ailes de jet.',
      ),
      step(
        'Le Ticket Éon',
        'Trouve le Ticket Éon sur les Routes 119 et 120, lors d’une expédition lancée sous la pluie.',
        find('ticket-eon', 1, 'routes-119-120', 5, { weathers: ['rain'] }),
        'Le ticket indique un rendez-vous au-dessus des nuages, là où la pluie tombe sur la forêt.',
      ),
      step(
        'L’ornithologue',
        'Un ornithologue guette le Pokémon bleu depuis des semaines et refuse qu’on lui vole sa découverte : bats Faucon (quête) sur les Routes 119 et 120.',
        defeated('quete-latios-faucon'),
        '« Rien ne vole plus vite que lui… » Faucon referme son carnet : « On dit qu’il répond aux pensées sincères. Des Pokémon Psy pourraient l’appeler, sous la pluie de la forêt. »',
      ),
      step(
        'Sous la pluie',
        'Réussis une expédition sur les Routes 119 et 120 avec 2 Pokémon Psy de PE 700 ou plus.',
        expedition('routes-119-120', {
          memberType: 'psychic',
          memberCount: 2,
          minMemberPower: 700,
        }),
        'Un sifflement fend l’air : Latios passe au ras des arbres, fait demi-tour pour te saluer, et repart plus vite qu’il n’est venu. Il parcourt désormais Hoenn.',
      ),
    ],
    rewards: { ...ROAMER_REWARD, pokemon: [roamer(381, 50)] },
  },
  {
    id: 'regirock',
    order: 2,
    name: 'Le colosse de roche',
    description:
      'Au fond de la mer, des ruines englouties portent des inscriptions en relief : elles parlent de trois géants endormis.',
    image: null,
    regionId: 'hoenn',
    enabled: true,
    unlock: defeated('maitre-marc'),
    steps: [
      step(
        'Les ruines englouties',
        'Réussis une expédition sur les Routes 105 à 108 avec Relicanth et Wailord dans l’équipe.',
        expedition('routes-105-108', { speciesIds: [369, 321] }),
        'Wailord plonge, Relicanth te guide entre les algues : au fond, une salle couverte de points en relief. « Dans le désert dort le géant de roche. »',
      ),
      step(
        'Sous les sables',
        'Réussis une expédition dans le Désert de la Route 111, lancée pendant une tempête de sable, avec 2 Pokémon Sol.',
        expedition('desert-hoenn', { memberType: 'ground', memberCount: 2, weathers: ['sand'] }),
        'La tempête dégage l’entrée de ruines enfouies. Sur le mur, un nouveau message en relief.',
      ),
      step(
        'Le pilleur de ruines',
        'Un archéologue sans scrupules fouille les ruines enfouies et veut garder le géant pour lui : bats Basalte (quête) dans le Désert de la Route 111.',
        defeated('quete-regirock-basalte'),
        '« Ces ruines m’appartiennent… enfin, m’appartenaient. » Basalte désigne une dalle à moitié enterrée : « La tablette est là-dessous, coincée dans la roche. Seuls des Pokémon Combat pourraient l’en arracher. »',
      ),
      step(
        'La tablette',
        'Trouve la Tablette de roche dans le Désert de la Route 111, avec 2 Pokémon Combat dans l’équipe.',
        find('tablette-de-roche', 1, 'desert-hoenn', 4, { memberType: 'fighting', memberCount: 2 }),
        'La tablette vibre dans tes mains. Tu la poses dans l’encoche du mur : les ruines se mettent à trembler.',
      ),
      step(
        'Le réveil',
        'Réussis une expédition dans le Désert de la Route 111 avec 3 Pokémon de PE 800 ou plus.',
        expedition('desert-hoenn', { memberCount: 3, minMemberPower: 800 }),
        'Le mur s’effondre. Dans un grondement de rocaille, Regirock se lève, ses yeux s’allument : il ne laissera personne troubler son sommeil.',
      ),
    ],
    rewards: {
      ...REGI_REWARD,
      pokemon: [legendary(377, 50, 'guardian', { level: 75, hpMultiplier: 6 })],
    },
  },
  {
    id: 'registeel',
    order: 3,
    name: 'Le colosse d’acier',
    description:
      'Près de la Route 120, un tombeau ancien résonne d’un bourdonnement métallique, de jour comme de nuit.',
    image: null,
    regionId: 'hoenn',
    enabled: true,
    unlock: defeated('maitre-marc'),
    steps: [
      step(
        'Métal',
        'Capture 8 Pokémon Acier à Hoenn.',
        catchOf(8, 'steel'),
        'Tes Pokémon Acier vibrent à l’unisson, comme appelés par quelque chose de bien plus lourd qu’eux.',
      ),
      step(
        'La tablette',
        'Trouve la Tablette d’acier sur les Routes 119 et 120, lors d’une expédition lancée sous la pluie avec un Pokémon Acier.',
        find('tablette-d-acier', 1, 'routes-119-120', 5, {
          memberType: 'steel',
          memberCount: 1,
          weathers: ['rain'],
        }),
        'Mouillée par la pluie, la tablette révèle des points en relief : « Le géant d’acier ne s’éveille que la nuit. »',
      ),
      step(
        'La gardienne du tombeau',
        'Une dresseuse veille sur le tombeau ancien de la Route 120 et en interdit l’entrée : bats Ferrine (quête).',
        defeated('quete-registeel-ferrine'),
        '« Le géant d’acier ne craint qu’une chose : la chaleur. » Ferrine s’écarte : « Reviens la nuit avec des Pokémon Feu, et les portes s’ouvriront. »',
      ),
      step(
        'Le tombeau ancien',
        'Réussis une expédition sur les Routes 119 et 120, lancée de nuit, avec 2 Pokémon Feu de PE 800 ou plus.',
        expedition('routes-119-120', {
          memberType: 'fire',
          memberCount: 2,
          minMemberPower: 800,
          timeOfDay: 'night',
        }),
        'Le bourdonnement devient assourdissant. Les portes du tombeau s’ouvrent sur Registeel, dont le corps d’acier luit dans le noir.',
      ),
    ],
    rewards: {
      ...REGI_REWARD,
      pokemon: [legendary(379, 50, 'guardian', { level: 75, hpMultiplier: 6 })],
    },
  },
  {
    id: 'regice',
    order: 4,
    name: 'Le colosse de glace',
    description:
      'Une grotte gelée, au large de Hoenn, renfermerait un géant de glace plus froid que l’hiver lui-même.',
    image: null,
    regionId: 'hoenn',
    enabled: true,
    unlock: defeated('maitre-marc'),
    steps: [
      step(
        'Glace éternelle',
        'Capture 8 Pokémon Glace à Hoenn.',
        catchOf(8, 'ice'),
        'Un plongeur de Pacifiville te parle d’une grotte où la glace ne fond jamais, même en plein été.',
      ),
      step(
        'La tablette',
        'Trouve la Tablette de glace dans la Grotte Tréfonds, lors d’une expédition lancée sous la grêle.',
        find('tablette-de-glace', 1, 'grotte-trefonds', 5, { weathers: ['hail'] }),
        'La tablette est si froide qu’elle te brûle les doigts. Ses points en relief disent : « Le géant de glace attend la tempête. »',
      ),
      step(
        'Le loup de mer',
        'Un vieux loup de mer de Pacifiville connaît l’île du tombeau, mais n’y conduit que ceux qui l’ont battu : bats Borée (quête).',
        defeated('quete-regice-boree'),
        '« Bien joué, moussaillon. » Borée pointe une île minuscule au large : « Le géant n’en sort que pendant la grêle. Et crois-moi, il déteste la chaleur. »',
      ),
      step(
        'Le tombeau de l’île',
        'Réussis une expédition sur les Routes 124 à 128, lancée sous la grêle, avec 2 Pokémon Feu de PE 800 ou plus.',
        expedition('routes-124-128', {
          memberType: 'fire',
          memberCount: 2,
          minMemberPower: 800,
          weathers: ['hail'],
        }),
        'Au cœur de la tempête, le sol se craquelle. Regice se dresse dans un nuage de givre, et l’air gèle autour de toi.',
      ),
    ],
    rewards: {
      ...REGI_REWARD,
      pokemon: [legendary(378, 50, 'guardian', { level: 75, hpMultiplier: 6 })],
    },
  },
  {
    id: 'kyogre',
    order: 5,
    name: 'Le maître des océans',
    description:
      'La Team Aqua chercherait à réveiller le Pokémon qui a créé les mers, endormi sous la Route 128.',
    image: null,
    regionId: 'hoenn',
    enabled: true,
    unlock: defeated('maitre-marc'),
    steps: [
      step(
        'Les trois colosses',
        'Termine les quêtes de Regirock, Registeel et Regice.',
        regis,
        'Les trois colosses éveillés, la mer elle-même semble s’agiter. Au Mont Mémoria, un vieux couple t’attendait.',
      ),
      step(
        'L’Orbe Bleu',
        'Trouve l’Orbe Bleu au Mont Mémoria, avec 2 Pokémon Eau dans l’équipe.',
        find('orbe-bleu', 1, 'mont-memoria', 3, { memberType: 'water', memberCount: 2 }),
        '« La Team Aqua l’a cherché partout. Garde-le loin d’eux. » L’Orbe pulse doucement ; au fond de la Route 128, l’entrée de la Grotte Sous-Marine vient d’apparaître.',
      ),
      step(
        'La grotte noyée',
        'Capture 6 Pokémon Eau dans la Grotte Sous-Marine.',
        catchOf(6, 'water', 'grotte-sous-marine'),
        'Plus tu avances, plus l’eau est noire et froide. L’Orbe Bleu brille de plus en plus fort.',
      ),
      step(
        'L’embuscade de la Team Aqua',
        'La Team Aqua t’a suivi jusqu’au fond de la grotte et réclame l’Orbe Bleu : bats l’Admin Abysse (quête).',
        defeated('quete-kyogre-abysse'),
        'Abysse recule, furieuse : « Garde-le, ton Orbe ! Le chef dit que Kyogre ne s’éveille que sous un déluge… et qu’il ne craint que la foudre. » Elle disparaît dans l’eau noire.',
      ),
      step(
        'Pluies diluviennes',
        'Réussis une expédition dans la Grotte Sous-Marine, lancée sous la pluie, avec 2 Pokémon Électrik de PE 900 ou plus.',
        expedition('grotte-sous-marine', {
          memberType: 'electric',
          memberCount: 2,
          minMemberPower: 900,
          weathers: ['rain'],
        }),
        'L’Orbe Bleu s’embrase de lumière. Kyogre émerge de l’eau noire, et la pluie se fait torrentielle sur tout Hoenn.',
      ),
    ],
    rewards: { ...MAJOR_REWARD, pokemon: [legendary(382, 70, 'major')] },
  },
  {
    id: 'groudon',
    order: 6,
    name: 'Le maître des continents',
    description:
      'La Team Magma voudrait agrandir les terres en réveillant le Pokémon qui a soulevé les continents.',
    image: null,
    regionId: 'hoenn',
    enabled: true,
    unlock: defeated('maitre-marc'),
    steps: [
      step(
        'Les trois colosses',
        'Termine les quêtes de Regirock, Registeel et Regice.',
        regis,
        'Les trois colosses éveillés, la terre gronde sous Hoenn. Au Mont Chimnée, la Team Magma s’agite.',
      ),
      step(
        'L’Orbe Rouge',
        'Trouve l’Orbe Rouge au Mont Chimnée, lors d’une expédition lancée sous un grand soleil avec 2 Pokémon Feu.',
        find('orbe-rouge', 1, 'mont-chimnee', 4, {
          memberType: 'fire',
          memberCount: 2,
          weathers: ['sun'],
        }),
        'Tu arraches l’Orbe Rouge aux mains de la Team Magma. Il brûle dans ton sac ; à Atalanopolis, l’entrée de la Grotte Originelle s’est ouverte.',
      ),
      step(
        'La terre tremble',
        'Capture 6 Pokémon Sol dans la Grotte Originelle.',
        catchOf(6, 'ground', 'grotte-originelle'),
        'La chaleur devient insoutenable. Les Pokémon de la grotte fuient vers la sortie.',
      ),
      step(
        'L’embuscade de la Team Magma',
        'La Team Magma veut reprendre l’Orbe Rouge avant que tu n’atteignes le cœur de la grotte : bats l’Admin Fumerol (quête).',
        defeated('quete-groudon-fumerol'),
        '« Rien ne peut arrêter Groudon ! » Battu, Fumerol s’enfuit vers la sortie en toussant : « Rien… sauf l’eau, peut-être. » Derrière lui, le magma bouillonne de plus belle.',
      ),
      step(
        'Le cœur de la grotte',
        'Réussis une expédition dans la Grotte Originelle avec 2 Pokémon Eau de PE 900 ou plus.',
        expedition('grotte-originelle', {
          memberType: 'water',
          memberCount: 2,
          minMemberPower: 900,
        }),
        'Le magma s’écarte. Groudon ouvre les yeux, et le soleil se met à brûler au-dessus de Hoenn.',
      ),
    ],
    rewards: { ...MAJOR_REWARD, pokemon: [legendary(383, 70, 'major', { level: 75 })] },
  },
  {
    id: 'rayquaza',
    order: 7,
    name: 'Le gardien du ciel',
    description:
      'Kyogre et Groudon se sont calmés, mais leur colère a réveillé le dragon qui vit au-dessus des nuages.',
    image: null,
    regionId: 'hoenn',
    enabled: true,
    unlock: completed('kyogre', 'groudon'),
    steps: [
      step(
        'La légende des Chutes',
        'Réussis une expédition aux Chutes Météore avec 2 Pokémon Dragon.',
        expedition('chutes-meteore', { memberType: 'dragon', memberCount: 2 }),
        'Une ancienne du peuple des Chutes Météore te raconte : « Quand la terre et la mer se battent, le gardien du ciel descend de son pilier pour les séparer. »',
      ),
      step(
        'L’Orbe de Jade',
        'Trouve l’Orbe de Jade sur les Routes 124 à 128, lors d’une expédition lancée sous la grêle.',
        find('orbe-de-jade', 1, 'routes-124-128', 4, { weathers: ['hail'] }),
        'L’Orbe vibre au rythme du vent. À l’horizon, une tour se dresse au-dessus des nuages : le Pilier Céleste.',
      ),
      step(
        'Le savoir des anciens',
        'Capture 80 % du Pokédex de Hoenn.',
        { type: 'regionDexPercent', regionId: 'hoenn', percent: 80 },
        'L’ancienne t’avertit : « Le gardien ne se montre qu’à ceux qui connaissent la terre, la mer et le ciel. Tu es prêt. »',
      ),
      step(
        'Les ailes du pilier',
        'Capture 2 Altaria au Pilier Céleste.',
        catchOf(2, null, 'pilier-celeste', 334),
        'Tes Altaria chantent face au vent. Au sommet du pilier, un grondement leur répond.',
      ),
      step(
        'La gardienne du pilier',
        'La petite-fille de l’ancienne des Chutes Météore garde la dernière volée de marches du Pilier Céleste : bats Zéphyra (quête).',
        defeated('quete-rayquaza-zephyra'),
        '« Grand-mère avait raison à ton sujet. » Zéphyra t’ouvre la dernière porte : « Le gardien du ciel ne craint ni le feu ni la foudre, mais la glace le fait plier. Monte quand la grêle tombera. »',
      ),
      step(
        'Le sommet du pilier',
        'Réussis une expédition au Pilier Céleste, lancée sous la grêle, avec 2 Pokémon Glace de PE 1000 ou plus.',
        expedition('pilier-celeste', {
          memberType: 'ice',
          memberCount: 2,
          minMemberPower: 1000,
          weathers: ['hail'],
        }),
        'L’air se charge d’électricité. Rayquaza fond sur toi depuis la couche d’ozone, en rugissant : personne ne grimpe impunément sur son pilier.',
      ),
    ],
    rewards: {
      ...reward({ currency: 60_000, items: [{ itemId: 'gold-bottle-cap', quantity: 1 }] }),
      pokemon: [legendary(384, 70, 'apex', { hpMultiplier: 4.5, statMultiplier: 1.15 })],
    },
  },
  {
    id: 'jirachi',
    order: 8,
    name: 'L’étoile des vœux',
    description:
      'Une comète ne passe qu’une fois tous les mille ans au-dessus de Hoenn. Celui qui la voit pourrait faire un vœu.',
    image: null,
    regionId: 'hoenn',
    enabled: true,
    unlock: completed('kyogre', 'groudon'),
    steps: [
      step(
        'Presque complet',
        'Capture 95 % du Pokédex de Hoenn.',
        { type: 'regionDexPercent', regionId: 'hoenn', percent: 95 },
        'Ce soir-là, une comète traverse le ciel de Hoenn. Une vieille légende dit qu’elle réveille un Pokémon capable d’exaucer les vœux.',
      ),
      step(
        'Pluie d’étoiles',
        'Trouve 3 Poussières d’étoile dans le Désert de la Route 111, lors d’expéditions lancées de nuit.',
        find('poussiere-d-etoile', 3, 'desert-hoenn', 4, { timeOfDay: 'night' }),
        'La poussière scintille au creux de ta main et dessine une traînée vers les Chutes Météore.',
      ),
      step(
        'Le soleil et la lune',
        'Réussis une expédition aux Chutes Météore, lancée de nuit, avec Séléroc et Solaroc dans l’équipe.',
        expedition('chutes-meteore', { speciesIds: [337, 338], timeOfDay: 'night' }),
        'Séléroc et Solaroc se mettent à briller ensemble. Au cœur des chutes, un cocon de lumière s’ouvre…',
      ),
      step(
        'L’astronome',
        'Une astronome a suivi la comète jusqu’aux Chutes Météore et veut garder le cocon de lumière pour elle : bats Stella (quête).',
        defeated('quete-jirachi-stella'),
        '« Je voulais seulement lui demander de faire revenir la comète… » Stella range sa lunette : « Il lui faut des compagnons forts pour s’éveiller tout à fait. Reste près de lui, et il viendra à toi. »',
      ),
      step(
        'Le vœu',
        'Réussis 3 expéditions aux Chutes Météore avec 3 Pokémon de PE 900 ou plus.',
        expedition('chutes-meteore', { memberCount: 3, minMemberPower: 900 }, 3),
        'Jirachi ouvre les yeux, s’étire et sourit. Il n’a que sept jours d’éveil devant lui : il compte bien jouer — et se battre — avant de se rendormir.',
      ),
    ],
    rewards: {
      ...reward({ currency: 75_000, items: [{ itemId: 'ability-patch', quantity: 1 }] }),
      pokemon: [legendary(385, 50, 'mythical', { hpMultiplier: 4.5, statMultiplier: 1.15 })],
    },
  },
  {
    id: 'deoxys',
    order: 9,
    name: 'Le visiteur de l’espace',
    description: 'Rayquaza a abattu une météorite au-dessus de Hoenn. Quelque chose en est sorti.',
    image: null,
    regionId: 'hoenn',
    enabled: true,
    unlock: completed('rayquaza', 'jirachi'),
    steps: [
      step(
        'La météorite',
        'Trouve un Fragment de météorite aux Chutes Météore, avec 2 Pokémon Psy dans l’équipe.',
        find('fragment-de-meteorite', 1, 'chutes-meteore', 3, {
          memberType: 'psychic',
          memberCount: 2,
        }),
        'Le fragment pulse d’une énergie inconnue. Les scientifiques de la Station Spatiale le relient à des signaux venus d’une île lointaine : l’Île Aurore.',
      ),
      step(
        'Signaux',
        'Capture 3 Pokémon Psy sur l’Île Aurore.',
        catchOf(3, 'psychic', 'ile-aurore'),
        'Les Pokémon Psy de l’île sont désorientés, comme brouillés par une onde venue d’en haut.',
      ),
      step(
        'Cristaux d’aurore',
        'Trouve 3 Cristaux aurore sur l’Île Aurore, lors d’expéditions lancées de nuit.',
        find('cristal-aurore', 3, 'ile-aurore', 4, { timeOfDay: 'night' }),
        'Réunis, les cristaux projettent une aurore au-dessus de l’île. Au sommet, une pyramide de lumière se forme.',
      ),
      step(
        'Le chercheur de la Station',
        'Un chercheur de la Station Spatiale veut ramener l’être venu de l’espace dans son laboratoire : bats Orion (quête) sur l’Île Aurore.',
        defeated('quete-deoxys-orion'),
        '« Ses ondes brouillent tout ce qui pense… mes Pokémon n’ont rien pu faire. » Orion range ses instruments : « Seuls des Pokémon Ténèbres garderaient l’esprit clair face à lui, la nuit, quand l’aurore s’allume. »',
      ),
      step(
        'La pyramide',
        'Réussis une expédition sur l’Île Aurore, lancée de nuit, avec 2 Pokémon Ténèbres de PE 1000 ou plus.',
        expedition('ile-aurore', {
          memberType: 'dark',
          memberCount: 2,
          minMemberPower: 1000,
          timeOfDay: 'night',
        }),
        'La pyramide se brise. Deoxys se matérialise, change de forme sous tes yeux, et attaque sans un bruit.',
      ),
    ],
    rewards: {
      ...reward({ currency: 80_000, items: [{ itemId: 'ability-patch', quantity: 1 }] }),
      pokemon: [legendary(386, 80, 'apex', { level: 75, hpMultiplier: 6 })],
    },
  },
];
