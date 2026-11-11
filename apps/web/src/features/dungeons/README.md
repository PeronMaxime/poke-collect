# Donjons

Onglet « Donjons » : un donjon par Méga-Évolution, révélé par la capture d'un Pokémon de sa
lignée ; la tentative en cours, le départ (équipe) et le résultat. Le combat est l'écran commun
`common/DungeonCombat.tsx`.

## Fichiers

- `DungeonsPage.tsx`, `useDungeonsPage.ts` : l'onglet ; `LaunchDungeonDialog.tsx`,
  `useLaunchDungeon.tsx` : le départ ; `DungeonResult.tsx`, `DungeonDifficultyBadge.tsx`.

## Données

`useDungeons` (`/api/dungeons`), `usePokemon`, `usePlayerProgress`, `usePlayerBonuses`.

## Actions

- `startDungeon` → `POST /api/dungeons` ; `markDungeonSeen` ; soins des K.O. (`useHeal`).
