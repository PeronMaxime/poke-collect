import { abilities as abilityData, getForm, natures, types as typeData } from '@poke/data';
import { unlockParts } from '../schemas';
import type {
  BaseUnlockCondition,
  GameContentData,
  ProgressReward,
  UnlockCondition,
} from '../schemas';
import type { ContentIssue, ContentEntityKind } from './types';

/**
 * Ce que tous les contrôles partagent : le contenu, des index par identifiant, la liste des
 * erreurs et alertes en cours de remplissage, et les deux contrôles réutilisés partout
 * (condition de déblocage, récompense).
 */

/** Forme qui n'appartient pas à l'espèce (message d'erreur), ou null si tout va bien. */
export function formError(p: { speciesId: number; formId?: number | null }): string | null {
  if (p.formId == null) return null;
  const form = getForm(p.formId);
  if (!form) return `Forme ${p.formId} inconnue`;
  if (form.speciesId !== p.speciesId) {
    return `${form.nameFr} n'est pas une forme de l'espèce ${p.speciesId}`;
  }
  return null;
}

export const KNOWN_TYPES = new Set(typeData.map((t) => t.name));
export const KNOWN_NATURES = new Set(natures.map((n) => n.name));
export const KNOWN_ABILITIES = new Set(abilityData.map((a) => a.name));
/** Types techniques des données, sans Pokémon (Stellaire, ???, Obscur). */
export const NON_POKEMON_TYPES: ReadonlySet<string> = new Set(['stellar', 'unknown', 'shadow']);

/** Identifiants présents plus d'une fois. */
export function duplicates(ids: readonly (string | number)[]): Set<string | number> {
  const seen = new Set<string | number>();
  const dups = new Set<string | number>();
  for (const id of ids) (seen.has(id) ? dups : seen).add(id);
  return dups;
}

export type IntegrityCheck = ReturnType<typeof createIntegrityCheck>;

/** Prépare les contrôles d'un contenu ; `issues` se remplit au fil des appels. */
export function createIntegrityCheck(content: GameContentData) {
  const issues: ContentIssue[] = [];
  const add = (
    severity: ContentIssue['severity'],
    entity: ContentEntityKind,
    entityId: string | number | null,
    message: string,
  ) =>
    issues.push({
      severity,
      entity,
      entityId: entityId == null ? null : String(entityId),
      message,
    });

  const regionIds = new Set(content.regions.map((r) => r.id));
  const itemIds = new Set(content.items.map((i) => i.id));
  const lootTableIds = new Set(content.lootTables.map((t) => t.id));
  const zoneIds = new Set(content.zones.map((z) => z.id));
  const trainerIds = new Set(content.trainers.map((t) => t.id));
  const shopCategoryIds = new Set(content.shopCategories.map((c) => c.id));
  const questsById = new Map(content.quests.map((q) => [q.id, q]));
  const disabled = new Set(
    content.speciesOverrides.filter((o) => !o.enabled).map((o) => o.speciesId),
  );

  const checkUnlockPart = (entity: ContentEntityKind, id: string, unlock: BaseUnlockCondition) => {
    if (
      (unlock.type === 'regionDexPercent' || unlock.type === 'regionUnlocked') &&
      !regionIds.has(unlock.regionId)
    ) {
      add('error', entity, id, `Condition de déblocage : région « ${unlock.regionId} » inconnue`);
    }
    if (unlock.type === 'regionUnlocked' && entity === 'region' && unlock.regionId === id) {
      add('error', entity, id, 'Condition de déblocage : la région dépend d’elle-même');
    }
    if (unlock.type === 'trainerDefeated') {
      if (!trainerIds.has(unlock.trainerId)) {
        add(
          'error',
          entity,
          id,
          `Condition de déblocage : dresseur « ${unlock.trainerId} » inconnu`,
        );
      } else if (entity === 'trainer' && unlock.trainerId === id) {
        add('error', entity, id, 'Condition de déblocage : le dresseur dépend de lui-même');
      }
    }
    if (unlock.type === 'questStepsDone' || unlock.type === 'questCompleted') {
      const quest = questsById.get(unlock.questId);
      if (!quest) {
        add('error', entity, id, `Condition de déblocage : quête « ${unlock.questId} » inconnue`);
      } else if (entity === 'quest' && unlock.questId === id) {
        add('error', entity, id, 'Condition de déblocage : la quête dépend d’elle-même');
      } else if (unlock.type === 'questStepsDone' && unlock.count > quest.steps.length) {
        add(
          'error',
          entity,
          id,
          `Condition de déblocage : ${unlock.count} étape(s) requise(s), la quête « ${quest.name} » en a ${quest.steps.length}`,
        );
      }
    }
    if (unlock.type === 'badgeCount') {
      const { regionId } = unlock;
      if (regionId !== undefined && !regionIds.has(regionId)) {
        add('error', entity, id, `Condition de déblocage : région « ${regionId} » inconnue`);
      }
      const badges = content.trainers.filter(
        (t) => t.badge && (regionId === undefined || t.regionId === regionId),
      ).length;
      if (unlock.count > badges) {
        add(
          'error',
          entity,
          id,
          `Condition de déblocage : ${unlock.count} badge(s) requis, ${badges} existent${regionId ? ` dans cette région` : ''}`,
        );
      }
    }
  };
  const checkUnlock = (entity: ContentEntityKind, id: string, unlock: UnlockCondition) => {
    for (const part of unlockParts(unlock)) checkUnlockPart(entity, id, part);
  };

  const checkReward = (entity: ContentEntityKind, id: string, reward: ProgressReward) => {
    for (const stack of reward.items) {
      if (!itemIds.has(stack.itemId)) {
        add('error', entity, id, `Récompense : objet « ${stack.itemId} » inconnu`);
      }
    }
    const types = reward.bonuses.map((b) => b.type);
    if (new Set(types).size !== types.length) {
      add('warning', entity, id, 'Plusieurs bonus du même type (ils s’additionnent)');
    }
  };

  const { balance } = content;

  return {
    content,
    balance,
    issues,
    add,
    checkUnlock,
    checkReward,
    regionIds,
    itemIds,
    lootTableIds,
    zoneIds,
    trainerIds,
    shopCategoryIds,
    questsById,
    disabled,
  };
}
