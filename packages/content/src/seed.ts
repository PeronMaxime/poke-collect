import type {
  Collection,
  Region,
  EvolutionMethod,
  EvolutionOverride,
  GameContentData,
  Item,
  ProgressReward,
  LootEntry,
  ShopCategory,
  ShopEntry,
} from './schemas';
import { forms, getSpecies } from '@poke/data';
import type { PokemonForm } from '@poke/data';
import { DEFAULT_GUILD_QUEST_TIERS, suggestedSellPrice } from './schemas';
import {
  expansionItems,
  expansionRegions,
  expansionShopEntries,
  expansionTrainers,
  expansionZones,
} from './seed-expansion';
import { combatSettings, dungeonSettings, megaStoneItems, seedDungeons } from './seed-dungeons';
import { hoennQuests, hoennRegion, hoennTrainers, hoennZones } from './seed-hoenn';
import { johtoQuests, johtoRegion, johtoTrainers, johtoZones } from './seed-johto';
import { kantoQuests, kantoTrainers, kantoZones } from './seed-kanto';
import { withOwnLootTables } from './seed-loot';
import { withSpecialEncounters } from './seed-special-encounters';
import { chestEntries, guildChestItems, guildQuests } from './seed-guilds';

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
  ['lonely', 'Solo'],
  ['naughty', 'Mauvais'],
  ['brave', 'Brave'],
  ['impish', 'Malin'],
  ['lax', 'Lâche'],
  ['relaxed', 'Relax'],
  ['mild', 'Doux'],
  ['rash', 'Foufou'],
  ['quiet', 'Discret'],
  ['gentle', 'Gentil'],
  ['careful', 'Prudent'],
  ['sassy', 'Malpoli'],
  ['hasty', 'Pressé'],
  ['naive', 'Naïf'],
  // Aromate Sérieux : nature neutre, comme les quatre autres (Hardi, Docile, Pudique, Bizarre).
  ['serious', 'Sérieux'],
] as const;

const shopCategories: ShopCategory[] = [
  { id: 'balls', name: 'Balls', icon: null, order: 0 },
  { id: 'baies', name: 'Baies', icon: null, order: 1 },
  { id: 'elevage', name: 'Élevage', icon: null, order: 2 },
  { id: 'evolution', name: 'Évolution', icon: null, order: 3 },
  { id: 'rare', name: 'Rare', icon: null, order: 4 },
  { id: 'soin', name: 'Soins', icon: null, order: 5 },
  { id: 'ferme', name: 'Ferme', icon: null, order: 6 },
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
  gift: null,
  ...extra,
});

/** Une Honor Ball offerte toutes les 10 Poké Balls achetées d'un coup (comme dans les jeux). */
const pokeBallGift = { itemId: 'premier-ball', every: 10, quantity: 1 };

/** Prix : PLAN.md, section 7. Super / Hyper Balls débloquées par les badges Roche et Cascade. */
const shopEntries: ShopEntry[] = [
  article('poke-ball', 'poke-ball', 'balls', 0, 200, { gift: pokeBallGift }),
  article('poke-ball-x10', 'poke-ball', 'balls', 1, 1800, { lotSize: 10, gift: pokeBallGift }),
  article('great-ball', 'great-ball', 'balls', 2, 600, {
    unlock: { type: 'trainerDefeated', trainerId: 'pierre' },
  }),
  article('ultra-ball', 'ultra-ball', 'balls', 3, 1200, {
    unlock: { type: 'trainerDefeated', trainerId: 'ondine' },
  }),
  article('revive', 'revive', 'soin', 0, 2000, {
    unlock: { type: 'badgeCount', count: 4, regionId: 'kanto' },
  }),
  // Parcelle de ferme : débloquée à l'achat, 10 000 ₽ puis × 1,4 à chaque achat ; 17 au plus
  // (ferme de 18 parcelles).
  article('parcelle-ferme', 'parcelle-ferme', 'ferme', 0, 10_000, {
    unlock: { type: 'regionUnlocked', regionId: 'hoenn' },
    lockedVisibility: 'hidden',
    purchaseLimit: { lots: 17, period: 'total' },
  }),
  // Baies : plus vendues, on les trouve en expédition puis on les cultive à la ferme.
  article('razz-berry', 'razz-berry', 'baies', 0, 150, { enabled: false }),
  article('razz-berry-x5', 'razz-berry', 'baies', 1, 600, { lotSize: 5, enabled: false }),
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
  article('ability-capsule', 'ability-capsule', 'rare', 2 + MINTS.length, 30_000, {
    unlock: { type: 'trainerDefeated', trainerId: 'olga' },
  }),
  article('ability-patch', 'ability-patch', 'rare', 3 + MINTS.length, 150_000, {
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
  daycareSlots: 0,
  incubators: 0,
  bonuses: [],
  ...r,
});

/** Région de chaque génération (collections dont l'espèce n'est dans aucun Pokédex régional). */
const GENERATION_REGIONS = [
  'kanto',
  'johto',
  'hoenn',
  'sinnoh',
  'unys',
  'kalos',
  'alola',
  'galar',
  'paldea',
];

/** « A », « A et B », « A, B et C ». */
const frenchList = (names: string[]) =>
  names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} et ${names.at(-1)}`;

const slugify = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * Collections des formes naturelles (variantes d'apparence et variétés : Zarbi, Prismillon,
 * Motisma…) : une par lignée, avec ses espèces (forme par défaut) et toutes leurs formes, même
 * celles qu'on ne peut pas encore obtenir. Région : la première dont le Pokédex contient l'espèce
 * de base, sinon celle de sa génération ; ordre : 100 × ordre de la région + rang dans la région.
 * Uniquement de petits bonus permanents, de 1 à 3 % selon la taille.
 */
function naturalFormCollections(regions: Region[]): Collection[] {
  const sorted = [...regions].sort((a, b) => a.order - b.order);
  const lines = new Map<number, PokemonForm[]>();
  for (const form of forms) {
    if (form.kind !== 'cosmetic' && form.kind !== 'alternate') continue;
    const chain = getSpecies(form.speciesId)!.evolutionChainId;
    lines.set(chain, [...(lines.get(chain) ?? []), form]);
  }
  const groups = [...lines.values()]
    .map((lineForms) => {
      const speciesIds = [...new Set(lineForms.map((f) => f.speciesId))].sort((a, b) => a - b);
      const base = getSpecies(speciesIds[0]!)!;
      const region =
        sorted.find((r) => r.speciesIds.includes(base.id)) ??
        sorted.find((r) => r.id === GENERATION_REGIONS[base.generation - 1])!;
      return { speciesIds, formIds: lineForms.map((f) => f.id), region };
    })
    .sort((a, b) => a.region.order - b.region.order || a.speciesIds[0]! - b.speciesIds[0]!);

  const rank = new Map<string, number>();
  return groups.map(({ speciesIds, formIds, region }, i): Collection => {
    const names = speciesIds.map((id) => getSpecies(id)!.nameFr);
    const total = speciesIds.length + formIds.length;
    const index = rank.get(region.id) ?? 0;
    rank.set(region.id, index + 1);
    const type = (['capture', 'money', 'xp'] as const)[i % 3]!;
    return {
      id: `formes-${slugify(names[0]!)}`,
      order: region.order * 100 + index,
      name: `Formes ${/^[aeiouyéèê]/i.test(names[0]!) ? 'd’' : 'de '}${frenchList(names)}`,
      description: `${total} formes à capturer, ${
        names.length > 1 ? 'formes par défaut comprises' : 'forme par défaut comprise'
      }.`,
      speciesIds,
      rewards: reward({ bonuses: [{ type, percent: total <= 4 ? 1 : total <= 15 ? 2 : 3 }] }),
      regionId: region.id,
      formIds,
    };
  });
}

const regions: Region[] = [
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
  hoennRegion,
  ...expansionRegions,
];

export const seedContent: GameContentData = withOwnLootTables({
  balance: {
    expeditions: {
      initialSlots: 2,
      maxSlots: 9,
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
      chainPerfectIvThresholds: [5, 10, 15, 20],
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
    daycare: { initialSlots: 1 },
    museum: { slots: 2 },
    center: { slots: 6, healMinutes: 30 },
    battles: {
      maxTeamSize: 6,
      defaultTrainerIv: 15,
      cooldownMinutes: 240,
      xpMultiplier: 1,
      happinessOnWin: 3,
      happinessOnLoss: -2,
    },
    combat: combatSettings,
    dungeons: dungeonSettings,
    evolution: { tradeItemId: 'linking-cord', dayStartHour: 6, nightStartHour: 20 },
    newPlayer: {
      starterLevel: 5,
      startingCurrency: 0,
      startingInventory: [{ itemId: 'poke-ball', quantity: 20 }],
    },
    guilds: {
      creationCost: 100_000,
      maxMembers: 30,
      rejoinCooldownHours: 24,
      quests: DEFAULT_GUILD_QUEST_TIERS,
      chestRolls: { bronze: 1, silver: 2, gold: 3 },
    },
    // Emplacements d'expédition et pensions en plus au fil du Pokédex de Kanto.
    facilityUnlocks: {
      expedition: [10, 50, 100].map((percent) => ({
        amount: 1,
        unlock: { type: 'regionDexPercent' as const, regionId: 'kanto', percent },
      })),
      daycare: [25, 75, 100].map((percent) => ({
        amount: 1,
        unlock: { type: 'regionDexPercent' as const, regionId: 'kanto', percent },
      })),
      incubator: [],
      museum: [],
      farm: [],
      center: [],
    },
    tabUnlocks: {
      daycare: { type: 'badgeCount', count: 2, regionId: 'kanto' },
      museum: { type: 'badgeCount', count: 3, regionId: 'kanto' },
      quests: { type: 'trainerDefeated', trainerId: 'maitre-blue' },
      dungeons: { type: 'badgeCount', count: 1, regionId: 'kalos' },
      farm: { type: 'regionUnlocked', regionId: 'hoenn' },
    },
    // Une couveuse par région entièrement complétée, +1 % de chromatique par expédition
    // complétée en chromatique.
    expeditionCompletions: [
      {
        id: 'region-complete',
        name: 'Région complétée',
        scope: 'region',
        regionId: null,
        zoneId: null,
        shiny: false,
        rewards: {
          currency: 0,
          items: [],
          expeditionSlots: 0,
          daycareSlots: 0,
          incubators: 1,
          bonuses: [],
        },
      },
      {
        id: 'expedition-chromatique',
        name: 'Expédition chromatique',
        scope: 'zone',
        regionId: null,
        zoneId: null,
        shiny: true,
        rewards: {
          currency: 0,
          items: [],
          expeditionSlots: 0,
          daycareSlots: 0,
          incubators: 0,
          bonuses: [{ type: 'shiny', percent: 1 }],
        },
      },
    ],
  },
  regions,
  speciesOverrides: [],
  abilities: [],
  items: withSellPrices([
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
      id: 'premier-ball',
      name: 'Honor Ball',
      description: 'Une Ball commémorative, offerte pour l’achat de 10 Poké Balls d’un coup.',
      icon: null,
      category: 'ball',
      rarity: 'uncommon',
      effects: [{ type: 'ball', catchMultiplier: 1 }],
    },
    // Pas encore obtenable : ni boutique ni butin.
    {
      id: 'master-ball',
      name: 'Master Ball',
      description: 'La meilleure Ball : elle capture à coup sûr.',
      icon: null,
      category: 'ball',
      rarity: 'legendary',
      effects: [{ type: 'ball', catchMultiplier: 255, guaranteed: true }],
    },
    // Pas encore obtenable : ni boutique ni butin.
    {
      id: 'rare-candy',
      name: 'Super Bonbon',
      description: 'Donné à un Pokémon : il monte d’un niveau.',
      icon: null,
      category: 'misc',
      rarity: 'rare',
      effects: [{ type: 'levelUp', levels: 1 }],
    },
    {
      id: 'razz-berry',
      name: 'Baie Framby',
      description: 'Donnée au Pokémon sauvage avant le lancer : capture plus facile.',
      icon: null,
      category: 'berry',
      rarity: 'common',
      effects: [
        { type: 'captureBoost', multiplier: 1.5 },
        { type: 'berryPlant', minutes: 60, minYield: 1, maxYield: 3 },
      ],
    },
    {
      id: 'sitrus-berry',
      name: 'Baie Sitrus',
      description: 'Donnée en combat au Pokémon actif : lui rend un quart de ses PV.',
      icon: null,
      category: 'berry',
      rarity: 'uncommon',
      effects: [
        { type: 'battleHeal', fraction: 0.25, cooldownSeconds: 10 },
        { type: 'berryPlant', minutes: 60, minYield: 1, maxYield: 3 },
      ],
    },
    {
      id: 'pomeg-berry',
      name: 'Baie Grena',
      description: 'Donnée à un Pokémon : son bonheur augmente un peu.',
      icon: null,
      category: 'berry',
      rarity: 'uncommon',
      effects: [
        { type: 'happiness', amount: 1 },
        { type: 'berryPlant', minutes: 60, minYield: 1, maxYield: 3 },
      ],
    },
    {
      id: 'nanab-berry',
      name: 'Baie Nanana',
      description: 'Emportée en expédition : plus de rencontres. Une baie par heure d’expédition.',
      icon: null,
      category: 'berry',
      rarity: 'uncommon',
      effects: [
        { type: 'encounterBoost', multiplier: 1.25 },
        { type: 'berryPlant', minutes: 60, minYield: 1, maxYield: 3 },
      ],
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
        'Il suffit de l’avoir dans son sac : les Pokémon chromatiques apparaissent 3 fois plus souvent.',
      icon: null,
      category: 'endgame',
      rarity: 'legendary',
      effects: [{ type: 'shinyCharm', multiplier: 3 }],
    },
    {
      id: 'revive',
      name: 'Rappel',
      description: 'Ranime aussitôt un Pokémon K.O., sans passer par le Centre Pokémon.',
      icon: null,
      category: 'misc',
      rarity: 'uncommon',
      effects: [{ type: 'revive' }],
    },
    ...endgameItems(),
    ...fossilItems(),
    ...megaStoneItems(regions),
    ...expansionItems,
  ]).concat(guildChestItems, [
    {
      id: 'parcelle-ferme',
      name: 'Parcelle de ferme',
      description:
        'Agrandit aussitôt la ferme à baies d’une parcelle. Son prix augmente à chaque achat.',
      icon: '/api/sprites/items/growth-mulch.png',
      category: 'misc',
      rarity: 'rare',
      // Jamais dans le sac : débloquée à l'achat.
      sellPrice: null,
      effects: [{ type: 'farmPlot', priceGrowth: 1.4 }],
    },
  ]),
  lootTables: [
    {
      id: 'butin-route',
      name: 'Butin de route',
      entries: [
        loot('poke-ball', 0.7, 1, 3),
        loot('razz-berry', 0.02),
        loot('great-ball', 0.05),
        loot('nanab-berry', 0.015),
      ],
    },
    {
      id: 'butin-foret',
      name: 'Butin de forêt',
      entries: [
        loot('poke-ball', 0.7, 1, 3),
        loot('razz-berry', 0.02),
        loot('great-ball', 0.1),
        loot('everstone', 0.02),
        loot('pomeg-berry', 0.015),
        loot('sitrus-berry', 0.01),
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
        loot('sitrus-berry', 0.015),
        loot('nanab-berry', 0.01),
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
  zones: withSpecialEncounters([...kantoZones, ...johtoZones, ...hoennZones, ...expansionZones]),
  trainers: [...kantoTrainers, ...johtoTrainers, ...hoennTrainers, ...expansionTrainers],
  dungeons: seedDungeons(regions),
  shopCategories,
  shopEntries: [...shopEntries, ...expansionShopEntries],
  evolutionOverrides,
  collections: naturalFormCollections(regions),
  quests: [...kantoQuests, ...johtoQuests, ...hoennQuests],
  guildQuests,
  chestEntries,
});

function caveLoot(): LootEntry[] {
  return [
    loot('poke-ball', 0.6, 1, 3),
    loot('great-ball', 0.2, 1, 2),
    loot('moon-stone', 0.03),
    loot('everstone', 0.04),
  ];
}

/** Objet du seed : le prix de revente découle de la boutique (voir `withSellPrices`). */
type SeedItem = Omit<Item, 'sellPrice'>;

/** Prix de revente : la moitié du prix boutique, sinon selon la rareté. */
function withSellPrices(items: SeedItem[]): Item[] {
  const entries = [...shopEntries, ...expansionShopEntries];
  return items.map((item) => ({ ...item, sellPrice: suggestedSellPrice(item, entries) }));
}

/** Fossiles : trouvés en expédition, restaurés au Musée (un Pokémon après quelques heures). */
function fossilItems(): SeedItem[] {
  const fossil = (
    id: string,
    name: string,
    speciesId: number,
    pokemonName: string,
    minutes: number,
    rarity: Item['rarity'],
  ): SeedItem => ({
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
function endgameItems(): SeedItem[] {
  const item = (
    id: string,
    name: string,
    description: string,
    rarity: Item['rarity'],
    effects: Item['effects'],
  ): SeedItem => ({ id, name, description, icon: null, category: 'endgame', rarity, effects });
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
      'Utilisée sur un Pokémon : il obtient un talent normal au hasard, ou passe à l’autre s’il en a déjà un.',
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
