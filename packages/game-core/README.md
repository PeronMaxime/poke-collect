# `@poke/game-core` : les règles du jeu

Toutes les règles, en **fonctions pures** : pas de base, pas de réseau, pas d'horloge, pas de
`Math.random()`. Une fonction reçoit le contenu (`GameContext`), des entrées et une graine, et
renvoie un résultat. Le serveur s'en sert pour décider ; le jeu et l'admin pour afficher des
aperçus avec les mêmes formules.

Vue d'ensemble : [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md). Les mots du jeu :
[docs/GLOSSAIRE.md](../../docs/GLOSSAIRE.md).

## Les deux objets à connaître

- **`GameContext`** (`context.ts`) : le contenu publié, indexé (`ctx.zone(id)`, `ctx.item(id)`,
  `ctx.species(id, formId)`, `ctx.balance`…). Toute règle le reçoit en premier paramètre :
  `game-core` ne connaît aucune valeur de contenu à l'avance.
- **`Rng`** (`rng.ts`) : générateur à graine (`createRng(seed)`). Même graine, même suite de
  tirages. L'ordre des tirages fait partie du comportement : en ajouter un au milieu d'une
  fonction change tous les résultats suivants.

## Les modules

| Fichier                                            | Règles                                                                      |
| -------------------------------------------------- | --------------------------------------------------------------------------- |
| `pokemon.ts`                                       | Statistiques, PE, courbes d'XP, génération d'un Pokémon                     |
| `expedition.ts`                                    | Rencontres, capture, pitié, plan de Balls, butin, cadence, XP d'équipe      |
| `shiny.ts`                                         | Chromatiques : taux, chaîne, Charme, Masuda                                 |
| `weather.ts`, `roaming.ts`                         | Météo horaire des zones ; cachette des Pokémon fuyards                      |
| `dungeon.ts`                                       | Le moteur de combat en temps réel (`simulateDungeon`) et les donjons        |
| `battle.ts`, `legendary.ts`                        | Combats de dresseurs et légendaires, sur le même moteur                     |
| `abilities.ts`                                     | Talents : modificateurs, conditions, effets de combat, postes d'assistant   |
| `breeding.ts`                                      | Pension, œufs, héritage, transfert et Bonbons de lignée                     |
| `evolution.ts`, `forms.ts`, `mega.ts`              | Évolutions (formes comprises), Méga-Évolution                               |
| `endgame.ts`                                       | Objets utilisés sur un Pokémon : Capsules, Aromates, Pilule et Patch Talent |
| `museum.ts`, `center.ts`, `farm.ts`                | Fossiles, soins, baies                                                      |
| `progress.ts`                                      | Conditions de déblocage et avancement du joueur                             |
| `progression.ts`, `completion.ts`, `facilities.ts` | Collections, complétions, bâtiments débloqués, bonus                        |
| `quest.ts`, `guilds.ts`, `shop.ts`                 | Quêtes, quêtes et coffres de guilde, boutique                               |
| `auto-team.ts`, `auto-transfer.ts`                 | Sélection automatique d'une équipe ; règles de transfert automatique        |
| `simulate.ts`                                      | Simulateur de zone de l'admin (moyennes sur N expéditions)                  |

Tout est réexporté par `index.ts`.

## Tests

```sh
pnpm --filter @poke/game-core test
```

- Un fichier `*.test.ts` par module, sur le contenu de test (`testContext()` dans
  `test-helpers.ts`, qui accepte une fonction pour l'ajuster).
- **`golden.test.ts`** : 800 situations tirées au hasard, dont l'empreinte du résultat est
  comparée à celle enregistrée dans `__snapshots__/`. Il garantit qu'un rangement de code ne
  change aucun résultat. Il échoue donc, à dessein, dès qu'une règle ou le contenu de test
  change : relire les lignes modifiées, puis réenregistrer avec `-- -u`.

## Ce que ce paquet n'a pas le droit de faire

Importer `@poke/db`, `@poke/shared`, Fastify ou React ; lire l'heure courante ; utiliser
`Math.random()`. ESLint vérifie les imports.
