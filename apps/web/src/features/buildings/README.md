# Colonne des bâtiments

Colonne de droite sur grand écran : une fenêtre (« widget ») par bâtiment — Centre Pokémon,
pension, couveuse, Musée, ferme — qu'on peut déplacer, replier ou masquer (réglages propres à
l'appareil, `lib/widgets.ts`). Chaque fenêtre résume l'onglet du bâtiment et en reprend les
actions courantes.

## Fichiers

- `BuildingsColumn.tsx` : la colonne (ordre, glisser-déposer, menu « Widgets »).
- `CenterTile.tsx`, `DaycareTile.tsx`, `IncubatorTile.tsx`, `MuseumTile.tsx`, `FarmTile.tsx` :
  une fenêtre chacune ; `tileParts.tsx` (cadre, en-tête, poignée), `tileIcons.tsx`.
- `AssistantCard.tsx` : assistant d'un poste (talent, effet, choix) ; `BuildingParts.tsx` :
  pièces communes aux fenêtres et aux onglets des bâtiments.

## Données

`useDaycare`, `useMuseum`, `useFarm`, `useAssistants`, `usePokemon`, `useInventory`.

## Actions

- Les mêmes que les onglets : `useHeal`, `collectEggs`, `hatchEggs`, `incubateEggs`,
  `depositFossil`, `reviveFossils`, `plantBerry`, `harvestBerries`, `assignAssistant`…
- Chaque action ne recharge que ce qu'elle change (`refresh(queryClient, …)`).
