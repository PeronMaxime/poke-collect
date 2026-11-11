# Sac

Onglet « Sac » : les objets du joueur rangés en onglets et rubriques (réglés dans l'admin,
`balance.bag`), ses œufs et ses Bonbons ; et les fenêtres qui utilisent un objet sur un Pokémon.

## Fichiers

- `InventoryPage.tsx` : l'onglet ; une carte par objet (`ItemCard`) avec son bouton.
- `ItemPokemonPicker.tsx` : fenêtre commune « choisir des Pokémon pour un objet » (boîte filtrée à
  gauche, panneau de l'objet à droite) ; `HappinessDialog.tsx` (baie de bonheur, Super Bonbon) et
  `ReviveDialog.tsx` (Rappels) la remplissent.
- `ChestOpenDialog.tsx`, `ChestLootHover.tsx` : coffres de guilde (ouverture, contenu possible).

## Données

`useInventory` (`/api/inventory`), `useCandies`, `useDaycare` (œufs du sac), `usePokemon`.

## Actions

- `applyItem` → `POST /api/pokemon/:id/use-item` (bonheur, niveau) ; `useRevive` (Rappels) ;
  `openChest` → `POST /api/items/open-chest`.
- Après une action : `patchPokemon` et `setItemQuantity` corrigent le cache sans tout recharger.
