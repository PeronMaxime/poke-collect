/**
 * Ce qu'un contrôle de cohérence renvoie : une erreur (bloque la publication) ou une alerte
 * (affichée dans le tableau de bord de l'admin), rattachée à une entité du contenu.
 */

export type ContentEntityKind =
  | 'balance'
  | 'region'
  | 'speciesOverride'
  | 'ability'
  | 'item'
  | 'lootTable'
  | 'zone'
  | 'trainer'
  | 'dungeon'
  | 'shopCategory'
  | 'shopEntry'
  | 'evolutionOverride'
  | 'collection'
  | 'quest'
  | 'guildQuest'
  | 'chestEntry';

export interface ContentIssue {
  severity: 'error' | 'warning';
  entity: ContentEntityKind;
  entityId: string | null;
  message: string;
}
