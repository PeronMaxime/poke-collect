# `@poke/web` : le jeu

React, Vite, Tailwind, TanStack Query. Le jeu affiche l'état renvoyé par l'API et lui demande
des actions ; il ne décide d'aucun résultat.

Vue d'ensemble : [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md), section 8.

## Organisation

```
src/
  main.tsx            Entrée : cache des requêtes, journal des erreurs, service worker
  App.tsx             Aiguillage : connexion, création du dresseur, starter, ou le jeu
  index.css           Thème (style rétro), utilitaires `card`, `tile`, `sprite-well`, `count-badge`
  lib/
    api.ts            `api()` : appel de l'API, délai maximal, `ApiError`, réessais des lectures
    game.ts           Clés de cache, lectures (`usePokemon`…), rechargements après action
    labels.ts         Libellés partagés et messages d'erreur (`GAME_ERRORS`)
    widgets.ts        Rangement de la colonne des bâtiments (par navigateur)
    pwa.ts, theme.ts, tab-profile.ts, log.ts, pokemon-shadows.ts
  components/         Briques communes : `ui.tsx` (boutons, dialogues, sprites), étiquettes, grille
  pages/
    HomePage.tsx      Coquille du jeu : en-tête, menu, onglet affiché (ancre de l'adresse)
    AuthPage, CreateProfilePage, StarterPage, SettingsDialog, ChangelogPage, LegalPages…
    game/             Les écrans du jeu : un fichier `…Page.tsx` par onglet, et leurs morceaux
test/                 Tests d'écran (jsdom contre la vraie API en mémoire)
public/               `sw.js`, `manifest.webmanifest`, icônes
```

## Comment un écran obtient ses données

1. Une lecture est un hook de `lib/game.ts` (`useExpeditions()`, `usePokemon()`…), qui appelle
   `api()` sous une clé de `keys`.
2. Les données restent fraîches 30 s : changer d'onglet ne recharge rien.
3. Une action est un `useMutation` qui appelle `api()` puis recharge **seulement** les clés
   qu'elle a pu changer (`refresh(queryClient, keys.expeditions, keys.inventory)` ou une fonction
   `refreshAfter…`). Recharger tout (`PLAYER_STATE_KEYS`) est réservé au choix du starter.
4. Le contenu du jeu (`useGameContext()`) est chargé une fois et gardé tant que le serveur
   n'annonce pas une autre version.
5. Un aperçu (puissance, chances, XP) se calcule avec les fonctions de `@poke/game-core`, les
   mêmes que le serveur.

Une erreur d'action s'affiche avec `errorText(err)` (`lib/labels.ts`).

## Navigation

Pas de routeur. L'onglet suit l'ancre : `#pc`, `#expeditions/<zone>`, `#wiki/pokemon`. Les
onglets, leur ordre et leur regroupement viennent du contenu (`MENU_TABS`, `balance.menu`) ; un
onglet verrouillé (`balance.tabUnlocks`) retombe sur les expéditions.

## Ce que le navigateur garde

`localStorage` (clés préfixées `dexpedition.` pour la plupart) : sections du menu repliées, widgets, filtres,
ordre des équipes, version des nouveautés lue. Rien d'important : tout l'état du jeu est sur le
serveur.

## Tests

```sh
pnpm --filter @poke/web test
```

- `src/**/*.test.ts` : fonctions pures.
- `test/**/*.test.tsx` : écrans rendus dans jsdom. `test/global-setup.ts` lance la vraie API en
  mémoire, `test/setup.ts` y dirige `fetch`, `test/game.tsx` crée un joueur (`newPlayer()`) et
  affiche le jeu (`renderGame('#pc')`).
