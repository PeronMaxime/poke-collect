# Architecture de Dexpedition

La carte du projet : ce que contient chaque dossier, comment une action du joueur traverse le
code, et les quelques mécanismes qu'il faut connaître avant de modifier quoi que ce soit.

Voir aussi : [GLOSSAIRE.md](GLOSSAIRE.md) (les mots du jeu et leur nom dans le code),
[RECETTES.md](RECETTES.md) (comment ajouter telle ou telle chose), [DECISIONS.md](DECISIONS.md)
(pourquoi c'est fait ainsi).

## 1. Vue d'ensemble

Dexpedition est un jeu web « idle » : le joueur lance des activités qui durent (expéditions,
pension, combats…), ferme le jeu, et revient chercher le résultat. Trois règles en découlent et
structurent tout le code :

1. **Le serveur décide de tout.** Le navigateur affiche et demande ; il ne calcule jamais un
   résultat qui compte.
2. **Tout résultat se recalcule à partir d'une graine.** Au lancement d'une activité, le serveur
   tire une graine et l'enregistre. Le résultat n'est calculé qu'à la réclamation, par une fonction
   pure : même graine, même contenu, même résultat.
3. **Rien ne tourne pendant l'absence du joueur.** Pas de tâche par joueur : le temps écoulé est
   « rattrapé » à sa prochaine requête.

```
apps/
  web/      Le jeu (React, Vite, Tailwind, TanStack Query)
  admin/    Le panneau d'administration (même pile, avec React Router)
  api/      Le serveur (Fastify, Better Auth, Drizzle)
packages/
  data/       Données PokéAPI importées (JSON) : espèces, formes, types, évolutions…
  content/    Schémas (Zod) du contenu réglable dans l'admin, cohérence, contenu de test
  game-core/  Règles du jeu, en fonctions pures : aucune base, aucun réseau, aucune horloge
  shared/     Contrat de l'API : schémas des entrées, types des réponses
  db/         Schéma Drizzle, migrations, contenu versionné, journal d'admin
scripts/
  import-pokeapi/  Régénère packages/data depuis PokéAPI, télécharge les sprites
  load-test/       Scénario de charge
content/
  game-content.json  Instantané du contenu publié (voir section 4)
deploy/     Scripts et configuration du serveur de production
docs/       Cette documentation, les guides d'exploitation, les plans
```

## 2. Qui dépend de qui

Les flèches se lisent « importe ». Elles ne vont que dans un sens, et ESLint le vérifie
(`eslint.config.js`, « frontières entre paquets »).

```
data  ◄──  content  ◄──  game-core  ◄──┬──  shared  ◄──┬──  web
                                       │               ├──  admin
                                       └──  db  ◄──────┴──  api   (web et admin n'importent pas db)
```

| Paquet      | Peut importer                   | Ne doit jamais importer        |
| ----------- | ------------------------------- | ------------------------------ |
| `data`      | rien                            | tout le reste                  |
| `content`   | `data`                          | `game-core`, `db`, `shared`    |
| `game-core` | `data`, `content`               | `db`, `shared`, Fastify, React |
| `shared`    | `data`, `content`, `game-core`  | `db`                           |
| `db`        | `content`, types de `game-core` | `shared`, les applications     |
| `web`       | tout sauf `db`                  | `db`, Drizzle, Fastify         |
| `admin`     | tout sauf `db`, et `web`        | `db`, Drizzle, Fastify         |
| `api`       | tous les paquets                | `web`, `admin`                 |

Conséquence utile : **`game-core` tourne aussi dans le navigateur.** Le jeu s'en sert pour
afficher des aperçus (puissance d'une équipe, chances de capture, XP attendue) avec exactement
les formules du serveur. L'aperçu n'engage à rien : le serveur refait le calcul.

L'admin réutilise quelques écrans du jeu (simulateur d'expédition) par l'alias `@web`.

## 3. Trajet d'une action

Exemple : le joueur lance une expédition.

```
web   LaunchExpeditionDialog          écran : choix de la zone, de l'équipe, des Balls
        │  api('/api/expeditions', { method: 'POST', json })      lib/api.ts
        ▼
api   routes/game.ts                  1. valide l'entrée (schéma Zod de @poke/shared)
        │                             2. appelle le module de jeu
        ▼
      game/expeditions.ts             startExpedition()
        │   content.get()             contenu publié, en mémoire (ContentCache)
        │   playerTransaction()       transaction + verrou du joueur (game/tx.ts)
        │   checkTeam(), …            règles : fonctions pures de @poke/game-core
        ▼
      base                            ligne `expeditions` : zone, équipe, graine, version du contenu
        │
        ▼
web   refreshAfterExpeditionStart()   ne recharge que ce que l'action a changé (lib/game.ts)
```

Plus tard, `POST /api/expeditions/:id/claim` relit la ligne, appelle `resolveExpedition` de
`game-core` avec la graine et le contenu **de la version enregistrée au départ**, puis applique
le résultat (Pokémon capturés, butin, XP, Pokédex) dans une seule transaction.

Toutes les activités suivent ce schéma en trois temps : **lancer** (vérifier, réserver, tirer la
graine), **attendre** (rien ne tourne), **réclamer** (calculer, appliquer).

### Couches du serveur

| Couche         | Dossier              | Rôle                                                               |
| -------------- | -------------------- | ------------------------------------------------------------------ |
| Démarrage      | `server.ts`          | Base, migrations, contenu initial, tâches de fond, écoute          |
| Application    | `app.ts`             | Assemble Fastify : erreurs, limites, supervision, routes           |
| Session        | `plugins/session.ts` | Qui appelle ? (`requireUser`, `requireAdmin`), rattrapage          |
| Routes         | `routes/*.ts`        | Valider l'entrée, appeler un module de jeu, renvoyer un DTO        |
| Modules de jeu | `game/*.ts`          | Lire et écrire la base, appeler `game-core`, lever des `GameError` |
| Règles         | `@poke/game-core`    | Décider (fonctions pures)                                          |

### Erreurs

- Un module de jeu refuse une action par `throw new GameError(statut, 'CODE')`
  (`game/errors.ts`). Le code est stable : c'est lui que le jeu traduit en message
  (`GAME_ERRORS` dans `apps/web/src/lib/labels.ts`).
- Une entrée invalide (Zod) répond 400 `VALIDATION`.
- Les erreurs Postgres attendues sous charge sont traduites dans `app.ts` : doublon → 409
  `CONFLICT`, interblocage ou délai dépassé → 503 `BUSY` (le jeu réessaie seul ses lectures).
- Une erreur 500 ne renvoie jamais de détail interne : il est dans les journaux et dans
  l'admin (« Santé de l'API »).

## 4. Le contenu du jeu

Tout ce qui se règle (équilibrage, régions, zones, dresseurs, quêtes, objets, butin, talents,
donjons, boutique, guildes, menu) est du **contenu**, pas du code.

- **Schémas** : `packages/content/src/schemas.ts` (Zod). C'est la définition de référence de
  chaque entité ; les types TypeScript en sont déduits.
- **Stockage** : en base, rattaché à une `content_version` (`packages/db/src/schema/content.ts`,
  `content-repo.ts`). Une seule version **publiée**, au plus un **brouillon**. Créer un brouillon
  copie la version publiée ; le publier archive l'ancienne.
- **Cohérence** : `packages/content/src/integrity.ts` vérifie les références croisées (une zone
  cite une région qui existe, un butin des objets qui existent…). Publier l'exige.
- **Lecture** : `ContentCache` (`apps/api/src/content-cache.ts`) garde en mémoire la version
  publiée, transformée en `GameContext` (`createGameContext`, index par identifiant). Le jeu
  reçoit le même contenu par `GET /api/content` et construit le même `GameContext`.
- **Version figée** : une activité enregistre la version active à son départ et se résout avec
  elle, même si une autre version est publiée entre-temps.
- **Contenu jouable** : régions, zones, dresseurs et quêtes ont un drapeau `enabled`.
  `ContentCache.get()` est la vue des joueurs (désactivés retirés) ; `ContentCache.version(id)`
  reste complète, pour terminer ce qui a été lancé avant une désactivation.

### La base est la source de vérité

Le contenu vit en base et se modifie dans l'admin. Trois copies existent, à ne pas confondre :

| Où                              | Rôle                                                                 |
| ------------------------------- | -------------------------------------------------------------------- |
| Base de production              | **La vérité.** Modifiée par l'admin et par les migrations de contenu |
| `content/game-content.json`     | Instantané versionné dans Git : point de départ d'une base neuve     |
| `packages/content/src/seed*.ts` | Contenu de test : tests automatiques, et base neuve sans instantané  |

En développement, l'API réécrit l'instantané au démarrage et à chaque publication. Une
migration de contenu ne remplace jamais tout : elle cible les champs à changer, pour ne pas
écraser les réglages faits dans l'admin (voir [RECETTES.md](RECETTES.md)).

## 5. Écritures sûres

Toute action d'un joueur qui écrit passe par `playerTransaction(db, userId, fn)`
(`apps/api/src/game/tx.ts`) :

- **verrou par joueur** pris en tête de transaction : les actions d'un même joueur passent l'une
  après l'autre, donc pas de course entre « vérifier » et « écrire » (double réclamation,
  Pokémon envoyé deux fois…) ;
- **réessai** automatique sur interblocage (3 essais), puis 503 `BUSY` : la fonction passée peut
  donc être appelée plusieurs fois et ne doit modifier que la base ;
- **`afterCommit`** : ce qui ne doit arriver qu'une fois la transaction validée (compteurs).

`apps/api/src/concurrency.test.ts` rejoue des actions simultanées sur un vrai Postgres (en CI).

## 6. Rattrapage du temps écoulé

`PlayerSettler` (`apps/api/src/game/settle.ts`) est appelé avant chaque requête de jeu
(`requireUser`). Il rattrape ce qui s'est terminé pendant l'absence du joueur : combat ou donjon
fini, places de pension ou du Musée fermées, Balls des expéditions en cours. Il ne touche pas la
base tant qu'il n'y a rien à faire : la prochaine échéance de chaque joueur est gardée en mémoire.

Beaucoup d'états sont de plus calculés **à la lecture** plutôt qu'enregistrés : œufs pondus
(depuis l'heure du dépôt), baies mûres, soins terminés, météo d'une zone (tirage horaire
déterministe), cachette d'un Pokémon fuyard.

## 7. Temps et hasard

- **Horloge injectable** : `buildApp({ now })`. Aucun module de jeu n'appelle `new Date()`
  lui-même ; les tests font avancer le temps sans attendre.
- **Hasard à graine** : `createRng(seed)` (`game-core/rng.ts`). Aucun `Math.random()` dans les
  règles. `packages/game-core/src/golden.test.ts` garantit que rien ne change par accident : il
  compare l'empreinte de 800 résultats à celle enregistrée.

## 8. Côté jeu (`apps/web`)

- **Pas de routeur** : `App.tsx` aiguille selon l'état du joueur (non connecté → connexion ; pas
  de dresseur → création ; pas de starter → choix ; sinon le jeu). Dans le jeu, l'onglet affiché
  suit l'ancre de l'adresse (`#pc`, `#expeditions/<zone>`), gérée par `pages/HomePage.tsx`.
- **Données** : TanStack Query. Clés, lectures et rechargements après action sont dans
  `lib/game.ts`. Règle issue du plan de stabilité : après une action, on ne recharge que les
  données qu'elle a pu changer (`refreshAfter…`), jamais tout.
- **Appels** : `lib/api.ts` (`api()`), qui gère délai maximal, erreurs typées (`ApiError`) et
  réessais des lectures.
- **Textes** : en français, dans les composants ; les libellés partagés et les messages d'erreur
  dans `lib/labels.ts`.
- **Hors ligne et installation** : PWA écrite à la main (`public/sw.js`,
  `manifest.webmanifest`, `lib/pwa.ts`).

## 9. Côté admin (`apps/admin`)

Une page par entité de contenu (`pages/content/*`), construite sur `components/EntityPage.tsx`
(liste, formulaire, enregistrement dans le brouillon). Le rôle est vérifié par le serveur à
chaque requête (`requireAdmin`) ; `AdminGate` ne fait qu'adapter l'affichage. Chaque modification
est inscrite au journal (`packages/db/src/audit.ts`).

## 10. Ce qui vit dans la mémoire du serveur

L'API tourne en **un seul processus**. Plusieurs choses en dépendent aujourd'hui ; les voici,
avec ce qu'il faudrait changer pour en lancer plusieurs (voir aussi [SURCHARGE.md](SURCHARGE.md)).

| En mémoire                                   | Fichier                 | Avec plusieurs processus                           |
| -------------------------------------------- | ----------------------- | -------------------------------------------------- |
| Contenu publié (`ContentCache`)              | `content-cache.ts`      | Prévenir les autres processus à chaque publication |
| Limite de requêtes par joueur et par IP      | `rate-limit.ts`         | Compteurs partagés (Redis ou Postgres)             |
| Échéances de rattrapage (`PlayerSettler`)    | `game/settle.ts`        | Rien : un doublon de rattrapage est sans effet     |
| Supervision (requêtes, erreurs, durées)      | `monitoring.ts`         | Chiffres par processus, à agréger                  |
| Compteurs d'espèces, écrits toutes les 30 s  | `game/capture-stats.ts` | Rien : chaque processus écrit ses incréments       |
| Présence (`last_seen_at`, une fois par min.) | `plugins/session.ts`    | Rien : au pire une écriture de plus                |
| Tournée des notifications push               | `game/push.ts`          | **Un seul** processus doit la lancer               |
| Distribution des coffres de guilde           | `game/guilds.ts`        | **Un seul** processus doit la lancer               |

Le verrou par joueur, lui, est tenu par Postgres : il reste valable quel que soit le nombre de
processus.

## 11. Tests

| Quoi                              | Où                                 | Comment                                               |
| --------------------------------- | ---------------------------------- | ----------------------------------------------------- |
| Règles du jeu                     | `packages/game-core/src/*.test.ts` | Fonctions pures, contenu de test                      |
| Non-régression « à graine égale » | `game-core/src/golden.test.ts`     | Empreintes de 800 résultats                           |
| Contenu et cohérence              | `packages/content/src/*.test.ts`   | Le contenu de test doit être valide et publiable      |
| API                               | `apps/api/src/*.test.ts`           | Vraie application, PGlite en mémoire, horloge avancée |
| Actions simultanées               | `apps/api/src/concurrency.test.ts` | Vrai Postgres (`TEST_DATABASE_URL`, en CI)            |
| Écrans du jeu                     | `apps/web/test/*.test.tsx`         | jsdom contre la vraie API en mémoire                  |
| Pages de l'admin                  | `apps/admin/test/*.test.tsx`       | Idem, avec un compte administrateur                   |

La CI (`.github/workflows/ci.yml`) lance lint, code mort (`knip`), format, types et tests avec
couverture. Un `push` sur `main` réussi déclenche le déploiement.
