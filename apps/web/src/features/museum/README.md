# Musée

Onglet du Musée : on y dépose un fossile ; après quelques heures il redevient un Pokémon. Chaque
place a son assistant, dont le talent agit sur le fossile.

## Fichiers

- `MuseumPage.tsx` : l'onglet (places, fossiles du sac, où en trouver).

## Données

`useMuseum` (`/api/museum`), `useInventory` (fossiles), `useAssistants`, `useNow`.

## Actions

- `depositFossil` → `POST /api/museum` ; `reviveFossils` → `POST /api/museum/revive` ;
  `withdrawFossil` → `DELETE /api/museum/:id`.
