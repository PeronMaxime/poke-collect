# Quêtes

Onglet « Quêtes » : des étapes à valider dans l'ordre, puis une récompense à réclamer (les objets
de quête sont alors rendus, retirés du Sac : `ClaimQuestResponse.handedIn`) ; le
légendaire de la quête s'affronte ensuite depuis cette page (les fuyards se croisent en
expédition), puis se capture. Les quêtes de formes (`quest.kind === 'form'`) ont leur section sous
les quêtes légendaires de la région : leur récompense est un objet de forme, à faire tenir au PC ;
leur portrait est la forme que donne cet objet.

## Fichiers

- `QuestsPage.tsx` : l'onglet (quêtes par région, combat en cours) ; `LegendaryViews.tsx` :
  départ du combat légendaire, capture du légendaire vaincu, défaite.

## Données

`useQuests`, `useLegendaryBattles` (`/api/legendary-battles`), `useExpeditions` (fuyards),
`useInventory` (Balls), `usePlayerProgress`.

## Actions

- `claimQuest` → `POST /api/quests/:id/claim` ; `startLegendaryBattle` →
  `POST /api/quests/:id/battle` ; `captureLegendary` → `POST /api/legendary-battles/:id/capture`.
