# Commun

Ce que plusieurs onglets partagent : le choix d'une équipe, l'écran de combat en temps réel
(dresseurs, donjons, légendaires), les onglets de région, les pièces des fenêtres.

## Fichiers

- `TeamPicker.tsx` et `teamPicker/` : choix d'une équipe (boîte filtrée, panneau, équipes
  enregistrées, conditions du départ dans `conditions.tsx`, testé).
- `DungeonCombat.tsx` et `combat/` : combat en temps réel (`useDungeonCombat`, arène, cartes des
  combattants, bulles d'événements ; `events.ts` testé) ; `CombatWindow.tsx` : sa fenêtre.
- `CombatTeamOrder.tsx` : ordre d'entrée et attaques avant le combat ; `TeamSection.tsx` :
  récapitulatif de l'équipe dans une fenêtre de départ.
- `RegionTabs.tsx` (onglets de région mémorisés), `dialogParts.tsx` (cadres et pièces des
  fenêtres), `WeatherIcon.tsx`, `XpPreview.tsx`, `zoneBanner.ts`.

## Données

`usePokemon`, `useTeams`, `useTags`, `useInventory`, `usePlayerBonuses`.

## Actions

- Combat : `sendCombatOrder` (changer de Pokémon, utiliser un objet) et `endCombat` (réclamer ou
  fuir) sur la route de la famille du combat (`COMBAT_API`) ; `refreshAfterCombat` ensuite.
