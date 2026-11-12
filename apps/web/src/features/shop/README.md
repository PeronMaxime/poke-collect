# Boutique

Onglet « Boutique » : achat d'objets (limites par jour, par semaine ou au total) et vente des
objets du sac.

## Fichiers

- `ShopPage.tsx` : l'onglet (articles, vente, reçu d'achat).

## Données

`useShop`, `useInventory`.

## Actions

- `purchase` → `POST /api/shop/purchase` ; `sellItem` → `POST /api/shop/sell` ; `markShopSeen`.
