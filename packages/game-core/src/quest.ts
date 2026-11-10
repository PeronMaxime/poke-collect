import type {
  ImposedWeather,
  Quest,
  QuestActionCondition,
  QuestCondition,
  QuestExpeditionCondition,
  QuestPokemon,
  Weather,
} from '@poke/content';
import type { GameContext } from './context';
import { timeOfDayAt } from './evolution';
import { generatePokemon, withPerfectIvs } from './pokemon';
import type { PokemonInstance } from './pokemon';
import { isUnlocked } from './progress';
import type { PlayerProgress } from './progress';
import { memberPower } from './abilities';
import { createRng } from './rng';
import type { Rng } from './rng';
import { shinyProbability } from './shiny';
import type { ShinyFactors } from './shiny';

/**
 * Quêtes : étapes ordonnées validées l'une après l'autre. Une étape « état » (Pokédex, dresseur
 * battu, œufs éclos…) se valide paresseusement dès que la condition est remplie ; une étape
 * « action » (captures, expédition réussie, objet de quête) compte les expéditions récupérées
 * pendant l'étape.
 */

/** Avancement enregistré d'une quête : étapes validées et compteur de l'étape en cours. */
export interface QuestRecord {
  step: number;
  count: number;
}

/** Avancement d'une quête pas encore commencée. */
export const NEW_QUEST: QuestRecord = { step: 0, count: 0 };

/**
 * L'étape compte-t-elle des actions (captures, expéditions, objets de quête), au lieu de constater
 * un état ?
 */
export function isActionCondition(c: QuestCondition): c is QuestActionCondition {
  return c.type === 'catchPokemon' || c.type === 'expedition' || c.type === 'questItem';
}

/** Expédition récupérée : seul événement qui fait progresser les étapes « action ». */
export interface QuestEvent {
  type: 'expedition';
  zoneId: string;
  team: readonly PokemonInstance[];
  /** Pokémon capturés pendant l'expédition (espèce et forme). */
  captured: readonly Pick<PokemonInstance, 'speciesId' | 'formId'>[];
  /** Tirages de butin de l'expédition (chances de trouver un objet de quête) ; absent = aucun. */
  lootRolls?: number;
  /** Seed de l'expédition (tirages des objets de quête). */
  seed?: number;
  /**
   * Météo de l'expédition : celle qu'impose un talent de l'équipe, sinon celle de la zone au
   * départ ; null = temps clair, absent = inconnue.
   */
  weather?: Weather | null;
  /** Heure locale du joueur au départ ; null = inconnue. */
  hour?: number | null;
}

/** Membres de l'équipe qui comptent pour une étape d'expédition (type et PE individuelle). */
export function qualifyingMembers(
  ctx: GameContext,
  condition: Pick<QuestExpeditionCondition, 'memberType' | 'minMemberPower'>,
  team: readonly PokemonInstance[],
): number {
  return team.filter((m) => {
    const species = ctx.species(m.speciesId, m.formId);
    if (!species) return false;
    if (condition.memberType && !species.types.includes(condition.memberType)) return false;
    return memberPower(ctx, m) >= condition.minMemberPower;
  }).length;
}

/** Ce qui manque à une expédition pour compter dans une étape de quête (vide = rien). */
export type QuestExpeditionMiss =
  | { code: 'zone' }
  | { code: 'members'; count: number }
  | { code: 'species'; speciesIds: number[] }
  | { code: 'weather'; weathers: ImposedWeather[] }
  | { code: 'timeOfDay'; time: 'day' | 'night' };

/**
 * Conditions d'une étape d'expédition (zone, membres, espèces, météo et moment du départ) que
 * l'expédition ne remplit pas. Météo ou heure inconnue (absente) : non vérifiée.
 */
export function questExpeditionMisses(
  ctx: GameContext,
  condition: QuestExpeditionCondition,
  expedition: {
    zoneId: string;
    team: readonly PokemonInstance[];
    weather?: Weather | null;
    hour?: number | null;
  },
): QuestExpeditionMiss[] {
  const misses: QuestExpeditionMiss[] = [];
  if (expedition.zoneId !== condition.zoneId) misses.push({ code: 'zone' });
  if (qualifyingMembers(ctx, condition, expedition.team) < condition.memberCount) {
    misses.push({ code: 'members', count: condition.memberCount });
  }
  const present = new Set(expedition.team.map((m) => m.speciesId));
  const missing = condition.speciesIds.filter((id) => !present.has(id));
  if (missing.length > 0) misses.push({ code: 'species', speciesIds: missing });
  if (condition.weathers.length > 0 && expedition.weather !== undefined) {
    if (!condition.weathers.includes(expedition.weather ?? 'clear')) {
      misses.push({ code: 'weather', weathers: condition.weathers });
    }
  }
  if (condition.timeOfDay && expedition.hour !== undefined) {
    if (expedition.hour === null || timeOfDayAt(ctx, expedition.hour) !== condition.timeOfDay) {
      misses.push({ code: 'timeOfDay', time: condition.timeOfDay });
    }
  }
  return misses;
}

/** Capture qui compte pour une étape « captures ». */
export function matchesCatch(
  ctx: GameContext,
  condition: Extract<QuestCondition, { type: 'catchPokemon' }>,
  caught: Pick<PokemonInstance, 'speciesId' | 'formId'>,
): boolean {
  if (condition.speciesId !== null && condition.speciesId !== caught.speciesId) return false;
  if (!condition.pokemonType) return true;
  return (
    ctx.species(caught.speciesId, caught.formId)?.types.includes(condition.pokemonType) ?? false
  );
}

/** Graine des tirages d'objet de quête d'une expédition (indépendante de ses autres tirages). */
function questItemSeed(seed: number, itemId: string): number {
  let hash = 0x811c9dc5 ^ seed;
  for (let i = 0; i < itemId.length; i++) hash = Math.imul(hash ^ itemId.charCodeAt(i), 0x01000193);
  return hash >>> 0;
}

/**
 * Objets de quête trouvés pendant une expédition qui remplit les conditions : chaque tirage de
 * butin a `chance` % d'en faire trouver un (tirages déterminés par le seed de l'expédition).
 */
export function questItemsFound(
  ctx: GameContext,
  condition: Extract<QuestCondition, { type: 'questItem' }>,
  event: QuestEvent,
): number {
  if (questExpeditionMisses(ctx, condition, event).length > 0) return 0;
  const rng = createRng(questItemSeed(event.seed ?? 0, condition.itemId));
  let found = 0;
  for (let i = 0; i < (event.lootRolls ?? 0); i++) {
    if (rng.chance(condition.chance / 100)) found++;
  }
  return found;
}

/** Progression qu'apporte un événement à une étape « action ». */
export function eventProgress(
  ctx: GameContext,
  condition: QuestActionCondition,
  event: QuestEvent,
  questRegionId: string | null,
): number {
  switch (condition.type) {
    case 'catchPokemon':
      // Sans zone précise, les captures comptent dans toute la région de la quête.
      if (condition.zoneId) {
        if (condition.zoneId !== event.zoneId) return 0;
      } else if (questRegionId && ctx.zone(event.zoneId)?.regionId !== questRegionId) {
        return 0;
      }
      return event.captured.filter((c) => matchesCatch(ctx, condition, c)).length;
    case 'expedition':
      return questExpeditionMisses(ctx, condition, event).length === 0 ? 1 : 0;
    case 'questItem':
      return questItemsFound(ctx, condition, event);
  }
}

/**
 * Fait avancer une quête : applique l'événement à l'étape en cours (si c'est une étape « action »),
 * puis valide toutes les étapes dont la condition est remplie. Un même événement ne compte que
 * pour l'étape en cours au moment où il se produit.
 */
export function advanceQuest(
  ctx: GameContext,
  quest: Quest,
  record: QuestRecord,
  progress: PlayerProgress,
  event?: QuestEvent,
): QuestRecord {
  const total = quest.steps.length;
  let step = Math.min(record.step, total);
  let count = step === record.step ? record.count : 0;
  const eventStep = step;
  while (step < total) {
    const condition = quest.steps[step]!.condition;
    if (isActionCondition(condition)) {
      if (event && step === eventStep)
        count += eventProgress(ctx, condition, event, quest.regionId);
      if (count < condition.count) break;
    } else if (!isUnlocked(ctx, condition, progress)) {
      break;
    }
    step++;
    count = 0;
  }
  return { step, count };
}

/**
 * Objets de quête gagnés par un avancement (`before` → `after`) : ceux de l'étape « objet de
 * quête » en cours au moment de l'événement, sans dépasser le nombre demandé.
 */
export function questItemsGained(
  quest: Quest,
  before: QuestRecord,
  after: QuestRecord,
): { itemId: string; quantity: number } | null {
  const condition = quest.steps[before.step]?.condition;
  if (condition?.type !== 'questItem') return null;
  const reached = after.step > before.step ? condition.count : after.count;
  const quantity = reached - before.count;
  return quantity > 0 ? { itemId: condition.itemId, quantity } : null;
}

/**
 * Étapes validées de chaque quête commencée ou débloquée (les autres sont absentes), calculées
 * à partir des avancements enregistrés. Les quêtes peuvent dépendre les unes des autres :
 * on itère jusqu'à stabilité.
 */
export function questStepsDone(
  ctx: GameContext,
  progress: PlayerProgress,
  records: ReadonlyMap<string, QuestRecord>,
): Map<string, number> {
  let steps = new Map<string, number>();
  for (let i = 0; i <= ctx.quests.length; i++) {
    const current = { ...progress, questSteps: steps };
    const next = new Map<string, number>();
    for (const quest of ctx.quests) {
      const record = records.get(quest.id);
      if (!record && !isUnlocked(ctx, quest.unlock, current)) continue;
      next.set(quest.id, advanceQuest(ctx, quest, record ?? NEW_QUEST, current).step);
    }
    const stable = next.size === steps.size && [...next].every(([id, n]) => steps.get(id) === n);
    steps = next;
    if (stable) break;
  }
  return steps;
}

/** Statut d'une quête pour un joueur. */
export type QuestStatus = 'locked' | 'active' | 'completed' | 'claimed';

/** Statut d'une quête : verrouillée, en cours, terminée (récompense à réclamer), réclamée. */
export function questStatus(
  quest: Quest,
  stepsDone: number | undefined,
  claimed: boolean,
): QuestStatus {
  if (claimed) return 'claimed';
  if (stepsDone === undefined) return 'locked';
  return stepsDone >= quest.steps.length ? 'completed' : 'active';
}

/**
 * Pokémon offert par une quête : généré comme un Pokémon sauvage, puis `perfectIvs` statistiques
 * tirées au hasard passent à 31. L'ordre des tirages est figé (seeds reproductibles).
 */
export function generateQuestPokemon(
  ctx: GameContext,
  rng: Rng,
  reward: QuestPokemon,
  shinyProbability: number,
): PokemonInstance {
  const pokemon = generatePokemon(ctx, rng, reward.speciesId, reward.level, {
    shinyProbability,
    formId: reward.formId,
  });
  return { ...pokemon, ivs: withPerfectIvs(rng, pokemon.ivs, reward.perfectIvs) };
}

/** Ce qui détermine le Pokémon rencontré au bout d'une quête. */
export interface QuestEncounterInput {
  /** Pokémon visé (récompense de la quête). */
  target: QuestPokemon;
  seed: number;
  /** Chaîne de la quête et Charme Chroma. */
  shiny?: ShinyFactors;
}

/**
 * Légendaire rencontré : ne dépend que du seed, de la chaîne et du Charme. La chaîne ne joue que
 * sur le taux shiny : les IV parfaits sont ceux de la récompense, toujours.
 */
export function questEncounter(
  ctx: GameContext,
  input: QuestEncounterInput,
): { pokemon: PokemonInstance; shinyChance: number; rng: Rng } {
  const rng = createRng(input.seed);
  const shinyChance = shinyProbability(ctx, input.shiny);
  const pokemon = generateQuestPokemon(ctx, rng, input.target, shinyChance);
  return { pokemon, shinyChance, rng };
}
