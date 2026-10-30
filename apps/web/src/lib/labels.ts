import {
  abilities,
  evolutionChains,
  getForm,
  getSpecies,
  itemSpriteUrl,
  natures,
  types,
} from '@poke/data';
import type { StatName } from '@poke/data';
import { CHEST_RARITY_LABELS } from '@poke/content';
import type {
  EvolutionMethod,
  GuildObjective,
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
/** Les Pokémon du joueur arrivent sans talent (`NO_ABILITY`, chaîne vide). */
export const abilityLabel = (ability: string) =>
  ability ? (abilityNames.get(ability) ?? ability) : 'Aucun talent';

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
      return effect.guaranteed ? 'Capture assurée' : `Capture × ${effect.catchMultiplier}`;
    case 'captureBoost':
      return `Capture × ${effect.multiplier} (consommée à chaque tentative)`;
    case 'breedingIvs':
      return `Pension : ${effect.count} IV transmis`;
    case 'breedingNature':
      return `Pension : transmet la nature${effect.chance < 1 ? ` (${Math.round(effect.chance * 100)} %)` : ''}`;
    case 'shinyCharm':
      return `Dans le sac : chromatique × ${effect.multiplier}`;
    case 'ivCap':
      return effect.all ? 'Sur un Pokémon : 6 IV à 31' : 'Sur un Pokémon : 1 IV au choix à 31';
    case 'mint':
      return `Sur un Pokémon : nature ${natureLabel(effect.nature)}`;
    case 'abilityChange':
      return effect.hidden
        ? 'Sur un Pokémon : donne son talent caché'
        : 'Sur un Pokémon : donne un talent normal au hasard, puis l’autre';
    case 'fossil':
      return `Musée : ${getSpecies(effect.speciesId)?.nameFr ?? `#${effect.speciesId}`} en ${formatDuration(effect.minutes)}`;
    case 'megaEvolution':
      return `Au PC : Méga-Évolution en ${getForm(effect.formId)?.nameFr ?? `forme ${effect.formId}`}`;
    case 'revive':
      return 'Ranime un Pokémon K.O.';
    case 'battleHeal':
      return `En combat : soigne ${Math.round(effect.fraction * 100)} % des PV du Pokémon actif${
        effect.cooldownSeconds > 0 ? ` (une fois toutes les ${effect.cooldownSeconds} s)` : ''
      }`;
    case 'happiness':
      return `Sur un Pokémon : bonheur +${effect.amount}`;
    case 'levelUp':
      return `Sur un Pokémon : +${effect.levels} niveau${effect.levels > 1 ? 'x' : ''}`;
    case 'encounterBoost':
      return `Expédition : rencontres ${formatMultiplier(effect.multiplier)} (une baie par heure)`;
    case 'guildChest':
      return `Coffre ${CHEST_RARITY_LABELS[effect.rarity]} : à ouvrir`;
    case 'farmPlot':
      return `Ferme : une parcelle de plus, aussitôt (prix ${formatMultiplier(effect.priceGrowth)} à chaque achat)`;
    case 'berryPlant':
      return `Ferme : pousse en ${formatDuration(effect.minutes)}, donne ${yieldRange(effect)} baies`;
  }
}

/** Baies récoltées d'une plantation : « 1 à 3 ». */
export const yieldRange = (effect: { minYield: number; maxYield: number }) =>
  effect.maxYield > effect.minYield
    ? `${effect.minYield} à ${effect.maxYield}`
    : `${effect.minYield}`;

/** Probabilité shiny lisible : « 1 / 4 096 ». */
/** Bonus d'un multiplicateur : 1.01 → « 1 % », 1.255 → « 25,5 % ». */
export const formatPercentBonus = (multiplier: number) =>
  `${(Math.round((multiplier - 1) * 1000) / 10).toLocaleString('fr-FR')} %`;

export function formatShinyRate(probability: number): string {
  if (probability >= 1) return '100 %';
  if (probability <= 0) return '0';
  return `1 / ${Math.round(1 / probability).toLocaleString('fr-FR')}`;
}

/** Multiplicateur lisible : « × 1,5 ». */
export const formatMultiplier = (m: number) =>
  `× ${m.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}`;

/**
 * Nom d'une région ; une région pas encore ouverte aux joueurs n'est pas dans le contexte : son
 * identifiant avec une majuscule (« kalos » → « Kalos »).
 */
const regionName = (ctx: GameContext, id: string) =>
  ctx.region(id)?.name ?? id.charAt(0).toUpperCase() + id.slice(1);

/** Condition de déblocage en clair (null pour « toujours ») : à afficher avec un cadenas. */
export function unlockConditionText(ctx: GameContext, u: UnlockCondition): string | null {
  switch (u.type) {
    case 'always':
      return null;
    case 'regionDexPercent':
      return `Capture ${u.percent} % du Pokédex de ${regionName(ctx, u.regionId)}`;
    case 'trainerDefeated': {
      const other = ctx.trainer(u.trainerId);
      return `Bats ${other ? `${other.trainerClass} ${other.name}` : u.trainerId}`;
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
  const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;
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
  shiny: 'chance de chromatique',
};

export const bonusText = (b: PermanentBonus) => `+${b.percent} % ${BONUS_LABELS[b.type]}`;

/** Lignes d'une récompense de progression (objets à part, avec leur icône). */
export function rewardLines(r: ProgressReward): string[] {
  const plural = (n: number, word: string) => `+${n} ${word}${n > 1 ? 's' : ''}`;
  return [
    r.currency > 0 && formatMoney(r.currency),
    r.expeditionSlots > 0 && plural(r.expeditionSlots, 'emplacement') + ' d’expédition',
    r.daycareSlots > 0 && plural(r.daycareSlots, 'pension'),
    r.incubators > 0 && plural(r.incubators, 'couveuse'),
    ...r.bonuses.map(bonusText),
  ].filter((line): line is string => typeof line === 'string');
}

/** « 45 min », « 1 h 30 » ; les durées raccourcies par un talent ont des secondes (« 1 min 48 s »). */
export function formatDuration(minutes: number): string {
  const total = Math.round(minutes * 60);
  const s = total % 60;
  const whole = (total - s) / 60;
  if (s) {
    const h = Math.floor(whole / 60);
    const m = whole % 60;
    return [h && `${h} h`, m && `${m} min`, `${s} s`].filter(Boolean).join(' ');
  }
  if (whole < 60) return `${whole} min`;
  const h = Math.floor(whole / 60);
  const m = whole % 60;
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
  POKEMON_BUSY:
    'Un de ces Pokémon est déjà occupé (expédition, combat, donjon, pension ou assistant).',
  NO_ASSISTANT: 'Aucun assistant à libérer.',
  NO_SUCH_SLOT: 'Cette place n’est pas encore débloquée.',
  ZONE_LOCKED: 'Cette zone n’est pas encore débloquée.',
  TEAM_INVALID: 'L’équipe ne remplit pas les conditions de la zone.',
  NOT_FINISHED: 'L’expédition n’est pas encore terminée.',
  ALREADY_CLAIMED: 'Déjà récupéré.',
  ALREADY_FINISHED: 'Déjà terminé : il ne reste plus qu’à récupérer le résultat.',
  STOCK_CHANGED: 'Ton inventaire a changé, réessaie.',
  INVALID_STARTER: 'Ce starter n’est pas disponible.',
  REGION_LOCKED: 'Cette région n’est pas encore débloquée.',
  REGION_NOT_FOUND: 'Région introuvable.',
  INCOMPATIBLE_PARENTS: 'Ces deux Pokémon ne peuvent pas avoir d’œuf ensemble.',
  NOT_A_BREEDING_ITEM: 'Cet objet n’a pas d’effet en pension.',
  ITEM_MISSING: 'Tu n’as plus cet objet.',
  NO_EGG_READY: 'Aucun œuf n’est prêt.',
  INCUBATOR_FULL: 'La couveuse est pleine : fais d’abord éclore des œufs.',
  ALREADY_COLLECTED: 'Ces œufs ont déjà été ramassés.',
  DAYCARE_EMPTY: 'Cette pension est vide.',
  PARENT_MISSING: 'Un des parents a disparu.',
  POKEMON_LOCKED: 'Les favoris ne peuvent pas être transférés.',
  POKEMON_LEGENDARY: 'Les Pokémon légendaires et fabuleux ne peuvent pas être transférés.',
  LAST_POKEMON: 'Tu dois garder au moins un Pokémon.',
  NOT_ENOUGH_CANDIES: 'Pas assez de Bonbons.',
  MAX_LEVEL: 'Ce Pokémon est déjà au niveau maximal.',
  POKEMON_KO: 'Un de ces Pokémon est K.O. : soigne-le d’abord au Centre Pokémon.',
  POKEMON_HEALING: 'Un de ces Pokémon est en soins au Centre Pokémon.',
  POKEMON_NOT_KO: 'Ce Pokémon n’est pas K.O.',
  CENTER_FULL: 'Le Centre Pokémon n’a plus assez de place.',
  NOT_A_REVIVE: 'Cet objet ne ranime pas les Pokémon.',
  TRAINER_LOCKED: 'Ce dresseur n’est pas encore accessible.',
  TRAINER_DEFEATED: 'Tu as déjà battu ce dresseur.',
  TRAINER_COOLDOWN: 'Ce dresseur se repose : reviens plus tard.',
  BATTLE_BUSY: 'Tu affrontes déjà un dresseur : termine ce combat d’abord.',
  BATTLE_FINISHED: 'Le combat est déjà terminé.',
  BATTLE_NOT_FOUND: 'Ce combat n’existe plus.',
  NOT_ENOUGH_MONEY: 'Tu n’as pas assez de Poké Dollars.',
  ENTRY_LOCKED: 'Cet article n’est pas encore débloqué.',
  NOT_ON_SALE: 'Cet article n’est plus en vente.',
  LIMIT_REACHED: 'Limite d’achat atteinte pour cet article.',
  SHOP_ENTRY_NOT_FOUND: 'Cet article n’existe plus.',
  ITEM_NOT_FOUND: 'Cet objet n’existe plus.',
  NOT_SELLABLE: 'Cet objet ne peut pas être vendu.',
  NOT_ENOUGH_ITEMS: 'Tu n’as pas autant de cet objet.',
  EVOLUTION_NOT_FOUND: 'Ce Pokémon ne peut pas évoluer ainsi.',
  EVOLUTION_NOT_READY: 'Les conditions d’évolution ne sont pas remplies.',
  POKEMON_CHANGED: 'Ce Pokémon a changé entre-temps, réessaie.',
  POKEMON_MEGA: 'Retire d’abord sa Méga-Gemme à ce Pokémon (au PC).',
  ALREADY_MEGA: 'Ce Pokémon est déjà Méga-Évolué.',
  NOT_MEGA: 'Ce Pokémon n’est pas Méga-Évolué.',
  NOT_A_MEGA_STONE: 'Cet objet n’est pas une Méga-Gemme.',
  WRONG_MEGA_STONE: 'Cette Méga-Gemme ne convient pas à ce Pokémon.',
  POKEMON_NOT_FOUND: 'Ce Pokémon n’existe plus.',
  TRAINER_NOT_FOUND: 'Aucun dresseur ne porte ce nom.',
  REWARD_NOT_FOUND: 'Cette récompense n’existe plus.',
  REWARD_LOCKED: 'Cette récompense n’est pas encore débloquée.',
  QUEST_NOT_FOUND: 'Cette quête n’existe plus.',
  QUEST_NOT_COMPLETED: 'Cette quête n’est pas encore terminée.',
  QUEST_NOT_CLAIMED: 'Réclame d’abord la récompense de la quête.',
  QUEST_POKEMON_CAUGHT: 'Le légendaire de cette quête est déjà capturé.',
  QUEST_POKEMON_ROAMING:
    'Ce légendaire est un fuyard : il se trouve dans les expéditions, pas dans une expédition légendaire.',
  QUEST_EXPEDITION_RUNNING: 'Une expédition légendaire est déjà en cours pour cette quête.',
  DECISION_REQUIRED: 'Choisis une Ball ou prends la fuite.',
  NOT_A_LEGENDARY_EXPEDITION: 'Ce n’est pas une expédition légendaire en attente.',
  QUEST_HAS_NO_LAIR: 'Cette quête n’a pas de repaire à explorer.',
  NO_EFFECT: 'Cet objet n’aurait aucun effet sur ce Pokémon.',
  CHOICE_REQUIRED: 'Choisis d’abord la statistique ou le talent.',
  NOT_USABLE_ON_POKEMON: 'Cet objet ne s’utilise pas sur un Pokémon.',
  NOT_A_FOSSIL: 'Cet objet ne peut pas être restauré au Musée.',
  MUSEUM_FULL: 'Toutes les places du Musée sont occupées.',
  NO_FOSSIL_READY: 'Aucun fossile n’est encore restauré.',
  FOSSIL_NOT_FOUND: 'Ce fossile n’est plus au Musée.',
  FOSSIL_ALREADY_REVIVED: 'Ce fossile est déjà restauré : récupère le Pokémon.',
  NOT_A_BATTLE_ITEM: 'Cet objet ne s’utilise pas en combat.',
  FULL_HP: 'Ce Pokémon a déjà tous ses PV.',
  ITEM_COOLDOWN: 'Cette baie se recharge : attends quelques secondes.',
  NOT_ENOUGH_BERRIES: 'Tu n’as pas assez de baies pour toute la durée de l’expédition.',
  NOT_PLANTABLE: 'Cet objet ne se plante pas à la ferme.',
  PLOT_TAKEN: 'Cette parcelle est déjà plantée.',
  PLOT_EMPTY: 'Cette parcelle est vide.',
  BERRY_ALREADY_RIPE: 'Cette baie est mûre : récolte-la.',
  NO_BERRY_READY: 'Aucune baie n’est encore mûre.',
  ASSISTANT_WRONG_TYPE: 'Ce Pokémon n’a pas le type demandé pour ce poste.',
  ASSISTANT_NO_ABILITY: 'Le talent de ce Pokémon n’agit pas à ce poste.',
  TAG_NOT_FOUND: 'Cette étiquette n’existe plus.',
  TOO_MANY_TAGS: 'Tu as atteint le nombre maximal d’étiquettes.',
  TEAM_NOT_FOUND: 'Cette équipe n’existe plus.',
  TOO_MANY_MEGAS: 'Un seul Pokémon Méga-Évolué par équipe.',
  TOO_MANY_TEAMS: 'Tu as atteint le nombre maximal d’équipes.',
  POKEMON_IN_OTHER_TEAM: 'Un de ces Pokémon fait déjà partie d’une autre équipe.',
  DUNGEON_NOT_FOUND: 'Ce donjon n’existe plus.',
  DUNGEON_LOCKED: 'Ce donjon n’est pas encore ouvert.',
  TAB_LOCKED: 'Cette partie du jeu n’est pas encore débloquée.',
  DUNGEON_COOLDOWN: 'Ce donjon se referme pour l’instant : reviens plus tard.',
  DUNGEON_BUSY: 'Tu explores déjà un donjon.',
  DUNGEON_FINISHED: 'Le combat est déjà terminé.',
  DUNGEON_RUN_NOT_FOUND: 'Cette tentative n’existe plus.',
  MEMBER_KO: 'Ce Pokémon est K.O.',
  MEMBER_ACTIVE: 'Ce Pokémon est déjà au combat.',
  MEMBER_RECALLED: 'Ce Pokémon vient d’être rappelé : il ne peut pas encore revenir.',
  NOT_IN_GUILD: 'Tu ne fais partie d’aucune guilde.',
  ALREADY_IN_GUILD: 'Tu fais déjà partie d’une guilde.',
  GUILD_NOT_FOUND: 'Cette guilde n’existe plus.',
  GUILD_FULL: 'Cette guilde est complète.',
  GUILD_COOLDOWN: 'Tu as quitté une guilde il y a peu : patiente avant d’en rejoindre une autre.',
  GUILD_NAME_TAKEN: 'Ce nom de guilde est déjà pris.',
  GUILD_FORBIDDEN: 'Ton rôle dans la guilde ne le permet pas.',
  REQUEST_NOT_FOUND: 'Cette candidature n’existe plus.',
  MEMBER_NOT_FOUND: 'Ce dresseur n’est pas membre de la guilde.',
  MESSAGE_NOT_FOUND: 'Ce message n’existe plus.',
  NOT_A_CHEST: 'Cet objet n’est pas un coffre.',
  CHEST_EMPTY: 'Ce coffre ne contient encore rien pour toi : progresse dans le jeu.',
};

export function formatMoney(amount: number): string {
  return `${amount.toLocaleString('fr-FR')} ₽`;
}

export const errorText = (err: unknown) =>
  err instanceof ApiError ? (GAME_ERRORS[err.code] ?? err.code) : 'Erreur inconnue';

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
