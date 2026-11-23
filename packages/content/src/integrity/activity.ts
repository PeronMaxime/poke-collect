import type { GameContentData } from '../schemas';
import type { ContentEntityKind } from './types';

/**
 * Ce qui est en jeu : une entité activée, dans une région activée (une région désactivée cache ses
 * zones, dresseurs, donjons et quêtes). Une région entière désactivée est du contenu à venir.
 */

export interface ContentActivity {
  /** Région en jeu, ou aucune région (null). */
  inActiveRegion: (regionId: string | null) => boolean;
  activeZoneIds: ReadonlySet<string>;
  /**
   * L'entité est-elle en jeu ? Les réglages et les entités sans interrupteur le sont toujours ;
   * ce qu'attend une entité hors jeu ne mérite pas d'alerte.
   */
  isActive: (entity: ContentEntityKind, id: string) => boolean;
}

export function contentActivity(content: GameContentData): ContentActivity {
  const activeRegionIds = new Set(content.regions.filter((r) => r.enabled).map((r) => r.id));
  const inActiveRegion = (regionId: string | null) =>
    regionId === null || activeRegionIds.has(regionId);
  const active = <T extends { id: string; enabled: boolean; regionId?: string | null }>(
    list: readonly T[],
  ) =>
    new Set(list.filter((e) => e.enabled && inActiveRegion(e.regionId ?? null)).map((e) => e.id));
  const activeZoneIds = active(content.zones);
  const byKind: Partial<Record<ContentEntityKind, ReadonlySet<string>>> = {
    region: activeRegionIds,
    zone: activeZoneIds,
    trainer: active(content.trainers),
    quest: active(content.quests),
    dungeon: active(content.dungeons),
    shopEntry: active(content.shopEntries),
    chestEntry: active(content.chestEntries),
  };
  return {
    inActiveRegion,
    activeZoneIds,
    isActive: (entity, id) => byKind[entity]?.has(id) ?? true,
  };
}
