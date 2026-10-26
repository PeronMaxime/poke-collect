import { GUILD_QUEST_DIFFICULTIES } from '@poke/content';
import type {
  ChestEntry,
  ChestRarity,
  GuildObjective,
  GuildQuestDifficulty,
  GuildQuestGoal,
  GuildQuestPeriod,
  ItemStack,
} from '@poke/content';
import type { GameContext } from './context';
import { isUnlocked } from './progress';
import type { PlayerProgress } from './progress';
import { createRng } from './rng';
import { textSeed } from './roaming';

/**
 * Guildes : jour et semaine des quêtes (de minuit à minuit, du lundi 0 h au lundi suivant, heure de
 * Paris), tirage des quêtes, progression des objectifs et ouverture des coffres.
 */

/** Fuseau horaire des quêtes de guilde : remise à zéro à minuit (et le lundi à minuit) à Paris. */
export const GUILD_TIME_ZONE = 'Europe/Paris';

export const GUILD_NAME_MIN = 3;
export const GUILD_NAME_MAX = 24;
export const GUILD_DESCRIPTION_MAX = 200;
export const GUILD_MESSAGE_MAX = 500;

export type GuildRole = 'leader' | 'officer' | 'member';
export type GuildJoinMode = 'open' | 'request';

const DAY_MS = 24 * 3_600_000;

const zoneFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: GUILD_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});

/** Décalage (ms) de l'heure de Paris sur UTC à cet instant (+1 h en hiver, +2 h en été). */
function zoneOffset(at: number): number {
  const parts = Object.fromEntries(
    zoneFormat.formatToParts(new Date(at)).map((p) => [p.type, Number(p.value)]),
  );
  const local = Date.UTC(
    parts.year!,
    parts.month! - 1,
    parts.day!,
    parts.hour!,
    parts.minute!,
    parts.second!,
  );
  return local - Math.floor(at / 1000) * 1000;
}

/** Instant de minuit (heure de Paris) du jour donné en « date locale » (UTC à 0 h). */
function zoneMidnight(localDay: number): Date {
  const guess = localDay - zoneOffset(localDay);
  return new Date(localDay - zoneOffset(guess));
}

export interface GuildPeriod {
  /** Jour, ou lundi de la semaine (AAAA-MM-JJ, heure de Paris) : identifiant de la période. */
  id: string;
  startsAt: Date;
  /** Minuit suivant, ou lundi suivant à minuit : remise à zéro des quêtes. */
  endsAt: Date;
}

/** Jour (heure de Paris) contenant cet instant, à minuit UTC, et son jour de la semaine. */
function localDay(now: Date | number): { day: number; weekday: number } {
  const at = new Date(now).getTime();
  const local = new Date(at + zoneOffset(at));
  return {
    day: Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()),
    weekday: local.getUTCDay(),
  };
}

function period(start: number, days: number): GuildPeriod {
  return {
    id: new Date(start).toISOString().slice(0, 10),
    startsAt: zoneMidnight(start),
    endsAt: zoneMidnight(start + days * DAY_MS),
  };
}

/** Semaine de guilde contenant cet instant. */
export function guildWeek(now: Date | number): GuildPeriod {
  const { day, weekday } = localDay(now);
  return period(day - ((weekday + 6) % 7) * DAY_MS, 7);
}

/** Jour de guilde contenant cet instant. */
export function guildDay(now: Date | number): GuildPeriod {
  return period(localDay(now).day, 1);
}

/** Jour ou semaine de guilde contenant cet instant. */
export function guildPeriod(kind: GuildQuestPeriod, now: Date | number): GuildPeriod {
  return kind === 'daily' ? guildDay(now) : guildWeek(now);
}

/** Objectif d'une quête (pour sa période) pour une guilde de `memberCount` membres. */
export function guildQuestTarget(goal: GuildQuestGoal, memberCount: number): number {
  return Math.max(goal.minCount, goal.countPerMember * Math.max(1, memberCount));
}

/** Coffre gagné par une quête de cette période et de cette difficulté. */
export function guildQuestChest(
  ctx: GameContext,
  period: GuildQuestPeriod,
  difficulty: GuildQuestDifficulty,
): ChestRarity {
  return ctx.balance.guilds.quests[period][difficulty].chest;
}

/** Quête tirée pour la période (figée : les retouches de l'admin valent au tirage suivant). */
export interface GuildQuestDraw {
  period: GuildQuestPeriod;
  slot: number;
  questId: string;
  name: string;
  description: string;
  difficulty: GuildQuestDifficulty;
  /** Coffre gagné. */
  rarity: ChestRarity;
  objective: GuildObjective;
  target: number;
}

/**
 * Quêtes du jour ou de la semaine d'une guilde : pour chaque difficulté (facile, difficile),
 * autant de modèles actifs (avec un objectif pour la période) que l'équilibrage en demande, tirés
 * sans remise. Le tirage ne dépend que de la guilde et de la période : deux demandes simultanées
 * donnent les mêmes quêtes.
 */
export function drawGuildQuests(
  ctx: GameContext,
  guildId: string,
  kind: GuildQuestPeriod,
  periodId: string,
  memberCount: number,
): GuildQuestDraw[] {
  const rng = createRng(textSeed(`${guildId}:${kind}:${periodId}`));
  const draws: GuildQuestDraw[] = [];
  for (const difficulty of GUILD_QUEST_DIFFICULTIES) {
    const pool = ctx.guildQuests.filter((q) => q.enabled && q.difficulty === difficulty && q[kind]);
    const { count, chest } = ctx.balance.guilds.quests[kind][difficulty];
    for (let i = 0; i < count && pool.length > 0; i++) {
      const [quest] = pool.splice(rng.int(0, pool.length - 1), 1);
      draws.push({
        period: kind,
        slot: draws.length,
        questId: quest!.id,
        name: quest!.name,
        description: quest!.description,
        difficulty,
        rarity: chest,
        objective: quest!.objective,
        target: guildQuestTarget(quest![kind]!, memberCount),
      });
    }
  }
  return draws;
}

/** Ce qu'une action d'un membre a accompli (expédition, combat, donjon, éclosion…). */
export interface GuildActivity {
  /** Pokémon obtenus par capture. */
  caught?: readonly { speciesId: number; formId?: number | null }[];
  expeditions?: number;
  battlesWon?: number;
  dungeonsWon?: number;
  eggsHatched?: number;
  money?: number;
}

/** Avancée d'un objectif de quête de guilde par une action. */
export function guildObjectiveAmount(
  ctx: GameContext,
  objective: GuildObjective,
  activity: GuildActivity,
): number {
  switch (objective.type) {
    case 'catchPokemon': {
      const caught = activity.caught ?? [];
      if (!objective.pokemonType) return caught.length;
      return caught.filter((p) =>
        ctx.species(p.speciesId, p.formId)?.types.includes(objective.pokemonType!),
      ).length;
    }
    case 'expeditions':
      return activity.expeditions ?? 0;
    case 'battlesWon':
      return activity.battlesWon ?? 0;
    case 'dungeonsWon':
      return activity.dungeonsWon ?? 0;
    case 'eggsHatched':
      return activity.eggsHatched ?? 0;
    case 'moneyEarned':
      return Math.max(0, Math.floor(activity.money ?? 0));
  }
}

/** Lots qu'un joueur peut tirer d'un coffre de cette rareté (activés, objet connu, débloqués). */
export function chestCandidates(
  ctx: GameContext,
  rarity: ChestRarity,
  progress: PlayerProgress,
): ChestEntry[] {
  return ctx.chestEntries.filter(
    (e) =>
      e.enabled &&
      e.rarity === rarity &&
      !!ctx.item(e.itemId) &&
      isUnlocked(ctx, e.unlock, progress),
  );
}

/**
 * Ouvre `count` coffres de cette rareté : chaque coffre tire `chestRolls` lots (avec remise)
 * parmi les lots débloqués. Objets regroupés par identifiant, dans l'ordre d'apparition.
 */
export function openGuildChests(
  ctx: GameContext,
  rarity: ChestRarity,
  progress: PlayerProgress,
  count: number,
  seed: number,
): ItemStack[] {
  const candidates = chestCandidates(ctx, rarity, progress);
  if (candidates.length === 0) return [];
  const rng = createRng(seed);
  const rolls = ctx.balance.guilds.chestRolls[rarity] * count;
  const totals = new Map<string, number>();
  for (let i = 0; i < rolls; i++) {
    const entry = rng.weighted(candidates.map((e) => ({ value: e, weight: e.weight })));
    totals.set(entry.itemId, (totals.get(entry.itemId) ?? 0) + entry.lotSize);
  }
  return [...totals].map(([itemId, quantity]) => ({ itemId, quantity }));
}
