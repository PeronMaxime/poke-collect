import { isRoamingZone } from '@poke/content';
import type { Quest, QuestPokemon, Zone } from '@poke/content';
import type { GameContext } from './context';
import { isZoneUnlocked } from './progress';
import type { PlayerProgress } from './progress';
import { createRng } from './rng';
import { weatherHour, weatherHourStart } from './weather';

/**
 * Pokémon fuyards. Une fois la récompense de sa quête réclamée, le fuyard (le prochain Pokémon de
 * la récompense pas encore capturé, s'il est marqué `roaming`) se cache dans une des zones
 * ordinaires débloquées par le joueur dans la région de la quête, et en change à chaque heure
 * pleine (les mêmes heures que la météo). Le tirage ne dépend que du joueur, du fuyard et de
 * l'heure : serveur et client trouvent la même zone. Une expédition lancée dans sa zone l'emporte
 * avec elle : il n'apparaît plus nulle part tant qu'elle n'est pas réclamée. Pas croisé, il reste
 * où il était ; croisé mais pas capturé, il fuit aussitôt vers une autre zone (sa cachette) jusqu'à
 * l'heure pleine suivante.
 */

/** Hachage FNV-1a d'un texte (graine des tirages). */
export function textSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  }
  return hash >>> 0;
}

/** Pokémon fuyard d'une quête réclamée : le prochain de la récompense, s'il est fuyard. */
export function roamingTarget(quest: Quest, pokemonCaught: number): QuestPokemon | undefined {
  const target = quest.rewards.pokemon[pokemonCaught];
  return target?.roaming != null ? target : undefined;
}

/** La quête offre au moins un Pokémon fuyard (pas d'expédition légendaire pour lui). */
export const hasRoamer = (quest: Quest) => quest.rewards.pokemon.some((p) => p.roaming != null);

/** Zones où peut se cacher un fuyard de la région : ordinaires et débloquées par le joueur. */
export function roamingZones(
  ctx: GameContext,
  regionId: string,
  progress: PlayerProgress,
): readonly Zone[] {
  return ctx.zones.filter(
    (z) => z.regionId === regionId && isRoamingZone(z) && isZoneUnlocked(ctx, z, progress),
  );
}

/** Tirage libre d'une heure paire. */
const evenPick = (seed: number, hour: number, count: number) =>
  createRng(seed ^ Math.imul(hour + 1, 0x9e3779b1)).int(0, count - 1);

/**
 * Indice de la zone (parmi `count`) du fuyard pendant l'heure `hour`, toujours différent de celui
 * de l'heure précédente. Les heures paires tirent librement ; une heure impaire tire parmi les
 * zones autres que celles de ses deux voisines paires, sans remonter le temps.
 */
export function roamerZoneIndex(seed: number, hour: number, count: number): number {
  if (count <= 1) return 0;
  if (count === 2) return (seed + hour) % 2;
  if (hour % 2 === 0) return evenPick(seed, hour, count);
  const excluded = [...new Set([evenPick(seed, hour - 1, count), evenPick(seed, hour + 1, count)])];
  let index = createRng(seed ^ Math.imul(hour + 1, 0x85ebca6b)).int(0, count - 1 - excluded.length);
  for (const e of excluded.sort((a, b) => a - b)) if (index >= e) index++;
  return index;
}

/** Fuyard en fuite et la zone où il se cache. */
export interface RoamerPosition {
  questId: string;
  /** Rang du Pokémon dans la récompense de la quête. */
  pokemonIndex: number;
  target: QuestPokemon;
  zoneId: string;
  /** Prochain changement de zone (heure pleine suivante). */
  movesAt: Date;
}

/** Zone où a fui un fuyard croisé mais pas capturé, valable pendant l'heure `hour`. */
export interface RoamerHideout {
  pokemonIndex: number;
  hour: number;
  zoneId: string;
}

export interface RoamersInput {
  userId: string;
  /** Quêtes réclamées du joueur, Pokémon de leur récompense déjà capturés et cachette du fuyard. */
  claimedQuests: readonly {
    questId: string;
    pokemonCaught: number;
    roamerHideout?: RoamerHideout | null;
  }[];
  progress: PlayerProgress;
  /** Quêtes dont le fuyard est parti avec une expédition pas encore réclamée. */
  engagedQuestIds: ReadonlySet<string>;
  at: Date | number;
}

/** Fuyards du joueur à l'instant `at` et leur zone. */
export function roamerPositions(ctx: GameContext, input: RoamersInput): RoamerPosition[] {
  const hour = weatherHour(input.at);
  const movesAt = weatherHourStart(hour + 1);
  return input.claimedQuests.flatMap(({ questId, pokemonCaught, roamerHideout }) => {
    const quest = ctx.quest(questId);
    const target = quest && roamingTarget(quest, pokemonCaught);
    if (!target || !quest.regionId || input.engagedQuestIds.has(questId)) return [];
    const zones = roamingZones(ctx, quest.regionId, input.progress);
    if (zones.length === 0) return [];
    const hideout =
      roamerHideout?.pokemonIndex === pokemonCaught && roamerHideout.hour === hour
        ? zones.find((z) => z.id === roamerHideout.zoneId)
        : undefined;
    const seed = textSeed(`${input.userId}:${questId}:${pokemonCaught}`);
    const zone = hideout ?? zones[roamerZoneIndex(seed, hour, zones.length)]!;
    return [{ questId, pokemonIndex: pokemonCaught, target, zoneId: zone.id, movesAt }];
  });
}

/**
 * Zone où fuit un fuyard croisé mais pas capturé dans `fromZoneId` : une autre de ses zones, tirée
 * avec `seed` (la même s'il n'en a pas d'autre).
 */
export function roamerFleeZoneId(
  zones: readonly Zone[],
  fromZoneId: string,
  seed: number,
): string | undefined {
  const others = zones.filter((z) => z.id !== fromZoneId);
  if (others.length === 0) return zones[0]?.id;
  return others[createRng(seed ^ 0x27d4eb2f).int(0, others.length - 1)]!.id;
}

/** Chances de croiser un fuyard (`chance` % par rencontre) en `encounters` rencontres. */
export function roamerMeetChance(chance: number, encounters: number): number {
  return 1 - (1 - chance / 100) ** encounters;
}
