import type { ItemStack, QuestPokemon, SpecialEncounter, Weather, Zone } from '@poke/content';
import type { GameContext } from '../context';
import { MAX_LEVEL, generatePokemon, withPerfectIvs } from '../pokemon';
import type { PokemonInstance } from '../pokemon';
import { NO_BONUSES } from '../progression';
import type { PlayerBonuses } from '../progression';
import {
  abilityBonuses,
  abilityHappiness,
  abilityModifier,
  abilityMultiplier,
  applyWildAbilities,
  attractedTypes,
  resolveWeather,
} from '../abilities';
import type { AbilityEnv } from '../abilities';
import { generateQuestPokemon } from '../quest';
import { roamerEncounterChance } from '../roaming';
import { createRng } from '../rng';
import type { Rng } from '../rng';
import { chainPerfectIvs, shinyProbability } from '../shiny';
import type { ShinyFactors } from '../shiny';
import { ballCategory, planThrows } from './balls';
import type { BallPlan, ChooseThrow } from './balls';
import { EPSILON, encounterClock, encounterTime, encountersAfter } from './cadence';
import { captureProbability, specialEncountersFor, weightedEncounters } from './capture';
import { berriesConsumed } from './clock';
import { matchesCaptureFilter } from './filter';
import type { CaptureFilter, CaughtDex } from './filter';
import { addStacks, rollLoot } from './loot';
import { countAffinity, expeditionEnv, expeditionPlan } from './team';
import type { TeamMember } from './team';
import { applyTeamXp, defeatXp } from './xp';
import type { TeamMemberResult } from './xp';

/**
 * Déroulement d'une expédition, rencontre après rencontre.
 */

/** Lancers des anciennes expéditions : Balls réservées au départ et filtre de capture. */
function reservedThrows(
  balls: ItemStack | null | undefined,
  filter: CaptureFilter | null | undefined,
): ChooseThrow {
  let left = balls?.quantity ?? 0;
  return ({ wild, ordinary, caught }) => {
    if (!balls || left <= 0) return { outcome: 'noBall' };
    if (ordinary && !matchesCaptureFilter(filter, wild, caught)) return { outcome: 'ignored' };
    left--;
    return { ballItemId: balls.itemId };
  };
}

/** Suite de tirages du butin, distincte de celle des rencontres. */
const LOOT_SEED_MASK = 0x5bd1e995;

export interface ExpeditionInput {
  zone: Zone;
  /** Temps écoulé entre le départ et l'arrêt de l'expédition. */
  elapsedMinutes: number;
  seed: number;
  team: readonly TeamMember[];
  /**
   * Ball à lancer selon la catégorie du Pokémon rencontré. Les Balls sont retirées du sac au fil
   * de l'expédition (voir `throws`).
   */
  ballPlan?: BallPlan | null;
  /**
   * Journal des lancers (voir `THROW_CODES`), qui fait foi pour le plan de Balls ; absent = stock
   * illimité (simulateur).
   */
  throws?: string;
  /** Anciennes expéditions : Balls réservées au départ (une par tentative de capture). */
  balls?: ItemStack | null;
  /** Baies de capture : la capture est facilitée le temps de leur effet, depuis le départ. */
  berries: ItemStack | null;
  /** Baies de rencontres : les rencontres s'accélèrent le temps de leur effet, depuis le départ. */
  encounterBerries?: ItemStack | null;
  /**
   * Allongement de l'intervalle entre deux rencontres par heure passée, figé au départ (0 pour
   * les anciennes expéditions) ; par défaut, le réglage du contenu.
   */
  intervalGrowthMinutes?: number;
  /** Échecs de capture accumulés par espèce. */
  pity: Readonly<Record<number, number>>;
  /** Par défaut, calculée à partir de l'équipe (le simulateur la fixe directement). */
  affinityCount?: number;
  /** Bonus permanents du joueur (paliers, collections) ; aucun par défaut. */
  bonuses?: PlayerBonuses;
  /** Chaîne de zone et Charme Chroma ; aucun multiplicateur par défaut. */
  shiny?: ShinyFactors;
  /** Anciennes expéditions : Pokémon à tenter de capturer ; absent = tous. */
  captureFilter?: CaptureFilter | null;
  /**
   * Captures du Pokédex, figées au départ : décident de la catégorie (nouveau ou déjà capturé) et
   * du filtre « nouveaux Pokémon ».
   */
  caught?: CaughtDex;
  /** Heure locale du joueur au départ (talents de jour ou de nuit). */
  hour?: number | null;
  /** Météo de la zone au départ (voir `zoneWeather`) ; absente = temps clair. */
  weather?: Weather | null;
  /**
   * Fuyards présents dans la zone au départ (voir `roamerPositions`) : chaque rencontre a
   * `target.roaming` % de chances d'être l'un d'eux, croisé une fois au plus.
   */
  roamers?: readonly ExpeditionRoamer[];
}

/** Fuyard emporté par une expédition. */
export interface ExpeditionRoamer {
  questId: string;
  target: QuestPokemon;
}

/** `ignored` : écarté par le filtre de capture. */
/** `fled` : le joueur a pris la fuite (expédition légendaire). */
export type EncounterOutcome = 'captured' | 'escaped' | 'noBall' | 'ignored' | 'fled';

export interface EncounterResult {
  speciesId: number;
  /** Forme rencontrée ; null = forme par défaut. */
  formId: number | null;
  level: number;
  isShiny: boolean;
  outcome: EncounterOutcome;
  captureChance: number;
  /** Ball lancée (absent sans lancer). */
  ballItemId?: string;
  /** Présent si capturé. */
  pokemon?: PokemonInstance;
  /** Fuyard de cette quête (absent pour une rencontre ordinaire). */
  questId?: string;
  /** Rencontre spéciale, ouverte par un Pokémon de l'équipe. */
  special?: true;
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
  /** Baies de capture entamées. */
  berriesUsed: number;
  /** Baies de rencontres entamées (absent des expéditions anciennes). */
  encounterBerriesUsed?: number;
  /** Probabilité shiny de chaque rencontre (multiplicateurs compris). */
  shinyChance: number;
  /**
   * Tirages de butin de l'expédition, table de butin ou non (chances d'objet de quête) ; absent
   * des résultats anciens.
   */
  lootRolls?: number;
  /**
   * Météo de l'expédition : celle qu'impose un talent de l'équipe, sinon celle de la zone au
   * départ (conditions de météo des quêtes) ; null = temps clair, absent des résultats anciens.
   */
  weather?: Weather | null;
}

/** Expédition jouée rencontre par rencontre (voir `createExpeditionRun`). */
export interface ExpeditionRun {
  /** Moment de la n-ième rencontre (à partir de 1), en minutes depuis le départ. */
  encounterMinutes(n: number): number;
  /** Rencontres survenues après `minutes`. */
  encountersAfter(minutes: number): number;
  /** Rencontres déjà jouées. */
  readonly played: number;
  /**
   * Joue la rencontre suivante ; `choose` décide de la Ball lancée. null si la zone n'a plus
   * aucune rencontre active.
   */
  next(choose: ChooseThrow): EncounterResult | null;
  /** Résultat après `elapsedMinutes` (butin, XP, pitié…), sur les rencontres jouées. */
  finish(elapsedMinutes: number): ExpeditionResult;
}

/**
 * Tirage du Pokémon de chaque rencontre. Dans l'ordre : un fuyard qui passe par la zone, une
 * rencontre spéciale ouverte par l'équipe (une fois au plus chacun), sinon une rencontre ordinaire
 * de la zone, pondérée par la pitié et les types attirés. Renvoie la fonction à appeler à chaque
 * rencontre ; elle donne null si la zone n'a plus aucune rencontre active.
 */
function encounterSource(
  ctx: GameContext,
  rng: Rng,
  input: Omit<ExpeditionInput, 'elapsedMinutes'>,
  zone: ExpeditionInput['zone'],
  env: AbilityEnv,
  pity: Map<number, number>,
  shinyChance: number,
) {
  const perfectIvs = Math.min(
    6,
    chainPerfectIvs(ctx, input.shiny?.chain ?? 0) +
      Math.max(0, Math.round(abilityModifier(ctx, env, 'perfectIvs'))),
  );
  const attracted = attractedTypes(ctx, env);
  const extraLevels = Math.round(abilityModifier(ctx, env, 'wildLevel'));
  // Fuyards et rencontres spéciales : une fois au plus chacun.
  const roamers = [...(input.roamers ?? [])];
  const specials = specialEncountersFor(ctx, zone, input.team);

  const wildOf = (speciesId: number, level: number, formId: number | null, shiny: number) => {
    const wild = generatePokemon(ctx, rng, speciesId, level, { shinyProbability: shiny, formId });
    if (perfectIvs > 0) wild.ivs = withPerfectIvs(rng, wild.ivs, perfectIvs);
    applyWildAbilities(ctx, env, rng, wild);
    return wild;
  };
  const wildLevel = (min: number, max: number) =>
    Math.min(MAX_LEVEL, Math.max(1, rng.int(min, max) + extraLevels));
  return () => {
    const roamerIndex = roamers.findIndex((r) =>
      rng.chance(roamerEncounterChance(ctx, r.target, r.target.roaming ?? 0, attracted) / 100),
    );
    if (roamerIndex >= 0) {
      const [{ questId, target }] = roamers.splice(roamerIndex, 1) as [ExpeditionRoamer];
      return {
        wild: generateQuestPokemon(ctx, rng, target, shinyChance),
        extra: { questId },
        ordinary: false,
      };
    }
    const specialIndex = specials.findIndex((s) => rng.chance(s.chance / 100));
    if (specialIndex >= 0) {
      const [special] = specials.splice(specialIndex, 1) as [SpecialEncounter];
      const formId = ctx.species(special.speciesId, special.formId)!.form?.id ?? null;
      const level = wildLevel(special.minLevel, special.maxLevel);
      return {
        wild: wildOf(special.speciesId, level, formId, 0),
        extra: { special: true as const },
        ordinary: false,
      };
    }
    const table = weightedEncounters(ctx, zone, pity, attracted);
    if (table.length === 0) return null;
    const encounter = rng.weighted(table);
    const formId = ctx.species(encounter.speciesId, encounter.formId)!.form?.id ?? null;
    const level = wildLevel(encounter.minLevel, encounter.maxLevel);
    return {
      wild: wildOf(encounter.speciesId, level, formId, shinyChance),
      extra: {},
      ordinary: true,
    };
  };
}

/**
 * Expédition jouée pas à pas, de façon déterministe (seed + contenu de la version active au
 * départ) : les rencontres, puis le butin, suivent chacun leur propre suite de tirages. Rejouer
 * les mêmes lancers redonne les mêmes rencontres ; le serveur s'en sert pour retirer les Balls du
 * sac au fil de l'expédition.
 */
export function createExpeditionRun(
  ctx: GameContext,
  input: Omit<ExpeditionInput, 'elapsedMinutes'>,
): ExpeditionRun {
  const rng = createRng(input.seed);
  const zone = { ...input.zone, weather: input.weather ?? null };
  const pity = new Map(Object.entries(input.pity).map(([k, v]) => [Number(k), v]));
  const touched = new Set<number>();
  const affinityCount = input.affinityCount ?? countAffinity(ctx, zone, input.team, input.hour);
  const captureBerry = input.berries
    ? ctx.itemEffect(input.berries.itemId, 'captureBoost')
    : undefined;
  const captureBerryMinutes = captureBerry
    ? input.berries!.quantity * ctx.balance.expeditions.berryDurationMinutes
    : 0;
  const env = expeditionEnv(zone, input.team, input.hour);
  const shinyChance = Math.min(
    1,
    shinyProbability(ctx, input.shiny) * abilityMultiplier(ctx, env, 'shinyChance'),
  );
  const bonuses = abilityBonuses(ctx, env, input.bonuses ?? NO_BONUSES);
  const clock = encounterClock(ctx, env, input.encounterBerries, input.intervalGrowthMinutes);
  const meet = encounterSource(ctx, rng, input, zone, env, pity, shinyChance);
  // Copie enrichie au fil des captures : un nouveau Pokémon capturé ne l'est plus ensuite.
  const caught = {
    speciesIds: new Set(input.caught?.speciesIds),
    formIds: new Set(input.caught?.formIds),
  };
  const encounters: EncounterResult[] = [];
  let xpPerMember = 0;
  let ballsUsed = 0;

  return {
    encounterMinutes: (n) => encounterTime(clock, n),
    encountersAfter: (minutes) => encountersAfter(clock, minutes),
    get played() {
      return encounters.length;
    },
    next(choose) {
      const n = encounters.length + 1;
      const met = meet();
      if (!met) return null;
      const { wild, extra, ordinary } = met;
      const species = ctx.species(wild.speciesId, wild.formId)!;
      const formId = wild.formId ?? null;
      xpPerMember += Math.floor(
        defeatXp(species, wild.level) * ctx.balance.xp.multiplier * bonuses.xp,
      );
      const base = {
        speciesId: wild.speciesId,
        formId,
        level: wild.level,
        isShiny: wild.isShiny,
        ...extra,
      };
      const category = ballCategory(wild, caught, input.ballPlan);
      const decision = choose({ n, wild, ordinary, caught, category });
      if ('outcome' in decision) {
        const skipped: EncounterResult = { ...base, outcome: decision.outcome, captureChance: 0 };
        encounters.push(skipped);
        return skipped;
      }
      const ball = ctx.itemEffect(decision.ballItemId, 'ball');
      const captureChance = captureProbability(ctx, {
        captureRate: species.captureRate,
        ballMultiplier: ball?.catchMultiplier ?? 1,
        guaranteed: ball?.guaranteed === true,
        boostMultiplier:
          encounterTime(clock, n) <= captureBerryMinutes + EPSILON ? captureBerry!.multiplier : 1,
        affinityCount,
        // Fuyard : capture facilitée (équilibrage des légendaires).
        bonusMultiplier:
          bonuses.capture *
          ('questId' in extra ? ctx.balance.legendary.roamerCaptureMultiplier : 1),
      });
      ballsUsed++;
      const captured = rng.chance(captureChance);
      if (ordinary) {
        pity.set(wild.speciesId, captured ? 0 : (pity.get(wild.speciesId) ?? 0) + 1);
        touched.add(wild.speciesId);
      }
      if (captured) {
        caught.speciesIds.add(wild.speciesId);
        if (formId != null) caught.formIds.add(formId);
      }
      const result: EncounterResult = {
        ...base,
        outcome: captured ? 'captured' : 'escaped',
        captureChance,
        ballItemId: decision.ballItemId,
        ...(captured && { pokemon: wild }),
      };
      encounters.push(result);
      return result;
    },
    finish(elapsedMinutes) {
      const lootRng = createRng(input.seed ^ LOOT_SEED_MASK);
      const lootTotals = new Map<string, number>();
      const lootTable = zone.lootTableId ? ctx.lootTable(zone.lootTableId) : undefined;
      const { lootRolls } = expeditionPlan(ctx, elapsedMinutes, env, input.encounterBerries);
      if (lootTable) {
        for (let i = 0; i < lootRolls; i++) addStacks(lootTotals, rollLoot(lootRng, lootTable));
      }
      return {
        encounters: [...encounters],
        loot: [...lootTotals].map(([itemId, quantity]) => ({ itemId, quantity })),
        team: applyTeamXp(
          ctx,
          input.team,
          xpPerMember,
          abilityHappiness(ctx, env, ctx.balance.xp.happinessPerExpedition),
          bonuses,
        ),
        xpPerMember,
        pity: Object.fromEntries([...touched].map((id) => [id, pity.get(id) ?? 0])),
        ballsUsed,
        berriesUsed: captureBerry
          ? berriesConsumed(ctx, input.berries!.quantity, elapsedMinutes)
          : 0,
        encounterBerriesUsed:
          clock.boostMinutes > 0
            ? berriesConsumed(ctx, input.encounterBerries!.quantity, elapsedMinutes)
            : 0,
        shinyChance,
        lootRolls,
        weather: resolveWeather(ctx, env),
      };
    },
  };
}

/**
 * Calcule le résultat d'une expédition arrêtée après `elapsedMinutes` (voir
 * `createExpeditionRun`) : s'arrêter plus tard ajoute des rencontres sans changer les
 * précédentes. Le serveur applique ensuite le résultat en base ; le client ne fait qu'afficher.
 */
export function resolveExpedition(ctx: GameContext, input: ExpeditionInput): ExpeditionResult {
  const run = createExpeditionRun(ctx, input);
  const choose = input.ballPlan
    ? planThrows(input.ballPlan, input.throws)
    : reservedThrows(input.balls, input.captureFilter);
  const total = run.encountersAfter(input.elapsedMinutes);
  while (run.played < total && run.next(choose));
  return run.finish(input.elapsedMinutes);
}
