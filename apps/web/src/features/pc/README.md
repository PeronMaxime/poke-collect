# PC

Onglet « PC » : tous les Pokémon du joueur (recherche, filtres, tri, étiquettes), la fiche d'un
Pokémon et ce qu'on peut y faire : évoluer, Méga-Évoluer, donner des Bonbons ou un objet,
verrouiller, transférer au Professeur, relâcher un légendaire.

## Fichiers

- `PcPage.tsx` : l'onglet ; `PcBrowser.tsx` : recherche, filtres et tri (`usePcBrowser`, repris
  par d'autres écrans) ; `transferMode.tsx`, `DuplicateSettings.tsx` : transfert en lot.
- `sheet/` : la fiche d'un Pokémon (`PokemonDetail.tsx`, sections, actions, évolutions,
  `ItemUseDialog.tsx`) ; `EvolutionReveal.tsx` : animation d'une évolution.

## Données

`usePokemon` (`/api/pokemon`), `useTags`, `useCandies`, `useInventory`, `useQuests`,
`usePlayerProgress`.

## Actions

- `evolvePokemon`, `megaEvolvePokemon`, `revertMegaEvolution`, `giveCandies`, `applyItem`,
  `updatePokemon` (verrou, étiquettes), `transferPokemon` → `POST /api/pokemon/transfer`,
  `releaseLegendary` ; `useHeal`, `useRevive`.
