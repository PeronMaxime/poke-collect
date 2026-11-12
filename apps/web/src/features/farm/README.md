# Ferme à baies

Onglet « Ferme à baies » : des champs de 9 parcelles ; une baie plantée ne pousse que si son champ
est arrosé (assistant de type Eau) ; un assistant de récolte en ajoute à chaque récolte.

## Fichiers

- `FarmPage.tsx` : l'onglet (une carte par champ, choix de la baie à planter).

## Données

`useFarm` (`/api/farm`), `useInventory` (baies), `useAssistants`, `useNow`.

## Actions

- `plantBerry` → `POST /api/farm` ; `uprootBerry` → `DELETE /api/farm/:plot` ;
  `harvestBerries` (une parcelle ou tout).
