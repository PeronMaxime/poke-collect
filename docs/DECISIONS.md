# Décisions : pourquoi c'est fait ainsi

Les choix qui structurent le projet, avec leur raison et ce qu'ils coûtent. À relire avant de
vouloir en changer un : la plupart répondent à un problème déjà rencontré.

## Le serveur décide, la graine fait foi

**Choix.** Aucun résultat n'est calculé par le navigateur. Chaque activité enregistre une graine
au lancement ; le résultat est calculé à la réclamation par une fonction pure de `game-core`.

**Pourquoi.** Impossible de tricher en modifiant le jeu dans son navigateur ; un résultat
contesté se rejoue à l'identique ; les règles se testent sans base ni réseau.

**Prix.** Une activité en cours se résout avec le code du jour de la réclamation. Changer une
règle demande donc de penser aux activités déjà lancées (voir « Changer une règle » dans
[RECETTES.md](RECETTES.md)).

## Le contenu est en base, versionné, et c'est la base qui fait foi

**Choix.** Zones, dresseurs, objets, équilibrage… sont des données éditées dans l'admin, pas du
code. Un brouillon se prépare puis se publie d'un coup ; les anciennes versions sont gardées.

**Pourquoi.** Régler le jeu sans déployer ; revenir en arrière ; terminer une expédition avec le
contenu de son départ.

**Prix.** Trois copies du contenu coexistent (base, instantané `game-content.json`, contenu de
test) et il faut savoir laquelle fait foi : **la base**. Toute migration de contenu doit être
ciblée pour ne pas écraser les réglages de l'admin, en local comme en production.

## Pas de tâche de fond par joueur : on rattrape à la requête

**Choix.** Rien ne s'exécute pour un joueur absent. Les états qui dépendent du temps sont
calculés à la lecture, ou rattrapés par `PlayerSettler` à sa requête suivante.

**Pourquoi.** Aucune file de tâches à exploiter, aucune charge pour les joueurs inactifs, et un
serveur qui redémarre sans rien perdre.

**Prix.** Chaque lecture doit penser « et si le temps a passé ? ». Les deux seules tâches de
fond (notifications push, coffres de guilde) sont globales, pas par joueur.

## Un verrou par joueur pour toutes ses écritures

**Choix.** `playerTransaction` prend un verrou Postgres au nom du joueur en tête de chaque
transaction d'action.

**Pourquoi.** Deux clics rapprochés, ou deux onglets, donnaient des doubles réclamations et des
Pokémon envoyés deux fois. Un joueur agit à vitesse humaine : faire passer ses actions l'une
après l'autre ne coûte rien et supprime toute cette famille de bugs.

**Prix.** Une action qui touche deux joueurs (guildes) doit verrouiller les deux, toujours dans
le même ordre (`lockPlayers` s'en charge).

## PGlite en développement, Postgres en production

**Choix.** Sans `DATABASE_URL`, l'API utilise PGlite, un Postgres embarqué dans un dossier.

**Pourquoi.** Développer et tester sans Docker ; des tests qui partent d'une base neuve en
mémoire en quelques secondes.

**Prix.** PGlite n'accepte qu'un processus et qu'une connexion : jamais deux programmes sur
`.data/pglite`, et les tests d'actions simultanées exigent un vrai Postgres (en CI).

## Un seul processus d'API

**Choix.** La production fait tourner une API, une base, un serveur web, sur une seule machine.

**Pourquoi.** Suffisant pour la taille du jeu, et bien plus simple à exploiter.

**Prix.** Plusieurs états vivent dans la mémoire du processus (cache du contenu, limite de
requêtes, supervision, tâches de fond). La liste et ce qu'il faudrait changer sont dans
[ARCHITECTURE.md](ARCHITECTURE.md), section 10, et dans [SURCHARGE.md](SURCHARGE.md).

## L'API tourne en TypeScript, sans étape de compilation

**Choix.** L'API est lancée par `tsx`, en développement comme en production. Les paquets
internes exportent directement leurs sources (`"exports": "./src/index.ts"`).

**Pourquoi.** Aucune chaîne de compilation à maintenir entre les paquets ; ce qui tourne en
production est ce qui a été testé.

**Prix.** Quelques secondes de démarrage en plus et la mémoire de `tsx`
([SURCHARGE.md](SURCHARGE.md), 2.2).

## Pas de routeur dans le jeu

**Choix.** Le jeu affiche un écran selon l'état du joueur, puis un onglet selon l'ancre de
l'adresse (`#pc`). L'admin, lui, utilise React Router.

**Pourquoi.** Le jeu est un seul écran à onglets : l'ancre suffit, se partage et survit au
rechargement.

**Prix.** La logique d'onglets (verrouillage, repli, pastilles) est concentrée dans `HomePage`.

## Recharger peu, et seulement ce qui a changé

**Choix.** Les données restent fraîches 30 s ; après une action, on ne recharge que les clés
qu'elle a pu modifier ; la liste des Pokémon et le contenu utilisent un ETag.

**Pourquoi.** Le jeu envoyait une dizaine de requêtes par geste et finissait par se faire
refuser par la limite de requêtes (voir [plans/PLAN-STABILITE.md](plans/PLAN-STABILITE.md)).

**Prix.** Chaque nouvelle action doit dire ce qu'elle invalide. En développement, `lib/api.ts`
avertit dans la console au-delà de 20 requêtes en 5 secondes.

## PWA écrite à la main

**Choix.** `public/sw.js` et `manifest.webmanifest` sont écrits à la main, sans extension Vite.

**Pourquoi.** Le besoin est petit (installation, cache des sprites, page hors ligne,
notifications) et un service worker généré est difficile à comprendre quand il se trompe.

**Prix.** Le découpage du JavaScript en plusieurs fichiers doit être vérifié avec lui.

## Textes en français dans le code, identifiants en anglais

**Choix.** Le jeu n'existe qu'en français : les textes sont écrits dans les composants. Le code
(noms de fonctions, de tables, de champs) est en anglais, les commentaires en français.

**Pourquoi.** Pas de couche de traduction à entretenir pour une seule langue.

**Prix.** Traduire le jeu demanderait d'extraire tous les textes. Le lien entre les mots du jeu
et ceux du code est tenu dans [GLOSSAIRE.md](GLOSSAIRE.md).

## TypeScript 6.0, pas plus récent

**Choix.** `typescript` est fixé à `~6.0`.

**Pourquoi.** `typescript-eslint` ne prend pas encore en charge TypeScript 7.

**À revoir** quand il le fera.

## Profils secondaires : provisoire

**Choix.** Pendant la bêta, un compte peut ouvrir une seconde partie sans autre inscription
(`beta-profiles.ts`).

**Pourquoi.** Laisser les testeurs recommencer une partie sans perdre la leur.

**À retirer** après la bêta : c'est le seul endroit où l'identité du joueur (`request.user.id`)
diffère de celle du compte (`accountUserId`).
