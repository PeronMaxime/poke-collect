# Combats

Onglet « Combats » : les dresseurs à affronter, région par région (Champions, Conseil 4,
dresseurs par palier, dresseurs de quête), le départ d'un combat et son résultat. Le combat
lui-même est l'écran commun `common/DungeonCombat.tsx`.

## Fichiers

- `BattlesPage.tsx` et `useBattlesPage.ts` : l'onglet (listes par région, combat en cours).
- `trainerLists.ts` (+ test) : quels dresseurs montrer et dans quel ordre ; `TrainerCards.tsx`,
  `trainerParts.tsx` : leurs cartes ; `trainerLink.ts` : lien `#battles/<dresseur>`.
- `LaunchBattleDialog.tsx` et `launch/useLaunchBattle.ts` : départ (équipe, vérifications).
- `BattleResult.tsx` : fenêtre du résultat.

## Données

`useBattles` (`/api/battles`), `useQuests`, `usePlayerProgress`, `usePlayerBonuses`.

## Actions

- `startBattle` → `POST /api/battles` ; ordres et fin du combat via `common/combat`
  (`sendCombatOrder`, `endCombat`) ; `markBattleSeen` → `POST /api/battles/:id/seen`.
