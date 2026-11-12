# Expéditions

Onglet « Expéditions » : les zones de chaque région, le départ d'une équipe (durée libre, Balls
et baies emportées), l'expédition en cours (chemin animé, captures au fil de l'eau, fuyards
croisés) et le retour (révélation des captures et du butin).

## Fichiers

- `ExpeditionsPage.tsx` : l'onglet ; `ZoneCard.tsx` : une zone ; `ActiveExpedition.tsx`,
  `ExpeditionTrail.tsx` : une expédition en cours.
- `LaunchExpeditionDialog.tsx` et `launch/` : départ (`useLaunchExpedition`, aperçu calculé par
  `preview.ts`, testé ; réglages de la zone `zoneSettings.ts`).
- `ExpeditionRevealView.tsx`, `LootReveal.tsx`, `returnSummary.ts` (testé) : le retour.
- `useExpeditionActions.ts` : réclamer, annuler, mettre en favori ; `AutoTransferSettings.tsx` :
  transfert automatique des captures.

## Données

`useExpeditions` (`/api/expeditions`), `usePokemon`, `useInventory`, `usePokedex`,
`useDexCatches`, `usePlayerProgress`, `usePlayerBonuses`.

## Actions

- `startExpedition` → `POST /api/expeditions` ; `claimExpedition`, `cancelExpedition`
  (`/api/expeditions/:id/…`) ; `setFavoriteZone` ; `chooseRegionStarter` → starter d'une région.
- Rechargements ciblés : `refreshAfterExpeditionStart`, `refreshAfterExpeditionClaim`.
