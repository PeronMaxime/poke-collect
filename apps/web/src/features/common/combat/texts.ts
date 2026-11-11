/**
 * Textes, symboles et décors de l'écran de combat.
 */
import { STATUS_LABELS, abilityEffectSummary } from '@poke/game-core';
import type { DungeonStat, Status, Weather } from '@poke/content';
import type { DungeonFighter, GameContext } from '@poke/game-core';
import { CHECKER } from '../zoneBanner';
import type { DungeonAbilityEvent, DungeonStatusEvent } from './events';

/** Symbole de chaque type, au cœur du projectile. */
export const TYPE_GLYPHS: Record<string, string> = {
  normal: '✦',
  fire: '🔥',
  water: '💧',
  grass: '🍃',
  electric: '⚡',
  ice: '❄️',
  fighting: '👊',
  poison: '☠️',
  ground: '⛰️',
  flying: '🌪️',
  psychic: '🌀',
  bug: '🐛',
  rock: '🪨',
  ghost: '👻',
  dragon: '🐉',
  dark: '🌑',
  steel: '⚙️',
  fairy: '✨',
};

/** Texte d'une attaque super efficace ou peu efficace ; rien pour une efficacité normale. */
export function effectivenessText(e: number): string | null {
  if (e > 1) return 'Super efficace !';
  if (e < 1) return 'Pas très efficace…';
  return null;
}

/** Nom français d'un combattant. */
export const fighterName = (ctx: GameContext, f: DungeonFighter) =>
  ctx.species(f.speciesId, f.formId)?.nameFr ?? `#${f.speciesId}`;

/** Abréviation et couleur de chaque statut, sur l'encadré d'un combattant. */
export const STATUS_BADGES: Record<Status, string> = {
  paralysis: 'PAR',
  burn: 'BRÛ',
  poison: 'PSN',
  sleep: 'SOM',
  freeze: 'GEL',
};
export const STATUS_COLORS: Record<Status, string> = {
  paralysis: 'bg-yellow-400 text-slate-900',
  burn: 'bg-orange-500 text-white',
  poison: 'bg-purple-500 text-white',
  sleep: 'bg-slate-500 text-white',
  freeze: 'bg-cyan-400 text-slate-900',
};
/** Symbole de chaque météo. */
export const WEATHER_ICONS = { sun: '☀️', rain: '🌧️', sand: '🌪️', hail: '🌨️' } as const;
/** Annonce du changement de météo. */
export const WEATHER_CHANGE_TEXTS: Record<Weather | 'clear', string> = {
  sun: 'Le soleil brille fort !',
  rain: 'Il commence à pleuvoir !',
  sand: 'Une tempête de sable se lève !',
  hail: 'Il commence à grêler !',
  clear: 'La météo redevient normale.',
};

/** Socles des deux Pokémon : une ellipse d'herbe foulée, cerclée d'un liseré plus sombre. */
export const ARENA_PADS =
  'radial-gradient(ellipse 25% 8% at 22% 81%, rgb(0 0 0 / 0.1) 0 74%, rgb(0 0 0 / 0.24) 77% 97%, transparent 100%), radial-gradient(ellipse 22% 7% at 76% 51%, rgb(0 0 0 / 0.1) 0 74%, rgb(0 0 0 / 0.24) 77% 97%, transparent 100%)';
/** Damier discret sur le sol, comme les bandeaux de zone. */
export const ARENA_GROUND = { ...CHECKER, top: '52%' };
/** Décor un peu assombri en thème sombre, comme les images des zones. */
export const ARENA_DIM = 'dark:brightness-[0.8]';
/** Étiquette posée sur l'arène (adversaires restants, météo, baies) : petit cadre de fenêtre. */
export const ARENA_LABEL =
  'rounded-md border-2 border-ink bg-win shadow-[2px_2px_0_rgb(0_0_0/0.25)]';
/** Boîte de message (météo, déchaînement, issue) : liseré rouge, comme les annonces du jeu. */
export const MESSAGE_BOX =
  'rounded-md border-4 border-ink bg-win shadow-[inset_0_0_0_3px_#d8605a,4px_4px_0_rgb(0_0_0/0.3)] dark:shadow-[inset_0_0_0_3px_#9c3f48,4px_4px_0_rgb(0_0_0/0.4)]';
/** Bulle d'un événement au-dessus d'un Pokémon (talent, statut, baie). */
export const POPUP_BOX =
  'rounded border-2 border-ink bg-win/95 px-1.5 py-0.5 shadow-[2px_2px_0_rgb(0_0_0/0.2)]';
/** Ciel et sol de l'arène selon la météo (temps clair par défaut). */
export const ARENA_BACKGROUNDS: Record<Weather | 'clear', string> = {
  clear: 'linear-gradient(to bottom, #bfdbfe 0%, #e0f2fe 52%, #bbf7d0 52%, #86efac 100%)',
  sun: 'radial-gradient(circle at 88% 10%, #fffbeb 0 5%, #fde68a 8%, transparent 30%), linear-gradient(to bottom, #fdba74 0%, #fef3c7 52%, #d9f99d 52%, #a3e635 100%)',
  rain: 'linear-gradient(to bottom, #475569 0%, #94a3b8 52%, #65a30d 52%, #3f6212 100%)',
  sand: 'linear-gradient(to bottom, #d4a373 0%, #f5deb3 52%, #e9c46a 52%, #c9953f 100%)',
  hail: 'linear-gradient(to bottom, #94a3b8 0%, #e2e8f0 52%, #f1f5f9 52%, #cbd5e1 100%)',
};

/**
 * Ce que fait un talent en combat (donjons et dresseurs) : ses effets qui y agissent. Ceux des
 * donjons, les mêmes en combat de dresseur hormis la PE minimale, qui ne joue pas pendant le combat.
 */
export function dungeonAbilityText(ctx: GameContext, ability: string): string {
  return abilityEffectSummary(ctx, ability, ['dungeon']) ?? 'Sans effet en combat';
}

/** Talent qui neutralise celui du Pokémon en face (Gaz Inhibiteur, Brise Moule…) ; null = aucun. */
export const suppressorAbility = (f: DungeonFighter): string | null =>
  f.traits?.suppressAbility ? f.ability || 'talent' : null;

/** Effet d'un talent qui se déclenche, en clair (`amount` : PV ou pourcentage selon l'effet). */
export const ABILITY_EFFECT_TEXTS: Record<
  DungeonAbilityEvent['effect'],
  (amount: number, stats: readonly DungeonStat[]) => string
> = {
  immunity: (n) => (n > 0 ? `Absorbé ! +${n} PV` : 'Sans effet !'),
  sturdy: () => 'Tient bon !',
  regenerator: (n) => `+${n} PV`,
  moxie: (n) => `Attaque +${n} %`,
  intimidate: (n, stats) =>
    `${stats.map((st) => DUNGEON_STAT_SHORT[st]).join(', ') || 'Attaque'} adverse −${n} %`,
  contactDamage: (n) => `L’attaquant perd ${n} PV`,
  aftermath: (n) => `L’attaquant perd ${n} PV`,
  naturalCure: () => 'Statut guéri',
  suppressAbility: () => 'Talent adverse neutralisé',
};

/** Abréviation de chaque statistique de combat. */
export const DUNGEON_STAT_SHORT: Record<DungeonStat, string> = {
  attack: 'Atq.',
  defense: 'Déf.',
  'special-attack': 'Atq. Spé.',
  'special-defense': 'Déf. Spé.',
  speed: 'Vit.',
};

/** Statut infligé, sommeil, réveil ou dégâts de statut et de météo, au-dessus du Pokémon. */
export function statusText(e: DungeonStatusEvent): string {
  const label = e.status ? STATUS_LABELS[e.status] : 'Météo';
  switch (e.change) {
    case 'inflicted':
      return `${label} !`;
    case 'skipped':
      return e.status === 'freeze' ? 'Gelé…' : 'Dort…';
    case 'cured':
      return e.status === 'freeze' ? 'Dégèle !' : 'Se réveille !';
    case 'damage':
      return `${label} −${e.amount}`;
  }
}

/** Message de fin de combat. */
export const OUTCOME_LABELS = {
  win: 'Victoire !',
  loss: 'Ton équipe est K.O.…',
  timeout: 'Temps écoulé…',
  fled: 'Tu as pris la fuite.',
} as const;
