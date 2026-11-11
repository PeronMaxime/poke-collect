# Fiche Dresseur et classements

Fiche Dresseur : la sienne (vitrine de Pokémon et favori modifiables), celle d'un autre dresseur
(`#trainer/<nom>`) et son Pokédex ; la recherche d'un dresseur ; les classements.

## Fichiers

- `TrainerCardPage.tsx` : les fiches et l'éditeur de la vitrine ; `FavoritePicker.tsx` : choix du
  favori ; `LeaderboardPage.tsx` : classements des dresseurs et des guildes.

## Données

`useTrainerCard`, `useTrainerProfile`, `useTrainerPokedex`, `useTrainerSearch`,
`useLeaderboard`, `useGuildLeaderboard`.

## Actions

- `setFeaturedPokemon` → `PUT /api/trainer-card/featured` ; `setFavoritePokemon` →
  `PUT /api/trainer-card/favorite`.
