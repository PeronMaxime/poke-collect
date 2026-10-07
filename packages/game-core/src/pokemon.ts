import { STAT_NAMES, growthRates, natures } from '@poke/data';
import type { Nature, Species, StatName, Stats } from '@poke/data';
import type { GameContext } from './context';
import type { Rng } from './rng';

/** Pokémon possédé (ou généré), indépendamment de son stockage en base. */
export type Gender = 'male' | 'female' | 'genderless';

export interface PokemonInstance {
  speciesId: number;
  level: number;
  xp: number;
  ivs: Stats;
  nature: string;
  ability: string;
  isShiny: boolean;
  gender: Gender;
  happiness: number;
}

export const MAX_LEVEL = 100;
export const MAX_IV = 31;

// --- Natures et statistiques ---------------------------------------------------

const naturesByName = new Map(natures.map((n) => [n.name, n]));

export function getNature(name: string): Nature | undefined {
  return naturesByName.get(name);
}

/** +10 % / −10 % selon la nature (les PV ne sont jamais affectés). */
export function natureModifier(nature: string, stat: StatName): number {
  const n = naturesByName.get(nature);
  if (!n || n.increasedStat === n.decreasedStat) return 1;
  if (n.increasedStat === stat) return 1.1;
  if (n.decreasedStat === stat) return 0.9;
  return 1;
}

/** Statistiques réelles (formule officielle, sans EV). */
export function computeStats(
  species: Pick<Species, 'baseStats'>,
  { level, ivs, nature }: Pick<PokemonInstance, 'level' | 'ivs' | 'nature'>,
): Stats {
  const stats = {} as Stats;
  for (const stat of STAT_NAMES) {
    const core = Math.floor(((2 * species.baseStats[stat] + ivs[stat]) * level) / 100);
    stats[stat] =
      stat === 'hp' ? core + level + 10 : Math.floor((core + 5) * natureModifier(nature, stat));
  }
  return stats;
}

/** Puissance d'expédition (PE) : somme des statistiques réelles. */
export function expeditionPower(stats: Stats): number {
  return STAT_NAMES.reduce((sum, stat) => sum + stats[stat], 0);
}

export function pokemonPower(
  species: Pick<Species, 'baseStats'>,
  pokemon: Pick<PokemonInstance, 'level' | 'ivs' | 'nature'>,
): number {
  return expeditionPower(computeStats(species, pokemon));
}

// --- Expérience ---------------------------------------------------------------------

const xpTables = new Map(growthRates.map((g) => [g.name, g.experienceByLevel]));

function xpTable(growthRate: string): number[] {
  const table = xpTables.get(growthRate);
  if (!table) throw new Error(`Courbe d'XP inconnue : ${growthRate}`);
  return table;
}

/** XP totale nécessaire pour atteindre `level`. */
export function xpForLevel(growthRate: string, level: number): number {
  const table = xpTable(growthRate);
  return table[Math.min(Math.max(level, 1), table.length) - 1]!;
}

/** Niveau correspondant à une XP totale. */
export function levelForXp(growthRate: string, xp: number): number {
  const table = xpTable(growthRate);
  let level = 1;
  while (level < table.length && table[level]! <= xp) level++;
  return level;
}

// --- Génération ---------------------------------------------------------------------

export function rollIvs(rng: Rng): Stats {
  const ivs = {} as Stats;
  for (const stat of STAT_NAMES) ivs[stat] = rng.int(0, MAX_IV);
  return ivs;
}

export function rollGender(rng: Rng, genderRate: number): Gender {
  if (genderRate < 0) return 'genderless';
  return rng.next() < genderRate / 8 ? 'female' : 'male';
}

export function rollAbility(rng: Rng, species: Species, hiddenChance: number): string {
  const regular = species.abilities.filter((a) => !a.isHidden);
  const hidden = species.abilities.filter((a) => a.isHidden);
  const roll = rng.next();
  if (hidden.length > 0 && (regular.length === 0 || roll < hiddenChance)) {
    return hidden[rng.int(0, hidden.length - 1)]!.name;
  }
  return regular[rng.int(0, regular.length - 1)]?.name ?? 'none';
}

/**
 * Génère un Pokémon (sauvage, starter…). L'ordre des tirages est figé :
 * le changer modifierait les résultats des seeds déjà enregistrés.
 */
export function generatePokemon(
  ctx: GameContext,
  rng: Rng,
  speciesId: number,
  level: number,
  { shinyProbability }: { shinyProbability: number },
): PokemonInstance {
  const species = ctx.species(speciesId);
  if (!species) throw new Error(`Espèce inconnue : ${speciesId}`);
  const isShiny = rng.chance(shinyProbability);
  const ivs = rollIvs(rng);
  const nature = natures[rng.int(0, natures.length - 1)]!.name;
  const ability = rollAbility(rng, species, ctx.balance.capture.hiddenAbilityChance);
  const gender = rollGender(rng, species.genderRate);
  return {
    speciesId,
    level,
    xp: xpForLevel(species.growthRate, level),
    ivs,
    nature,
    ability,
    isShiny,
    gender,
    happiness: species.baseHappiness ?? 0,
  };
}
