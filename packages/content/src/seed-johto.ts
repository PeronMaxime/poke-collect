import { speciesForms } from '@poke/data';
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
 * Johto : le parcours des 8 arènes, la Ligue, les zones spéciales et les quêtes légendaires, sur
 * le modèle de Kanto.
 *
 * - Seules les espèces du Pokédex de Johto (152 à 251) y partent en expédition et y combattent :
 *   le joueur choisit un starter de Johto en arrivant, puis se refait une équipe. Des Pokémon de
 *   Kanto apparaissent aussi dans les zones, pour le Pokédex national.
 * - Parcours principal : chaque badge de Johto ouvre de nouvelles zones, de plus en plus exigeantes.
 *   Les Champions se battent à effectif égal, puis le Conseil 4 et le Maître sans restriction.
 * - Zones spéciales : plusieurs conditions à la fois, PE élevée, Pokémon introuvables ailleurs
 *   (starters et Togepi, Simularbre, Scarhino, Scorplane et Airmure, Embrylex et Feuforêve).
 * - Quêtes : Raikou, Entei, Suicune, Lugia, Ho-Oh puis Celebi. Les trois bêtes sont des fuyards :
 *   pas d'expédition légendaire, elles changent de zone de Johto à chaque heure.
 *
 * Les 100 espèces sont obtenables : rencontres, évolutions (niveau, bonheur, pierres et objets de
 * la boutique), œufs (bébés : Pichu, Mélo, Toudoudou, Debugant, Lippouti, Élekid, Magby) et quêtes.
 */

const ALL_DURATIONS = [2, 5, 15, 60, 240, 480];
const LONG_DURATIONS = [60, 240, 480];
/** Zones spéciales : pas d'aller-retour rapide. */
const SPECIAL_DURATIONS = [240, 480];

export const johtoRegion: Region = {
  id: 'johto',
  order: 1,
  name: 'Johto',
  image: null,
  speciesIds: Array.from({ length: 100 }, (_, i) => 152 + i),
  starterSpeciesIds: [152, 155, 158],
  enabled: true,
  unlock: { type: 'regionDexPercent', regionId: 'kanto', percent: 50 },
};

const enc = (speciesId: number, weight: number, minLevel: number, maxLevel: number): Encounter => ({
  speciesId,
  weight,
  minLevel,
  maxLevel,
});

/** Zarbi : les 28 formes (A, puis B à Z, ! et ?), à parts égales. */
const unownEncounters = (weight: number, minLevel: number, maxLevel: number): Encounter[] => [
  enc(201, weight, minLevel, maxLevel),
  ...speciesForms(201).map((form) => ({
    ...enc(201, weight, minLevel, maxLevel),
    formId: form.id,
  })),
];

/** Badges de Johto uniquement (ceux de Kanto ne comptent pas). */
const badges = (count: number): UnlockCondition => ({
  type: 'badgeCount',
  count,
  regionId: 'johto',
});
const defeated = (trainerId: string): UnlockCondition => ({ type: 'trainerDefeated', trainerId });
const johtoDex = (percent: number): UnlockCondition => ({
  type: 'regionDexPercent',
  regionId: 'johto',
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
  regionId: 'johto',
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

export const johtoZones: Zone[] = [
  // --- Avant le premier badge -------------------------------------------------------------
  zone({
    id: 'route-29',
    order: 0,
    name: 'Route 29',
    description: 'Le chemin herbeux qui relie Bourg Geon à Ville Griotte. Idéal pour débuter.',
    habitat: 'grassland',
    minPower: 0,
    weatherTypes: ['normal', 'flying'],
    encounters: [
      enc(161, 30, 2, 4),
      enc(163, 25, 2, 4),
      enc(187, 15, 3, 5),
      enc(16, 15, 2, 4),
      enc(19, 15, 2, 4),
    ],
    lootTableId: 'butin-route',
    unlock: { type: 'always' },
  }),
  zone({
    id: 'routes-30-31',
    order: 1,
    name: 'Routes 30 et 31',
    description:
      'Les sentiers boisés au nord de Ville Griotte, où Coxy et Mimigal se relaient jour et nuit.',
    habitat: 'forest',
    minPower: 170,
    weatherTypes: ['bug', 'grass'],
    encounters: [
      enc(165, 25, 3, 6),
      enc(167, 25, 3, 6),
      enc(163, 12, 3, 6),
      enc(161, 10, 4, 6),
      enc(10, 8, 3, 5),
      enc(13, 8, 3, 5),
      enc(69, 12, 4, 6),
    ],
    lootTableId: 'butin-foret',
    unlock: johtoDex(3),
  }),
  zone({
    id: 'tour-chetiflor',
    order: 2,
    name: 'Tour Chétiflor',
    description: 'Une vieille tour de bois qui oscille doucement. Des ombres y rôdent la nuit.',
    habitat: 'urban',
    minPower: 300,
    weatherTypes: ['ghost', 'grass', 'normal'],
    encounters: [
      enc(163, 25, 4, 7),
      enc(198, 8, 5, 8),
      enc(177, 12, 5, 8),
      enc(19, 25, 4, 7),
      enc(92, 20, 4, 7),
      enc(69, 10, 4, 7),
    ],
    lootTableId: 'butin-grotte',
    unlock: defeated('scout-willy'),
  }),
  // --- Badge Zéphyr ---------------------------------------------------------------------------
  zone({
    id: 'route-32',
    order: 3,
    name: 'Route 32',
    description:
      'La longue route qui descend de Mauville vers les Caves Jumelles, bordée d’étangs.',
    habitat: 'grassland',
    minPower: 450,
    weatherTypes: ['electric', 'grass', 'water'],
    encounters: [
      enc(179, 25, 6, 9),
      enc(187, 18, 6, 9),
      enc(163, 12, 6, 9),
      enc(211, 6, 7, 10),
      enc(23, 10, 6, 9),
      enc(69, 10, 6, 9),
      enc(72, 9, 6, 9),
      enc(129, 10, 5, 10),
    ],
    lootTableId: 'butin-route',
    unlock: badges(1),
  }),
  zone({
    id: 'caves-jumelles',
    order: 4,
    name: 'Caves Jumelles',
    description: 'Un réseau de galeries humides sous la Route 32, où barbotent les Axoloto.',
    habitat: 'cave',
    minPower: 500,
    weatherTypes: ['rock', 'ground', 'water'],
    encounters: [
      enc(194, 25, 7, 10),
      enc(41, 22, 6, 10),
      enc(74, 22, 6, 10),
      enc(27, 10, 7, 10),
      enc(19, 12, 6, 9),
      enc(95, 6, 8, 11),
      enc(195, 3, 15, 18),
    ],
    lootTableId: 'butin-grotte',
    unlock: badges(1),
  }),
  zone({
    id: 'ruines-alpha',
    order: 5,
    name: 'Ruines d’Alpha',
    description:
      'Des ruines millénaires couvertes d’inscriptions. Les Zarbi semblent former des lettres.',
    habitat: 'rough-terrain',
    minPower: 700,
    weatherTypes: ['psychic', 'rock'],
    encounters: unownEncounters(4, 8, 12),
    lootTableId: 'butin-fouilles',
    unlock: defeated('montagnard-anthony'),
  }),
  zone({
    id: 'puits-ramoloss',
    order: 6,
    name: 'Puits Ramoloss',
    description:
      'Le puits d’Écorcia, où la Team Rocket coupe la queue des Ramoloss pour la revendre.',
    habitat: 'cave',
    minPower: 800,
    weatherTypes: ['water', 'psychic'],
    encounters: [
      enc(79, 40, 9, 13),
      enc(41, 25, 9, 13),
      enc(194, 15, 9, 13),
      enc(118, 10, 9, 13),
      enc(129, 10, 8, 12),
    ],
    lootTableId: 'butin-grotte',
    unlock: defeated('montagnard-anthony'),
  }),
  // --- Badge Essaim ---------------------------------------------------------------------------
  zone({
    id: 'bois-aux-chenes',
    order: 7,
    name: 'Bois aux Chênes',
    description:
      'Une forêt si dense que le soleil n’y perce jamais. Un petit autel y est dédié au protecteur des bois.',
    habitat: 'forest',
    minPower: 950,
    weatherTypes: ['bug', 'grass'],
    encounters: [
      enc(204, 18, 10, 14),
      enc(165, 12, 10, 14),
      enc(167, 12, 10, 14),
      enc(163, 10, 10, 14),
      enc(46, 16, 10, 14),
      enc(43, 14, 10, 14),
      enc(54, 10, 10, 14),
      enc(166, 4, 16, 18),
      enc(168, 4, 20, 22),
    ],
    lootTableId: 'butin-foret',
    unlock: badges(2),
  }),
  zone({
    id: 'routes-34-35',
    order: 8,
    name: 'Routes 34 et 35',
    description:
      'Les prés qui entourent Doublonville et sa Pension. Un Métamorph s’y cache parfois.',
    habitat: 'grassland',
    minPower: 1000,
    weatherTypes: ['normal', 'fairy', 'grass'],
    encounters: [
      enc(209, 18, 12, 16),
      enc(191, 15, 12, 16),
      enc(193, 8, 12, 16),
      enc(161, 8, 12, 16),
      enc(96, 12, 12, 16),
      enc(39, 10, 12, 16),
      enc(63, 7, 12, 16),
      enc(132, 6, 12, 16),
      enc(29, 6, 12, 16),
      enc(32, 6, 12, 16),
      enc(162, 4, 16, 18),
    ],
    lootTableId: 'butin-route',
    unlock: badges(2),
  }),
  zone({
    id: 'antre-noir',
    order: 9,
    name: 'Antre Noir',
    description:
      'Une grotte plongée dans le noir complet. On y bute sur des Insolourdo et des Qulbutoké.',
    habitat: 'cave',
    minPower: 1050,
    weatherTypes: ['normal', 'psychic', 'rock'],
    encounters: [
      enc(216, 14, 13, 17),
      enc(206, 10, 13, 17),
      enc(202, 7, 14, 18),
      enc(41, 26, 12, 16),
      enc(74, 25, 12, 16),
      enc(95, 8, 14, 18),
      enc(42, 5, 22, 25),
    ],
    lootTableId: 'butin-grotte',
    unlock: badges(2),
  }),
  // --- Badge Plaine ---------------------------------------------------------------------------
  zone({
    id: 'routes-36-37',
    order: 10,
    name: 'Routes 36 et 37',
    description: 'Les routes qui mènent à Rosalia, où paissent les Cerfrousse à la nuit tombée.',
    habitat: 'grassland',
    minPower: 1650,
    weatherTypes: ['normal', 'psychic', 'dark'],
    encounters: [
      enc(234, 14, 16, 20),
      enc(198, 10, 16, 20),
      enc(177, 10, 16, 20),
      enc(163, 10, 16, 20),
      enc(164, 5, 20, 22),
      enc(166, 6, 18, 20),
      enc(168, 6, 22, 24),
      enc(58, 10, 16, 20),
      enc(37, 10, 16, 20),
      enc(17, 9, 18, 21),
      enc(69, 10, 16, 20),
    ],
    lootTableId: 'butin-route',
    unlock: badges(3),
  }),
  zone({
    id: 'tour-cendree',
    order: 11,
    name: 'Tour Cendrée',
    description:
      'Les ruines calcinées d’une tour de Rosalia. Trois Pokémon légendaires y seraient nés des flammes.',
    habitat: 'urban',
    minPower: 1725,
    weatherTypes: ['fire', 'dark', 'poison'],
    encounters: [
      enc(218, 18, 16, 21),
      enc(228, 12, 16, 21),
      enc(19, 22, 16, 21),
      enc(109, 18, 16, 21),
      enc(20, 10, 20, 23),
      enc(58, 10, 16, 21),
      enc(41, 10, 16, 21),
    ],
    lootTableId: 'butin-grotte',
    unlock: badges(3),
  }),
  zone({
    id: 'routes-38-39',
    order: 12,
    name: 'Routes 38 et 39',
    description: 'Les pâturages de la Ferme Meuh Meuh, entre Rosalia et Oliville.',
    habitat: 'grassland',
    minPower: 1800,
    weatherTypes: ['normal', 'electric', 'water'],
    encounters: [
      enc(241, 12, 18, 22),
      enc(209, 8, 18, 22),
      enc(164, 8, 20, 24),
      enc(52, 15, 18, 22),
      enc(20, 10, 18, 22),
      enc(17, 10, 18, 22),
      enc(79, 10, 18, 22),
      enc(81, 10, 18, 22),
      enc(22, 6, 20, 24),
      enc(210, 3, 23, 25),
    ],
    lootTableId: 'butin-route',
    unlock: badges(3),
  }),
  // --- Badge Brume ----------------------------------------------------------------------------
  zone({
    id: 'routes-42-44',
    order: 13,
    name: 'Routes 42 à 44',
    description:
      'Les routes de montagne qui relient Rosalia, Acajou et Ebenelle, au pied du Mont Creuset.',
    habitat: 'mountain',
    minPower: 1950,
    weatherTypes: ['normal', 'electric', 'water'],
    durationsMinutes: LONG_DURATIONS,
    encounters: [
      enc(190, 12, 22, 28),
      enc(203, 10, 22, 28),
      enc(179, 10, 22, 26),
      enc(180, 6, 24, 28),
      enc(183, 10, 22, 28),
      enc(223, 10, 22, 28),
      enc(21, 10, 22, 28),
      enc(22, 6, 26, 30),
      enc(56, 8, 22, 28),
      enc(77, 8, 22, 28),
      enc(224, 3, 25, 30),
    ],
    lootTableId: 'butin-route',
    unlock: badges(4),
  }),
  zone({
    id: 'mont-creuset',
    order: 14,
    name: 'Mont Creuset',
    description: 'Une montagne creusée de cascades et de galeries. Un Maître Karaté s’y entraîne.',
    habitat: 'cave',
    minPower: 2025,
    weatherTypes: ['fighting', 'rock', 'water'],
    durationsMinutes: LONG_DURATIONS,
    encounters: [
      enc(183, 16, 22, 28),
      enc(184, 4, 26, 30),
      enc(66, 16, 22, 28),
      enc(74, 15, 22, 28),
      enc(75, 8, 25, 30),
      enc(41, 12, 22, 28),
      enc(42, 8, 25, 30),
      enc(217, 3, 30, 32),
    ],
    lootTableId: 'butin-grotte',
    unlock: badges(4),
  }),
  zone({
    id: 'routes-40-41',
    order: 15,
    name: 'Routes 40 et 41',
    description:
      'Le bras de mer entre Oliville et Irisia, semé d’îlots. Il faut un Pokémon Eau pour le traverser.',
    habitat: 'sea',
    minPower: 2100,
    requiredTypes: [{ type: 'water', count: 1 }],
    weatherTypes: ['water'],
    durationsMinutes: LONG_DURATIONS,
    encounters: [
      enc(170, 16, 22, 28),
      enc(226, 5, 24, 30),
      enc(213, 6, 22, 28),
      enc(171, 3, 27, 30),
      enc(72, 24, 22, 28),
      enc(98, 10, 22, 28),
      enc(116, 8, 22, 28),
      enc(120, 8, 22, 28),
      enc(90, 6, 22, 28),
      enc(73, 6, 28, 32),
      enc(129, 8, 20, 30),
    ],
    lootTableId: 'butin-mer',
    unlock: badges(4),
  }),
  // --- Badge Choc -----------------------------------------------------------------------------
  zone({
    id: 'phare-oliville',
    order: 16,
    name: 'Phare d’Oliville',
    description:
      'Le grand phare du port, dont la lumière vient d’un Pharamp malade. Des Magnéti y grésillent.',
    habitat: 'urban',
    minPower: 2750,
    weatherTypes: ['electric', 'steel', 'water'],
    durationsMinutes: LONG_DURATIONS,
    encounters: [
      enc(180, 16, 28, 34),
      enc(181, 4, 32, 36),
      enc(81, 22, 28, 34),
      enc(82, 8, 32, 36),
      enc(52, 14, 28, 34),
      enc(72, 14, 28, 34),
      enc(171, 10, 28, 34),
      enc(53, 6, 30, 36),
      enc(79, 6, 28, 34),
    ],
    lootTableId: 'butin-mer',
    unlock: badges(5),
  }),
  // --- Badge Minéral --------------------------------------------------------------------------
  zone({
    id: 'lac-colere',
    order: 17,
    name: 'Lac Colère',
    description:
      'Un grand lac agité au nord d’Acajou. On murmure qu’un Léviator rouge y aurait été aperçu.',
    habitat: 'waters-edge',
    minPower: 3150,
    requiredTypes: [{ type: 'water', count: 1 }],
    weatherTypes: ['water', 'bug'],
    durationsMinutes: LONG_DURATIONS,
    encounters: [
      enc(129, 32, 28, 38),
      enc(194, 14, 30, 36),
      enc(195, 8, 32, 38),
      enc(193, 8, 30, 36),
      enc(118, 12, 30, 36),
      enc(119, 4, 34, 40),
      enc(60, 10, 30, 36),
      enc(61, 6, 32, 38),
      enc(130, 3, 36, 40),
    ],
    lootTableId: 'butin-mer',
    unlock: badges(6),
  }),
  // --- Badge Glacier --------------------------------------------------------------------------
  zone({
    id: 'route-de-glace',
    order: 18,
    name: 'Route de Glace',
    description:
      'Un passage gelé entre Acajou et Ebenelle, où l’on glisse d’un bout à l’autre de la grotte.',
    habitat: 'cave',
    minPower: 3350,
    weatherTypes: ['ice', 'water', 'dark'],
    durationsMinutes: LONG_DURATIONS,
    encounters: [
      enc(220, 24, 32, 38),
      enc(221, 4, 36, 40),
      enc(225, 7, 32, 38),
      enc(215, 7, 32, 38),
      enc(86, 16, 32, 38),
      enc(87, 4, 36, 40),
      enc(41, 12, 32, 38),
      enc(42, 10, 34, 40),
      enc(74, 10, 32, 38),
    ],
    lootTableId: 'butin-grotte',
    unlock: badges(7),
  }),
  // --- Badge Lever ----------------------------------------------------------------------------
  zone({
    id: 'routes-45-46',
    order: 19,
    name: 'Routes 45 et 46',
    description: 'Un sentier de montagne abrupt au sud d’Ebenelle, où dévalent les Phanpy.',
    habitat: 'mountain',
    minPower: 3600,
    weatherTypes: ['ground', 'rock', 'normal'],
    durationsMinutes: LONG_DURATIONS,
    encounters: [
      enc(231, 18, 36, 42),
      enc(232, 4, 40, 44),
      enc(216, 10, 36, 42),
      enc(217, 5, 40, 44),
      enc(74, 12, 36, 42),
      enc(75, 10, 38, 44),
      enc(57, 10, 38, 44),
      enc(66, 10, 36, 42),
      enc(67, 6, 40, 44),
      enc(22, 8, 38, 44),
    ],
    lootTableId: 'butin-fouilles',
    unlock: badges(8),
  }),
  zone({
    id: 'routes-26-27',
    order: 20,
    name: 'Routes 26 et 27',
    description:
      'Les routes côtières qui mènent au Plateau Indigo. Les dresseurs y sont tous aguerris.',
    habitat: 'waters-edge',
    minPower: 3650,
    weatherTypes: ['normal', 'water', 'psychic'],
    durationsMinutes: LONG_DURATIONS,
    encounters: [
      enc(164, 10, 40, 46),
      enc(178, 8, 40, 46),
      enc(195, 8, 40, 46),
      enc(232, 6, 42, 46),
      enc(229, 5, 42, 46),
      enc(20, 10, 40, 46),
      enc(22, 10, 40, 46),
      enc(78, 8, 42, 46),
      enc(85, 8, 42, 46),
      enc(57, 8, 42, 46),
      enc(73, 8, 40, 46),
    ],
    lootTableId: 'butin-elite',
    unlock: badges(8),
  }),

  // === Zones spéciales : plusieurs conditions, PE élevée, Pokémon exclusifs (rares) ===========
  zone({
    id: 'labo-orme',
    order: 21,
    name: 'Labo du Prof. Orme',
    description:
      'Le Prof. Orme élève des Germignon, Héricendre et Kaiminus, et étudie un mystérieux œuf de Togepi. Il ouvre son labo aux dresseurs confirmés.',
    habitat: 'grassland',
    minPower: 1850,
    weatherTypes: ['grass', 'fire', 'water'],
    durationsMinutes: SPECIAL_DURATIONS,
    encounters: [
      enc(161, 22, 14, 18),
      enc(163, 22, 14, 18),
      enc(165, 14, 14, 18),
      enc(167, 14, 14, 18),
      enc(187, 14, 14, 18),
      enc(152, 3, 10, 12),
      enc(155, 3, 10, 12),
      enc(158, 3, 10, 12),
      enc(175, 3, 5, 8),
    ],
    lootTableId: 'butin-foret',
    unlock: allOf(badges(2), johtoDex(20)),
  }),
  zone({
    id: 'arbre-etrange',
    order: 22,
    name: 'Arbre étrange',
    description:
      'Un arbre bloque la Route 36… et il bouge quand on l’arrose. Il faut un Pokémon Eau pour le déloger.',
    habitat: 'forest',
    minPower: 2025,
    requiredTypes: [{ type: 'water', count: 1 }],
    weatherTypes: ['grass', 'rock', 'water'],
    durationsMinutes: SPECIAL_DURATIONS,
    encounters: [
      enc(191, 16, 18, 22),
      enc(192, 4, 22, 26),
      enc(187, 16, 18, 22),
      enc(188, 8, 20, 24),
      enc(43, 14, 18, 22),
      enc(69, 14, 18, 22),
      enc(190, 8, 18, 22),
      enc(185, 4, 20, 22),
    ],
    lootTableId: 'butin-foret',
    unlock: allOf(badges(3), johtoDex(30)),
  }),
  zone({
    id: 'parc-naturel',
    order: 23,
    name: 'Parc Naturel',
    description:
      'Le parc de Doublonville et son Concours de Capture d’insectes. Seules les équipes d’au moins deux Pokémon Insecte y participent ; un Scarhino s’y montre parfois.',
    habitat: 'grassland',
    minPower: 2500,
    requiredTypes: [{ type: 'bug', count: 2 }],
    weatherTypes: ['bug', 'grass'],
    durationsMinutes: SPECIAL_DURATIONS,
    encounters: [
      enc(165, 12, 20, 26),
      enc(166, 6, 24, 28),
      enc(167, 12, 20, 26),
      enc(168, 6, 24, 28),
      enc(193, 8, 20, 26),
      enc(204, 10, 20, 26),
      enc(191, 8, 20, 26),
      enc(12, 6, 24, 28),
      enc(15, 6, 24, 28),
      enc(48, 10, 20, 26),
      enc(46, 10, 20, 26),
      enc(214, 3, 24, 28),
    ],
    lootTableId: 'butin-foret',
    unlock: allOf(badges(3), defeated('scout-hugo')),
  }),
  zone({
    id: 'parc-safari-johto',
    order: 24,
    name: 'Parc Safari de Johto',
    description:
      'La réserve ouverte au-delà d’Irisia, sur des terres arides et rocheuses. Scorplane et Airmure ne se montrent qu’aux dresseurs patients.',
    habitat: 'rough-terrain',
    minPower: 3250,
    weatherTypes: ['ground', 'rock', 'flying'],
    durationsMinutes: SPECIAL_DURATIONS,
    encounters: [
      enc(231, 14, 28, 34),
      enc(195, 10, 28, 34),
      enc(178, 8, 30, 34),
      enc(203, 8, 28, 34),
      enc(111, 14, 28, 34),
      enc(102, 12, 28, 34),
      enc(114, 10, 28, 34),
      enc(84, 10, 28, 34),
      enc(27, 8, 28, 34),
      enc(235, 6, 28, 34),
      enc(207, 4, 28, 34),
      enc(227, 2, 30, 34),
    ],
    lootTableId: 'butin-fouilles',
    unlock: allOf(badges(5), johtoDex(40)),
  }),
  zone({
    id: 'mont-argente',
    order: 25,
    name: 'Mont Argenté',
    description:
      'La montagne interdite entre Johto et Kanto, réservée aux Maîtres. Un dresseur silencieux attendrait au sommet.',
    habitat: 'mountain',
    minPower: 5000,
    weatherTypes: ['rock', 'ghost', 'ground'],
    durationsMinutes: SPECIAL_DURATIONS,
    encounters: [
      enc(217, 12, 45, 52),
      enc(232, 10, 45, 52),
      enc(229, 8, 45, 52),
      enc(75, 12, 45, 52),
      enc(95, 10, 45, 52),
      enc(57, 10, 45, 52),
      enc(105, 8, 45, 52),
      enc(59, 6, 48, 52),
      enc(78, 6, 48, 52),
      enc(200, 3, 45, 50),
      enc(246, 3, 20, 25),
    ],
    lootTableId: 'butin-elite',
    unlock: allOf(defeated('maitre-peter'), johtoDex(60)),
  }),

  // === Zones de quêtes : ouvertes en cours de quête ==============================================
  zone({
    id: 'tourb-iles',
    order: 26,
    name: 'Tourb’Îles',
    description:
      'Quatre îles cernées de tourbillons, au large d’Irisia. Un gardien des mers dormirait dans leurs profondeurs ; des Corayon s’y accrochent aux rochers.',
    habitat: 'sea',
    minPower: 3500,
    requiredTypes: [{ type: 'water', count: 2 }],
    weatherTypes: ['water', 'psychic'],
    durationsMinutes: SPECIAL_DURATIONS,
    encounters: [
      enc(72, 18, 38, 44),
      enc(73, 8, 40, 46),
      enc(98, 10, 38, 44),
      enc(99, 5, 40, 46),
      enc(116, 10, 38, 44),
      enc(117, 5, 40, 46),
      enc(86, 10, 38, 44),
      enc(87, 4, 40, 46),
      enc(129, 8, 35, 45),
      enc(171, 6, 40, 46),
      enc(222, 4, 38, 44),
    ],
    lootTableId: 'butin-mer',
    unlock: { type: 'questStepsDone', questId: 'lugia', count: 1 },
  }),
  zone({
    id: 'tour-carillon',
    order: 27,
    name: 'Tour Carillon',
    description:
      'La tour à neuf étages de Rosalia. Ses cloches sonnent pour accueillir l’oiseau arc-en-ciel.',
    habitat: 'urban',
    minPower: 4000,
    weatherTypes: ['fire', 'psychic', 'ghost'],
    durationsMinutes: SPECIAL_DURATIONS,
    encounters: [
      enc(198, 12, 45, 50),
      enc(228, 10, 45, 50),
      enc(229, 6, 48, 52),
      enc(218, 10, 45, 50),
      enc(219, 6, 48, 52),
      enc(177, 10, 45, 50),
      enc(178, 6, 48, 52),
      enc(92, 12, 45, 50),
      enc(93, 8, 48, 52),
      enc(20, 10, 45, 50),
    ],
    lootTableId: 'butin-elite',
    unlock: { type: 'questStepsDone', questId: 'ho-oh', count: 2 },
  }),
  zone({
    id: 'autel-bois-aux-chenes',
    order: 28,
    name: 'Autel du Bois aux Chênes',
    description:
      'Le petit autel de bois, au cœur de la forêt. On raconte qu’un voyageur du temps y apparaît.',
    habitat: 'forest',
    minPower: 3650,
    weatherTypes: ['grass', 'bug', 'psychic'],
    durationsMinutes: SPECIAL_DURATIONS,
    encounters: [
      enc(204, 14, 40, 46),
      enc(205, 6, 42, 46),
      enc(191, 12, 40, 46),
      enc(192, 6, 42, 46),
      enc(188, 10, 40, 46),
      enc(189, 6, 42, 46),
      enc(166, 8, 40, 46),
      enc(168, 8, 40, 46),
      enc(47, 8, 40, 46),
      enc(45, 6, 42, 46),
    ],
    lootTableId: 'butin-foret',
    unlock: { type: 'questStepsDone', questId: 'celebi', count: 2 },
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
    regionId: 'johto',
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

export const johtoTrainers: Trainer[] = [
  // Avant le Badge Zéphyr
  trainer({
    id: 'gamin-joey',
    zoneId: 'route-29',
    order: 0,
    name: 'Joey',
    trainerClass: 'Gamin',
    spriteName: 'youngster-gen4',
    team: [mon(161, 5), mon(19, 5)],
    money: 120,
    unlock: { type: 'always' },
  }),
  trainer({
    id: 'scout-willy',
    zoneId: 'routes-30-31',
    order: 1,
    name: 'Willy',
    trainerClass: 'Scout',
    spriteName: 'bugcatcher-gen3',
    team: [mon(165, 6), mon(167, 6), mon(13, 7)],
    money: 225,
    lootTableId: 'butin-foret',
    unlock: johtoDex(3),
  }),
  trainer({
    id: 'sage-li',
    zoneId: 'tour-chetiflor',
    order: 2,
    name: 'Li',
    trainerClass: 'Sage',
    spriteName: 'sage',
    team: [mon(69, 8), mon(69, 8), mon(163, 11)],
    money: 300,
    lootTableId: 'butin-grotte',
    lootRolls: 2,
    unlock: defeated('scout-willy'),
  }),
  gymLeader(
    'albert',
    3,
    'Albert',
    GYM,
    'falkner',
    'Badge Zéphyr',
    [mon(16, 12), mon(17, 16)],
    defeated('sage-li'),
    { money: 2250, lootTableId: 'butin-route' },
  ),
  // Badge Zéphyr → Badge Essaim
  trainer({
    id: 'pecheur-raoul',
    zoneId: 'route-32',
    order: 4,
    name: 'Raoul',
    trainerClass: 'Pêcheur',
    spriteName: 'fisherman',
    team: [mon(129, 12), mon(211, 14), mon(72, 13)],
    money: 450,
    lootTableId: 'butin-mer',
    lootRolls: 2,
    unlock: badges(1),
  }),
  trainer({
    id: 'montagnard-anthony',
    zoneId: 'caves-jumelles',
    order: 5,
    name: 'Anthony',
    trainerClass: 'Montagnard',
    spriteName: 'hiker-gen4',
    team: [mon(74, 14), mon(41, 14), mon(95, 15)],
    money: 540,
    lootTableId: 'butin-grotte',
    lootRolls: 2,
    unlock: defeated('pecheur-raoul'),
  }),
  trainer({
    id: 'sbire-puits',
    zoneId: 'puits-ramoloss',
    order: 6,
    name: 'Sbire',
    trainerClass: 'Team Rocket',
    spriteName: 'rocketgrunt',
    team: [mon(19, 15), mon(23, 16), mon(41, 17)],
    money: 675,
    lootTableId: 'butin-grotte',
    lootRolls: 2,
    unlock: defeated('montagnard-anthony'),
  }),
  gymLeader(
    'hector',
    7,
    'Hector',
    GYM,
    'bugsy',
    'Badge Essaim',
    [mon(11, 18), mon(14, 18), mon(123, 20)],
    defeated('sbire-puits'),
    { money: 2700, lootTableId: 'butin-foret' },
  ),
  // Badge Essaim → Badge Plaine
  trainer({
    id: 'scout-hugo',
    zoneId: 'bois-aux-chenes',
    order: 8,
    name: 'Hugo',
    trainerClass: 'Scout',
    spriteName: 'bugcatcher-gen3',
    team: [mon(204, 19), mon(166, 20), mon(168, 20)],
    money: 750,
    lootTableId: 'butin-foret',
    lootRolls: 2,
    unlock: badges(2),
  }),
  trainer({
    id: 'pique-niqueuse-gina',
    zoneId: 'routes-34-35',
    order: 9,
    name: 'Gina',
    trainerClass: 'Pique-niqueuse',
    spriteName: 'picnicker',
    team: [mon(209, 20), mon(191, 20), mon(39, 21)],
    money: 825,
    lootRolls: 2,
    unlock: defeated('scout-hugo'),
  }),
  gymLeader(
    'blanche',
    10,
    'Blanche',
    GYM_F,
    'whitney',
    'Badge Plaine',
    [mon(39, 23), mon(35, 24), mon(241, 27)],
    defeated('pique-niqueuse-gina'),
    { money: 3600 },
  ),
  // Badge Plaine → Badge Brume
  trainer({
    id: 'mediume-edith',
    zoneId: 'tour-cendree',
    order: 11,
    name: 'Édith',
    trainerClass: 'Médium',
    spriteName: 'medium',
    team: [mon(92, 24), mon(92, 24), mon(93, 26), mon(228, 26)],
    money: 1350,
    lootTableId: 'butin-grotte',
    lootRolls: 2,
    unlock: badges(3),
  }),
  gymLeader(
    'mortimer',
    12,
    'Mortimer',
    GYM,
    'morty',
    'Badge Brume',
    [mon(92, 27), mon(93, 27), mon(93, 29), mon(94, 31)],
    defeated('mediume-edith'),
    { money: 4050 },
  ),
  // Badge Brume → Badge Choc
  trainer({
    id: 'nageuse-marina',
    zoneId: 'routes-40-41',
    order: 13,
    name: 'Marina',
    trainerClass: 'Nageuse',
    spriteName: 'swimmerf-gen4',
    team: [mon(170, 31), mon(72, 31), mon(116, 32), mon(226, 33)],
    money: 1950,
    lootTableId: 'butin-mer',
    lootRolls: 2,
    unlock: badges(4),
  }),
  gymLeader(
    'chuck',
    14,
    'Chuck',
    GYM,
    'chuck',
    'Badge Choc',
    [mon(56, 35), mon(66, 35), mon(57, 37), mon(62, 39)],
    defeated('nageuse-marina'),
    { money: 5100 },
  ),
  // Badge Choc → Badge Minéral
  trainer({
    id: 'marin-gilles',
    zoneId: 'phare-oliville',
    order: 15,
    name: 'Gilles',
    trainerClass: 'Marin',
    spriteName: 'sailor',
    team: [mon(72, 36), mon(81, 36), mon(171, 37), mon(82, 38)],
    money: 2400,
    lootTableId: 'butin-mer',
    lootRolls: 2,
    unlock: badges(5),
  }),
  gymLeader(
    'jasmine',
    16,
    'Jasmine',
    GYM_F,
    'jasmine',
    'Badge Minéral',
    [mon(81, 40, 18), mon(82, 41, 18), mon(205, 41, 18), mon(208, 45, 18)],
    defeated('marin-gilles'),
    { money: 5850 },
  ),
  // Badge Minéral → Badge Glacier
  trainer({
    id: 'sbire-qg-rocket',
    zoneId: null,
    order: 17,
    name: 'Sbire',
    trainerClass: 'Team Rocket',
    spriteName: 'rocketgrunt',
    team: [mon(24, 40), mon(89, 40), mon(110, 41), mon(20, 41)],
    money: 2700,
    lootTableId: 'butin-grotte',
    lootRolls: 2,
    unlock: badges(6),
  }),
  gymLeader(
    'fredo',
    18,
    'Frédo',
    GYM,
    'pryce',
    'Badge Glacier',
    [mon(86, 43, 20), mon(124, 44, 20), mon(91, 44, 20), mon(87, 45, 20), mon(221, 47, 20)],
    defeated('sbire-qg-rocket'),
    { money: 6000 },
  ),
  // Badge Glacier → Badge Lever
  trainer({
    id: 'skieuse-rosa',
    zoneId: 'route-de-glace',
    order: 19,
    name: 'Rosa',
    trainerClass: 'Skieuse',
    spriteName: 'skier',
    team: [mon(220, 43), mon(86, 43), mon(225, 44), mon(215, 45), mon(87, 45)],
    money: 3300,
    lootTableId: 'butin-grotte',
    lootRolls: 2,
    unlock: badges(7),
  }),
  gymLeader(
    'sandra',
    20,
    'Sandra',
    GYM_F,
    'clair',
    'Badge Lever',
    [mon(148, 48, 25), mon(148, 48, 25), mon(148, 48, 25), mon(130, 49, 25), mon(230, 52, 25)],
    defeated('skieuse-rosa'),
    { money: 6600, lootTableId: 'butin-elite' },
  ),
  // Routes 26 et 27, puis la Ligue
  trainer({
    id: 'topdresseur-gaston',
    zoneId: 'routes-26-27',
    order: 21,
    name: 'Gaston',
    trainerClass: 'Topdresseur',
    spriteName: 'acetrainer-gen4',
    team: [
      mon(181, 52, 20),
      mon(229, 52, 20),
      mon(195, 51, 20),
      mon(232, 52, 20),
      mon(164, 51, 20),
    ],
    money: 5250,
    lootTableId: 'butin-elite',
    lootRolls: 2,
    unlock: badges(8),
  }),
  ...league(),
  trainer({
    id: 'red',
    zoneId: 'mont-argente',
    order: 27,
    name: 'Red',
    trainerClass: 'Dresseur légendaire',
    spriteName: 'red',
    team: [
      mon(25, 91, 31),
      mon(196, 83, 31),
      mon(143, 85, 31),
      mon(3, 87, 31),
      mon(6, 87, 31),
      mon(9, 87, 31),
    ],
    money: 45_000,
    lootTableId: 'butin-elite',
    lootRolls: 6,
    repeatable: false,
    unlock: allOf(defeated('maitre-peter'), defeated('maitre-blue')),
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
      'clement',
      22,
      'Clément',
      'will',
      [mon(178, 60, 25), mon(124, 61, 25), mon(103, 61, 25), mon(80, 61, 25), mon(178, 63, 25)],
      allOf(badges(8), defeated('topdresseur-gaston')),
    ),
    member(
      'koga-conseil',
      23,
      'Koga',
      'koga',
      [mon(168, 61, 25), mon(49, 62, 25), mon(205, 64, 25), mon(89, 63, 25), mon(169, 65, 25)],
      defeated('clement'),
    ),
    member(
      'aldo-johto',
      24,
      'Aldo',
      'bruno',
      [mon(237, 63, 25), mon(106, 63, 25), mon(107, 63, 25), mon(95, 64, 25), mon(68, 67, 25)],
      defeated('koga-conseil'),
    ),
    member(
      'marion',
      25,
      'Marion',
      'karen',
      [mon(197, 64, 25), mon(45, 64, 25), mon(198, 66, 25), mon(94, 67, 25), mon(229, 69, 25)],
      defeated('aldo-johto'),
    ),
    member(
      'maitre-peter',
      26,
      'Peter',
      'lance',
      [
        mon(130, 70, 31),
        mon(149, 72, 31),
        mon(149, 72, 31),
        mon(142, 71, 31),
        mon(6, 71, 31),
        mon(149, 75, 31),
      ],
      defeated('marion'),
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
/** Pokémon offert par une quête : au moins 3 IV parfaits, comme dans les jeux récents. */
/** Légendaire offert : 3 IV parfaits ; expédition légendaire de PE minimale `minPower`. */
const legendary = (speciesId: number, level: number, minPower: number): QuestPokemon => ({
  speciesId,
  level,
  perfectIvs: 3,
  expedition: defaultLegendaryExpedition(speciesId, null, minPower),
  roaming: null,
});
/** Fuyard : il change de zone de Johto à chaque heure au lieu d'une expédition légendaire. */
const roamer = (speciesId: number, level: number): QuestPokemon => ({
  ...legendary(speciesId, level, 0),
  roaming: DEFAULT_ROAMING_CHANCE,
});
const step = (name: string, description: string, condition: QuestCondition): QuestStep => ({
  name,
  description,
  condition,
});
const catchOf = (count: number, pokemonType: string | null): QuestCondition => ({
  type: 'catchPokemon',
  count,
  pokemonType,
  speciesId: null,
  zoneId: null,
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
const quest = (q: Omit<Quest, 'image' | 'regionId' | 'enabled'>): Quest => ({
  image: null,
  regionId: 'johto',
  enabled: true,
  ...q,
});
const BEAST_REWARD = reward({ currency: 12_000, items: [{ itemId: 'bottle-cap', quantity: 1 }] });

/** Quêtes des légendaires de Johto : les trois bêtes, les deux gardiens des tours, puis Celebi. */
export const johtoQuests: Quest[] = [
  quest({
    id: 'raikou',
    order: 0,
    name: 'La bête du tonnerre',
    description: 'Un grondement de tonnerre résonne sous la Tour Cendrée.',
    unlock: defeated('maitre-peter'),
    steps: [
      step('Orage', 'Capture 10 Pokémon Électrik.', catchOf(10, 'electric')),
      step('Les cendres', 'Capture 5 Pokémon Feu.', catchOf(5, 'fire')),
      step(
        'Le sous-sol de la tour',
        'Réussis une expédition à la Tour Cendrée avec 2 Pokémon Électrik de PE 350 ou plus.',
        questExpedition('tour-cendree', 'electric', 2, 350),
      ),
    ],
    rewards: { ...BEAST_REWARD, pokemon: [roamer(243, 50)] },
  }),
  quest({
    id: 'entei',
    order: 1,
    name: 'La bête du volcan',
    description: 'Une bête de feu aurait fui la Tour Cendrée en faisant trembler la terre.',
    unlock: defeated('maitre-peter'),
    steps: [
      step('Braises', 'Capture 10 Pokémon Feu.', catchOf(10, 'fire')),
      step('Sur ses traces', 'Capture 40 % du Pokédex de Johto.', johtoDex(40)),
      step(
        'Le brasier',
        'Réussis une expédition à la Tour Cendrée avec 2 Pokémon Feu de PE 450 ou plus.',
        questExpedition('tour-cendree', 'fire', 2, 450),
      ),
    ],
    rewards: { ...BEAST_REWARD, pokemon: [roamer(244, 50)] },
  }),
  quest({
    id: 'suicune',
    order: 2,
    name: 'La bête des aurores',
    description: 'Une bête aux reflets de cristal court sur l’eau du Lac Colère.',
    unlock: defeated('maitre-peter'),
    steps: [
      step('Eaux pures', 'Capture 15 Pokémon Eau.', catchOf(15, 'water')),
      step('Le vent du nord', 'Bats Frédo, le Champion d’Acajou.', defeated('fredo')),
      step(
        'Sur le lac',
        'Réussis une expédition au Lac Colère avec 2 Pokémon Eau de PE 500 ou plus.',
        questExpedition('lac-colere', 'water', 2, 500),
      ),
    ],
    rewards: { ...BEAST_REWARD, pokemon: [roamer(245, 50)] },
  }),
  quest({
    id: 'lugia',
    order: 3,
    name: 'Le gardien des mers',
    description: 'Les tourbillons des Tourb’Îles cacheraient un Pokémon aux ailes d’argent.',
    unlock: defeated('maitre-peter'),
    steps: [
      step(
        'Plongée',
        'Capture 20 Pokémon Eau pour franchir les tourbillons.',
        catchOf(20, 'water'),
      ),
      step('Le chant des kimonos', 'Bats Sandra, la Championne d’Ebenelle.', defeated('sandra')),
      step('Esprits', 'Capture 10 Pokémon Psy.', catchOf(10, 'psychic')),
      step(
        'Les profondeurs',
        'Réussis une expédition aux Tourb’Îles avec 2 Pokémon Psy de PE 600 ou plus.',
        questExpedition('tourb-iles', 'psychic', 2, 600),
      ),
    ],
    rewards: {
      ...reward({ currency: 40_000, items: [{ itemId: 'gold-bottle-cap', quantity: 1 }] }),
      pokemon: [legendary(249, 70, 3000)],
    },
  }),
  quest({
    id: 'ho-oh',
    order: 4,
    name: 'L’oiseau arc-en-ciel',
    description: 'Les cloches de la Tour Carillon attendent un dresseur digne de l’oiseau sacré.',
    unlock: defeated('maitre-peter'),
    steps: [
      step(
        'Les trois bêtes',
        'Termine les quêtes de Raikou, d’Entei et de Suicune.',
        allOf(
          { type: 'questCompleted', questId: 'raikou' },
          { type: 'questCompleted', questId: 'entei' },
          { type: 'questCompleted', questId: 'suicune' },
        ),
      ),
      step('Maître de Johto', 'Bats Peter, le Maître de la Ligue.', defeated('maitre-peter')),
      step('Chercheur', 'Capture 80 % du Pokédex de Johto.', johtoDex(80)),
      step(
        'Le sommet de la tour',
        'Réussis une expédition à la Tour Carillon avec 3 Pokémon Feu de PE 750 ou plus.',
        questExpedition('tour-carillon', 'fire', 3, 750),
      ),
    ],
    rewards: {
      ...reward({ currency: 50_000, items: [{ itemId: 'gold-bottle-cap', quantity: 1 }] }),
      pokemon: [legendary(250, 70, 4000)],
    },
  }),
  quest({
    id: 'celebi',
    order: 5,
    name: 'Le voyageur du temps',
    description: 'Lugia et Ho-Oh apaisés, l’autel du Bois aux Chênes se met à briller.',
    unlock: allOf(
      { type: 'questCompleted', questId: 'lugia' },
      { type: 'questCompleted', questId: 'ho-oh' },
    ),
    steps: [
      step('Générations', 'Fais éclore 40 œufs.', { type: 'eggsHatched', count: 40 }),
      step('Presque complet', 'Capture 95 % du Pokédex de Johto.', johtoDex(95)),
      step('Le souffle des bois', 'Capture 30 Pokémon Plante.', catchOf(30, 'grass')),
      step(
        'L’autel',
        'Réussis 3 expéditions à l’Autel du Bois aux Chênes.',
        questExpedition('autel-bois-aux-chenes', null, 0, 0, 3),
      ),
    ],
    rewards: {
      ...reward({ items: [{ itemId: 'ability-patch', quantity: 1 }] }),
      pokemon: [legendary(251, 30, 3600)],
    },
  }),
];
