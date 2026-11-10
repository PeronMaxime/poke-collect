import type { Dungeon } from '@poke/content';
import type { GameContext } from '../context';
import type { TeamMember } from '../expedition';
import type { PlayerProgress } from '../progress';
import { isRegionalSpecies, isRegionUnlocked, isUnlocked } from '../progress';
import { MAX_MEGAS_PER_TEAM, megaCount } from '../mega';
import { MOVE_CATEGORIES } from './moves';
import type { DungeonMove } from './moves';

/**
 * Accès à un donjon (délai entre deux tentatives, condition d'ouverture) et validité de
 * l'équipe engagée.
 */

export function dungeonCooldownMinutes(ctx: GameContext, dungeon: Dungeon): number {
  return dungeon.cooldownMinutes ?? ctx.balance.dungeons.cooldownMinutes;
}

export interface DungeonRecord {
  lastEndedAt: Date | string | null;
}

export type DungeonStatus =
  /** Aucune espèce de la lignée capturée (ou région verrouillée) : le donjon n'apparaît pas. */
  | { state: 'hidden' }
  /** Visible, mais il manque des espèces de la lignée ou la condition supplémentaire. */
  | { state: 'locked'; missingSpeciesIds: number[]; conditionMet: boolean }
  | { state: 'cooldown'; until: Date }
  | { state: 'available' };

export function dungeonStatus(
  ctx: GameContext,
  dungeon: Dungeon,
  progress: PlayerProgress,
  record: DungeonRecord | undefined,
  now: Date | number,
): DungeonStatus {
  const region = ctx.region(dungeon.regionId);
  if (!region || !isRegionUnlocked(ctx, region, progress)) return { state: 'hidden' };
  const missingSpeciesIds = dungeon.familySpeciesIds.filter(
    (id) => !progress.caughtSpeciesIds.has(id),
  );
  if (missingSpeciesIds.length === dungeon.familySpeciesIds.length) return { state: 'hidden' };
  const conditionMet = isUnlocked(ctx, dungeon.unlock, progress);
  if (missingSpeciesIds.length > 0 || !conditionMet) {
    return { state: 'locked', missingSpeciesIds, conditionMet };
  }
  if (record?.lastEndedAt) {
    const until = new Date(
      new Date(record.lastEndedAt).getTime() + dungeonCooldownMinutes(ctx, dungeon) * 60_000,
    );
    if (until.getTime() > new Date(now).getTime()) return { state: 'cooldown', until };
  }
  return { state: 'available' };
}

export type DungeonTeamError =
  | { code: 'TEAM_EMPTY' }
  | { code: 'TEAM_TOO_LARGE'; max: number }
  | { code: 'DUPLICATE_MEMBER' }
  | { code: 'TOO_MANY_MEGAS'; max: number }
  | { code: 'WRONG_REGION'; speciesIds: number[] }
  | { code: 'INVALID_MOVE' };

export function checkDungeonTeam(
  ctx: GameContext,
  dungeon: Dungeon,
  team: readonly (Pick<TeamMember, 'id' | 'speciesId' | 'formId'> & {
    move?: DungeonMove | null;
  })[],
): DungeonTeamError[] {
  const errors: DungeonTeamError[] = [];
  const max = ctx.balance.dungeons.maxTeamSize;
  if (team.length === 0) errors.push({ code: 'TEAM_EMPTY' });
  if (team.length > max) errors.push({ code: 'TEAM_TOO_LARGE', max });
  if (new Set(team.map((m) => m.id)).size !== team.length) {
    errors.push({ code: 'DUPLICATE_MEMBER' });
  }
  if (megaCount(team) > MAX_MEGAS_PER_TEAM) {
    errors.push({ code: 'TOO_MANY_MEGAS', max: MAX_MEGAS_PER_TEAM });
  }
  const outside = team
    .filter((m) => !isRegionalSpecies(ctx, dungeon.regionId, m.speciesId))
    .map((m) => m.speciesId);
  if (outside.length > 0) errors.push({ code: 'WRONG_REGION', speciesIds: outside });
  if (hasInvalidMove(ctx, team)) errors.push({ code: 'INVALID_MOVE' });
  return errors;
}

/** Une attaque choisie n'est pas d'un type du Pokémon (ou de catégorie inconnue). */
export function hasInvalidMove(
  ctx: GameContext,
  team: readonly (Pick<TeamMember, 'speciesId' | 'formId'> & { move?: DungeonMove | null })[],
): boolean {
  return team.some((m) => {
    if (!m.move) return false;
    const species = ctx.species(m.speciesId, m.formId);
    return (
      !species || !species.types.includes(m.move.type) || !MOVE_CATEGORIES.includes(m.move.category)
    );
  });
}
