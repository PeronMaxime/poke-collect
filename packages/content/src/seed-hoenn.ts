import type {
  BattleRules,
  Encounter,
  ProgressReward,
  Quest,
  QuestCondition,
  QuestPokemon,
  QuestStep,
  Region,
  Trainer,
  TrainerPokemon,
  UnlockCondition,
  Zone,
} from './schemas';
import {
  DEFAULT_ROAMING_CHANCE,
  defaultLegendaryExpedition,
  defaultTrainerTimeLimitSeconds,
  zoneAffinityTypes,
} from './schemas';
import { ZONE_WEATHER_CHANGE_CHANCE, seedZoneWeathers } from './seed-weather';

/**
 * Hoenn : le parcours des 8 arènes, la Ligue, les zones spéciales et les quêtes légendaires, sur
 * le modèle de Johto (même courbe de PE, de niveaux et de récompenses, pour la même difficulté).
 *
 * - Seules les espèces du Pokédex de Hoenn (252 à 386) y partent en expédition et y combattent :
 *   le joueur choisit un starter de Hoenn en arrivant, puis se refait une équipe. Des Pokémon de
 *   Kanto et de Johto apparaissent aussi dans les zones, pour le Pokédex national.
 * - Parcours principal : chaque badge de Hoenn ouvre de nouvelles zones, de plus en plus exigeantes.
 *   Les Champions se battent à effectif égal, puis le Conseil 4 et le Maître sans restriction.
 * - Zones spéciales : plusieurs conditions à la fois, PE élevée, Pokémon introuvables ailleurs
 *   (starters et Tarsal, Draby, Coquiperl et Relicanth, Morphéo, Terhal).
 * - Quêtes : Latias et Latios (fuyards : pas d'expédition légendaire, ils changent de zone de
 *   Hoenn à chaque heure), Regirock, Registeel, Regice, Kyogre, Groudon, Rayquaza, Jirachi puis
 *   Deoxys.
 *
 * Les 135 espèces sont obtenables : rencontres, évolutions (niveau, bonheur, pierres et objets de
 * la boutique), fossiles (Lilia, Anorith), œufs (Azurill, Okéoké) et quêtes.
 */

const ALL_DURATIONS = [2, 5, 15, 60, 240, 480];
const LONG_DURATIONS = [60, 240, 480];
/** Zones spéciales : pas d'aller-retour rapide. */
const SPECIAL_DURATIONS = [240, 480];

export const hoennRegion: Region = {
  id: 'hoenn',
  order: 2,
  name: 'Hoenn',
  image: null,
  speciesIds: Array.from({ length: 135 }, (_, i) => 252 + i),
  starterSpeciesIds: [252, 255, 258],
  enabled: true,
  unlock: { type: 'regionDexPercent', regionId: 'johto', percent: 50 },
};

const enc = (
  speciesId: number,
  weight: number,
  minLevel: number,
  maxLevel: number,
  formId?: number,
): Encounter => ({
  speciesId,
  ...(formId && { formId }),
  weight,
  minLevel,
  maxLevel,
});

/** Zigzaton de Galar (forme PokéAPI 10174), rare sur la première route. */
const ZIGZAGOON_GALAR = 10174;

/** Badges de Hoenn uniquement (ceux des autres régions ne comptent pas). */
const badges = (count: number): UnlockCondition => ({
  type: 'badgeCount',
  count,
  regionId: 'hoenn',
});
const defeated = (trainerId: string): UnlockCondition => ({ type: 'trainerDefeated', trainerId });
const hoennDex = (percent: number): UnlockCondition => ({
  type: 'regionDexPercent',
  regionId: 'hoenn',
  percent,
});
const allOf = (...conditions: UnlockCondition[]): UnlockCondition => ({
  type: 'allOf',
  conditions: conditions.flatMap((c) => (c.type === 'allOf' ? c.conditions : [c])),
});

/** `weatherTypes` : types de la zone d'où le seed tire ses météos ; affinités calculées. */
const zone = ({
  weatherTypes,
  ...z
}: Omit<
  Zone,
  | 'regionId'
  | 'image'
  | 'enabled'
  | 'requiredTypes'
  | 'durationsMinutes'
  | 'weatherChangeChance'
  | 'weathers'
  | 'specialEncounters'
  | 'affinityTypes'
> &
  Partial<Zone> & { weatherTypes: string[] }): Zone => ({
  regionId: 'hoenn',
  image: null,
  enabled: true,
  requiredTypes: [],
  durationsMinutes: ALL_DURATIONS,
  weatherChangeChance: ZONE_WEATHER_CHANGE_CHANCE,
  weathers: seedZoneWeathers(z.habitat, weatherTypes),
  specialEncounters: [],
  affinityTypes: zoneAffinityTypes(z.encounters),
  ...z,
});

export const hoennZones: Zone[] = [
  // --- Avant le premier badge -------------------------------------------------------------
  zone({
    id: 'route-101',
    order: 0,
    name: 'Routes 101 à 103',
    description:
      'Les herbes folles autour de Bourg-en-Vol et de Rosyères, là où tout commence à Hoenn.',
    habitat: 'grassland',
    minPower: 0,
    weatherTypes: ['normal', 'dark', 'bug'],
    encounters: [
      enc(261, 28, 2, 4),
      enc(263, 28, 2, 4),
      enc(263, 2, 2, 4, ZIGZAGOON_GALAR),
      enc(265, 16, 2, 4),
      enc(270, 10, 3, 5),
      enc(273, 10, 3, 5),
      enc(276, 6, 3, 5),
    ],
    lootTableId: 'butin-route',
    unlock: { type: 'always' },
  }),
  zone({
    id: 'bois-clementi',
    order: 1,
    name: 'Bois Clémenti',
    description:
      'Une forêt humide entre Clémenti-Ville et Mérouville, tapissée de champignons et de cocons.',
    habitat: 'forest',
    minPower: 170,
    weatherTypes: ['bug', 'grass'],
    encounters: [
      enc(265, 24, 3, 6),
      enc(266, 8, 4, 6),
      enc(268, 8, 4, 6),
      enc(285, 20, 3, 6),
      enc(287, 14, 3, 6),
      enc(276, 12, 3, 6),
      enc(263, 14, 3, 6),
    ],
    lootTableId: 'butin-foret',
    unlock: hoennDex(3),
  }),
  zone({
    id: 'route-104',
    order: 2,
    name: 'Route 104',
    description:
      'La côte sableuse au nord de Clémenti-Ville, où les Goélise tournoient au-dessus des pêcheurs.',
    habitat: 'waters-edge',
    minPower: 300,
    weatherTypes: ['water', 'flying', 'normal'],
    encounters: [
      enc(276, 20, 4, 7),
      enc(278, 22, 4, 7),
      enc(263, 12, 4, 7),
      enc(183, 10, 4, 7),
      enc(270, 10, 4, 7),
      enc(283, 8, 4, 7),
      enc(129, 18, 4, 8),
    ],
    lootTableId: 'butin-mer',
    unlock: defeated('scout-arthur'),
  }),
  // --- Badge Rocher ---------------------------------------------------------------------------
  zone({
    id: 'route-116',
    order: 3,
    name: 'Route 116',
    description: 'La route à l’est de Mérouville, qui bute sur un tunnel inachevé.',
    habitat: 'grassland',
    minPower: 450,
    weatherTypes: ['normal', 'bug'],
    encounters: [
      enc(290, 20, 6, 9),
      enc(300, 16, 6, 9),
      enc(293, 14, 6, 9),
      enc(276, 14, 6, 9),
      enc(263, 14, 6, 9),
      enc(261, 14, 6, 9),
      enc(264, 4, 20, 22),
      enc(262, 4, 18, 20),
    ],
    lootTableId: 'butin-route',
    unlock: badges(1),
  }),
  zone({
    id: 'tunnel-merazon',
    order: 4,
    name: 'Tunnel Mérazon',
    description:
      'Un tunnel creusé à la main vers Vergazon. Le vacarme des Chuchmur résonne sur ses parois.',
    habitat: 'cave',
    minPower: 500,
    weatherTypes: ['normal', 'rock', 'ground'],
    encounters: [
      enc(293, 30, 7, 10),
      enc(41, 22, 6, 10),
      enc(74, 22, 6, 10),
      enc(296, 12, 7, 10),
      enc(27, 10, 7, 10),
      enc(294, 4, 20, 22),
    ],
    lootTableId: 'butin-grotte',
    unlock: badges(1),
  }),
  zone({
    id: 'grotte-granite',
    order: 5,
    name: 'Grotte Granite',
    description:
      'Une grotte de l’île de Village Myokara, aux parois couvertes de fresques. Ténéfix et Mysdibule s’y cachent dans le noir.',
    habitat: 'cave',
    minPower: 700,
    weatherTypes: ['rock', 'fighting', 'steel'],
    encounters: [
      enc(296, 20, 8, 12),
      enc(304, 18, 8, 12),
      enc(41, 18, 8, 12),
      enc(74, 12, 8, 12),
      enc(299, 10, 9, 13),
      enc(63, 8, 8, 12),
      enc(302, 5, 10, 13),
      enc(303, 5, 10, 13),
    ],
    lootTableId: 'butin-fouilles-hoenn',
    unlock: defeated('montagnard-bruno'),
  }),
  zone({
    id: 'route-109',
    order: 6,
    name: 'Plage de Poivressel',
    description:
      'La plage de la Route 109, devant le grand port de Poivressel. Les Écrapince y pincent les orteils.',
    habitat: 'waters-edge',
    minPower: 800,
    weatherTypes: ['water', 'flying'],
    encounters: [
      enc(278, 30, 9, 13),
      enc(72, 20, 9, 13),
      enc(341, 14, 9, 13),
      enc(283, 10, 9, 13),
      enc(129, 12, 8, 12),
      enc(118, 10, 9, 13),
      enc(279, 4, 25, 27),
    ],
    lootTableId: 'butin-mer',
    unlock: defeated('montagnard-bruno'),
  }),
  // --- Badge Poing ----------------------------------------------------------------------------
  zone({
    id: 'route-110',
    order: 7,
    name: 'Route 110',
    description:
      'La route qui longe la Piste Cyclable jusqu’à Lavandia. Ça grésille dans les hautes herbes.',
    habitat: 'grassland',
    minPower: 950,
    weatherTypes: ['electric', 'normal', 'poison'],
    encounters: [
      enc(309, 20, 10, 14),
      enc(311, 10, 10, 14),
      enc(312, 10, 10, 14),
      enc(316, 14, 10, 14),
      enc(263, 10, 10, 14),
      enc(261, 10, 10, 14),
      enc(81, 9, 10, 14),
      enc(100, 9, 10, 14),
      enc(264, 4, 20, 22),
      enc(317, 4, 26, 28),
    ],
    lootTableId: 'butin-route',
    unlock: badges(2),
  }),
  zone({
    id: 'routes-117-118',
    order: 8,
    name: 'Routes 117 et 118',
    description:
      'Les prés fleuris autour de la Pension de Hoenn. Muciole et Lumivole y dansent à la nuit tombée.',
    habitat: 'grassland',
    minPower: 1000,
    weatherTypes: ['bug', 'grass', 'water'],
    encounters: [
      enc(313, 12, 12, 16),
      enc(314, 12, 12, 16),
      enc(315, 8, 12, 16),
      enc(183, 10, 12, 16),
      enc(283, 10, 12, 16),
      enc(43, 10, 12, 16),
      enc(273, 8, 12, 16),
      enc(341, 8, 12, 16),
      enc(262, 5, 18, 20),
      enc(264, 5, 20, 22),
      enc(352, 3, 14, 16),
    ],
    lootTableId: 'butin-route',
    unlock: badges(2),
  }),
  zone({
    id: 'chemin-ardent',
    order: 9,
    name: 'Chemin Ardent',
    description:
      'Un passage brûlant creusé sous le Mont Chimnée. Des Chartor y crachent leur fumée noire.',
    habitat: 'cave',
    minPower: 1050,
    weatherTypes: ['fire', 'poison', 'ground'],
    encounters: [
      enc(322, 24, 13, 17),
      enc(324, 12, 13, 17),
      enc(316, 14, 13, 17),
      enc(109, 12, 13, 17),
      enc(88, 8, 13, 17),
      enc(66, 12, 13, 17),
      enc(74, 10, 12, 16),
      enc(317, 4, 26, 28),
    ],
    lootTableId: 'butin-grotte',
    unlock: badges(2),
  }),
  // --- Badge Dynamo ---------------------------------------------------------------------------
  zone({
    id: 'routes-111-113',
    order: 10,
    name: 'Routes 111 à 113',
    description:
      'Les routes qui contournent le Mont Chimnée, sous une pluie de cendres qui recouvre les herbes.',
    habitat: 'grassland',
    minPower: 1650,
    weatherTypes: ['normal', 'ground', 'fire'],
    encounters: [
      enc(327, 14, 16, 20),
      enc(27, 12, 16, 20),
      enc(322, 12, 16, 20),
      enc(333, 10, 16, 20),
      enc(343, 8, 16, 20),
      enc(183, 8, 16, 20),
      enc(74, 10, 16, 20),
      enc(66, 8, 16, 20),
      enc(277, 6, 22, 24),
      enc(28, 4, 22, 24),
    ],
    lootTableId: 'butin-route',
    unlock: badges(3),
  }),
  zone({
    id: 'mont-chimnee',
    order: 11,
    name: 'Mont Chimnée',
    description:
      'Le volcan qui domine Vermilava. Ses pentes escarpées mènent à un cratère encore fumant.',
    habitat: 'mountain',
    minPower: 1725,
    weatherTypes: ['fire', 'psychic', 'fighting'],
    encounters: [
      enc(322, 18, 16, 21),
      enc(325, 16, 16, 21),
      enc(307, 12, 16, 21),
      enc(66, 12, 16, 21),
      enc(74, 12, 16, 21),
      enc(324, 10, 16, 21),
      enc(67, 4, 28, 30),
    ],
    lootTableId: 'butin-grotte',
    unlock: badges(3),
  }),
  zone({
    id: 'routes-114-115',
    order: 12,
    name: 'Routes 114 et 115',
    description:
      'Des prairies coupées de rivières, au nord d’Autéquia. Mangriff et Séviper s’y livrent une guerre sans fin.',
    habitat: 'grassland',
    minPower: 1800,
    weatherTypes: ['normal', 'poison', 'flying'],
    encounters: [
      enc(335, 10, 18, 22),
      enc(336, 10, 18, 22),
      enc(333, 10, 18, 22),
      enc(270, 8, 18, 22),
      enc(271, 6, 20, 24),
      enc(290, 8, 18, 22),
      enc(273, 8, 18, 22),
      enc(274, 5, 20, 24),
      enc(339, 9, 18, 22),
      enc(293, 8, 18, 22),
      enc(129, 6, 15, 25),
    ],
    lootTableId: 'butin-route',
    unlock: badges(3),
  }),
  // --- Badge Chaleur --------------------------------------------------------------------------
  zone({
    id: 'desert-hoenn',
    order: 13,
    name: 'Désert de la Route 111',
    description:
      'Une tempête de sable permanente souffle sur ce désert. On y déterre parfois des fossiles très anciens.',
    habitat: 'rough-terrain',
    minPower: 1950,
    weatherTypes: ['ground', 'grass', 'rock'],
    durationsMinutes: LONG_DURATIONS,
    encounters: [
      enc(328, 18, 22, 28),
      enc(331, 18, 22, 28),
      enc(343, 14, 22, 28),
      enc(27, 12, 22, 28),
      enc(28, 6, 24, 28),
      enc(74, 10, 22, 28),
      enc(332, 4, 32, 34),
      enc(329, 3, 35, 37),
    ],
    lootTableId: 'butin-fouilles-hoenn',
    unlock: badges(4),
  }),
  zone({
    id: 'new-lavandia',
    order: 14,
    name: 'New Lavandia',
    description:
      'Une centrale abandonnée sous la Route 110, où les générateurs n’ont jamais cessé de tourner.',
    habitat: 'urban',
    minPower: 2025,
    weatherTypes: ['electric', 'steel'],
    durationsMinutes: LONG_DURATIONS,
    encounters: [
      enc(81, 22, 22, 28),
      enc(100, 22, 22, 28),
      enc(309, 15, 22, 28),
      enc(311, 8, 22, 28),
      enc(312, 8, 22, 28),
      enc(310, 6, 26, 30),
      enc(82, 5, 30, 32),
      enc(101, 3, 30, 32),
    ],
    lootTableId: 'butin-grotte',
    unlock: badges(4),
  }),
  zone({
    id: 'routes-105-108',
    order: 15,
    name: 'Routes 105 à 108',
    description:
      'La mer au sud de Clémenti-Ville, semée d’îlots jusqu’à Village Myokara. Il faut un Pokémon Eau pour la traverser.',
    habitat: 'sea',
    minPower: 2100,
    requiredTypes: [{ type: 'water', count: 1 }],
    weatherTypes: ['water'],
    durationsMinutes: LONG_DURATIONS,
    encounters: [
      enc(72, 24, 22, 28),
      enc(278, 16, 22, 28),
      enc(320, 14, 22, 28),
      enc(318, 10, 22, 28),
      enc(279, 6, 25, 30),
      enc(73, 4, 28, 32),
      enc(129, 8, 20, 30),
      enc(116, 8, 22, 28),
    ],
    lootTableId: 'butin-mer',
    unlock: badges(4),
  }),
  // --- Badge Balance --------------------------------------------------------------------------
  zone({
    id: 'routes-119-120',
    order: 16,
    name: 'Routes 119 et 120',
    description:
      'Une jungle détrempée où il pleut presque sans arrêt. Un Absol rôderait près de Cimetronelle.',
    habitat: 'forest',
    minPower: 2750,
    weatherTypes: ['grass', 'dark', 'water'],
    durationsMinutes: LONG_DURATIONS,
    encounters: [
      enc(352, 10, 28, 34),
      enc(357, 8, 28, 34),
      enc(283, 10, 28, 34),
      enc(284, 5, 28, 34),
      enc(274, 8, 28, 34),
      enc(43, 8, 28, 34),
      enc(44, 5, 28, 34),
      enc(264, 10, 28, 34),
      enc(318, 8, 28, 34),
      enc(319, 3, 32, 36),
      enc(359, 4, 30, 34),
      enc(349, 3, 20, 30),
    ],
    lootTableId: 'butin-foret',
    unlock: badges(5),
  }),
  // --- Badge Plume ----------------------------------------------------------------------------
  zone({
    id: 'mont-memoria',
    order: 17,
    name: 'Mont Mémoria',
    description:
      'La montagne sacrée où reposent les Pokémon disparus. Des esprits errent entre les tombes, jusqu’au sommet venteux.',
    habitat: 'mountain',
    minPower: 3150,
    weatherTypes: ['ghost', 'psychic'],
    durationsMinutes: LONG_DURATIONS,
    encounters: [
      enc(353, 22, 28, 38),
      enc(355, 22, 28, 38),
      enc(92, 10, 28, 36),
      enc(37, 10, 28, 36),
      enc(358, 6, 30, 36),
      enc(354, 5, 37, 40),
      enc(356, 5, 37, 40),
      enc(93, 4, 32, 38),
    ],
    lootTableId: 'butin-grotte',
    unlock: badges(6),
  }),
  // --- Badge Esprit ---------------------------------------------------------------------------
  zone({
    id: 'grotte-trefonds',
    order: 18,
    name: 'Grotte Tréfonds',
    description:
      'Une grotte au large de Nénucrique que la marée remplit et vide chaque jour. Le fond est couvert de glace.',
    habitat: 'cave',
    minPower: 3350,
    weatherTypes: ['ice', 'water'],
    durationsMinutes: LONG_DURATIONS,
    encounters: [
      enc(361, 22, 32, 38),
      enc(363, 22, 32, 38),
      enc(364, 6, 36, 40),
      enc(362, 3, 42, 44),
      enc(41, 10, 32, 38),
      enc(42, 10, 34, 40),
      enc(72, 8, 32, 38),
      enc(341, 6, 32, 38),
      enc(342, 4, 34, 40),
    ],
    lootTableId: 'butin-grotte',
    unlock: badges(7),
  }),
  // --- Badge Pluie ----------------------------------------------------------------------------
  zone({
    id: 'route-victoire-hoenn',
    order: 19,
    name: 'Route Victoire de Hoenn',
    description:
      'La dernière grotte avant la Ligue d’Éternara. Seuls les dresseurs aux huit badges en ressortent.',
    habitat: 'cave',
    minPower: 3600,
    weatherTypes: ['rock', 'fighting', 'steel'],
    durationsMinutes: LONG_DURATIONS,
    encounters: [
      enc(294, 10, 36, 42),
      enc(295, 4, 40, 44),
      enc(297, 8, 36, 42),
      enc(305, 10, 36, 42),
      enc(306, 3, 42, 44),
      enc(308, 8, 37, 42),
      enc(302, 5, 36, 42),
      enc(303, 5, 36, 42),
      enc(42, 10, 36, 42),
      enc(75, 10, 38, 44),
    ],
    lootTableId: 'butin-fouilles-hoenn',
    unlock: badges(8),
  }),
  zone({
    id: 'routes-124-128',
    order: 20,
    name: 'Routes 124 à 128',
    description:
      'La haute mer autour d’Atalanopolis et d’Algatia. Les dresseurs qui y naviguent sont tous aguerris.',
    habitat: 'waters-edge',
    minPower: 3650,
    weatherTypes: ['water', 'dark', 'ice'],
    durationsMinutes: LONG_DURATIONS,
    encounters: [
      enc(370, 12, 40, 46),
      enc(320, 12, 40, 46),
      enc(321, 4, 40, 46),
      enc(319, 8, 40, 46),
      enc(73, 10, 40, 46),
      enc(279, 8, 40, 46),
      enc(340, 6, 40, 46),
      enc(364, 6, 40, 46),
      enc(117, 6, 40, 46),
      enc(130, 4, 40, 46),
    ],
    lootTableId: 'butin-elite',
    unlock: badges(8),
  }),

  // === Zones spéciales : plusieurs conditions, PE élevée, Pokémon exclusifs (rares) ===========
  zone({
    id: 'labo-seko',
    order: 21,
    name: 'Labo du Prof. Seko',
    description:
      'Le Prof. Seko étudie Arcko, Poussifeu et Gobou sur le terrain, et un Tarsal timide vit près du labo. Il ouvre ses enclos aux dresseurs confirmés.',
    habitat: 'grassland',
    minPower: 1850,
    weatherTypes: ['grass', 'fire', 'water'],
    durationsMinutes: SPECIAL_DURATIONS,
    encounters: [
      enc(261, 22, 14, 18),
      enc(263, 22, 14, 18),
      enc(265, 14, 14, 18),
      enc(276, 14, 14, 18),
      enc(278, 14, 14, 18),
      enc(252, 3, 10, 12),
      enc(255, 3, 10, 12),
      enc(258, 3, 10, 12),
      enc(280, 3, 5, 8),
    ],
    lootTableId: 'butin-foret',
    unlock: allOf(badges(2), hoennDex(20)),
  }),
  zone({
    id: 'chutes-meteore',
    order: 22,
    name: 'Chutes Météore',
    description:
      'Une grotte de cascades, creusée par une pluie de météorites. Il faut un Pokémon Eau pour remonter le courant jusqu’au repaire des Draby.',
    habitat: 'cave',
    minPower: 2025,
    requiredTypes: [{ type: 'water', count: 1 }],
    weatherTypes: ['dragon', 'rock', 'water'],
    durationsMinutes: SPECIAL_DURATIONS,
    encounters: [
      enc(41, 18, 18, 22),
      enc(42, 6, 22, 26),
      enc(337, 10, 18, 22),
      enc(338, 10, 18, 22),
      enc(339, 12, 18, 22),
      enc(340, 4, 30, 32),
      enc(129, 10, 15, 25),
      enc(118, 8, 18, 22),
      enc(371, 3, 20, 22),
    ],
    lootTableId: 'butin-grotte',
    unlock: allOf(badges(3), hoennDex(30)),
  }),
  zone({
    id: 'epave-abandonnee',
    order: 23,
    name: 'Épave Abandonnée',
    description:
      'Un paquebot échoué entre Poivressel et Nénucrique, à moitié englouti. Seules les équipes d’au moins deux Pokémon Eau peuvent explorer ses cales ; un Relicanth s’y montre parfois.',
    habitat: 'sea',
    minPower: 2500,
    requiredTypes: [{ type: 'water', count: 2 }],
    weatherTypes: ['water', 'ghost'],
    durationsMinutes: SPECIAL_DURATIONS,
    encounters: [
      enc(72, 20, 20, 26),
      enc(41, 14, 20, 26),
      enc(278, 10, 20, 26),
      enc(92, 10, 20, 26),
      enc(129, 8, 18, 26),
      enc(341, 10, 20, 26),
      enc(342, 4, 30, 32),
      enc(366, 4, 20, 26),
      enc(369, 3, 24, 28),
    ],
    lootTableId: 'butin-mer',
    unlock: allOf(badges(3), defeated('cycliste-ludo')),
  }),
  zone({
    id: 'parc-safari-hoenn',
    order: 24,
    name: 'Parc Safari de Hoenn',
    description:
      'La réserve au nord de Nénucrique, où vivent des Pokémon venus d’autres régions. Un Morphéo y change d’apparence au gré du temps.',
    habitat: 'grassland',
    minPower: 3250,
    weatherTypes: ['normal', 'psychic', 'ground'],
    durationsMinutes: SPECIAL_DURATIONS,
    encounters: [
      enc(203, 10, 28, 34),
      enc(231, 10, 28, 34),
      enc(177, 10, 28, 34),
      enc(84, 10, 28, 34),
      enc(111, 10, 28, 34),
      enc(43, 8, 28, 34),
      enc(54, 8, 28, 34),
      enc(202, 8, 28, 34),
      enc(25, 6, 28, 34),
      enc(183, 6, 28, 34),
      enc(351, 3, 28, 34),
    ],
    lootTableId: 'butin-fouilles-hoenn',
    unlock: allOf(badges(5), hoennDex(40)),
  }),
  zone({
    id: 'zone-de-combat',
    order: 25,
    name: 'Zone de Combat',
    description:
      'Les installations au large d’Éternara, réservées aux Maîtres. Pierre Rochard, l’ancien Maître, y attendrait un adversaire à sa mesure.',
    habitat: 'urban',
    minPower: 5000,
    weatherTypes: ['steel', 'psychic', 'dragon'],
    durationsMinutes: SPECIAL_DURATIONS,
    encounters: [
      enc(289, 10, 45, 52),
      enc(297, 10, 45, 52),
      enc(306, 8, 45, 52),
      enc(330, 8, 45, 52),
      enc(334, 8, 45, 52),
      enc(365, 8, 45, 52),
      enc(332, 8, 45, 52),
      enc(357, 6, 45, 52),
      enc(359, 6, 45, 52),
      enc(374, 3, 20, 25),
    ],
    lootTableId: 'butin-elite',
    unlock: allOf(defeated('maitre-marc'), hoennDex(60)),
  }),

  // === Zones de quêtes : ouvertes en cours de quête ==============================================
  zone({
    id: 'grotte-sous-marine',
    order: 26,
    name: 'Grotte Sous-Marine',
    description:
      'Une grotte noyée sous la Route 128, qu’on n’atteint qu’en plongée. Le maître des océans y dormirait.',
    habitat: 'sea',
    minPower: 3500,
    requiredTypes: [{ type: 'water', count: 2 }],
    weatherTypes: ['water', 'dark'],
    durationsMinutes: SPECIAL_DURATIONS,
    encounters: [
      enc(72, 18, 38, 44),
      enc(73, 8, 40, 46),
      enc(41, 10, 38, 44),
      enc(42, 6, 40, 46),
      enc(320, 10, 38, 44),
      enc(321, 4, 40, 46),
      enc(319, 6, 40, 46),
      enc(364, 6, 38, 44),
      enc(129, 8, 35, 45),
    ],
    lootTableId: 'butin-mer',
    unlock: { type: 'questStepsDone', questId: 'kyogre', count: 2 },
  }),
  zone({
    id: 'grotte-originelle',
    order: 27,
    name: 'Grotte Originelle',
    description:
      'La grotte sous Atalanopolis, d’où jaillit toute l’énergie de Hoenn. Une chaleur écrasante monte des profondeurs.',
    habitat: 'cave',
    minPower: 4000,
    weatherTypes: ['ground', 'fire', 'rock'],
    durationsMinutes: SPECIAL_DURATIONS,
    encounters: [
      enc(42, 14, 45, 50),
      enc(302, 10, 45, 50),
      enc(303, 10, 45, 50),
      enc(75, 10, 45, 50),
      enc(323, 8, 45, 50),
      enc(324, 8, 45, 50),
      enc(344, 6, 48, 52),
      enc(297, 6, 48, 52),
    ],
    lootTableId: 'butin-elite',
    unlock: { type: 'questStepsDone', questId: 'groudon', count: 2 },
  }),
  zone({
    id: 'pilier-celeste',
    order: 28,
    name: 'Pilier Céleste',
    description:
      'Une tour en ruine qui perce les nuages, sur un îlot au large de Pacifiville. Le gardien du ciel s’y repose.',
    habitat: 'mountain',
    minPower: 4500,
    weatherTypes: ['dragon', 'flying', 'ghost'],
    durationsMinutes: SPECIAL_DURATIONS,
    encounters: [
      enc(302, 10, 46, 52),
      enc(344, 10, 46, 52),
      enc(354, 10, 46, 52),
      enc(356, 10, 46, 52),
      enc(334, 10, 46, 52),
      enc(42, 10, 46, 52),
      enc(75, 8, 46, 52),
      enc(362, 6, 46, 52),
    ],
    lootTableId: 'butin-elite',
    unlock: { type: 'questStepsDone', questId: 'rayquaza', count: 2 },
  }),
  zone({
    id: 'ile-aurore',
    order: 29,
    name: 'Île Aurore',
    description:
      'Une île triangulaire perdue au large de Hoenn, née d’une météorite. Une étrange pyramide s’y dresse.',
    habitat: 'waters-edge',
    minPower: 3650,
    weatherTypes: ['psychic', 'rock'],
    durationsMinutes: SPECIAL_DURATIONS,
    encounters: [
      enc(337, 10, 40, 46),
      enc(338, 10, 40, 46),
      enc(343, 10, 40, 46),
      enc(344, 6, 42, 46),
      enc(325, 10, 40, 46),
      enc(326, 6, 42, 46),
      enc(177, 10, 40, 46),
      enc(178, 6, 42, 46),
      enc(358, 6, 40, 46),
    ],
    lootTableId: 'butin-elite',
    unlock: { type: 'questStepsDone', questId: 'deoxys', count: 2 },
  }),
];

// --- Dresseurs ---------------------------------------------------------------------------------

const mon = (speciesId: number, level: number, iv: number | null = null): TrainerPokemon => ({
  speciesId,
  level,
  iv,
  nature: null,
});
const noRules = (): BattleRules => ({
  teamSize: null,
  maxLevel: null,
  requiredTypes: [],
  forbiddenTypes: [],
  minPower: 0,
});
/** Sprites de dresseurs servis par l'API (`pnpm sprites:download`, source : Pokémon Showdown). */
const sprite = (name: string) => `/api/sprites/trainers/${name}.png`;

/** Dresseur de route : répétable, rapporte de l'argent et du butin. */
const trainer = (
  t: Pick<Trainer, 'id' | 'zoneId' | 'order' | 'name' | 'trainerClass' | 'team' | 'unlock'> &
    Partial<Trainer> & { spriteName: string },
): Trainer => {
  const { spriteName, ...rest } = t;
  return {
    regionId: 'hoenn',
    sprite: sprite(spriteName),
    timeLimitSeconds: defaultTrainerTimeLimitSeconds(rest.team.length),
    rules: noRules(),
    money: 0,
    lootTableId: 'butin-route',
    lootRolls: 1,
    badge: null,
    repeatable: true,
    cooldownMinutes: null,
    enabled: true,
    ...rest,
  };
};

/**
 * Champion d'arène : unique, combat à effectif égal (autant de Pokémon que lui), badge.
 */
const gymLeader = (
  id: string,
  order: number,
  name: string,
  trainerClass: string,
  spriteName: string,
  badge: string,
  team: TrainerPokemon[],
  unlock: UnlockCondition,
  extra: Partial<Trainer>,
): Trainer => {
  return trainer({
    id,
    zoneId: null,
    order,
    name,
    trainerClass,
    spriteName,
    team,
    unlock,
    rules: { ...noRules(), teamSize: team.length },
    money: Math.max(...team.map((m) => m.level)) * 150,
    lootTableId: 'butin-grotte',
    lootRolls: 3,
    badge: { name: badge, image: null },
    repeatable: false,
    ...extra,
  });
};

const GYM = 'Champion d’arène';
const GYM_F = 'Championne d’arène';

export const hoennTrainers: Trainer[] = [
  // Avant le Badge Rocher
  trainer({
    id: 'gamin-calvin',
    zoneId: 'route-101',
    order: 0,
    name: 'Calvin',
    trainerClass: 'Gamin',
    spriteName: 'youngster-gen3',
    team: [mon(263, 5), mon(261, 5)],
    money: 120,
    unlock: { type: 'always' },
  }),
  trainer({
    id: 'scout-arthur',
    zoneId: 'bois-clementi',
    order: 1,
    name: 'Arthur',
    trainerClass: 'Scout',
    spriteName: 'bugcatcher-gen3',
    team: [mon(265, 6), mon(285, 6), mon(266, 7)],
    money: 225,
    lootTableId: 'butin-foret',
    unlock: hoennDex(3),
  }),
  trainer({
    id: 'sbire-aqua-clementi',
    zoneId: 'route-104',
    order: 2,
    name: 'Sbire',
    trainerClass: 'Team Aqua',
    spriteName: 'aquagrunt',
    team: [mon(261, 8), mon(278, 8), mon(318, 11)],
    money: 300,
    lootTableId: 'butin-mer',
    lootRolls: 2,
    unlock: defeated('scout-arthur'),
  }),
  gymLeader(
    'roxanne',
    3,
    'Roxanne',
    GYM_F,
    'roxanne',
    'Badge Rocher',
    [mon(74, 12), mon(299, 16)],
    defeated('sbire-aqua-clementi'),
    { money: 2250 },
  ),
  // Badge Rocher → Badge Poing
  trainer({
    id: 'campeur-jose',
    zoneId: 'route-116',
    order: 4,
    name: 'José',
    trainerClass: 'Campeur',
    spriteName: 'camper-gen3',
    team: [mon(276, 12), mon(300, 14), mon(290, 13)],
    money: 450,
    lootRolls: 2,
    unlock: badges(1),
  }),
  trainer({
    id: 'montagnard-bruno',
    zoneId: 'tunnel-merazon',
    order: 5,
    name: 'Bruno',
    trainerClass: 'Montagnard',
    spriteName: 'hiker-gen3',
    team: [mon(74, 14), mon(293, 14), mon(296, 15)],
    money: 540,
    lootTableId: 'butin-grotte',
    lootRolls: 2,
    unlock: defeated('campeur-jose'),
  }),
  trainer({
    id: 'sbire-magma-poivressel',
    zoneId: 'route-109',
    order: 6,
    name: 'Sbire',
    trainerClass: 'Team Magma',
    spriteName: 'magmagrunt',
    team: [mon(261, 15), mon(322, 16), mon(41, 17)],
    money: 675,
    lootTableId: 'butin-mer',
    lootRolls: 2,
    unlock: defeated('montagnard-bruno'),
  }),
  gymLeader(
    'bastien',
    7,
    'Bastien',
    GYM,
    'brawly',
    'Badge Poing',
    [mon(66, 18), mon(307, 18), mon(296, 20)],
    defeated('sbire-magma-poivressel'),
    { money: 2700 },
  ),
  // Badge Poing → Badge Dynamo
  trainer({
    id: 'cycliste-ludo',
    zoneId: 'route-110',
    order: 8,
    name: 'Ludo',
    trainerClass: 'Cycliste',
    spriteName: 'cyclist',
    team: [mon(309, 19), mon(316, 20), mon(264, 20)],
    money: 750,
    lootRolls: 2,
    unlock: badges(2),
  }),
  trainer({
    id: 'pique-niqueuse-lina',
    zoneId: 'routes-117-118',
    order: 9,
    name: 'Lina',
    trainerClass: 'Pique-niqueuse',
    spriteName: 'picnicker-gen3',
    team: [mon(313, 20), mon(314, 20), mon(315, 21)],
    money: 825,
    lootRolls: 2,
    unlock: defeated('cycliste-ludo'),
  }),
  gymLeader(
    'voltere',
    10,
    'Voltère',
    GYM,
    'wattson',
    'Badge Dynamo',
    [mon(100, 23), mon(309, 24), mon(82, 27)],
    defeated('pique-niqueuse-lina'),
    { money: 3600 },
  ),
  // Badge Dynamo → Badge Chaleur
  trainer({
    id: 'sbire-magma-chimnee',
    zoneId: 'mont-chimnee',
    order: 11,
    name: 'Sbire',
    trainerClass: 'Team Magma',
    spriteName: 'magmagruntf',
    team: [mon(322, 24), mon(88, 24), mon(262, 26), mon(324, 26)],
    money: 1350,
    lootTableId: 'butin-grotte',
    lootRolls: 2,
    unlock: badges(3),
  }),
  gymLeader(
    'adriane',
    12,
    'Adriane',
    GYM_F,
    'flannery',
    'Badge Chaleur',
    [mon(322, 27), mon(218, 27), mon(322, 29), mon(324, 31)],
    defeated('sbire-magma-chimnee'),
    { money: 4050 },
  ),
  // Badge Chaleur → Badge Balance
  trainer({
    id: 'nageuse-maeva',
    zoneId: 'routes-105-108',
    order: 13,
    name: 'Maëva',
    trainerClass: 'Nageuse',
    spriteName: 'swimmerf-gen3',
    team: [mon(72, 31), mon(278, 31), mon(320, 32), mon(318, 33)],
    money: 1950,
    lootTableId: 'butin-mer',
    lootRolls: 2,
    unlock: badges(4),
  }),
  gymLeader(
    'norman',
    14,
    'Norman',
    GYM,
    'norman',
    'Badge Balance',
    [mon(327, 35), mon(288, 35), mon(264, 37), mon(289, 39)],
    defeated('nageuse-maeva'),
    { money: 5100 },
  ),
  // Badge Balance → Badge Plume
  trainer({
    id: 'ornithologue-elie',
    zoneId: 'routes-119-120',
    order: 15,
    name: 'Élie',
    trainerClass: 'Ornithologue',
    spriteName: 'birdkeeper-gen3',
    team: [mon(277, 36), mon(333, 36), mon(357, 37), mon(279, 38)],
    money: 2400,
    lootTableId: 'butin-foret',
    lootRolls: 2,
    unlock: badges(5),
  }),
  gymLeader(
    'alizee',
    16,
    'Alizée',
    GYM_F,
    'winona',
    'Badge Plume',
    [mon(277, 40, 18), mon(279, 41, 18), mon(357, 41, 18), mon(334, 45, 18)],
    defeated('ornithologue-elie'),
    { money: 5850 },
  ),
  // Badge Plume → Badge Esprit
  trainer({
    id: 'sbire-aqua-memoria',
    zoneId: 'mont-memoria',
    order: 17,
    name: 'Sbire',
    trainerClass: 'Team Aqua',
    spriteName: 'aquagruntf',
    team: [mon(319, 40), mon(42, 40), mon(262, 41), mon(73, 41)],
    money: 2700,
    lootTableId: 'butin-grotte',
    lootRolls: 2,
    unlock: badges(6),
  }),
  gymLeader(
    'levy-tatia',
    18,
    'Lévy et Tatia',
    'Champions d’arène',
    'tateandliza-gen3',
    'Badge Esprit',
    [mon(337, 43, 20), mon(338, 44, 20), mon(344, 44, 20), mon(178, 45, 20), mon(326, 47, 20)],
    defeated('sbire-aqua-memoria'),
    { money: 6000 },
  ),
  // Badge Esprit → Badge Pluie
  trainer({
    id: 'pecheur-tomas',
    zoneId: 'grotte-trefonds',
    order: 19,
    name: 'Tomas',
    trainerClass: 'Pêcheur',
    spriteName: 'fisherman-gen3',
    team: [mon(361, 43), mon(363, 43), mon(341, 44), mon(319, 45), mon(364, 45)],
    money: 3300,
    lootTableId: 'butin-mer',
    lootRolls: 2,
    unlock: badges(7),
  }),
  gymLeader(
    'juan',
    20,
    'Juan',
    GYM,
    'juan',
    'Badge Pluie',
    [mon(370, 48, 25), mon(340, 48, 25), mon(364, 48, 25), mon(342, 49, 25), mon(230, 52, 25)],
    defeated('pecheur-tomas'),
    { money: 6600, lootTableId: 'butin-elite' },
  ),
  // Route Victoire, puis la Ligue
  trainer({
    id: 'topdresseuse-vanessa',
    zoneId: 'route-victoire-hoenn',
    order: 21,
    name: 'Vanessa',
    trainerClass: 'Topdresseuse',
    spriteName: 'acetrainerf-gen3',
    team: [
      mon(282, 52, 20),
      mon(295, 52, 20),
      mon(297, 51, 20),
      mon(306, 52, 20),
      mon(308, 51, 20),
    ],
    money: 5250,
    lootTableId: 'butin-elite',
    lootRolls: 2,
    unlock: badges(8),
  }),
  ...league(),
  trainer({
    id: 'pierre-rochard',
    zoneId: 'zone-de-combat',
    order: 27,
    name: 'Pierre Rochard',
    trainerClass: 'Ancien Maître',
    spriteName: 'steven',
    team: [
      mon(227, 87, 31),
      mon(344, 83, 31),
      mon(346, 85, 31),
      mon(348, 87, 31),
      mon(306, 87, 31),
      mon(376, 91, 31),
    ],
    money: 45_000,
    lootTableId: 'butin-elite',
    lootRolls: 6,
    repeatable: false,
    unlock: defeated('maitre-marc'),
  }),
];

/** Conseil 4 puis Maître de la Ligue : uniques, à affronter dans l'ordre, IV élevés. */
function league(): Trainer[] {
  const member = (
    id: string,
    order: number,
    name: string,
    spriteName: string,
    team: TrainerPokemon[],
    unlock: UnlockCondition,
    extra: Partial<Trainer> = {},
  ): Trainer =>
    trainer({
      id,
      zoneId: null,
      order,
      name,
      trainerClass: 'Conseil 4',
      spriteName,
      team,
      unlock,
      money: 10_500,
      lootTableId: 'butin-elite',
      lootRolls: 3,
      repeatable: false,
      ...extra,
    });
  return [
    member(
      'damien',
      22,
      'Damien',
      'sidney',
      [mon(262, 60, 25), mon(275, 61, 25), mon(332, 61, 25), mon(342, 61, 25), mon(359, 63, 25)],
      allOf(badges(8), defeated('topdresseuse-vanessa')),
    ),
    member(
      'spectra',
      23,
      'Spectra',
      'phoebe-gen3',
      [mon(356, 61, 25), mon(354, 62, 25), mon(302, 64, 25), mon(354, 63, 25), mon(356, 65, 25)],
      defeated('damien'),
    ),
    member(
      'glacia',
      24,
      'Glacia',
      'glacia',
      [mon(362, 63, 25), mon(364, 63, 25), mon(362, 63, 25), mon(364, 64, 25), mon(365, 67, 25)],
      defeated('spectra'),
    ),
    member(
      'aragon',
      25,
      'Aragon',
      'drake-gen3',
      [mon(372, 64, 25), mon(330, 64, 25), mon(334, 66, 25), mon(230, 67, 25), mon(373, 69, 25)],
      defeated('glacia'),
    ),
    member(
      'maitre-marc',
      26,
      'Marc',
      'wallace',
      [
        mon(321, 70, 31),
        mon(73, 72, 31),
        mon(272, 72, 31),
        mon(340, 71, 31),
        mon(130, 71, 31),
        mon(350, 75, 31),
      ],
      defeated('aragon'),
      { trainerClass: 'Maître de la Ligue', money: 27_000, lootRolls: 5 },
    ),
  ];
}

// --- Quêtes légendaires --------------------------------------------------------------------------

const reward = (r: Partial<ProgressReward>): ProgressReward => ({
  currency: 0,
  items: [],
  expeditionSlots: 0,
  daycareSlots: 0,
  incubators: 0,
  bonuses: [],
  ...r,
});
/** Légendaire offert : 3 IV parfaits ; expédition légendaire de PE minimale `minPower`. */
const legendary = (speciesId: number, level: number, minPower: number): QuestPokemon => ({
  speciesId,
  level,
  perfectIvs: 3,
  expedition: defaultLegendaryExpedition(speciesId, null, minPower),
  roaming: null,
});
/** Fuyard : il change de zone de Hoenn à chaque heure au lieu d'une expédition légendaire. */
const roamer = (speciesId: number, level: number): QuestPokemon => ({
  ...legendary(speciesId, level, 0),
  roaming: DEFAULT_ROAMING_CHANCE,
});
const step = (name: string, description: string, condition: QuestCondition): QuestStep => ({
  name,
  description,
  condition,
});
const catchOf = (
  count: number,
  pokemonType: string | null,
  zoneId: string | null = null,
): QuestCondition => ({
  type: 'catchPokemon',
  count,
  pokemonType,
  speciesId: null,
  zoneId,
});
/** Expédition réussie dans une zone, avec des Pokémon d'un type et d'une PE donnés. */
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
const quest = (q: Omit<Quest, 'image' | 'regionId' | 'enabled'>): Quest => ({
  image: null,
  regionId: 'hoenn',
  enabled: true,
  ...q,
});
const EON_REWARD = reward({ currency: 15_000, items: [{ itemId: 'bottle-cap', quantity: 1 }] });
const REGI_REWARD = reward({ currency: 10_000, items: [{ itemId: 'bottle-cap', quantity: 1 }] });

/**
 * Quêtes des légendaires de Hoenn : les deux éons (fuyards), les trois colosses, les maîtres de la
 * mer et de la terre, le gardien du ciel, puis Jirachi et Deoxys.
 */
export const hoennQuests: Quest[] = [
  quest({
    id: 'latias',
    order: 0,
    name: 'L’éon au voile rouge',
    description: 'Un oiseau rouge aux reflets de verre aurait été aperçu au-dessus de la mer.',
    unlock: defeated('maitre-marc'),
    steps: [
      step('Ondes psychiques', 'Capture 50 Pokémon Psy.', catchOf(50, 'psychic')),
      step(
        'Au-dessus des vagues',
        'Réussis une expédition sur les Routes 105 à 108 avec 2 Pokémon Psy de PE 600 ou plus.',
        questExpedition('routes-105-108', 'psychic', 2, 600),
      ),
    ],
    rewards: { ...EON_REWARD, pokemon: [roamer(380, 50)] },
  }),
  quest({
    id: 'latios',
    order: 1,
    name: 'L’éon au voile bleu',
    description: 'Un oiseau bleu fend le ciel de Hoenn plus vite qu’un avion de ligne.',
    unlock: defeated('maitre-marc'),
    steps: [
      step('Courants marins', 'Capture 50 Pokémon Eau.', catchOf(50, 'water')),
      step(
        'Sous la pluie',
        'Réussis une expédition sur les Routes 119 et 120 avec 2 Pokémon Psy de PE 600 ou plus.',
        questExpedition('routes-119-120', 'psychic', 2, 600),
      ),
    ],
    rewards: { ...EON_REWARD, pokemon: [roamer(381, 50)] },
  }),
  quest({
    id: 'regirock',
    order: 2,
    name: 'Le colosse de roche',
    description: 'Des inscriptions en braille, sous le désert, parlent d’un géant fait de pierres.',
    unlock: defeated('maitre-marc'),
    steps: [
      step('Roches anciennes', 'Capture 50 Pokémon Roche.', catchOf(50, 'rock')),
      step(
        'Éboulements',
        'Capture 75 Pokémon Roche au Désert de la Route 111.',
        catchOf(75, 'rock', 'desert-hoenn'),
      ),
      step(
        'Le tombeau du désert',
        'Réussis une expédition au Désert de la Route 111 avec 2 Pokémon Roche de PE 600 ou plus.',
        questExpedition('desert-hoenn', 'rock', 2, 600),
      ),
    ],
    rewards: { ...REGI_REWARD, pokemon: [legendary(377, 50, 3000)] },
  }),
  quest({
    id: 'registeel',
    order: 3,
    name: 'Le colosse d’acier',
    description: 'Un tombeau caché près de Cimetronelle abriterait un géant au corps de métal.',
    unlock: defeated('maitre-marc'),
    steps: [
      step('Métal', 'Capture 50 Pokémon Acier.', catchOf(50, 'steel')),
      step(
        'Champ magnétique',
        'Capture 75 Pokémon Acier à New Lavandia.',
        catchOf(75, 'steel', 'new-lavandia'),
      ),
      step(
        'Le tombeau de la forêt',
        'Réussis une expédition à New Lavandia avec 2 Pokémon Acier de PE 600 ou plus.',
        questExpedition('new-lavandia', 'steel', 2, 600),
      ),
    ],
    rewards: { ...REGI_REWARD, pokemon: [legendary(379, 50, 3000)] },
  }),
  quest({
    id: 'regice',
    order: 4,
    name: 'Le colosse de glace',
    description: 'Un tombeau gelé sur une île de la Route 105 renfermerait un géant de glace.',
    unlock: defeated('maitre-marc'),
    steps: [
      step('Glace éternelle', 'Capture 50 Pokémon Glace.', catchOf(50, 'ice')),
      step(
        'Le froid des profondeurs',
        'Capture 75 Pokémon Glace à la Grotte Tréfonds.',
        catchOf(75, 'ice', 'grotte-trefonds'),
      ),
      step(
        'Le tombeau de l’île',
        'Réussis une expédition à la Grotte Tréfonds avec 2 Pokémon Glace de PE 600 ou plus.',
        questExpedition('grotte-trefonds', 'ice', 2, 600),
      ),
    ],
    rewards: { ...REGI_REWARD, pokemon: [legendary(378, 50, 3000)] },
  }),
  quest({
    id: 'kyogre',
    order: 5,
    name: 'Le maître des océans',
    description:
      'La Team Aqua chercherait à réveiller le Pokémon qui a créé les mers, endormi sous la Route 128.',
    unlock: defeated('maitre-marc'),
    steps: [
      step(
        'Les trois colosses',
        'Termine les quêtes de Regirock, de Registeel et de Regice.',
        allOf(
          { type: 'questCompleted', questId: 'regirock' },
          { type: 'questCompleted', questId: 'registeel' },
          { type: 'questCompleted', questId: 'regice' },
        ),
      ),
      step('Plongée', 'Capture 30 Pokémon Eau pour atteindre la grotte.', catchOf(30, 'water')),
      step('Les ténèbres', 'Capture 30 Pokémon Ténèbres.', catchOf(30, 'dark')),
      step(
        'La grotte noyée',
        'Réussis une expédition à la Grotte Sous-Marine avec 2 Pokémon Eau de PE 600 ou plus.',
        questExpedition('grotte-sous-marine', 'water', 2, 600),
      ),
    ],
    rewards: {
      ...reward({ currency: 50_000, items: [{ itemId: 'gold-bottle-cap', quantity: 1 }] }),
      pokemon: [legendary(382, 70, 4500)],
    },
  }),
  quest({
    id: 'groudon',
    order: 6,
    name: 'Le maître des continents',
    description:
      'La Team Magma voudrait agrandir les terres en réveillant le Pokémon qui a soulevé les continents.',
    unlock: defeated('maitre-marc'),
    steps: [
      step(
        'Les trois colosses',
        'Termine les quêtes de Regirock, de Registeel et de Regice.',
        allOf(
          { type: 'questCompleted', questId: 'regirock' },
          { type: 'questCompleted', questId: 'registeel' },
          { type: 'questCompleted', questId: 'regice' },
        ),
      ),
      step('La terre tremble', 'Capture 30 Pokémon Sol.', catchOf(30, 'ground')),
      step('Le magma', 'Capture 30 Pokémon Feu.', catchOf(30, 'fire')),
      step(
        'Le cœur de la grotte',
        'Réussis une expédition à la Grotte Originelle avec 3 Pokémon Sol de PE 600 ou plus.',
        questExpedition('grotte-originelle', 'ground', 3, 600),
      ),
    ],
    rewards: {
      ...reward({ currency: 50_000, items: [{ itemId: 'gold-bottle-cap', quantity: 1 }] }),
      pokemon: [legendary(383, 70, 4500)],
    },
  }),
  quest({
    id: 'rayquaza',
    order: 7,
    name: 'Le gardien du ciel',
    description:
      'Kyogre et Groudon se sont calmés, mais leur colère a réveillé le dragon qui vit au-dessus des nuages.',
    unlock: allOf(
      { type: 'questCompleted', questId: 'kyogre' },
      { type: 'questCompleted', questId: 'groudon' },
    ),
    steps: [
      step('Dragons', 'Capture 15 Pokémon Dragon.', catchOf(15, 'dragon')),
      step('Chercheur', 'Capture 80 % du Pokédex de Hoenn.', hoennDex(80)),
      step('Le ciel', 'Capture 20 Pokémon Vol.', catchOf(20, 'flying')),
      step(
        'Le sommet du pilier',
        'Réussis une expédition au Pilier Céleste avec 3 Pokémon Dragon de PE 800 ou plus.',
        questExpedition('pilier-celeste', 'dragon', 3, 800),
      ),
    ],
    rewards: {
      ...reward({ currency: 60_000, items: [{ itemId: 'gold-bottle-cap', quantity: 1 }] }),
      pokemon: [legendary(384, 70, 4500)],
    },
  }),
  quest({
    id: 'jirachi',
    order: 8,
    name: 'L’étoile des vœux',
    description:
      'Une comète ne passe qu’une fois tous les mille ans au-dessus de Hoenn. Celui qui la voit pourrait faire un vœu.',
    unlock: allOf(
      { type: 'questCompleted', questId: 'kyogre' },
      { type: 'questCompleted', questId: 'groudon' },
    ),
    steps: [
      step('Presque complet', 'Capture 95 % du Pokédex de Hoenn.', hoennDex(95)),
      step('Étoiles d’acier', 'Capture 50 Pokémon Acier.', catchOf(50, 'steel')),
      step(
        'La pluie d’étoiles',
        'Réussis 3 expéditions aux Chutes Météore avec 3 Pokémon de PE 800 ou plus.',
        questExpedition('chutes-meteore', null, 3, 800, 3),
      ),
    ],
    rewards: {
      ...reward({ currency: 75_000, items: [{ itemId: 'gold-bottle-cap', quantity: 1 }] }),
      pokemon: [legendary(385, 50, 4500)],
    },
  }),
  quest({
    id: 'deoxys',
    order: 9,
    name: 'Le visiteur de l’espace',
    description:
      'Rayquaza a abattu une météorite au-dessus de l’Île Aurore. Quelque chose en est sorti.',
    unlock: allOf(
      { type: 'questCompleted', questId: 'rayquaza' },
      { type: 'questCompleted', questId: 'jirachi' },
    ),
    steps: [
      step('Générations', 'Fais éclore 40 œufs.', { type: 'eggsHatched', count: 40 }),
      step('Presque complet', 'Capture 95 % du Pokédex de Hoenn.', hoennDex(95)),
      step('Signaux', 'Capture 30 Pokémon Psy.', catchOf(30, 'psychic')),
      step(
        'La pyramide',
        'Réussis 3 expéditions à l’Île Aurore.',
        questExpedition('ile-aurore', null, 0, 0, 3),
      ),
    ],
    rewards: {
      ...reward({ items: [{ itemId: 'ability-patch', quantity: 1 }] }),
      pokemon: [legendary(386, 30, 3600)],
    },
  }),
];
