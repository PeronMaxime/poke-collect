import { abilities, evolutionChains, getSpecies, itemSpriteUrl, natures, types } from '@poke/data';
import type { StatName } from '@poke/data';
import type {
  EvolutionMethod,
  ItemEffect,
  PermanentBonus,
  ProgressReward,
  QuestCondition,
  Rarity,
  UnlockCondition,
} from '@poke/content';
import type { EvolutionRequirement, GameContext } from '@poke/game-core';
import { ApiError } from './api';

export { TYPE_COLORS } from '@poke/data';

/** Libellés et couleurs d'affichage (interface uniquement, aucune règle de jeu). */

const typeNames = new Map(types.map((t) => [t.name, t.nameFr]));
const natureNames = new Map(natures.map((n) => [n.name, n.nameFr]));
const abilityNames = new Map(abilities.map((a) => [a.name, a.nameFr]));

export const typeLabel = (type: string) => typeNames.get(type) ?? type;
export const natureLabel = (nature: string) => natureNames.get(nature) ?? nature;
export const abilityLabel = (ability: string) => abilityNames.get(ability) ?? ability;

export const STAT_LABELS: Record<StatName, string> = {
  hp: 'PV',
  attack: 'Attaque',
  defense: 'Défense',
  'special-attack': 'Atq. Spé.',
  'special-defense': 'Déf. Spé.',
  speed: 'Vitesse',
};

export const RARITY_STYLES: Record<Rarity, string> = {
  common: 'text-slate-500',
  uncommon: 'text-emerald-600 dark:text-emerald-400',
  rare: 'text-sky-600 dark:text-sky-400',
  epic: 'text-violet-600 dark:text-violet-400',
  legendary: 'text-amber-600 dark:text-amber-400',
};

export const RARITY_LABELS: Record<Rarity, string> = {
  common: 'Commun',
  uncommon: 'Peu commun',
  rare: 'Rare',
  epic: 'Épique',
  legendary: 'Légendaire',
};

export function itemIcon(ctx: GameContext | undefined, itemId: string): string {
  return ctx?.item(itemId)?.icon ?? itemSpriteUrl(itemId);
}

export const itemName = (ctx: GameContext | undefined, itemId: string) =>
  ctx?.item(itemId)?.name ?? itemId;

/** Nom de l'espèce, ou de la forme (« Goupix d’Alola ») quand elle est indiquée. */
export const speciesName = (
  ctx: GameContext | undefined,
  speciesId: number,
  formId?: number | null,
) => ctx?.species(speciesId, formId)?.nameFr ?? `#${speciesId}`;

const lineageBase = new Map(evolutionChains.map((c) => [c.id, c.chain.speciesId]));

/** Espèce de base d'une lignée (chaîne d'évolution), pour nommer ses Bonbons. */
export const lineageSpeciesId = (lineageId: number) => lineageBase.get(lineageId);

export const candyName = (ctx: GameContext | undefined, lineageId: number) => {
  const base = lineageSpeciesId(lineageId);
  return `Bonbon ${base ? speciesName(ctx, base) : `#${lineageId}`}`;
};

export function effectText(effect: ItemEffect): string {
  switch (effect.type) {
    case 'ball':
      return `Capture × ${effect.catchMultiplier}`;
    case 'captureBoost':
      return `Capture × ${effect.multiplier} (consommée à chaque tentative)`;
    case 'breedingIvs':
      return `Pension : ${effect.count} IV transmis`;
    case 'breedingNature':
      return `Pension : transmet la nature${effect.chance < 1 ? ` (${Math.round(effect.chance * 100)} %)` : ''}`;
    case 'shinyCharm':
      return `Dans le sac : shiny × ${effect.multiplier}`;
    case 'ivCap':
      return effect.all ? 'Sur un Pokémon : 6 IV à 31' : 'Sur un Pokémon : 1 IV au choix à 31';
    case 'mint':
      return `Sur un Pokémon : nature ${natureLabel(effect.nature)}`;
    case 'abilityChange':
      return effect.hidden ? 'Sur un Pokémon : talent caché' : 'Sur un Pokémon : autre talent';
    case 'fossil':
      return `Musée : ${getSpecies(effect.speciesId)?.nameFr ?? `#${effect.speciesId}`} en ${formatDuration(effect.minutes)}`;
  }
}

/** Probabilité shiny lisible : « 1 / 4 096 ». */
export function formatShinyRate(probability: number): string {
  if (probability >= 1) return '100 %';
  if (probability <= 0) return '0';
  return `1 / ${Math.round(1 / probability).toLocaleString('fr-FR')}`;
}

/** Multiplicateur lisible : « × 1,5 ». */
export const formatMultiplier = (m: number) =>
  `× ${m.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}`;

/** Condition de déblocage en clair (null pour « toujours ») : à afficher avec un cadenas. */
export function unlockConditionText(ctx: GameContext, u: UnlockCondition): string | null {
  switch (u.type) {
    case 'always':
      return null;
    case 'regionDexPercent':
      return `Capture ${u.percent} % du Pokédex de ${ctx.region(u.regionId)?.name ?? u.regionId}`;
    case 'trainerDefeated': {
      const other = ctx.trainer(u.trainerId);
      return `Bats ${other ? `${other.trainerClass} ${other.name}` : u.trainerId}`;
    }
    case 'badgeCount':
      return `Obtiens ${u.count} badge${u.count > 1 ? 's' : ''}`;
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
  const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;
  switch (c.type) {
    case 'catchPokemon': {
      const what = c.speciesId
        ? speciesName(ctx, c.speciesId)
        : `Pokémon${c.pokemonType ? ` ${typeLabel(c.pokemonType)}` : ''}`;
      return `Capture ${c.count} ${what}`;
    }
    case 'expedition': {
      const zone = ctx.zone(c.zoneId)?.name ?? c.zoneId;
      const times = c.count > 1 ? `${c.count} expéditions` : 'une expédition';
      if (c.memberCount === 0) return `Réussis ${times} : ${zone}`;
      const members = `${plural(c.memberCount, 'Pokémon')}${c.memberType ? ` ${typeLabel(c.memberType)}` : ''}`;
      const power = c.minMemberPower > 0 ? ` de PE ${c.minMemberPower} ou plus` : '';
      return `Réussis ${times} (${zone}) avec ${members}${power}`;
    }
    case 'always':
      return 'Aucune condition';
    default:
      return unlockConditionText(ctx, c) ?? '';
  }
}

const TIME_OF_DAY_LABELS = { day: 'de jour', night: 'de nuit' } as const;

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

const BONUS_LABELS: Record<PermanentBonus['type'], string> = {
  capture: 'capture en expédition',
  xp: 'XP gagnée',
  money: 'Poké Dollars gagnés en combat',
};

export const bonusText = (b: PermanentBonus) => `+${b.percent} % ${BONUS_LABELS[b.type]}`;

/** Lignes d'une récompense de progression (objets à part, avec leur icône). */
export function rewardLines(r: ProgressReward): string[] {
  const plural = (n: number, word: string) => `+${n} ${word}${n > 1 ? 's' : ''}`;
  return [
    r.currency > 0 && formatMoney(r.currency),
    r.expeditionSlots > 0 && plural(r.expeditionSlots, 'emplacement') + ' d’expédition',
    r.battleSlots > 0 && plural(r.battleSlots, 'emplacement') + ' de combat',
    r.daycareSlots > 0 && plural(r.daycareSlots, 'pension'),
    ...r.bonuses.map(bonusText),
  ].filter((line): line is string => typeof line === 'string');
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m}` : `${h} h`;
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export const GAME_ERRORS: Record<string, string> = {
  NO_FREE_SLOT: 'Tous tes emplacements sont occupés.',
  POKEMON_BUSY: 'Un de ces Pokémon est déjà occupé (expédition, combat ou pension).',
  ZONE_LOCKED: 'Cette zone n’est pas encore débloquée.',
  TEAM_INVALID: 'L’équipe ne remplit pas les conditions de la zone.',
  NOT_FINISHED: 'L’expédition n’est pas encore terminée.',
  ALREADY_CLAIMED: 'Déjà récupéré.',
  STOCK_CHANGED: 'Ton inventaire a changé, réessaie.',
  INVALID_STARTER: 'Ce starter n’est pas disponible.',
  INCOMPATIBLE_PARENTS: 'Ces deux Pokémon ne peuvent pas avoir d’œuf ensemble.',
  NOT_A_BREEDING_ITEM: 'Cet objet n’a pas d’effet en pension.',
  ITEM_MISSING: 'Tu n’as plus cet objet.',
  NO_EGG_READY: 'Aucun œuf n’est prêt.',
  INCUBATOR_FULL: 'La couveuse est pleine : fais d’abord éclore des œufs.',
  ALREADY_COLLECTED: 'Ces œufs ont déjà été ramassés.',
  DAYCARE_EMPTY: 'Cette pension est vide.',
  PARENT_MISSING: 'Un des parents a disparu.',
  POKEMON_LOCKED: 'Les favoris ne peuvent pas être transférés.',
  LAST_POKEMON: 'Tu dois garder au moins un Pokémon.',
  NOT_ENOUGH_CANDIES: 'Pas assez de Bonbons.',
  MAX_LEVEL: 'Ce Pokémon est déjà au niveau maximal.',
  POKEMON_KO: 'Un de ces Pokémon est K.O. : il doit se reposer.',
  TRAINER_LOCKED: 'Ce dresseur n’est pas encore accessible.',
  TRAINER_DEFEATED: 'Tu as déjà battu ce dresseur.',
  TRAINER_COOLDOWN: 'Ce dresseur se repose : reviens plus tard.',
  TRAINER_BUSY: 'Tu affrontes déjà ce dresseur.',
  NOT_ENOUGH_MONEY: 'Tu n’as pas assez de Poké Dollars.',
  ENTRY_LOCKED: 'Cet article n’est pas encore débloqué.',
  NOT_ON_SALE: 'Cet article n’est plus en vente.',
  LIMIT_REACHED: 'Limite d’achat atteinte pour cet article.',
  SHOP_ENTRY_NOT_FOUND: 'Cet article n’existe plus.',
  EVOLUTION_NOT_FOUND: 'Ce Pokémon ne peut pas évoluer ainsi.',
  EVOLUTION_NOT_READY: 'Les conditions d’évolution ne sont pas remplies.',
  POKEMON_CHANGED: 'Ce Pokémon a changé entre-temps, réessaie.',
  POKEMON_NOT_FOUND: 'Ce Pokémon n’existe plus.',
  REWARD_NOT_FOUND: 'Cette récompense n’existe plus.',
  REWARD_LOCKED: 'Cette récompense n’est pas encore débloquée.',
  QUEST_NOT_FOUND: 'Cette quête n’existe plus.',
  QUEST_NOT_COMPLETED: 'Cette quête n’est pas encore terminée.',
  NO_EFFECT: 'Cet objet n’aurait aucun effet sur ce Pokémon.',
  CHOICE_REQUIRED: 'Choisis d’abord la statistique ou le talent.',
  NOT_USABLE_ON_POKEMON: 'Cet objet ne s’utilise pas sur un Pokémon.',
  NOT_A_FOSSIL: 'Cet objet ne peut pas être restauré au Musée.',
  MUSEUM_FULL: 'Toutes les places du Musée sont occupées.',
  NO_FOSSIL_READY: 'Aucun fossile n’est encore restauré.',
  FOSSIL_NOT_FOUND: 'Ce fossile n’est plus au Musée.',
  FOSSIL_ALREADY_REVIVED: 'Ce fossile est déjà restauré : récupère le Pokémon.',
};

export function formatMoney(amount: number): string {
  return `${amount.toLocaleString('fr-FR')} ₽`;
}

export const errorText = (err: unknown) =>
  err instanceof ApiError ? (GAME_ERRORS[err.code] ?? err.code) : 'Erreur inconnue';
