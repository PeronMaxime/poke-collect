import type {
  ChestEntry,
  ChestRarity,
  GuildObjective,
  GuildQuest,
  Item,
  UnlockCondition,
} from './schemas';

/**
 * Guildes : coffres (objets), lots des coffres et catalogue des quêtes hebdomadaires.
 * Tout reste modifiable ensuite dans le panneau d'admin.
 */

/** Coffres de guilde : invendables, ouverts depuis le sac. */
export const guildChestItems: Item[] = (
  [
    ['bronze', 'Coffre de guilde Bronze', 'uncommon'],
    ['silver', 'Coffre de guilde Argent', 'rare'],
    ['gold', 'Coffre de guilde Or', 'epic'],
  ] as const
).map(([rarity, name, itemRarity]) => ({
  id: `guild-chest-${rarity}`,
  name,
  description: 'Gagné en terminant une quête de guilde. Ouvre-le depuis le sac.',
  icon: null, // sprite maison : apps/api/sprites/items/guild-chest-<rareté>.png
  category: 'chest',
  rarity: itemRarity,
  sellPrice: null,
  effects: [{ type: 'guildChest', rarity }],
}));

const always: UnlockCondition = { type: 'always' };
const kantoDex25: UnlockCondition = { type: 'regionDexPercent', regionId: 'kanto', percent: 25 };
const species60: UnlockCondition = { type: 'speciesCaught', count: 60 };
const KANTO_STONES = ['moon-stone', 'water-stone', 'thunder-stone', 'fire-stone', 'leaf-stone'];
const OTHER_STONES = ['sun-stone', 'dawn-stone', 'dusk-stone', 'shiny-stone', 'ice-stone'];
const MINT_IDS = ['adamant', 'modest', 'jolly', 'timid', 'bold', 'calm'].map((n) => `${n}-mint`);

const lot = (
  rarity: ChestRarity,
  itemId: string,
  lotSize: number,
  weight: number,
  unlock: UnlockCondition = always,
): ChestEntry => ({
  id: `${rarity}-${itemId}${lotSize > 1 ? `-x${lotSize}` : ''}`,
  rarity,
  itemId,
  lotSize,
  weight,
  unlock,
  enabled: true,
});

export const chestEntries: ChestEntry[] = [
  // Bronze : Balls en nombre, un Super Bonbon ou une pierre.
  lot('bronze', 'poke-ball', 100, 30),
  lot('bronze', 'great-ball', 50, 25, { type: 'trainerDefeated', trainerId: 'pierre' }),
  lot('bronze', 'ultra-ball', 20, 10, { type: 'trainerDefeated', trainerId: 'ondine' }),
  lot('bronze', 'rare-candy', 1, 15),
  ...KANTO_STONES.map((id) => lot('bronze', id, 1, 4, kantoDex25)),
  // Argent : de quoi élever et faire évoluer.
  lot('silver', 'great-ball', 50, 20),
  lot('silver', 'ultra-ball', 20, 20, { type: 'trainerDefeated', trainerId: 'ondine' }),
  lot('silver', 'rare-candy', 3, 15),
  ...KANTO_STONES.map((id) => lot('silver', id, 1, 3, kantoDex25)),
  ...OTHER_STONES.map((id) => lot('silver', id, 1, 2, species60)),
  lot('silver', 'destiny-knot', 1, 6, { type: 'eggsHatched', count: 10 }),
  lot('silver', 'bottle-cap', 1, 6, { type: 'trainerDefeated', trainerId: 'olga' }),
  ...MINT_IDS.map((id) => lot('silver', id, 1, 1.5, { type: 'badgeCount', count: 2 })),
  // Or : les objets les plus rares, dont la Master Ball.
  lot('gold', 'ultra-ball', 20, 20),
  lot('gold', 'rare-candy', 5, 20),
  lot('gold', 'master-ball', 1, 5, { type: 'badgeCount', count: 8 }),
  lot('gold', 'destiny-knot', 1, 8, { type: 'eggsHatched', count: 10 }),
  lot('gold', 'bottle-cap', 1, 10, { type: 'trainerDefeated', trainerId: 'olga' }),
  lot('gold', 'gold-bottle-cap', 1, 3, { type: 'trainerDefeated', trainerId: 'maitre-blue' }),
  ...MINT_IDS.map((id) => lot('gold', id, 1, 2, { type: 'badgeCount', count: 2 })),
  ...[...KANTO_STONES, ...OTHER_STONES].map((id) => lot('gold', id, 1, 1, species60)),
];

const quest = (
  id: string,
  rarity: ChestRarity,
  name: string,
  description: string,
  objective: GuildObjective,
  countPerMember: number,
  minCount: number,
): GuildQuest => ({
  id,
  name,
  description,
  rarity,
  objective,
  countPerMember,
  minCount,
  enabled: true,
});

export const guildQuests: GuildQuest[] = [
  quest(
    'captures',
    'bronze',
    'Grande collecte',
    'Capturez des Pokémon, de toutes les espèces.',
    { type: 'catchPokemon', pokemonType: null },
    25,
    50,
  ),
  quest(
    'expeditions',
    'bronze',
    'En route !',
    'Récupérez des expéditions.',
    { type: 'expeditions' },
    8,
    15,
  ),
  quest(
    'eclosions',
    'bronze',
    'Couvée de la semaine',
    'Faites éclore des œufs.',
    { type: 'eggsHatched' },
    3,
    5,
  ),
  quest(
    'captures-normal',
    'bronze',
    'Pokémon du quotidien',
    'Capturez des Pokémon de type Normal.',
    { type: 'catchPokemon', pokemonType: 'normal' },
    8,
    15,
  ),
  quest(
    'combats',
    'silver',
    'Esprit de compétition',
    'Gagnez des combats de dresseurs.',
    { type: 'battlesWon' },
    4,
    8,
  ),
  quest(
    'captures-eau',
    'silver',
    'Pêche miraculeuse',
    'Capturez des Pokémon de type Eau.',
    { type: 'catchPokemon', pokemonType: 'water' },
    10,
    20,
  ),
  quest(
    'captures-plante',
    'silver',
    'Main verte',
    'Capturez des Pokémon de type Plante.',
    { type: 'catchPokemon', pokemonType: 'grass' },
    10,
    20,
  ),
  quest(
    'captures-feu',
    'silver',
    'Feu de camp',
    'Capturez des Pokémon de type Feu.',
    { type: 'catchPokemon', pokemonType: 'fire' },
    6,
    12,
  ),
  quest(
    'argent',
    'silver',
    'Trésor de guerre',
    'Gagnez des Poké Dollars en combat de dresseur et en donjon.',
    { type: 'moneyEarned' },
    3000,
    6000,
  ),
  quest(
    'donjons',
    'gold',
    'Expédition souterraine',
    'Réussissez des donjons.',
    { type: 'dungeonsWon' },
    2,
    4,
  ),
  quest(
    'grande-chasse',
    'gold',
    'Grande chasse',
    'Capturez énormément de Pokémon.',
    { type: 'catchPokemon', pokemonType: null },
    80,
    150,
  ),
  quest(
    'marathon',
    'gold',
    'Marathon',
    'Récupérez un grand nombre d’expéditions.',
    { type: 'expeditions' },
    25,
    50,
  ),
];
