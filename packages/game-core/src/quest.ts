import type { Quest, QuestActionCondition, QuestCondition, QuestPokemon } from '@poke/content';
import type { GameContext } from './context';
import {
  applyTeamXp,
  captureProbability,
  countAffinity,
  defeatXp,
  expeditionEnv,
} from './expedition';
import type { ExpeditionResult, ExpeditionSite, TeamMember } from './expedition';
import { generatePokemon, withPerfectIvs } from './pokemon';
import type { PokemonInstance } from './pokemon';
import { isUnlocked } from './progress';
import type { PlayerProgress } from './progress';
import { NO_BONUSES } from './progression';
import type { PlayerBonuses } from './progression';
import { abilityBonuses, abilityHappiness, memberPower } from './abilities';
import { createRng } from './rng';
import type { Rng } from './rng';
import { shinyProbability } from './shiny';
import type { ShinyFactors } from './shiny';

/**
 * Quêtes : étapes ordonnées validées l'une après l'autre. Une étape « état » (Pokédex, dresseur
 * battu, œufs éclos…) se valide paresseusement dès que la condition est remplie ; une étape
 * « action » (captures, expédition réussie) compte les expéditions récupérées pendant l'étape.
 */

/** Avancement enregistré d'une quête : étapes validées et compteur de l'étape en cours. */
export interface QuestRecord {
  step: number;
  count: number;
}

export const NEW_QUEST: QuestRecord = { step: 0, count: 0 };

export function isActionCondition(c: QuestCondition): c is QuestActionCondition {
  return c.type === 'catchPokemon' || c.type === 'expedition';
}

/** Expédition récupérée : seul événement qui fait progresser les étapes « action ». */
export interface QuestEvent {
  type: 'expedition';
  zoneId: string;
  team: readonly PokemonInstance[];
  /** Pokémon capturés pendant l'expédition (espèce et forme). */
  captured: readonly Pick<PokemonInstance, 'speciesId' | 'formId'>[];
}

/** Membres de l'équipe qui comptent pour une étape « expédition » (type et PE individuelle). */
export function qualifyingMembers(
  ctx: GameContext,
  condition: Extract<QuestCondition, { type: 'expedition' }>,
  team: readonly PokemonInstance[],
): number {
  return team.filter((m) => {
    const species = ctx.species(m.speciesId, m.formId);
    if (!species) return false;
    if (condition.memberType && !species.types.includes(condition.memberType)) return false;
    return memberPower(ctx, m) >= condition.minMemberPower;
  }).length;
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

/** Progression qu'apporte un événement à une étape « action ». */
export function eventProgress(
  ctx: GameContext,
  condition: QuestActionCondition,
  event: QuestEvent,
): number {
  switch (condition.type) {
    case 'catchPokemon':
      return event.captured.filter((c) => matchesCatch(ctx, condition, c)).length;
    case 'expedition':
      return event.zoneId === condition.zoneId &&
        qualifyingMembers(ctx, condition, event.team) >= condition.memberCount
        ? 1
        : 0;
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
      if (event && step === eventStep) count += eventProgress(ctx, condition, event);
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

// --- Expédition légendaire -------------------------------------------------------------------

/**
 * Le Pokémon d'une quête ne s'offre pas : une fois la récompense réclamée, une expédition
 * légendaire (lancée depuis les quêtes, elle occupe un emplacement) le rencontre. Au retour, le
 * joueur le découvre (shiny ou non) puis lance une seule Ball, avec une baie, ou prend la fuite.
 * En cas d'échec ou de fuite, on peut retenter : la relance allonge la chaîne shiny de la quête.
 */
export function legendarySite(quest: Quest, target: QuestPokemon): ExpeditionSite {
  const { expedition } = target;
  return {
    regionId: quest.regionId,
    minPower: expedition.minPower,
    requiredTypes: expedition.requiredTypes,
    affinityTypes: expedition.affinityTypes,
    durationsMinutes: [expedition.durationMinutes],
  };
}

export interface QuestEncounterInput {
  /** Pokémon visé (récompense de la quête) et son expédition (affinités). */
  target: QuestPokemon;
  seed: number;
  /** Chaîne de la quête (figée au départ) et Charme Chroma. */
  shiny?: ShinyFactors;
}

export interface QuestExpeditionInput extends QuestEncounterInput {
  team: readonly TeamMember[];
  /** Ball lancée ; null = le joueur prend la fuite. */
  ballItemId: string | null;
  berryItemId: string | null;
  bonuses?: PlayerBonuses;
  /** Heure locale du joueur au départ (talents de jour ou de nuit). */
  hour?: number | null;
}

/**
 * Légendaire rencontré au retour de l'expédition, avant la décision du joueur : ne dépend que du
 * seed, de la chaîne et du Charme (pas de la Ball), donc identique à ce que donnera la capture.
 * La chaîne ne joue que sur le taux shiny : les IV parfaits sont ceux de la récompense, toujours.
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

/**
 * Rencontre du légendaire, au format d'un résultat d'expédition (une rencontre, une Ball) :
 * même formule de capture qu'en expédition (Ball, baie, affinité de l'équipe, bonus permanents).
 */
export function resolveQuestExpedition(
  ctx: GameContext,
  input: QuestExpeditionInput,
): ExpeditionResult {
  const { target } = input;
  const species = ctx.species(target.speciesId, target.formId)!;
  const { pokemon: wild, shinyChance, rng } = questEncounter(ctx, input);
  const env = expeditionEnv(target.expedition, input.team, input.hour, 'quest');
  const bonuses = abilityBonuses(ctx, env, input.bonuses ?? NO_BONUSES);
  const fled = input.ballItemId === null;
  const berry =
    !fled && input.berryItemId ? ctx.itemEffect(input.berryItemId, 'captureBoost') : undefined;
  const captureChance = fled
    ? 0
    : captureProbability(ctx, {
        captureRate: species.captureRate,
        ballMultiplier: ctx.itemEffect(input.ballItemId!, 'ball')?.catchMultiplier ?? 1,
        boostMultiplier: berry?.multiplier ?? 1,
        affinityCount: countAffinity(ctx, target.expedition, input.team, input.hour),
        bonusMultiplier: bonuses.capture,
      });
  const captured = !fled && rng.chance(captureChance);
  // Fuir ne rapporte rien : ni XP ni bonheur pour l'équipe.
  const xpPerMember = fled
    ? 0
    : Math.floor(defeatXp(species, target.level) * ctx.balance.xp.multiplier * bonuses.xp);
  return {
    encounters: [
      {
        speciesId: species.id,
        formId: species.form?.id ?? null,
        level: target.level,
        isShiny: wild.isShiny,
        outcome: fled ? 'fled' : captured ? 'captured' : 'escaped',
        captureChance,
        ...(captured && { pokemon: wild }),
      },
    ],
    loot: [],
    team: fled
      ? []
      : applyTeamXp(
          ctx,
          input.team,
          xpPerMember,
          abilityHappiness(ctx, env, ctx.balance.xp.happinessPerExpedition),
        ),
    xpPerMember,
    pity: {},
    ballsUsed: fled ? 0 : 1,
    berriesUsed: berry ? 1 : 0,
    shinyChance,
  };
}
