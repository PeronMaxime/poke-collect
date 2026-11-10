import type { DungeonStat, Status, Weather } from '@poke/content';
import { allUp } from './traits';
import type { DungeonFighter, DungeonTraits, HolderUp } from './types';

/**
 * Ce qui varie chez un combattant pendant le combat (statistiques, statut, Fermeté), et les
 * règles des statuts et de la météo : immunités, attaques sautées, PV perdus. Interne au dossier.
 */

/** Variations du combat en cours : statistiques, Fermeté utilisée, statut. */
export interface FighterMods {
  stats: Record<DungeonStat, number>;
  sturdyUsed: boolean;
  status: Status | null;
  /** Attaques encore sautées (sommeil, gel). */
  statusTurns: number;
}

/** Variations d'un combattant qui entre en combat : rien n'a encore changé. */
export const freshMods = (): FighterMods => ({
  stats: { attack: 1, defense: 1, 'special-attack': 1, 'special-defense': 1, speed: 1 },
  sturdyUsed: false,
  status: null,
  statusTurns: 0,
});

/** Vitesse au plus triplée par les talents (Turbo). */
export const MAX_SPEED_BOOST = 3;

/** Attaques sautées : endormi, gelé. */
export const SKIPPED_TURNS: Partial<Record<Status, number>> = { sleep: 3, freeze: 2 };

/** PV max perdus après chacune de ses attaques : brûlure, poison. */
export const STATUS_DAMAGE: Partial<Record<Status, number>> = { burn: 1 / 16, poison: 1 / 8 };

/** PV max perdus après chacune de ses attaques par tempête de sable ou grêle. */
export const WEATHER_DAMAGE = 1 / 16;

/** Types insensibles à un statut (Feu : brûlure ; Électrik : paralysie…). */
const STATUS_TYPE_IMMUNITY: Record<Status, readonly string[]> = {
  paralysis: ['electric'],
  burn: ['fire'],
  poison: ['poison', 'steel'],
  sleep: [],
  freeze: ['ice'],
};

/** Perte ou soin d'une part de ses PV max (sur ses PV d'avant renfort, pour un boss). */
export const hpShare = (f: DungeonFighter, fraction: number) =>
  Math.round(fraction * (f.percentHp ?? f.maxHp));

/** Types insensibles aux dégâts de la météo. */
export const WEATHER_TYPE_IMMUNITY: Partial<Record<Weather, readonly string[]>> = {
  sand: ['rock', 'ground', 'steel'],
  hail: ['ice'],
};

/** Baisses d'Intimidation par statistique (tentatives antérieures : Attaque et Attaque Spéciale). */
export function intimidation(traits: DungeonTraits | undefined): [DungeonStat, number][] {
  if (traits?.intimidateStats) {
    return Object.entries(traits.intimidateStats) as [DungeonStat, number][];
  }
  const percent = traits?.intimidate ?? 0;
  return percent > 0
    ? [
        ['attack', percent],
        ['special-attack', percent],
      ]
    : [];
}

/**
 * Le combattant peut-il recevoir ce statut ? Non s'il en a déjà un, s'il y est insensible (type,
 * talent, coéquipier debout), ou pour le gel en plein soleil.
 */
export function canGetStatus(
  f: DungeonFighter,
  mods: FighterMods,
  status: Status,
  weather?: Weather | null,
  up: HolderUp = allUp,
) {
  if (mods.status) return false;
  if (status === 'freeze' && weather === 'sun') return false;
  if (f.types.some((t) => STATUS_TYPE_IMMUNITY[status].includes(t))) return false;
  if (f.traits?.statusImmunities?.includes(status)) return false;
  return !f.traits?.teamStatusImmunities?.some((i) => i.status === status && up(i.from));
}
