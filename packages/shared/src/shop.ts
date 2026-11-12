import { z } from 'zod';
import { slugSchema } from '@poke/content';
import type { GameContent } from '@poke/content';
import type { ShopEntryState } from '@poke/game-core';
import { MAX_LOTS_PER_PURCHASE } from '@poke/game-core';
import type { PlayerProfileDto, UserRole } from './profile';

/**
 * Boutique : achats et reventes.
 */

/** État d'un article visible par le joueur (les articles cachés ne sont pas renvoyés). */
export interface ShopEntryStatusDto {
  entryId: string;
  state: Exclude<ShopEntryState, 'hidden'>;
  /** Prix du prochain lot (il augmente à chaque achat d'une parcelle de ferme). */
  price: number;
  /** Lots achetables d'un coup : un seul quand le prix augmente à chaque achat. */
  maxLotsPerPurchase: number;
  /** Lots encore achetables ; null = illimité. */
  remainingLots: number | null;
  /** Limite par période : date où des lots se libèrent. */
  nextLotsAt: string | null;
  /** Débloqué mais pas encore vu (badge « Nouveau ! »). */
  isNew: boolean;
}

export interface ShopResponse {
  serverTime: string;
  currency: number;
  /** Articles visibles, triés par catégorie puis par ordre. */
  entries: ShopEntryStatusDto[];
}

export const purchaseInputSchema = z.object({
  entryId: slugSchema,
  lots: z.int().min(1).max(MAX_LOTS_PER_PURCHASE),
});

export type PurchaseInput = z.infer<typeof purchaseInputSchema>;

export interface PurchaseResponse {
  entryId: string;
  itemId: string;
  lots: number;
  /** Objets reçus (lots × taille du lot). */
  quantity: number;
  totalPrice: number;
  /** Objets offerts avec l'achat (ex. Honor Balls) ; null = aucun. */
  gift: { itemId: string; quantity: number } | null;
  /** Solde après l'achat. */
  currency: number;
  /** Quantité de l'objet dans le sac après l'achat. */
  inventoryQuantity: number;
  /** Parcelle de ferme (rien n'entre dans le sac) : parcelles de la ferme après l'achat ; null sinon. */
  farmPlots: number | null;
}

export const sellInputSchema = z.object({
  itemId: slugSchema,
  quantity: z.int().min(1).max(1_000_000),
});

export type SellInput = z.infer<typeof sellInputSchema>;

export interface SellResponse {
  itemId: string;
  quantity: number;
  totalPrice: number;
  /** Solde après la vente. */
  currency: number;
  /** Quantité de l'objet restant dans le sac. */
  inventoryQuantity: number;
}

export const markShopSeenInputSchema = z.object({
  entryIds: z.array(slugSchema).min(1).max(500),
});

/** Contenu publié exposé au jeu. */
export type PublicContentDto = GameContent;

export interface MeResponse {
  user: { id: string; email: string; name: string; role: UserRole };
  profile: PlayerProfileDto | null;
  /** Version du contenu publié : le jeu recharge son contenu quand elle change. */
  contentVersion: number | null;
}

// Bêta : profils secondaires (nouvelle partie sans nouveau compte), à retirer après la bêta.
export const selectBetaProfileInputSchema = z.object({
  /** `null` : retour au profil principal. */
  profileId: z.string().min(1).nullable(),
});

export interface BetaProfilesResponse {
  activeProfileId: string;
  maxSecondary: number;
  profiles: { id: string; trainerName: string; main: boolean; starterChosen: boolean }[];
}
