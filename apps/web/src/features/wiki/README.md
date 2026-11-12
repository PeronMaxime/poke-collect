# Wiki

Wiki du jeu (`#wiki/…`), lisible sans rien changer : les Pokémon (liste filtrée, fiche d'une
espèce), les talents, le tutoriel.

## Fichiers

- `WikiPage.tsx` : aiguillage selon l'adresse (`useWikiPath`) ; `WikiPokemonPage.tsx`,
  `WikiAbilitiesPage.tsx`, `WikiTutorialPage.tsx` ; `wiki.ts` : liens ; `WikiBreadcrumb.tsx`.

## Données

Le contenu publié du jeu (`ctx`, d'où `useWikiAbilities` tire les talents), `usePokedex`
(espèces capturées).

## Actions

Aucune : le wiki ne fait que lire.
