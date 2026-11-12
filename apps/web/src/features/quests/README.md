# Quêtes

Onglet « Quêtes » : des étapes à valider dans l'ordre, puis une récompense à réclamer ; le
légendaire de la quête s'affronte ensuite depuis cette page (les fuyards se croisent en
expédition), puis se capture.

## Fichiers

- `QuestsPage.tsx` : l'onglet (quêtes par région, combat en cours) ; `LegendaryViews.tsx` :
  départ du combat légendaire, capture du légendaire vaincu, défaite.

## Données

`useQuests`, `useLegendaryBattles` (`/api/legendary-battles`), `useExpeditions` (fuyards),
`useInventory` (Balls), `usePlayerProgress`.

## Actions

- `claimQuest` → `POST /api/quests/:id/claim` ; `startLegendaryBattle` →
  `POST /api/quests/:id/battle` ; `captureLegendary` → `POST /api/legendary-battles/:id/capture`.
