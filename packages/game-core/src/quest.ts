import type { Quest, QuestActionCondition, QuestCondition, QuestPokemon } from '@poke/content';
import type { GameContext } from './context';
import { generatePokemon, pokemonPower, withPerfectIvs } from './pokemon';
import type { PokemonInstance } from './pokemon';
import { isUnlocked } from './progress';
import type { PlayerProgress } from './progress';
import type { Rng } from './rng';

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
    return pokemonPower(species, m) >= condition.minMemberPower;
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
