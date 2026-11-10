# `@poke/data` : les données PokéAPI

Les données de référence des Pokémon, importées une fois de [PokéAPI](https://pokeapi.co) et
versionnées en JSON. Ce paquet ne dépend de rien et ne change que lorsqu'on relance l'import.

## Les fichiers

| Fichier            | Rôle                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| `generated/*.json` | Espèces (1 025, générations I à IX), formes, chaînes d'évolution, types, natures, talents…     |
| `src/types.ts`     | Les types de ces données (`Species`, `PokemonForm`, `EvolutionChain`…)                         |
| `src/index.ts`     | Les tableaux typés et les accès : `getSpecies`, `getForm`, `speciesForms`, `typeEffectiveness` |
| `src/sprites.ts`   | Adresses des images : `pokemonSpriteUrl`, `itemSpriteUrl` (servies sous `/api/sprites`)        |
| `src/display.ts`   | Couleurs des types, sections de formes du Pokédex                                              |
| `src/habitat.ts`   | Habitat déduit pour les espèces qui n'en ont pas dans PokéAPI (générations IV et suivantes)    |

`generated/` n'est jamais modifié à la main, ni formaté, ni analysé par ESLint.

## Régénérer

```sh
pnpm import:pokeapi [--gens 1,2,3,4]   # réécrit packages/data/generated (cache dans scripts/import-pokeapi/.cache)
pnpm sprites:download [--force]        # images dans apps/api/sprites
```

Le script est dans `scripts/import-pokeapi`. Les illustrations (`apps/api/sprites/artwork`) sont
trop lourdes pour Git : elles se téléchargent en local et au déploiement.

## Formes

Une forme (`forms.json`, champ `kind`) remplace les types, statistiques et talents de son espèce
et a ses propres images : régionales, Méga-Évolutions, Gigamax, formes d'apparence (identifiant
= 100 000 + identifiant PokéAPI de la forme). Le Pokédex reste tenu par espèce, avec des sections
de formes à part (`DEX_FORM_SECTIONS`).

## Surcharges

Ces données sont une base en lecture seule. Ce que le jeu en change (espèce désactivée, habitat,
évolution différente) est du **contenu** (`speciesOverrides`, réglé dans l'admin) et s'applique
dans `GameContext.species()` de `@poke/game-core`.
