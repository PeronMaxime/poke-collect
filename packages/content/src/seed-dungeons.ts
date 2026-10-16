import { directLineage, forms, getSpecies } from '@poke/data';
import type {
  Dungeon,
  DungeonDifficulty,
  DungeonSettings,
  Item,
  Region,
  TrainerPokemon,
} from './schemas';

/**
 * Donjons du contenu de test : un par Méga-Évolution d'une espèce des régions, avec sa
 * Méga-Gemme. Les adversaires sont tirés de la lignée directe du boss (plusieurs fois la même
 * espèce si elle est seule dans sa lignée), de niveau croissant jusqu'au boss, dont le niveau
 * dépend de la difficulté (légendaire, starter, espèce évoluée ou seule dans sa lignée).
 */

/** Attaque de chaque type en donjon (même puissance pour tous au départ). */
export const dungeonSettings: DungeonSettings = {
  maxTeamSize: 6,
  baseAttackIntervalMs: 2000,
  referenceSpeed: 150,
  minAttackIntervalMs: 500,
  maxAttackIntervalMs: 3000,
  damageMultiplier: 0.5,
  stabMultiplier: 1.5,
  minDamageRoll: 0.85,
  defaultOpponentIv: 15,
  difficulties: {
    easy: { name: 'Facile' },
    hard: { name: 'Difficile' },
    veryHard: { name: 'Très difficile' },
    extreme: { name: 'Extrême' },
  },
  cooldownMinutes: 60,
  koMinutes: 30,
  xpMultiplier: 1,
  happinessOnWin: 3,
  happinessOnLoss: -2,
  enemyAbilities: false,
  attacks: {
    normal: { name: 'Plaquage', power: 80 },
    fire: { name: 'Lance-Flammes', power: 80 },
    water: { name: 'Surf', power: 80 },
    grass: { name: 'Éco-Sphère', power: 80 },
    electric: { name: 'Tonnerre', power: 80 },
    ice: { name: 'Laser Glace', power: 80 },
    fighting: { name: 'Casse-Brique', power: 80 },
    poison: { name: 'Bomb-Beurk', power: 80 },
    ground: { name: 'Séisme', power: 80 },
    flying: { name: 'Lame d’Air', power: 80 },
    psychic: { name: 'Psyko', power: 80 },
    bug: { name: 'Plaie-Croix', power: 80 },
    rock: { name: 'Éboulement', power: 80 },
    ghost: { name: 'Ball’Ombre', power: 80 },
    dragon: { name: 'Dracogriffe', power: 80 },
    dark: { name: 'Mâchouille', power: 80 },
    steel: { name: 'Luminocanon', power: 80 },
    fairy: { name: 'Pouvoir Lunaire', power: 80 },
  },
};

/** Méga-Gemme de chaque Méga-Évolution (nom PokéAPI de la forme → objet). */
const MEGA_STONES: Record<string, [id: string, name: string]> = {
  'venusaur-mega': ['venusaurite', 'Florizarrite'],
  'charizard-mega-x': ['charizardite-x', 'Dracaufite X'],
  'charizard-mega-y': ['charizardite-y', 'Dracaufite Y'],
  'blastoise-mega': ['blastoisinite', 'Tortankite'],
  'beedrill-mega': ['beedrillite', 'Dardargnite'],
  'pidgeot-mega': ['pidgeotite', 'Roucarnagite'],
  'raichu-mega-x': ['raichunite-x', 'Raichunite X'],
  'raichu-mega-y': ['raichunite-y', 'Raichunite Y'],
  'clefable-mega': ['clefablite', 'Mélodelfite'],
  'alakazam-mega': ['alakazite', 'Alakazamite'],
  'victreebel-mega': ['victreebelite', 'Empiflorite'],
  'slowbro-mega': ['slowbronite', 'Flagadossite'],
  'gengar-mega': ['gengarite', 'Ectoplasmite'],
  'kangaskhan-mega': ['kangaskhanite', 'Kangourexite'],
  'starmie-mega': ['starminite', 'Starossite'],
  'pinsir-mega': ['pinsirite', 'Scarabruite'],
  'gyarados-mega': ['gyaradosite', 'Léviatorite'],
  'aerodactyl-mega': ['aerodactylite', 'Ptéraïte'],
  'dragonite-mega': ['dragoninite', 'Dracolossite'],
  'mewtwo-mega-x': ['mewtwonite-x', 'Mewtwoïte X'],
  'mewtwo-mega-y': ['mewtwonite-y', 'Mewtwoïte Y'],
  'meganium-mega': ['meganiumite', 'Méganiumite'],
  'feraligatr-mega': ['feraligite', 'Aligatueurite'],
  'ampharos-mega': ['ampharosite', 'Pharampite'],
  'steelix-mega': ['steelixite', 'Steelixite'],
  'scizor-mega': ['scizorite', 'Cizayoxite'],
  'heracross-mega': ['heracronite', 'Scarhinoïte'],
  'skarmory-mega': ['skarmorite', 'Airmurite'],
  'houndoom-mega': ['houndoominite', 'Démolossite'],
  'tyranitar-mega': ['tyranitarite', 'Tyranocivite'],
  'sceptile-mega': ['sceptilite', 'Jungkite'],
  'blaziken-mega': ['blazikenite', 'Braségalite'],
  'swampert-mega': ['swampertite', 'Laggronite'],
  'gardevoir-mega': ['gardevoirite', 'Gardevoirite'],
  'sableye-mega': ['sablenite', 'Ténéfixite'],
  'mawile-mega': ['mawilite', 'Mysdibulite'],
  'aggron-mega': ['aggronite', 'Galekingite'],
  'medicham-mega': ['medichamite', 'Charminite'],
  'manectric-mega': ['manectite', 'Élecsprintite'],
  'sharpedo-mega': ['sharpedonite', 'Sharpedite'],
  'camerupt-mega': ['cameruptite', 'Caméruptite'],
  'altaria-mega': ['altarianite', 'Altarite'],
  'banette-mega': ['banettite', 'Branettite'],
  'chimecho-mega': ['chimechite', 'Éokite'],
  'absol-mega': ['absolite', 'Absolite'],
  'absol-mega-z': ['absolite-z', 'Absolite Z'],
  'glalie-mega': ['glalitite', 'Oniglalite'],
  'salamence-mega': ['salamencite', 'Drattakite'],
  'metagross-mega': ['metagrossite', 'Métalossite'],
  'latias-mega': ['latiasite', 'Latiasite'],
  'latios-mega': ['latiosite', 'Latiosite'],
  // Méga-Rayquaza n'a pas de gemme dans les jeux : un fragment de météorite en tient lieu.
  'rayquaza-mega': ['meteorite-shard', 'Fragment de Météorite'],
  'staraptor-mega': ['staraptite', 'Étouraptorite'],
  'lopunny-mega': ['lopunnite', 'Lockpinite'],
  'garchomp-mega': ['garchompite', 'Carchacrokite'],
  'garchomp-mega-z': ['garchompite-z', 'Carchacrokite Z'],
  'lucario-mega': ['lucarionite', 'Lucarite'],
  'lucario-mega-z': ['lucarionite-z', 'Lucarite Z'],
  'abomasnow-mega': ['abomasite', 'Blizzarite'],
  'gallade-mega': ['galladite', 'Gallamite'],
  'froslass-mega': ['froslassite', 'Momartikite'],
  'heatran-mega': ['heatranite', 'Heatranite'],
  'darkrai-mega': ['darkranite', 'Darkraïte'],
};

/**
 * Selon la difficulté : niveau et IV du boss et des adversaires, nombre d'adversaires avant lui,
 * PV du boss et temps imparti (les donjons extrêmes, de niveau 95, restent ainsi à la portée d'une équipe de niveau 100).
 */
const DIFFICULTY_SETUP: Record<
  DungeonDifficulty,
  {
    bossLevel: number;
    iv: number;
    opponents: number;
    bossHpMultiplier: number;
    timeLimitSeconds: number;
  }
> = {
  easy: { bossLevel: 50, iv: 10, opponents: 5, bossHpMultiplier: 1.5, timeLimitSeconds: 180 },
  hard: { bossLevel: 65, iv: 18, opponents: 5, bossHpMultiplier: 1.5, timeLimitSeconds: 180 },
  veryHard: { bossLevel: 80, iv: 25, opponents: 5, bossHpMultiplier: 1.5, timeLimitSeconds: 240 },
  extreme: { bossLevel: 95, iv: 31, opponents: 4, bossHpMultiplier: 1.25, timeLimitSeconds: 300 },
};
/** Premières espèces des lignées de starters (les régions sans starters configurés en dépendent). */
const STARTERS = [1, 4, 7, 152, 155, 158, 252, 255, 258, 387, 390, 393];
const GEM_CHANCE = 0.1;

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Méga-Évolutions des espèces d'une région (la première région qui contient l'espèce). */
function megasByRegion(regions: readonly Region[]) {
  const sorted = [...regions].sort((a, b) => a.order - b.order);
  return forms
    .filter((f) => f.kind === 'mega' && MEGA_STONES[f.name])
    .flatMap((form) => {
      const region = sorted.find((r) => r.speciesIds.includes(form.speciesId));
      return region ? [{ form, region }] : [];
    })
    .sort((a, b) => a.form.speciesId - b.form.speciesId || a.form.id - b.form.id);
}

/**
 * Difficulté d'un donjon : extrême pour un légendaire ou un mythique, très difficile pour un
 * starter, difficile pour une espèce évoluée, facile pour une espèce seule dans sa lignée.
 */
export function dungeonDifficultyOf(
  speciesId: number,
  starterSpeciesIds: readonly number[] = [],
): DungeonDifficulty {
  const species = getSpecies(speciesId)!;
  const lineage = directLineage(speciesId);
  const starters = new Set([...STARTERS, ...starterSpeciesIds]);
  if (species.isLegendary || species.isMythical) return 'extreme';
  if (lineage.some((id) => starters.has(id))) return 'veryHard';
  if (lineage.length > 1) return 'hard';
  return 'easy';
}

/** Méga-Gemmes : laissées par le boss d'un donjon, elles permettent la Méga-Évolution au PC. */
export function megaStoneItems(regions: readonly Region[]): Omit<Item, 'sellPrice'>[] {
  return megasByRegion(regions).map(({ form }) => {
    const [id, name] = MEGA_STONES[form.name]!;
    return {
      id,
      name,
      description: `Une Méga-Gemme, laissée par ${form.nameFr} au fond de son donjon.`,
      icon: null,
      category: 'megaStone',
      rarity: 'legendary',
      effects: [{ type: 'megaEvolution', formId: form.id }],
    };
  });
}

/** Un donjon par Méga-Évolution : la lignée du boss, de niveau croissant, puis le boss. */
export function seedDungeons(regions: readonly Region[]): Dungeon[] {
  const order = new Map<string, number>();
  return megasByRegion(regions).map(({ form, region }) => {
    const species = getSpecies(form.speciesId)!;
    const lineage = directLineage(species.id);
    const difficulty = dungeonDifficultyOf(species.id, region.starterSpeciesIds);
    const setup = DIFFICULTY_SETUP[difficulty];
    const { bossLevel, iv } = setup;
    const count = setup.opponents;
    const opponents: TrainerPokemon[] = Array.from({ length: count }, (_, i) => ({
      speciesId: lineage[Math.floor((i * lineage.length) / count)]!,
      formId: null,
      level: Math.round(bossLevel - 15 + (12 * i) / (count - 1)),
      iv,
      nature: null,
    }));
    const index = order.get(region.id) ?? 0;
    order.set(region.id, index + 1);
    return {
      id: slug(form.nameFr),
      regionId: region.id,
      order: index,
      name: form.nameFr,
      description: `Affronte la lignée de ${species.nameFr} jusqu’à ${form.nameFr}.`,
      difficulty,
      boss: { speciesId: species.id, formId: form.id, level: bossLevel, iv, nature: null },
      bossHpMultiplier: setup.bossHpMultiplier,
      familySpeciesIds: lineage,
      opponents,
      timeLimitSeconds: setup.timeLimitSeconds,
      cooldownMinutes: null,
      koMinutes: null,
      money: bossLevel * 100,
      lootTableId: null,
      lootRolls: 0,
      gemItemId: MEGA_STONES[form.name]![0],
      gemChance: GEM_CHANCE,
      enabled: true,
      unlock: { type: 'always' },
    };
  });
}
