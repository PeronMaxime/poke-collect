import { gameContentStructureSchema } from '../schemas';
import type { GameContentData } from '../schemas';
import { checkAbilities } from './abilities';
import { checkBalance } from './balance';
import { checkCollections } from './collections';
import { createIntegrityCheck } from './context';
import { checkDungeons } from './dungeons';
import { checkDuplicates } from './duplicates';
import { checkGuilds } from './guilds';
import { checkItems } from './items';
import { checkLootTables } from './loot';
import { checkQuests } from './quests';
import { checkRegions } from './regions';
import { checkShop } from './shop';
import { checkExpeditionSlots } from './slots';
import { checkEvolutionOverrides } from './evolutions';
import { checkSpeciesOverrides } from './species';
import { checkTrainers } from './trainers';
import type { ContentIssue } from './types';
import { checkZones } from './zones';

export { NON_POKEMON_TYPES } from './context';
export type { ContentEntityKind, ContentIssue } from './types';
export { findUsages } from './usages';

/**
 * Cohérence du contenu : références croisées (zone → région, butin → objet…) et alertes.
 * Les erreurs bloquent la publication ; les avertissements s'affichent dans le tableau de bord.
 *
 * Un contrôle par entité, dans un fichier à son nom. L'ordre ci-dessous est celui de l'affichage
 * dans l'admin : ajouter un contrôle, c'est écrire sa fonction et l'inscrire dans cette liste.
 */
const CHECKS = [
  checkDuplicates,
  checkBalance,
  checkRegions,
  checkSpeciesOverrides,
  checkAbilities,
  checkItems,
  checkLootTables,
  checkZones,
  checkTrainers,
  checkDungeons,
  checkShop,
  checkGuilds,
  checkEvolutionOverrides,
  checkCollections,
  checkQuests,
  checkExpeditionSlots,
];

export function contentIssues(content: GameContentData): ContentIssue[] {
  const check = createIntegrityCheck(content);
  for (const run of CHECKS) run(check);
  return check.issues;
}

/** Contenu complet : structure + références croisées (erreurs bloquantes). */
export const gameContentSchema = gameContentStructureSchema.superRefine((content, ctx) => {
  for (const issue of contentIssues(content)) {
    if (issue.severity !== 'error') continue;
    ctx.addIssue({
      code: 'custom',
      message: issue.message,
      path: issue.entityId ? [issue.entity, issue.entityId] : [issue.entity],
    });
  }
});
