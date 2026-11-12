/**
 * Conditions en toutes lettres : déblocage d'un onglet ou d'un bâtiment, étape de quête, méthode d'évolution, objectif de guilde.
 */
import type {
  EvolutionMethod,
  ImposedWeather,
  GuildObjective,
  QuestCondition,
  Trainer,
  UnlockCondition,
} from '@poke/content';
import type { EvolutionRequirement, GameContext } from '@poke/game-core';
import { itemName, speciesName, typeLabel } from './names';

/**
 * Nom d'une région ; une région pas encore ouverte aux joueurs n'est pas dans le contexte : son
 * identifiant avec une majuscule (« kalos » → « Kalos »).
 */
const regionName = (ctx: GameContext, id: string) =>
  ctx.region(id)?.name ?? id.charAt(0).toUpperCase() + id.slice(1);

/** Nom d'un dresseur, suivi de « (quête) » pour un dresseur de quête. */
export const trainerName = (trainer: Pick<Trainer, 'name' | 'questId'>) =>
  trainer.questId ? `${trainer.name} (quête)` : trainer.name;

/** Condition de déblocage en clair (null pour « toujours ») : à afficher avec un cadenas. */
export function unlockConditionText(ctx: GameContext, u: UnlockCondition): string | null {
  switch (u.type) {
    case 'always':
      return null;
    case 'regionDexPercent':
      return `Capture ${u.percent} % du Pokédex de ${regionName(ctx, u.regionId)}`;
    case 'trainerDefeated': {
      const other = ctx.trainer(u.trainerId);
      return `Bats ${other ? `${other.trainerClass} ${trainerName(other)}` : u.trainerId}`;
    }
    case 'regionUnlocked':
      return `Débloque la région ${regionName(ctx, u.regionId)}`;
    case 'badgeCount': {
      const region = u.regionId && regionName(ctx, u.regionId);
      return `Obtiens ${u.count} badge${u.count > 1 ? 's' : ''}${region ? ` de ${region}` : ''}`;
    }
    case 'speciesCaught':
      return `Capture ${u.count} espèce${u.count > 1 ? 's' : ''} différente${u.count > 1 ? 's' : ''}`;
    case 'eggsHatched':
      return `Fais éclore ${u.count} œuf${u.count > 1 ? 's' : ''}`;
    case 'questStepsDone': {
      const quest = ctx.quest(u.questId);
      const name = `« ${quest?.name ?? u.questId} »`;
      return u.count === 1
        ? `Avance dans la quête ${name}`
        : `Valide ${u.count} étapes de la quête ${name}`;
    }
    case 'questCompleted':
      return `Termine la quête « ${ctx.quest(u.questId)?.name ?? u.questId} »`;
    case 'allOf': {
      // « Obtiens 5 badges, capture 50 espèces différentes et termine la quête … »
      const parts = u.conditions
        .flatMap((c) => unlockConditionText(ctx, c) ?? [])
        .map((p, i) => (i === 0 ? p : p.charAt(0).toLowerCase() + p.slice(1)));
      if (parts.length <= 1) return parts[0] ?? null;
      return `${parts.slice(0, -1).join(', ')} et ${parts.at(-1)}`;
    }
  }
}

/** Condition d'une étape de quête en clair. */
export function questConditionText(ctx: GameContext, c: QuestCondition): string {
  switch (c.type) {
    case 'catchPokemon': {
      const what = c.speciesId
        ? speciesName(ctx, c.speciesId)
        : `Pokémon${c.pokemonType ? ` ${typeLabel(c.pokemonType)}` : ''}`;
      const zone = c.zoneId ? ` (${ctx.zone(c.zoneId)?.name ?? c.zoneId})` : '';
      return `Capture ${c.count} ${what}${zone}`;
    }
    case 'expedition': {
      const zone = ctx.zone(c.zoneId)?.name ?? c.zoneId;
      const times = c.count > 1 ? `${c.count} expéditions` : 'une expédition';
      return `Réussis ${times} (${zone})${questRequirementsText(ctx, c)}`;
    }
    case 'questItem': {
      const zone = ctx.zone(c.zoneId)?.name ?? c.zoneId;
      const what =
        c.count > 1 ? `${c.count} × ${itemName(ctx, c.itemId)}` : itemName(ctx, c.itemId);
      return `Trouve ${what} en expédition (${zone})${questRequirementsText(ctx, c)}`;
    }
    case 'always':
      return 'Aucune condition';
    default:
      return unlockConditionText(ctx, c) ?? '';
  }
}

const TIME_OF_DAY_LABELS = { day: 'de jour', night: 'de nuit' } as const;

/** Météo au départ d'une expédition, en complément de « lancée … ». */
const START_WEATHER_TEXTS: Record<ImposedWeather, string> = {
  clear: 'par temps clair',
  sun: 'sous un grand soleil',
  rain: 'sous la pluie',
  sand: 'dans une tempête de sable',
  hail: 'sous la grêle',
};

/**
 * Conditions de départ d'une étape d'expédition : « avec 2 Pokémon Eau de PE 600 ou plus et
 * Lokhlass, lancée sous la pluie, de nuit ». Vide sans condition.
 */
function questRequirementsText(
  ctx: GameContext,
  c: Extract<QuestCondition, { type: 'expedition' | 'questItem' }>,
): string {
  const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;
  const team = [
    c.memberCount > 0 &&
      `${plural(c.memberCount, 'Pokémon')}${c.memberType ? ` ${typeLabel(c.memberType)}` : ''}${
        c.minMemberPower > 0 ? ` de PE ${c.minMemberPower} ou plus` : ''
      }`,
    ...c.speciesIds.map((id) => speciesName(ctx, id)),
  ].filter(Boolean);
  const start = [
    c.weathers.length > 0 && c.weathers.map((w) => START_WEATHER_TEXTS[w]).join(' ou '),
    c.timeOfDay && TIME_OF_DAY_LABELS[c.timeOfDay],
  ].filter(Boolean);
  return [
    team.length > 0 && ` avec ${team.join(' et ')}`,
    start.length > 0 && `, lancée ${start.join(', ')}`,
  ]
    .filter(Boolean)
    .join('');
}

/** Méthode d'évolution en clair : « N.16 », « Pierre Lune », « Bonheur 160 · de nuit ». */
export function evolutionMethodText(ctx: GameContext, m: EvolutionMethod): string {
  return [
    m.minLevel !== null && `N.${m.minLevel}`,
    m.itemId !== null && itemName(ctx, m.itemId),
    m.minHappiness !== null && `Bonheur ${m.minHappiness}`,
    m.timeOfDay !== null && TIME_OF_DAY_LABELS[m.timeOfDay],
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Condition d'une évolution en toutes lettres (niveau, objet, bonheur…). */
export function requirementText(ctx: GameContext, r: EvolutionRequirement): string {
  switch (r.type) {
    case 'level':
      return `niveau ${r.required} (actuel : ${r.current})`;
    case 'item':
      return `${itemName(ctx, r.itemId)} dans le sac`;
    case 'happiness':
      return `bonheur ${r.required} (actuel : ${r.current})`;
    case 'timeOfDay':
      return r.required === 'day' ? 'il doit faire jour' : 'il doit faire nuit';
  }
}

/** Objectif d'une quête de guilde, en clair (« Pokémon Eau capturés »). */
export function guildObjectiveText(objective: GuildObjective): string {
  switch (objective.type) {
    case 'catchPokemon':
      return `Pokémon${objective.pokemonType ? ` ${typeLabel(objective.pokemonType)}` : ''} capturés`;
    case 'expeditions':
      return 'Expéditions récupérées';
    case 'battlesWon':
      return 'Combats de dresseurs gagnés';
    case 'dungeonsWon':
      return 'Donjons réussis';
    case 'eggsHatched':
      return 'Œufs éclos';
    case 'moneyEarned':
      return 'Poké Dollars gagnés en combat';
  }
}
