# Pokédex

Onglet « Pokédex » : le Pokédex de chaque région (normal ou chromatique), la fiche d'une espèce,
les collections de formes et la complétion des expéditions, avec leurs récompenses. Sert aussi
au Pokédex d'un autre dresseur, en lecture seule.

## Fichiers

- `PokedexPage.tsx` : l'onglet et la grille (`DexView`) ; `DexSheet.tsx` : fiche d'une espèce ;
  `pokemonSources.ts` : où l'obtenir ; `ProgressionViews.tsx` : collections et complétions.

## Données

`usePokedex`, `usePokedexForms`, `useDexCatches`, `useClaimedRewards`, `usePlayerProgress`.

## Actions

- `claimReward` → `POST /api/progression/claim` (via `useClaim`), puis `refreshAfterReward`.
