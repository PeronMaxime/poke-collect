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
    queries/          Couche de données : clés de cache, lectures, requêtes d'action, par domaine
    labels/           Textes composés : noms, effets, conditions, récompenses, durées, erreurs
                      (`GAME_ERRORS` dans `errors.ts`)
    widgets.ts        Rangement de la colonne des bâtiments (par navigateur)
    lazy.ts           `lazyPage()` : page chargée à la demande, préchargement
    storage.ts        Accès à `localStorage` qui ne plante jamais (navigation privée, quota)
    pwa.ts, theme.ts, tab-profile.ts, log.ts, pokemon-shadows.ts
  components/         Briques communes : `ui/` (un fichier par composant : `Modal`, `PokemonSprite`,
                      `HoverBubble`, `useNow`…), étiquettes, grille, repli
  pages/
    HomePage.tsx      Coquille du jeu : en-tête, menu, onglet affiché (ancre de l'adresse)
    AuthPage, CreateProfilePage, StarterPage, SettingsDialog, ChangelogPage, LegalPages…
  features/           Les écrans du jeu, un dossier par domaine
    pages.ts          La liste des pages (une par onglet), chargées à la demande
    expeditions/ pc/ battles/ dungeons/ daycare/ farm/ museum/ center/ quests/ shop/ bag/
    pokedex/ teams/ trainer/ guild/ wiki/
                      Un domaine : sa page `…Page.tsx`, ses dialogues et ses morceaux
    buildings/        Colonne des bâtiments (grand écran), assistants, pièces communes
    common/           Ce que plusieurs domaines partagent : choix d'équipe (`TeamPicker`), combat
                      en temps réel (`DungeonCombat`), onglets de région, cadres de dialogue
test/                 Tests d'écran (jsdom contre la vraie API en mémoire)
public/               `sw.js`, `manifest.webmanifest`, icônes
```

## Comment un écran obtient ses données

Tout passe par `lib/queries/` : un écran n'écrit aucune adresse de l'API.

| Fichier                       | Contenu                                                           |
| ----------------------------- | ----------------------------------------------------------------- |
| `keys.ts`                     | Clés de cache, `refresh()` et les `refreshAfter…` par famille     |
| `cache.ts`                    | Retouches du cache sans relire le serveur (`patchPokemon`…)       |
| `clock.ts`                    | Heure locale envoyée au serveur, écart avec l'horloge du serveur  |
| `player.ts`                   | Compte, profil, contenu du jeu, avancement, récompenses           |
| `pokemon.ts`, `pokedex.ts`    | PC, étiquettes, équipes, Bonbons, évolutions ; Pokédex            |
| `inventory.ts`, `shop.ts`     | Sac, coffres ; boutique                                           |
| `expeditions.ts`, `combat.ts` | Expéditions ; dresseurs, donjons, légendaires                     |
| `buildings.ts`                | Pension, couveuses, Musée, Ferme, Centre, assistants              |
| `guild.ts`, `quests.ts`       | Guildes ; quêtes                                                  |
| `trainers.ts`, `settings.ts`  | Fiche Dresseur, classements, autres joueurs ; notifications, bêta |

1. Une lecture est un hook (`useExpeditions()`, `usePokemon()`…), qui appelle `api()` sous une clé
   de `keys`.
2. Les données restent fraîches 30 s : changer d'onglet ne recharge rien.
3. Une action est une fonction de requête du domaine (`startExpedition(input)`,
   `collectEggs(slot, to)`…), appelée par le `useMutation` de l'écran. Son `onSuccess` recharge
   **seulement** les clés que l'action a pu changer (`refresh(queryClient, keys.expeditions)` ou
   une fonction `refreshAfter…`). Recharger tout (`PLAYER_STATE_KEYS`) est réservé au choix d'un
   starter.
4. Le contenu du jeu (`useGameContext()`) est chargé une fois et gardé tant que le serveur
   n'annonce pas une autre version.
5. Un aperçu (puissance, chances, XP) se calcule avec les fonctions de `@poke/game-core`, les
   mêmes que le serveur.

Une erreur d'action s'affiche avec `errorText(err)` (`lib/labels/errors.ts`).

## Navigation

Pas de routeur. L'onglet suit l'ancre : `#pc`, `#expeditions/<zone>`, `#wiki/pokemon`. Les
onglets, leur ordre et leur regroupement viennent du contenu (`MENU_TABS`, `balance.menu`) ; un
onglet verrouillé (`balance.tabUnlocks`) retombe sur les expéditions.

## Ce qui est chargé, et quand

À l'ouverture, le navigateur ne reçoit que la coquille (`HomePage`), les composants communs,
les bibliothèques (`vendor-….js`) et les données PokéAPI (`data-….js`). Ces deux derniers
fichiers portent un nom tiré de leur contenu : tant qu'ils ne changent pas, ils restent en cache
d'une mise en ligne à l'autre.

Chaque onglet est une page chargée à la demande, déclarée dans `features/pages.ts` avec
`lazyPage()`. Une fois le jeu affiché, les pages de `PRELOADED_PAGES` se téléchargent en avance
(navigateur inactif) : changer d'onglet reste immédiat. Le wiki attend qu'on l'ouvre.

Ajouter un onglet : exporter sa page depuis `pages.ts`, l'afficher dans `HomePage`, et ne jamais
l'importer directement depuis la coquille (elle reviendrait dans le code d'ouverture).

Si un fichier a disparu parce qu'une mise en ligne a eu lieu pendant la visite, le chargement
échoue : `UpdatePrompt` vérifie aussitôt `/version.json` et propose de recharger.

```sh
pnpm --filter @poke/web build
node scripts/bundle-size.mjs apps/web/dist   # poids à l'ouverture, plafonné par la CI
```

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
