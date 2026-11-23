import { abilities as abilityData, getForm, natures, types as typeData } from '@poke/data';
import type { GameContentData, ProgressReward } from '../schemas';
import { contentActivity } from './activity';
import type { ContentIssue, ContentEntityKind } from './types';
import { unlockChecker } from './unlock';

/**
 * Ce que tous les contrôles partagent : le contenu, des index par identifiant, la liste des
 * erreurs et alertes en cours de remplissage, ce qui est en jeu (`activity.ts`) et les deux
 * contrôles réutilisés partout (condition de déblocage dans `unlock.ts`, récompense).
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

  const activity = contentActivity(content);
  const checkUnlock = unlockChecker({
    content,
    add,
    activity,
    regionIds,
    trainerIds,
    questsById,
  });

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
    activeZoneIds: activity.activeZoneIds,
    isActive: activity.isActive,
  };
}
