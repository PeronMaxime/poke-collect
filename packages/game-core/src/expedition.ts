import { STAT_NAMES } from '@poke/data';
import type { Encounter, ItemStack, LootTable, Zone } from '@poke/content';
import type { GameContext } from './context';
import {
  MAX_IV,
  MAX_LEVEL,
  generatePokemon,
  levelForXp,
  pokemonPower,
  withPerfectIvs,
  xpForLevel,
} from './pokemon';
import type { PokemonInstance } from './pokemon';
import { outOfRegionSpecies } from './progress';
import { NO_BONUSES } from './progression';
import type { PlayerBonuses } from './progression';
import { createRng } from './rng';
import type { Rng } from './rng';
import { chainPerfectIvs, shinyProbability } from './shiny';
import type { ShinyFactors } from './shiny';

// --- Quantités selon la durée ----------------------------------------------------

/** Quantité = taux horaire × (durée en h) ^ exposant : rendements décroissants. */
function scaledCount(ctx: GameContext, durationMinutes: number, perHour: number, min: number) {
  const hours = durationMinutes / 60;
  return Math.max(min, Math.floor(perHour * hours ** ctx.balance.expeditions.durationExponent));
}

export function encounterCount(ctx: GameContext, durationMinutes: number): number {
  const { encountersPerHour, minEncounters } = ctx.balance.expeditions;
  return scaledCount(ctx, durationMinutes, encountersPerHour, minEncounters);
}

export function lootRollCount(ctx: GameContext, durationMinutes: number): number {
  const { lootRollsPerHour, minLootRolls } = ctx.balance.expeditions;
  return scaledCount(ctx, durationMinutes, lootRollsPerHour, minLootRolls);
}

// --- Capture et pitié ----------------------------------------------------------------

export function pityMultiplier(ctx: GameContext, misses: number): number {
  const { weightBonusPerMiss, maxMultiplier } = ctx.balance.pity;
  return Math.min(maxMultiplier, 1 + weightBonusPerMiss * misses);
}

export interface CaptureFactors {
  captureRate: number;
  ballMultiplier: number;
  boostMultiplier?: number;
  /** Nombre de membres de l'équipe en affinité avec la zone. */
  affinityCount?: number;
  /** Bonus permanent du joueur (collections). */
  bonusMultiplier?: number;
}

/**
 * Inspirée de la formule officielle : a = (3 PVmax − 2 PV) / (3 PVmax) × taux × Ball,
 * probabilité ≈ a / 255, puis bonus d'affinité et multiplicateur global.
 */
export function captureProbability(ctx: GameContext, f: CaptureFactors): number {
  const { globalMultiplier, assumedHpFraction, affinityBonusPerPokemon } = ctx.balance.capture;
  const hpFactor = (3 - 2 * assumedHpFraction) / 3;
  const affinity = 1 + affinityBonusPerPokemon * (f.affinityCount ?? 0);
  const a =
    f.captureRate *
    f.ballMultiplier *
    (f.boostMultiplier ?? 1) *
    hpFactor *
    affinity *
    (f.bonusMultiplier ?? 1) *
    globalMultiplier;
  return Math.min(1, Math.max(0, a / 255));
}

/** Rencontres actives de la zone (espèces désactivées exclues), poids ajustés par la pitié. */
export function weightedEncounters(
  ctx: GameContext,
  zone: Zone,
  pity: ReadonlyMap<number, number> = new Map(),
): { value: Encounter; weight: number }[] {
  return zone.encounters
    .filter((e) => ctx.species(e.speciesId)?.enabled)
    .map((e) => ({ value: e, weight: e.weight * pityMultiplier(ctx, pity.get(e.speciesId) ?? 0) }));
}

/** Probabilité d'apparition de chaque espèce (pour l'admin et l'affichage). */
export function encounterProbabilities(
  ctx: GameContext,
  zone: Zone,
  pity?: ReadonlyMap<number, number>,
): { speciesId: number; formId: number | null; probability: number }[] {
  const entries = weightedEncounters(ctx, zone, pity);
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  const byForm = new Map<
    string,
    { speciesId: number; formId: number | null; probability: number }
  >();
  for (const e of entries) {
    const formId = e.value.formId ?? null;
    const key = `${e.value.speciesId}:${formId}`;
    const current = byForm.get(key) ?? { speciesId: e.value.speciesId, formId, probability: 0 };
    current.probability += e.weight / total;
    byForm.set(key, current);
  }
  return [...byForm.values()];
}

// --- Butin ---------------------------------------------------------------------------------

export function addStacks(into: Map<string, number>, stacks: readonly ItemStack[]): void {
  for (const s of stacks) into.set(s.itemId, (into.get(s.itemId) ?? 0) + s.quantity);
}

/** Un tirage : chaque entrée tombe indépendamment selon sa probabilité. */
export function rollLoot(rng: Rng, table: LootTable): ItemStack[] {
  const drops: ItemStack[] = [];
  for (const entry of table.entries) {
    if (rng.chance(entry.chance)) {
      drops.push({ itemId: entry.itemId, quantity: rng.int(entry.min, entry.max) });
    }
  }
  return drops;
}

/**
 * Butin possible d'une expédition (pour l'affichage) : probabilité d'obtenir chaque objet au
 * moins une fois sur l'ensemble des tirages, et quantité par tirage réussi.
 */
export function lootProbabilities(
  ctx: GameContext,
  zone: Zone,
  durationMinutes: number,
): { itemId: string; probability: number; min: number; max: number }[] {
  const table = zone.lootTableId ? ctx.lootTable(zone.lootTableId) : undefined;
  if (!table) return [];
  const rolls = lootRollCount(ctx, durationMinutes);
  return table.entries.map((e) => ({
    itemId: e.itemId,
    probability: 1 - (1 - e.chance) ** rolls,
    min: e.min,
    max: e.max,
  }));
}

// --- Validation de l'équipe -----------------------------------------------------------------

export interface TeamMember extends PokemonInstance {
  id: string;
}

export type ExpeditionError =
  | { code: 'DURATION_NOT_ALLOWED' }
  | { code: 'TEAM_EMPTY' }
  | { code: 'TEAM_TOO_LARGE'; max: number }
  | { code: 'DUPLICATE_MEMBER' }
  /** Espèces hors du Pokédex de la région de la zone. */
  | { code: 'WRONG_REGION'; regionId: string; speciesIds: number[] }
  | { code: 'POWER_TOO_LOW'; power: number; minPower: number }
  | { code: 'MISSING_TYPES'; missing: { type: string; count: number }[] };

export interface TeamCheck {
  power: number;
  affinityCount: number;
  errors: ExpeditionError[];
}

/** Types de chaque membre de l'équipe. */
function memberTypes(
  ctx: GameContext,
  team: readonly Pick<PokemonInstance, 'speciesId' | 'formId'>[],
) {
  return team.map((m) => ctx.species(m.speciesId, m.formId)?.types ?? []);
}

export function teamPower(ctx: GameContext, team: readonly PokemonInstance[]): number {
  return team.reduce((sum, m) => {
    const species = ctx.species(m.speciesId, m.formId);
    return sum + (species ? pokemonPower(species, m) : 0);
  }, 0);
}

export function countAffinity(
  ctx: GameContext,
  zone: Zone,
  team: readonly Pick<PokemonInstance, 'speciesId' | 'formId'>[],
): number {
  const affinity = new Set(zone.affinityTypes);
  return memberTypes(ctx, team).filter((types) => types.some((t) => affinity.has(t))).length;
}

/** Types requis (« 2 Pokémon Eau ») qui manquent encore à l'équipe. */
export function missingTypes(
  ctx: GameContext,
  team: readonly Pick<PokemonInstance, 'speciesId' | 'formId'>[],
  required: readonly { type: string; count: number }[],
): { type: string; count: number }[] {
  const types = memberTypes(ctx, team);
  return required
    .map((r) => ({ type: r.type, count: r.count - types.filter((t) => t.includes(r.type)).length }))
    .filter((r) => r.count > 0);
}

export function checkTeam(
  ctx: GameContext,
  zone: Zone,
  durationMinutes: number,
  team: readonly TeamMember[],
): TeamCheck {
  const errors: ExpeditionError[] = [];
  const { maxTeamSize } = ctx.balance.expeditions;
  if (!zone.durationsMinutes.includes(durationMinutes))
    errors.push({ code: 'DURATION_NOT_ALLOWED' });
  if (team.length === 0) errors.push({ code: 'TEAM_EMPTY' });
  if (team.length > maxTeamSize) errors.push({ code: 'TEAM_TOO_LARGE', max: maxTeamSize });
  if (new Set(team.map((m) => m.id)).size !== team.length)
    errors.push({ code: 'DUPLICATE_MEMBER' });
  const outside = outOfRegionSpecies(ctx, zone.regionId, team);
  if (outside.length > 0)
    errors.push({ code: 'WRONG_REGION', regionId: zone.regionId, speciesIds: outside });

  const power = teamPower(ctx, team);
  if (power < zone.minPower) errors.push({ code: 'POWER_TOO_LOW', power, minPower: zone.minPower });

  const missing = missingTypes(ctx, team, zone.requiredTypes);
  if (missing.length > 0) errors.push({ code: 'MISSING_TYPES', missing });

  return { power, affinityCount: countAffinity(ctx, zone, team), errors };
}

// --- Filtre de capture -------------------------------------------------------------------

/**
 * Pokémon à tenter de capturer ; les autres rencontres sont ignorées (ni Ball ni baie).
 * Les critères se cumulent ; `shiny: 'always'` tente en plus tout shiny, quels que soient
 * les autres critères.
 */
export interface CaptureFilter {
  /** Espèces visées ; vide = toutes. */
  speciesIds: number[];
  /** Nombre minimal d'IV au maximum (31). */
  minPerfectIvs: number;
  shiny: 'any' | 'always' | 'only';
  /**
   * Uniquement les Pokémon pas encore capturés (espèce, ou forme pour une forme régionale,
   * Méga…) ; une fois l'un d'eux capturé, ses rencontres suivantes sont ignorées.
   */
  newOnly?: boolean;
}

/** Captures déjà enregistrées au Pokédex, pour le filtre « nouveaux Pokémon ». */
export interface CaughtDex {
  speciesIds: ReadonlySet<number>;
  formIds: ReadonlySet<number>;
}

export function isNewToDex(
  caught: CaughtDex,
  wild: Pick<PokemonInstance, 'speciesId' | 'formId'>,
): boolean {
  return wild.formId != null
    ? !caught.formIds.has(wild.formId)
    : !caught.speciesIds.has(wild.speciesId);
}

export function perfectIvCount(pokemon: Pick<PokemonInstance, 'ivs'>): number {
  return STAT_NAMES.filter((stat) => pokemon.ivs[stat] === MAX_IV).length;
}

export function matchesCaptureFilter(
  filter: CaptureFilter | null | undefined,
  wild: Pick<PokemonInstance, 'speciesId' | 'formId' | 'isShiny' | 'ivs'>,
  caught?: CaughtDex,
): boolean {
  if (!filter) return true;
  if (filter.shiny === 'always' && wild.isShiny) return true;
  if (filter.shiny === 'only' && !wild.isShiny) return false;
  if (filter.newOnly && caught && !isNewToDex(caught, wild)) return false;
  if (filter.speciesIds.length > 0 && !filter.speciesIds.includes(wild.speciesId)) return false;
  return perfectIvCount(wild) >= filter.minPerfectIvs;
}

// --- Résolution ----------------------------------------------------------------------------

export interface ExpeditionInput {
  zone: Zone;
  durationMinutes: number;
  seed: number;
  team: readonly TeamMember[];
  /** Balls réservées au départ (une par tentative de capture). */
  balls: ItemStack | null;
  /** Baies réservées au départ (une par tentative de capture). */
  berries: ItemStack | null;
  /** Échecs de capture accumulés par espèce. */
  pity: Readonly<Record<number, number>>;
  /** Par défaut, calculée à partir de l'équipe (le simulateur la fixe directement). */
  affinityCount?: number;
  /** Bonus permanents du joueur (paliers, collections) ; aucun par défaut. */
  bonuses?: PlayerBonuses;
  /** Chaîne de zone et Charme Chroma ; aucun multiplicateur par défaut. */
  shiny?: ShinyFactors;
  /** Pokémon à tenter de capturer ; absent = tous. */
  captureFilter?: CaptureFilter | null;
  /** Captures du Pokédex, lues à la réclamation ; requis par le filtre « nouveaux Pokémon ». */
  caught?: CaughtDex;
}

/** `ignored` : écarté par le filtre de capture. */
export type EncounterOutcome = 'captured' | 'escaped' | 'noBall' | 'ignored';

export interface EncounterResult {
  speciesId: number;
  /** Forme rencontrée ; null = forme par défaut. */
  formId: number | null;
  level: number;
  isShiny: boolean;
  outcome: EncounterOutcome;
  captureChance: number;
  /** Présent si capturé. */
  pokemon?: PokemonInstance;
}

/** XP de base que rapporte un Pokémon vaincu (ou rencontré), avant multiplicateur. */
export function defeatXp(species: { baseExperience: number | null }, level: number): number {
  return ((species.baseExperience ?? 50) * level) / 7;
}

export interface TeamMemberResult {
  id: string;
  xpGained: number;
  levelBefore: number;
  levelAfter: number;
  xpAfter: number;
  happinessAfter: number;
}

export interface ExpeditionResult {
  encounters: EncounterResult[];
  loot: ItemStack[];
  team: TeamMemberResult[];
  /** XP gagnée par chaque membre (avant plafonnement au niveau maximal). */
  xpPerMember: number;
  /** Nouveaux compteurs de pitié des espèces concernées. */
  pity: Record<number, number>;
  ballsUsed: number;
  berriesUsed: number;
  /** Probabilité shiny de chaque rencontre (multiplicateurs compris). */
  shinyChance: number;
}

/** XP (plafonnée au niveau maximal) et bonheur (borné entre 0 et 255) gagnés par l'équipe. */
export function applyTeamXp(
  ctx: GameContext,
  team: readonly TeamMember[],
  xp: number,
  happinessDelta: number,
): TeamMemberResult[] {
  return team.map((m) => {
    const growth = ctx.species(m.speciesId, m.formId)?.growthRate;
    const xpCap = growth ? xpForLevel(growth, MAX_LEVEL) : m.xp;
    const xpAfter = Math.max(m.xp, Math.min(m.xp + xp, xpCap));
    return {
      id: m.id,
      xpGained: xpAfter - m.xp,
      levelBefore: m.level,
      levelAfter: growth ? Math.max(m.level, levelForXp(growth, xpAfter)) : m.level,
      xpAfter,
      happinessAfter: Math.min(255, Math.max(0, m.happiness + happinessDelta)),
    };
  });
}

/**
 * Calcule le résultat d'une expédition de façon déterministe (seed + contenu de la version
 * active au départ). Le serveur l'applique ensuite en base ; le client ne fait qu'afficher.
 */
export function resolveExpedition(ctx: GameContext, input: ExpeditionInput): ExpeditionResult {
  const rng = createRng(input.seed);
  const { zone } = input;
  const pity = new Map(Object.entries(input.pity).map(([k, v]) => [Number(k), v]));
  const touched = new Set<number>();
  const affinityCount = input.affinityCount ?? countAffinity(ctx, zone, input.team);
  const ballMultiplier = input.balls
    ? (ctx.itemEffect(input.balls.itemId, 'ball')?.catchMultiplier ?? 1)
    : 0;
  const boostMultiplier = input.berries
    ? (ctx.itemEffect(input.berries.itemId, 'captureBoost')?.multiplier ?? 1)
    : 1;
  let ballsLeft = input.balls?.quantity ?? 0;
  let berriesLeft = input.berries?.quantity ?? 0;
  const shinyChance = shinyProbability(ctx, input.shiny);
  const perfectIvs = chainPerfectIvs(ctx, input.shiny?.chain ?? 0);
  const bonuses = input.bonuses ?? NO_BONUSES;
  // Copie enrichie au fil des captures : un nouveau Pokémon capturé n'est plus visé ensuite.
  const caught = {
    speciesIds: new Set(input.caught?.speciesIds),
    formIds: new Set(input.caught?.formIds),
  };

  const encounters: EncounterResult[] = [];
  let xpPerMember = 0;
  const count = encounterCount(ctx, input.durationMinutes);
  for (let i = 0; i < count; i++) {
    const table = weightedEncounters(ctx, zone, pity);
    if (table.length === 0) break;
    const encounter = rng.weighted(table);
    const species = ctx.species(encounter.speciesId, encounter.formId)!;
    const formId = species.form?.id ?? null;
    const level = rng.int(encounter.minLevel, encounter.maxLevel);
    const wild = generatePokemon(ctx, rng, species.id, level, {
      shinyProbability: shinyChance,
      formId,
    });
    // Aucun tirage en plus sans palier atteint : les seeds sans chaîne restent inchangés.
    if (perfectIvs > 0) wild.ivs = withPerfectIvs(rng, wild.ivs, perfectIvs);
    xpPerMember += Math.floor(defeatXp(species, level) * ctx.balance.xp.multiplier * bonuses.xp);

    if (ballsLeft <= 0 || !matchesCaptureFilter(input.captureFilter, wild, caught)) {
      encounters.push({
        speciesId: species.id,
        formId,
        level,
        isShiny: wild.isShiny,
        outcome: ballsLeft <= 0 ? 'noBall' : 'ignored',
        captureChance: 0,
      });
      continue;
    }
    const useBerry = berriesLeft > 0;
    const captureChance = captureProbability(ctx, {
      captureRate: species.captureRate,
      ballMultiplier,
      boostMultiplier: useBerry ? boostMultiplier : 1,
      affinityCount,
      bonusMultiplier: bonuses.capture,
    });
    ballsLeft--;
    if (useBerry) berriesLeft--;
    const captured = rng.chance(captureChance);
    pity.set(species.id, captured ? 0 : (pity.get(species.id) ?? 0) + 1);
    touched.add(species.id);
    if (captured) {
      caught.speciesIds.add(species.id);
      if (formId != null) caught.formIds.add(formId);
    }
    encounters.push({
      speciesId: species.id,
      formId,
      level,
      isShiny: wild.isShiny,
      outcome: captured ? 'captured' : 'escaped',
      captureChance,
      ...(captured && { pokemon: wild }),
    });
  }

  const lootTotals = new Map<string, number>();
  const lootTable = zone.lootTableId ? ctx.lootTable(zone.lootTableId) : undefined;
  if (lootTable) {
    const rolls = lootRollCount(ctx, input.durationMinutes);
    for (let i = 0; i < rolls; i++) addStacks(lootTotals, rollLoot(rng, lootTable));
  }

  return {
    encounters,
    loot: [...lootTotals].map(([itemId, quantity]) => ({ itemId, quantity })),
    team: applyTeamXp(ctx, input.team, xpPerMember, ctx.balance.xp.happinessPerExpedition),
    xpPerMember,
    pity: Object.fromEntries([...touched].map((id) => [id, pity.get(id) ?? 0])),
    ballsUsed: (input.balls?.quantity ?? 0) - ballsLeft,
    berriesUsed: (input.berries?.quantity ?? 0) - berriesLeft,
    shinyChance,
  };
}
