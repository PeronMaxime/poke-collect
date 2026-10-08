import { evolutionChains, forms, getSpecies, items as dataItems } from '@poke/data';
import type { EvolutionNode } from '@poke/data';
import { johtoRegion } from './seed-johto';
import type {
  BattleRules,
  DexMilestone,
  Item,
  Region,
  ShopEntry,
  Trainer,
  TrainerPokemon,
  Zone,
} from './schemas';

/**
 * Contenu de test de l'expansion : les régions de Hoenn à Paldea (et Hisui), débloquées l'une
 * après l'autre par le Pokédex de la région précédente (Johto a son propre fichier), l'Archipel Lointain de Kanto, peuplé de
 * formes régionales, et des zones à Méga-Évolutions (Kalos) et à Gigamax (Galar). Les légendaires
 * et mythiques des nouvelles régions sont exclus de leur Pokédex tant qu'aucune quête ne permet
 * de les obtenir.
 */

const ALL_DURATIONS = [2, 5, 15, 60, 240, 480];
/** Sprites de dresseurs servis par l'API (`pnpm sprites:download`, source : Pokémon Showdown). */
const TRAINER_SPRITES = '/api/sprites/trainers';

/** Identifiant PokéAPI d'une forme, à partir de son nom (`vulpix-alola`). */
export function formIdOf(name: string): number {
  const form = forms.find((f) => f.name === name);
  if (!form) throw new Error(`Forme inconnue : ${name}`);
  return form.id;
}

const enc = (
  speciesId: number,
  weight: number,
  minLevel: number,
  maxLevel: number,
  form?: string,
) => ({
  speciesId,
  ...(form && { formId: formIdOf(form) }),
  weight,
  minLevel,
  maxLevel,
});

const mon = (speciesId: number, level: number, form?: string): TrainerPokemon => ({
  speciesId,
  ...(form && { formId: formIdOf(form) }),
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

/** Espèces d'une plage du Pokédex national, hors légendaires et mythiques. */
const dexRange = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i).filter((id) => {
    const s = getSpecies(id);
    return s && !s.isLegendary && !s.isMythical;
  });

/** Espèces qui ont une forme régionale donnée (`hisui`), hors légendaires et mythiques. */
function regionalFormSpecies(region: string): number[] {
  return [
    ...new Set(
      forms
        .filter((f) => f.kind === 'regional' && f.formName.split('-')[0] === region)
        .map((f) => f.speciesId),
    ),
  ].filter((id) => !getSpecies(id)?.isLegendary && !getSpecies(id)?.isMythical);
}

const region = (
  id: string,
  order: number,
  name: string,
  speciesIds: number[],
  previous: string,
): Region => ({
  id,
  order,
  name,
  image: null,
  speciesIds,
  starterSpeciesIds: [],
  enabled: false,
  unlock: { type: 'regionDexPercent', regionId: previous, percent: 50 },
});

export const expansionRegions: Region[] = [
  {
    id: 'hoenn',
    order: 2,
    name: 'Hoenn',
    image: null,
    speciesIds: dexRange(252, 386),
    starterSpeciesIds: [],
    enabled: false,
    unlock: { type: 'regionDexPercent', regionId: 'johto', percent: 50 },
  },
  {
    id: 'sinnoh',
    order: 3,
    name: 'Sinnoh',
    image: null,
    speciesIds: dexRange(387, 493),
    starterSpeciesIds: [],
    enabled: false,
    unlock: { type: 'regionDexPercent', regionId: 'hoenn', percent: 50 },
  },
  region('unys', 4, 'Unys', dexRange(494, 649), 'sinnoh'),
  region('kalos', 5, 'Kalos', dexRange(650, 721), 'unys'),
  region('alola', 6, 'Alola', dexRange(722, 809), 'kalos'),
  region('galar', 7, 'Galar', dexRange(810, 898), 'alola'),
  // Espèces propres à Hisui, et celles qui y ont une forme régionale.
  region(
    'hisui',
    8,
    'Hisui',
    [...dexRange(899, 905), ...regionalFormSpecies('hisui')].sort((a, b) => a - b),
    'galar',
  ),
  region('paldea', 9, 'Paldea', dexRange(906, 1025), 'hisui'),
];

const zone = (
  z: Omit<Zone, 'image' | 'enabled' | 'requiredTypes' | 'durationsMinutes'> & Partial<Zone>,
): Zone => ({
  image: null,
  enabled: true,
  requiredTypes: [],
  durationsMinutes: ALL_DURATIONS,
  ...z,
});

export const expansionZones: Zone[] = [
  zone({
    id: 'archipel-lointain',
    regionId: 'kanto',
    order: 28,
    name: 'Archipel Lointain',
    description:
      'Des îles au climat étrange, au large de Kanto : les Pokémon y ont pris d’autres formes.',
    habitat: 'waters-edge',
    minPower: 400,
    affinityTypes: ['ice', 'dark', 'psychic'],
    encounters: [
      enc(19, 20, 18, 22, 'rattata-alola'),
      enc(37, 12, 18, 22, 'vulpix-alola'),
      enc(27, 12, 18, 22, 'sandshrew-alola'),
      enc(50, 12, 18, 22, 'diglett-alola'),
      enc(52, 10, 18, 22, 'meowth-alola'),
      enc(52, 6, 18, 22, 'meowth-galar'),
      enc(74, 10, 20, 24, 'geodude-alola'),
      enc(77, 6, 20, 24, 'ponyta-galar'),
      enc(58, 5, 20, 24, 'growlithe-hisui'),
      enc(79, 4, 20, 24, 'slowpoke-galar'),
      enc(88, 3, 22, 26, 'grimer-alola'),
    ],
    lootTableId: 'butin-mer',
    unlock: { type: 'regionDexPercent', regionId: 'kanto', percent: 50 },
  }),
  zone({
    id: 'route-101',
    regionId: 'hoenn',
    order: 0,
    name: 'Route 101',
    description: 'Les herbes folles au nord de Bourg-en-Vol, là où tout commence à Hoenn.',
    habitat: 'grassland',
    minPower: 0,
    affinityTypes: ['normal', 'bug', 'dark'],
    encounters: [
      enc(263, 30, 4, 7),
      enc(263, 3, 4, 7, 'zigzagoon-galar'),
      enc(265, 25, 4, 7),
      enc(261, 25, 4, 7),
      enc(276, 12, 5, 8),
    ],
    lootTableId: 'butin-route',
    unlock: { type: 'always' },
  }),
  zone({
    id: 'grotte-granite',
    regionId: 'hoenn',
    order: 1,
    name: 'Grotte Granite',
    description: 'Une grotte de l’île de Village Myokara, aux parois couvertes de fresques.',
    habitat: 'cave',
    minPower: 300,
    affinityTypes: ['rock', 'fighting', 'steel'],
    encounters: [
      enc(296, 25, 10, 14),
      enc(304, 25, 10, 14),
      enc(302, 10, 12, 15),
      enc(299, 15, 12, 15),
      enc(293, 25, 10, 13),
    ],
    lootTableId: 'butin-fouilles-hoenn',
    unlock: { type: 'regionDexPercent', regionId: 'hoenn', percent: 5 },
  }),
  zone({
    id: 'route-201',
    regionId: 'sinnoh',
    order: 0,
    name: 'Route 201',
    description: 'Un sentier tranquille entre Bonaugure et Littorella, battu par le vent du lac.',
    habitat: 'grassland',
    minPower: 0,
    affinityTypes: ['normal', 'flying', 'bug'],
    encounters: [enc(396, 30, 4, 7), enc(399, 30, 4, 7), enc(401, 20, 4, 7), enc(403, 20, 5, 8)],
    lootTableId: 'butin-route',
    unlock: { type: 'always' },
  }),
  zone({
    id: 'mont-couronne',
    regionId: 'sinnoh',
    order: 1,
    name: 'Mont Couronné',
    description: 'La montagne qui coupe Sinnoh en deux. Ses grottes cachent des Pokémon rares.',
    habitat: 'mountain',
    minPower: 600,
    affinityTypes: ['rock', 'steel', 'ice', 'dragon'],
    encounters: [
      enc(436, 25, 20, 25),
      enc(459, 20, 20, 25),
      enc(408, 10, 22, 26),
      enc(410, 10, 22, 26),
      enc(443, 4, 24, 28),
      enc(433, 15, 20, 24),
    ],
    lootTableId: 'butin-fouilles-sinnoh',
    unlock: { type: 'trainerDefeated', trainerId: 'pierrick' },
  }),
  zone({
    id: 'route-1-unys',
    regionId: 'unys',
    order: 0,
    name: 'Route 1 d’Unys',
    description: 'Le chemin qui part de Renouet, entre la mer et les grands arbres.',
    habitat: 'grassland',
    minPower: 0,
    affinityTypes: ['normal', 'grass', 'dark'],
    encounters: [
      enc(504, 30, 4, 7),
      enc(506, 30, 4, 7),
      enc(519, 20, 4, 7),
      enc(509, 15, 5, 8),
      enc(511, 5, 5, 8),
    ],
    lootTableId: 'butin-route',
    unlock: { type: 'always' },
  }),
  zone({
    id: 'desert-delassant',
    regionId: 'unys',
    order: 1,
    name: 'Désert Délassant',
    description: 'Une tempête de sable permanente souffle sur ce désert et ses ruines anciennes.',
    habitat: 'rough-terrain',
    minPower: 700,
    affinityTypes: ['ground', 'rock', 'fire'],
    encounters: [
      enc(551, 25, 22, 26),
      enc(554, 20, 22, 26),
      enc(557, 20, 22, 26),
      enc(562, 15, 22, 26),
      enc(556, 15, 22, 26),
      enc(550, 5, 22, 26, 'basculin-white-striped'),
    ],
    lootTableId: 'butin-grotte',
    unlock: { type: 'trainerDefeated', trainerId: 'aloe' },
  }),
  zone({
    id: 'route-2-kalos',
    regionId: 'kalos',
    order: 0,
    name: 'Route 2 de Kalos',
    description: 'Des prés fleuris où butinent des Flabébé de toutes les couleurs.',
    habitat: 'grassland',
    minPower: 0,
    affinityTypes: ['normal', 'bug', 'fairy'],
    encounters: [
      enc(659, 25, 4, 7),
      enc(661, 20, 4, 7),
      enc(664, 20, 4, 7),
      enc(669, 15, 5, 8),
      enc(669, 8, 5, 8, 'flabebe-blue'),
      enc(666, 2, 10, 12, 'vivillon-polar'),
    ],
    lootTableId: 'butin-route',
    unlock: { type: 'always' },
  }),
  zone({
    id: 'tour-maitrise',
    regionId: 'kalos',
    order: 1,
    name: 'Tour Maîtrise',
    description:
      'La tour de Yantreizh, berceau de la Méga-Évolution. On y croise, très rarement, des Pokémon méga-évolués.',
    habitat: 'urban',
    minPower: 2500,
    affinityTypes: ['fighting', 'steel', 'psychic'],
    encounters: [
      enc(447, 25, 30, 35),
      enc(280, 20, 30, 35),
      enc(309, 20, 30, 35),
      enc(228, 15, 30, 35),
      enc(448, 2, 45, 50, 'lucario-mega'),
      enc(282, 1, 45, 50, 'gardevoir-mega'),
      enc(475, 1, 45, 50, 'gallade-mega'),
      enc(310, 1, 45, 50, 'manectric-mega'),
      enc(229, 1, 45, 50, 'houndoom-mega'),
      enc(359, 1, 45, 50, 'absol-mega'),
    ],
    lootTableId: 'butin-elite',
    unlock: { type: 'trainerDefeated', trainerId: 'violette' },
  }),
  zone({
    id: 'route-1-alola',
    regionId: 'alola',
    order: 0,
    name: 'Route 1 d’Alola',
    description: 'Les chemins ensoleillés de l’île de Mele-Mele.',
    habitat: 'grassland',
    minPower: 0,
    affinityTypes: ['normal', 'flying', 'bug'],
    encounters: [
      enc(731, 25, 4, 7),
      enc(734, 25, 4, 7),
      enc(736, 20, 4, 7),
      enc(19, 25, 4, 7, 'rattata-alola'),
      enc(742, 5, 5, 8),
    ],
    lootTableId: 'butin-route',
    unlock: { type: 'always' },
  }),
  zone({
    id: 'mont-lanakila',
    regionId: 'alola',
    order: 1,
    name: 'Mont Lanakila',
    description:
      'Le sommet enneigé d’Ula-Ula. Les formes d’Alola y abondent, et un Pokémon Dominant y règne.',
    habitat: 'mountain',
    minPower: 1200,
    affinityTypes: ['ice', 'rock', 'dark'],
    encounters: [
      enc(27, 20, 28, 32, 'sandshrew-alola'),
      enc(37, 20, 28, 32, 'vulpix-alola'),
      enc(50, 15, 28, 32, 'diglett-alola'),
      enc(74, 15, 28, 32, 'geodude-alola'),
      enc(88, 10, 28, 32, 'grimer-alola'),
      enc(105, 5, 30, 34, 'marowak-alola'),
      enc(20, 1, 40, 40, 'raticate-totem-alola'),
    ],
    lootTableId: 'butin-grotte',
    unlock: { type: 'trainerDefeated', trainerId: 'ilima' },
  }),
  zone({
    id: 'route-1-galar',
    regionId: 'galar',
    order: 0,
    name: 'Route 1 de Galar',
    description: 'Les champs paisibles qui bordent Paddoxton.',
    habitat: 'grassland',
    minPower: 0,
    affinityTypes: ['normal', 'flying', 'bug'],
    encounters: [
      enc(819, 30, 4, 7),
      enc(821, 25, 4, 7),
      enc(824, 20, 4, 7),
      enc(831, 15, 5, 8),
      enc(263, 10, 4, 7, 'zigzagoon-galar'),
    ],
    lootTableId: 'butin-route',
    unlock: { type: 'always' },
  }),
  zone({
    id: 'terres-sauvages',
    regionId: 'galar',
    order: 1,
    name: 'Terres Sauvages',
    description: 'Une immense étendue sauvage au cœur de Galar, où vivent ses formes régionales.',
    habitat: 'rough-terrain',
    minPower: 1000,
    affinityTypes: ['fighting', 'ghost', 'psychic'],
    encounters: [
      enc(77, 20, 25, 30, 'ponyta-galar'),
      enc(83, 15, 25, 30, 'farfetchd-galar'),
      enc(222, 15, 25, 30, 'corsola-galar'),
      enc(562, 15, 25, 30, 'yamask-galar'),
      enc(618, 15, 25, 30, 'stunfisk-galar'),
      enc(52, 10, 25, 30, 'meowth-galar'),
    ],
    lootTableId: 'butin-foret',
    unlock: { type: 'trainerDefeated', trainerId: 'percy' },
  }),
  zone({
    id: 'antre-dynamax',
    regionId: 'galar',
    order: 2,
    name: 'Antre Dynamax',
    description:
      'Des colonnes d’énergie rouge jaillissent des tanières : des Pokémon Gigamax s’y terrent.',
    habitat: 'cave',
    minPower: 3000,
    affinityTypes: ['dragon', 'steel', 'fighting'],
    encounters: [
      enc(143, 10, 45, 50, 'snorlax-gmax'),
      enc(68, 10, 45, 50, 'machamp-gmax'),
      enc(94, 10, 45, 50, 'gengar-gmax'),
      enc(131, 10, 45, 50, 'lapras-gmax'),
      enc(823, 10, 45, 50, 'corviknight-gmax'),
      enc(834, 10, 45, 50, 'drednaw-gmax'),
      enc(844, 10, 45, 50, 'sandaconda-gmax'),
      enc(12, 8, 45, 50, 'butterfree-gmax'),
      enc(133, 4, 45, 50, 'eevee-gmax'),
      enc(25, 4, 45, 50, 'pikachu-gmax'),
    ],
    lootTableId: 'butin-elite',
    unlock: { type: 'regionDexPercent', regionId: 'galar', percent: 25 },
  }),
  zone({
    id: 'plaine-obsidienne',
    regionId: 'hisui',
    order: 0,
    name: 'Plaine Obsidienne',
    description: 'Les vastes plaines de l’ancienne Hisui, autour du Village Rusti.',
    habitat: 'grassland',
    minPower: 0,
    affinityTypes: ['normal', 'fire', 'electric'],
    encounters: [
      enc(399, 25, 5, 9),
      enc(396, 20, 5, 9),
      enc(234, 15, 8, 12),
      enc(58, 12, 8, 12, 'growlithe-hisui'),
      enc(100, 12, 8, 12, 'voltorb-hisui'),
      enc(570, 8, 10, 14, 'zorua-hisui'),
      enc(215, 8, 10, 14, 'sneasel-hisui'),
      enc(211, 8, 10, 14, 'qwilfish-hisui'),
    ],
    lootTableId: 'butin-route',
    unlock: { type: 'always' },
  }),
  zone({
    id: 'province-sud-paldea',
    regionId: 'paldea',
    order: 0,
    name: 'Province Sud de Paldea',
    description: 'Les collines douces autour de Mesada, où commence la Chasse au Trésor.',
    habitat: 'grassland',
    minPower: 0,
    affinityTypes: ['normal', 'bug', 'electric'],
    encounters: [
      enc(915, 25, 3, 6),
      enc(919, 20, 3, 6),
      enc(921, 20, 3, 6),
      enc(924, 15, 3, 6),
      enc(194, 20, 3, 6, 'wooper-paldea'),
    ],
    lootTableId: 'butin-route',
    unlock: { type: 'always' },
  }),
  zone({
    id: 'lac-salinas',
    regionId: 'paldea',
    order: 1,
    name: 'Lac Salinas',
    description:
      'Les rives du grand lac de Paldea : des Tauros de trois races y galopent, des Nigirigon s’y cachent.',
    habitat: 'waters-edge',
    minPower: 1200,
    affinityTypes: ['water', 'fire', 'fighting'],
    encounters: [
      enc(128, 15, 30, 34, 'tauros-paldea-combat-breed'),
      enc(128, 8, 30, 34, 'tauros-paldea-blaze-breed'),
      enc(128, 8, 30, 34, 'tauros-paldea-aqua-breed'),
      enc(978, 10, 30, 34),
      enc(978, 6, 30, 34, 'tatsugiri-droopy'),
      enc(978, 6, 30, 34, 'tatsugiri-stretchy'),
      enc(194, 20, 28, 32, 'wooper-paldea'),
      enc(963, 15, 28, 32),
    ],
    lootTableId: 'butin-mer',
    unlock: { type: 'trainerDefeated', trainerId: 'katy' },
  }),
];

const trainer = (
  t: Pick<Trainer, 'id' | 'regionId' | 'zoneId' | 'order' | 'name' | 'trainerClass' | 'team'> &
    Partial<Trainer>,
): Trainer => ({
  sprite: null,
  enabled: true,
  durationMinutes: 15,
  rules: noRules(),
  money: 200,
  lootTableId: 'butin-route',
  lootRolls: 1,
  badge: null,
  repeatable: true,
  cooldownMinutes: null,
  koMinutes: null,
  unlock: { type: 'always' },
  ...t,
});

export const expansionTrainers: Trainer[] = [
  trainer({
    id: 'touriste-maya',
    regionId: 'kanto',
    zoneId: 'archipel-lointain',
    order: 29,
    name: 'Maya',
    trainerClass: 'Touriste',
    sprite: `${TRAINER_SPRITES}/lass-gen4.png`,
    team: [
      mon(37, 24, 'vulpix-alola'),
      mon(27, 24, 'sandshrew-alola'),
      mon(52, 26, 'meowth-galar'),
    ],
    durationMinutes: 30,
    money: 900,
    lootTableId: 'butin-mer',
    lootRolls: 2,
    unlock: { type: 'regionDexPercent', regionId: 'kanto', percent: 50 },
  }),
  trainer({
    id: 'montagnard-bruno',
    regionId: 'hoenn',
    zoneId: 'grotte-granite',
    order: 0,
    name: 'Bruno',
    trainerClass: 'Montagnard',
    sprite: `${TRAINER_SPRITES}/hiker-gen3.png`,
    team: [mon(296, 13), mon(304, 14)],
    durationMinutes: 20,
    money: 400,
    lootTableId: 'butin-grotte',
  }),
  trainer({
    id: 'roxanne',
    regionId: 'hoenn',
    zoneId: null,
    order: 1,
    name: 'Roxanne',
    trainerClass: 'Championne d’arène',
    sprite: `${TRAINER_SPRITES}/roxanne.png`,
    team: [mon(74, 15), mon(74, 15), mon(299, 18)],
    durationMinutes: 60,
    money: 2400,
    lootTableId: 'butin-grotte',
    lootRolls: 3,
    badge: { name: 'Badge Rocher', image: null },
    repeatable: false,
    unlock: { type: 'trainerDefeated', trainerId: 'montagnard-bruno' },
  }),
  trainer({
    id: 'pierrick',
    regionId: 'sinnoh',
    zoneId: null,
    order: 0,
    name: 'Pierrick',
    trainerClass: 'Champion d’arène',
    sprite: `${TRAINER_SPRITES}/roark.png`,
    team: [mon(74, 22), mon(95, 23), mon(408, 26)],
    durationMinutes: 60,
    money: 3000,
    lootTableId: 'butin-grotte',
    lootRolls: 3,
    badge: { name: 'Badge Charbon', image: null },
    repeatable: false,
    unlock: { type: 'regionDexPercent', regionId: 'sinnoh', percent: 5 },
  }),
  trainer({
    id: 'gamin-unys',
    regionId: 'unys',
    zoneId: 'route-1-unys',
    order: 0,
    name: 'Kévin',
    trainerClass: 'Gamin',
    sprite: `${TRAINER_SPRITES}/youngster.png`,
    team: [mon(504, 7), mon(506, 8)],
    durationMinutes: 10,
    money: 300,
  }),
  trainer({
    id: 'aloe',
    regionId: 'unys',
    zoneId: null,
    order: 1,
    name: 'Aloé',
    trainerClass: 'Championne d’arène',
    sprite: `${TRAINER_SPRITES}/lenora.png`,
    team: [mon(506, 20), mon(505, 22)],
    durationMinutes: 60,
    money: 3500,
    lootRolls: 3,
    badge: { name: 'Badge Basique', image: null },
    repeatable: false,
    unlock: { type: 'trainerDefeated', trainerId: 'gamin-unys' },
  }),
  trainer({
    id: 'violette',
    regionId: 'kalos',
    zoneId: null,
    order: 0,
    name: 'Violette',
    trainerClass: 'Championne d’arène',
    sprite: `${TRAINER_SPRITES}/viola.png`,
    team: [mon(283, 22), mon(666, 25, 'vivillon-polar')],
    durationMinutes: 60,
    money: 4000,
    lootRolls: 3,
    badge: { name: 'Badge Coléoptère', image: null },
    repeatable: false,
    unlock: { type: 'regionDexPercent', regionId: 'kalos', percent: 5 },
  }),
  trainer({
    id: 'cornelia',
    regionId: 'kalos',
    zoneId: 'tour-maitrise',
    order: 1,
    name: 'Cornélia',
    trainerClass: 'Maîtresse de la Méga-Évolution',
    sprite: `${TRAINER_SPRITES}/korrina.png`,
    team: [mon(68, 46), mon(701, 46), mon(448, 50, 'lucario-mega')],
    durationMinutes: 120,
    money: 15_000,
    lootTableId: 'butin-elite',
    lootRolls: 3,
    badge: { name: 'Badge Lutte', image: null },
    repeatable: false,
    unlock: { type: 'trainerDefeated', trainerId: 'violette' },
  }),
  trainer({
    id: 'ilima',
    regionId: 'alola',
    zoneId: null,
    order: 0,
    name: 'Althéo',
    trainerClass: 'Capitaine',
    sprite: `${TRAINER_SPRITES}/ilima.png`,
    team: [mon(734, 22), mon(20, 24, 'raticate-alola'), mon(235, 24)],
    durationMinutes: 60,
    money: 4500,
    lootRolls: 3,
    badge: { name: 'Tampon de l’Épreuve Normal', image: null },
    repeatable: false,
    unlock: { type: 'regionDexPercent', regionId: 'alola', percent: 5 },
  }),
  trainer({
    id: 'percy',
    regionId: 'galar',
    zoneId: null,
    order: 0,
    name: 'Percy',
    trainerClass: 'Champion d’arène',
    sprite: `${TRAINER_SPRITES}/milo.png`,
    team: [mon(829, 22), mon(830, 25)],
    durationMinutes: 60,
    money: 5000,
    lootRolls: 3,
    badge: { name: 'Badge Plante', image: null },
    repeatable: false,
    unlock: { type: 'regionDexPercent', regionId: 'galar', percent: 5 },
  }),
  trainer({
    id: 'tarak',
    regionId: 'galar',
    zoneId: 'antre-dynamax',
    order: 1,
    name: 'Tarak',
    trainerClass: 'Maître',
    sprite: `${TRAINER_SPRITES}/leon.png`,
    team: [mon(887, 50), mon(612, 50), mon(6, 52, 'charizard-gmax')],
    durationMinutes: 180,
    money: 25_000,
    lootTableId: 'butin-elite',
    lootRolls: 4,
    repeatable: true,
    cooldownMinutes: 24 * 60,
    unlock: { type: 'regionDexPercent', regionId: 'galar', percent: 50 },
  }),
  trainer({
    id: 'nouvel',
    regionId: 'hisui',
    zoneId: 'plaine-obsidienne',
    order: 0,
    name: 'Nouvel',
    trainerClass: 'Membre du Groupe Galaxie',
    sprite: `${TRAINER_SPRITES}/youngster-gen4.png`,
    team: [mon(58, 14, 'growlithe-hisui'), mon(100, 14, 'voltorb-hisui')],
    durationMinutes: 20,
    money: 800,
  }),
  trainer({
    id: 'katy',
    regionId: 'paldea',
    zoneId: null,
    order: 0,
    name: 'Katy',
    trainerClass: 'Championne d’arène',
    sprite: `${TRAINER_SPRITES}/katy.png`,
    team: [mon(917, 14), mon(919, 14), mon(216, 15)],
    durationMinutes: 60,
    money: 5500,
    lootRolls: 3,
    badge: { name: 'Badge Insecte', image: null },
    repeatable: false,
    unlock: { type: 'regionDexPercent', regionId: 'paldea', percent: 5 },
  }),
];

/** Un palier « 50 % » par nouvelle région. */
export const expansionDexMilestones: DexMilestone[] = [johtoRegion, ...expansionRegions].map(
  (region, i) => ({
    id: `${region.id}-50`,
    order: 5 + i,
    name: `Chercheur ${/^[AEIOUY]/.test(region.name) ? 'd’' : 'de '}${region.name}`,
    regionId: region.id,
    shiny: false,
    percent: 50,
    rewards: {
      currency: 10_000 * (i + 1),
      items: [{ itemId: 'ultra-ball', quantity: 10 }],
      expeditionSlots: 0,
      battleSlots: 0,
      daycareSlots: 0,
      bonuses: [],
    },
  }),
);

// --- Objets d'évolution des autres régions --------------------------------------------------

/** Objets d'évolution déjà définis dans le contenu de Kanto. */
const KANTO_EVOLUTION_ITEMS = new Set([
  'moon-stone',
  'water-stone',
  'thunder-stone',
  'fire-stone',
  'leaf-stone',
  'linking-cord',
]);

/** Objets utilisés par les évolutions PokéAPI (pierres, objets tenus…), sauf ceux de Kanto. */
const evolutionItemIds = (() => {
  const ids = new Set<string>();
  const visit = (node: EvolutionNode) => {
    for (const d of node.details) {
      if (d.item) ids.add(d.item);
      if (d.heldItem) ids.add(d.heldItem);
    }
    node.evolvesTo.forEach(visit);
  };
  for (const chain of evolutionChains) visit(chain.chain);
  return [...ids].filter((id) => !KANTO_EVOLUTION_ITEMS.has(id)).sort();
})();

export const expansionItems: Item[] = evolutionItemIds.flatMap((id) => {
  const data = dataItems.find((i) => i.name === id);
  if (!data) return [];
  return [
    {
      id,
      name: data.nameFr,
      description: (data.descriptionFr ?? '').slice(0, 500),
      icon: null,
      category: 'evolution',
      rarity: id.endsWith('-stone') ? 'rare' : 'epic',
      effects: [],
    },
  ];
});

/**
 * Articles de la boutique pour ces objets, cachés jusqu'au déblocage : les pierres dès 60 espèces
 * capturées, les autres objets dès 150.
 */
export const expansionShopEntries: ShopEntry[] = expansionItems.map((item, i) => {
  const stone = item.id.endsWith('-stone');
  return {
    id: item.id,
    itemId: item.id,
    categoryId: 'evolution',
    order: 20 + i,
    price: stone ? 3000 : 6000,
    lotSize: 1,
    unlock: { type: 'speciesCaught', count: stone ? 60 : 150 },
    lockedVisibility: 'hidden',
    purchaseLimit: null,
    availableFrom: null,
    availableUntil: null,
    enabled: true,
  };
});
