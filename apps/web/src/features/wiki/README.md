# Wiki

Wiki du jeu (`#wiki/…`), lisible sans rien changer : les Pokémon (liste filtrée, fiche d'une
espèce), les talents, le tutoriel. Le tutoriel s'ouvre aussi en popup quand le joueur choisit son
tout premier starter (compte principal comme profil secondaire), avec un bouton « Masquer » et un
rappel qu'il reste dans le wiki.

## Fichiers

- `WikiPage.tsx` : aiguillage selon l'adresse (`useWikiPath`) ; `WikiPokemonPage.tsx`,
  `WikiAbilitiesPage.tsx`, `WikiTutorialPage.tsx` (dont `TutorialContent`, le tutoriel lui-même) ;
  `wiki.ts` : liens ; `WikiBreadcrumb.tsx`.
- `TutorialDialog.tsx` : la popup du tutoriel, posée à la racine (`App.tsx`) et ouverte par
  `openTutorial()` depuis `StarterPage` ; elle se ferme aussi quand on suit l'un de ses liens.

## Données

Le contenu publié du jeu (`ctx`, d'où `useWikiAbilities` tire les talents), `usePokedex`
(espèces capturées).

## Actions

Aucune : le wiki ne fait que lire.
