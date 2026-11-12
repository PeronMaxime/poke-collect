import type { IntegrityCheck } from './context';
import type { ContentIssue } from './types';

/** Boutique : catégories et articles. */
export function checkShop(check: IntegrityCheck): void {
  const { content, add, checkUnlock, itemIds, shopCategoryIds } = check;
  for (const category of content.shopCategories) {
    if (!content.shopEntries.some((e) => e.categoryId === category.id)) {
      add('warning', 'shopCategory', category.id, 'Catégorie sans article');
    }
  }
  for (const entry of content.shopEntries) {
    const report = (severity: ContentIssue['severity'], message: string) =>
      add(severity, 'shopEntry', entry.id, message);
    if (!itemIds.has(entry.itemId)) report('error', `Objet « ${entry.itemId} » inconnu`);
    if (!shopCategoryIds.has(entry.categoryId)) {
      report('error', `Catégorie « ${entry.categoryId} » inconnue`);
    }
    if (entry.gift && !itemIds.has(entry.gift.itemId)) {
      report('error', `Objet offert « ${entry.gift.itemId} » inconnu`);
    }
    if (entry.price === 0) report('warning', 'Article gratuit');
    if (entry.enabled && entry.availableUntil && Date.parse(entry.availableUntil) < Date.now()) {
      report('warning', 'Date de fin dépassée : l’article n’est plus proposé');
    }
    checkUnlock('shopEntry', entry.id, entry.unlock);
  }
}
