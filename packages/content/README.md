# `@poke/content` : la forme du contenu

Ce qu'est le **contenu** du jeu (tout ce qui se règle dans l'admin), et à quelles conditions il
est valide. Ce paquet ne contient aucune règle de jeu et ne parle à aucune base.

Voir « Le contenu du jeu » dans [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md), et « Changer
le contenu » dans [docs/RECETTES.md](../../docs/RECETTES.md).

## Les fichiers

| Fichier                | Rôle                                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| `schemas/`             | Les schémas Zod de chaque entité et de l'équilibrage ; les types en sont déduits                            |
| `integrity.ts`         | `contentIssues` : références croisées et alertes, exigées pour publier                                      |
| `seed/`                | Le contenu de test, écrit en TypeScript, assemblé en `seedContent` et exporté à part : `@poke/content/seed` |
| `ability-proposals.ts` | Propositions d'effets pour les talents (aide de l'admin)                                                    |
| `badge-sprites.ts`     | Image de chaque badge                                                                                       |

## Les entités

`GameContentData` (dans `schemas/`) regroupe : l'équilibrage (`balance`), les régions, les
surcharges d'espèces et d'évolutions, les talents, les objets, les tables de butin, les zones,
les dresseurs, les donjons, les quêtes, la boutique, les quêtes et coffres de guilde.
`GameContent` y ajoute le numéro de version.

Un schéma doit rester capable de lire les **anciennes versions** du contenu gardées en base : un
champ ajouté est `.optional()` ou a un `.default()`.

## Le contenu de test n'est pas la source de vérité

`seedContent` sert aux tests automatiques, et à remplir une base neuve quand l'instantané
`content/game-content.json` est absent. Le contenu réel vit en base et se règle dans l'admin : il
diverge du contenu de test, et c'est voulu. Modifier un fichier `seed/*.ts` ne change rien pour
les joueurs.

## Tests

```sh
pnpm --filter @poke/content test
```

`seed/seed.test.ts` vérifie que le contenu de test est valide et publiable (aucune erreur de
cohérence) ; `menu.test.ts` le rangement du menu.
