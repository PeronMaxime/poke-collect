import { z } from 'zod';
import { slugSchema } from './common';
import { imageSchema, nameSchema } from './internal';
import { unlockConditionSchema } from './unlock';

/**
 * Boutique.
 */

export const shopCategorySchema = z.object({
  id: slugSchema,
  /** Nom de l'onglet : Balls, Soins, Élevage, Évolution, Rare… */
  name: nameSchema,
  /** Icône de l'onglet ; si absente, icône du premier article. */
  icon: imageSchema,
  order: z.int().min(0),
});

export type ShopCategory = z.infer<typeof shopCategorySchema>;

export const PURCHASE_PERIODS = ['total', 'day', 'week'] as const;

export type PurchasePeriod = (typeof PURCHASE_PERIODS)[number];

/** Limite d'achat par joueur, en lots : au total, ou sur les dernières 24 h / 7 jours. */
export const purchaseLimitSchema = z.object({
  lots: z.int().min(1).max(10_000),
  period: z.enum(PURCHASE_PERIODS),
});

export type PurchaseLimit = z.infer<typeof purchaseLimitSchema>;

/** Objet offert avec un achat : `quantity` objets tous les `every` objets achetés d'un coup. */
export const shopGiftSchema = z.object({
  itemId: slugSchema,
  every: z.int().min(1).max(999),
  quantity: z.int().min(1).max(99),
});

export type ShopGift = z.infer<typeof shopGiftSchema>;

export const shopEntrySchema = z
  .object({
    id: slugSchema,
    itemId: slugSchema,
    categoryId: slugSchema,
    order: z.int().min(0),
    /** Prix d'un lot, en Poké Dollars (premier achat pour un objet `farmPlot`). */
    price: z.int().min(0).max(100_000_000),
    /** Nombre d'objets par lot (ex. 10 Poké Balls). */
    lotSize: z.int().min(1).max(999),
    /** Condition d'apparition. */
    unlock: unlockConditionSchema,
    /** Avant déblocage : caché, ou verrouillé (visible, grisé, condition affichée). */
    lockedVisibility: z.enum(['hidden', 'locked']),
    /** Limite d'achat par joueur ; null = illimité. */
    purchaseLimit: purchaseLimitSchema.nullable(),
    /** Disponibilité dans le temps (dates ISO) ; null = sans borne. */
    availableFrom: z.iso.datetime({ offset: true }).nullable(),
    availableUntil: z.iso.datetime({ offset: true }).nullable(),
    enabled: z.boolean(),
    /** Objet offert selon la quantité achetée (ex. une Honor Ball par 10 Poké Balls) ; null = aucun. */
    gift: shopGiftSchema.nullable(),
  })
  .refine(
    (e) =>
      !e.availableFrom ||
      !e.availableUntil ||
      Date.parse(e.availableFrom) < Date.parse(e.availableUntil),
    { message: 'La fin doit être après le début', path: ['availableUntil'] },
  );

export type ShopEntry = z.infer<typeof shopEntrySchema>;
