import { unlockParts } from '../schemas';
import type { BaseUnlockCondition, GameContentData, Quest, UnlockCondition } from '../schemas';
import type { ContentActivity } from './activity';
import type { ContentEntityKind, ContentIssue } from './types';

/**
 * Contrôle d'une condition de déblocage, réutilisé par toutes les entités qui en ont une (régions,
 * zones, dresseurs, quêtes et leurs étapes, onglets, bâtiments…) : cibles connues, pas de
 * dépendance à soi-même, nombres atteignables, cibles encore en jeu.
 */

type Add = (
  severity: ContentIssue['severity'],
  entity: ContentEntityKind,
  entityId: string,
  message: string,
) => void;

interface UnlockCheckInput {
  content: GameContentData;
  add: Add;
  activity: ContentActivity;
  regionIds: ReadonlySet<string>;
  trainerIds: ReadonlySet<string>;
  questsById: ReadonlyMap<string, Quest>;
}

/** Fabrique `checkUnlock(entité, id, condition)`, qui ajoute erreurs et alertes au fil des appels. */
export function unlockChecker(input: UnlockCheckInput) {
  const { content, add, activity, regionIds, trainerIds, questsById } = input;
  const { inActiveRegion, isActive } = activity;

  /**
   * Condition qui attend un dresseur ou une quête désactivés dans une région en jeu : elle ne se
   * remplit plus pour les joueurs qui ne l'ont pas déjà remplie. Une région entière désactivée est
   * du contenu à venir : ce qui l'attend n'est pas signalé.
   */
  const checkTargetActive = (
    entity: ContentEntityKind,
    id: string,
    unlock: BaseUnlockCondition,
  ) => {
    if (!isActive(entity, id)) return;
    const warn = (what: string) =>
      add(
        'warning',
        entity,
        id,
        `Condition de déblocage : ${what}, elle ne se remplit plus pour qui ne l’a pas déjà remplie`,
      );
    if (unlock.type === 'trainerDefeated') {
      const trainer = content.trainers.find((t) => t.id === unlock.trainerId);
      if (trainer && !trainer.enabled && inActiveRegion(trainer.regionId)) {
        warn(`dresseur « ${trainer.name} » désactivé`);
      }
    }
    if (unlock.type === 'questStepsDone' || unlock.type === 'questCompleted') {
      const quest = questsById.get(unlock.questId);
      if (quest && !quest.enabled && inActiveRegion(quest.regionId)) {
        warn(`quête « ${quest.name} » désactivée`);
      }
    }
  };

  /** Badges : assez de dresseurs qui en donnent, et encore à gagner (pas désactivés). */
  const checkBadges = (
    entity: ContentEntityKind,
    id: string,
    unlock: Extract<BaseUnlockCondition, { type: 'badgeCount' }>,
  ) => {
    const { regionId } = unlock;
    if (regionId !== undefined && !regionIds.has(regionId)) {
      add('error', entity, id, `Condition de déblocage : région « ${regionId} » inconnue`);
    }
    const inRegion = content.trainers.filter(
      (t) => t.badge && (regionId === undefined || t.regionId === regionId),
    );
    const where = regionId ? ` dans cette région` : '';
    if (unlock.count > inRegion.length) {
      add(
        'error',
        entity,
        id,
        `Condition de déblocage : ${unlock.count} badge(s) requis, ${inRegion.length} existent${where}`,
      );
      return;
    }
    if (!isActive(entity, id)) return;
    // Les badges des dresseurs désactivés restent acquis, mais ne se gagnent plus (ceux d'une
    // région à venir comptent : ils se gagneront à sa sortie).
    const winnable = inRegion.filter((t) => t.enabled || !inActiveRegion(t.regionId)).length;
    if (unlock.count > winnable) {
      add(
        'warning',
        entity,
        id,
        `Condition de déblocage : ${unlock.count} badge(s) requis, ${winnable} encore à gagner${where} (dresseurs désactivés) : hors de portée des nouveaux joueurs`,
      );
    }
  };

  const checkPart = (entity: ContentEntityKind, id: string, unlock: BaseUnlockCondition) => {
    checkTargetActive(entity, id, unlock);
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
    if (unlock.type === 'badgeCount') checkBadges(entity, id, unlock);
  };

  return (entity: ContentEntityKind, id: string, unlock: UnlockCondition) => {
    for (const part of unlockParts(unlock)) checkPart(entity, id, part);
  };
}
