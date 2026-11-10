# Plan de qualité du code : lisibilité, documentation, optimisation

Rédigé le 10 novembre 2026 après relecture de tout le dépôt (`apps/api`, `apps/web`, `apps/admin`,
`packages/*`). Objectif : un code **propre, stable, capable de grossir**, et surtout **reprenable
par un humain** qui n'a pas suivi son écriture.

Ce plan ne change **rien au jeu** : aucune règle, aucun écran, aucune donnée. C'est un chantier de
rangement, de découpage et de documentation, mené par petites étapes vérifiables. Il complète
[PLAN-STABILITE.md](PLAN-STABILITE.md) (terminé), qui traitait la charge et les bugs.

---

## 1. État des lieux

### 1.1 Ce qui est déjà sain (à ne pas casser)

- `pnpm lint` et `pnpm typecheck` passent sans erreur ni avertissement.
- TypeScript strict (`noUncheckedIndexedAccess` compris) : **0** `any`, **0** `@ts-ignore`,
  **0** `TODO` oublié, 2 `eslint-disable` seulement.
- Découpage en paquets clair : logique pure (`game-core`), contenu (`content`), base (`db`),
  contrat d'API (`shared`), données PokéAPI (`data`).
- Logique de jeu et API bien testées : 32 fichiers de tests dans `game-core`, 30 dans `api`
  (dont les actions simultanées sur un vrai Postgres en CI).
- Le serveur est déjà bien commenté là où c'est subtil (`tx.ts`, `content-cache.ts`, `app.ts`) :
  les commentaires disent **pourquoi**, pas ce que fait la ligne. C'est le modèle à généraliser.
- Conventions cohérentes : identifiants en anglais, commentaires et textes en français.

### 1.2 Ce qui gêne la reprise en main

Mesures du 10 novembre (hors tests et hors contenu de test) :

| Constat                                                   | Mesure                                                              |
| --------------------------------------------------------- | ------------------------------------------------------------------- |
| Fichiers de plus de 800 lignes                            | **25**                                                              |
| Fonctions ou composants de 150 lignes et plus             | **84**, dont **21** de 300 lignes et plus                           |
| Commentaires dans le jeu et l'admin (`web`, `admin`)      | 0 à 6 % des lignes (8 à 27 % côté serveur et `game-core`)           |
| Dossier `apps/web/src/pages/game`                         | 63 fichiers à plat, tous domaines mélangés                          |
| Appels `api(...)` écrits directement dans les écrans      | 91, dans 32 fichiers (83 `useQuery` / `useMutation` hors de `lib/`) |
| Tests du jeu (`web`) et de l'admin                        | 1 fichier et 0 fichier                                              |
| JavaScript du jeu                                         | **un seul fichier de 2,53 Mo** (560 Ko compressé), chargé d'un bloc |
| Documentation d'architecture                              | aucune (7 guides d'installation et d'exploitation à la racine)      |
| Codes d'erreur de l'API                                   | ≈ 130 chaînes dispersées, libellés tenus à la main côté jeu         |
| `request.user!` (session supposée présente)               | 132 fois                                                            |
| Type `Deps` des routes                                    | recopié dans 20 fichiers                                            |
| `localStorage` lu et écrit à la main (avec son try/catch) | 25 appels dans 12 fichiers                                          |

Les plus gros morceaux :

| Fonction ou composant                     | Lignes | Fichier                                         |
| ----------------------------------------- | -----: | ----------------------------------------------- |
| `LaunchExpeditionForm` (14 hooks)         |  1 016 | `web/pages/game/LaunchExpeditionDialog.tsx`     |
| `BalanceForm`                             |    911 | `admin/pages/content/BalancePage.tsx`           |
| `contentIssues`                           |    776 | `content/integrity.ts`                          |
| `PokemonDetail` (13 hooks)                |    745 | `web/pages/game/PcPage.tsx`                     |
| `TeamPicker`                              |    720 | `web/pages/game/TeamPicker.tsx`                 |
| `DungeonCombat` (11 hooks)                |    652 | `web/pages/game/DungeonCombat.tsx`              |
| `HomePage` (18 hooks)                     |    646 | `web/pages/HomePage.tsx`                        |
| `DepositDialog` (14 hooks)                |    626 | `web/pages/game/DepositDialog.tsx`              |
| `ItemForm`                                |    481 | `admin/pages/content/ItemsPage.tsx`             |
| `simulateDungeon`                         |    470 | `game-core/dungeon.ts`                          |
| `telemetry`                               |    420 | `api/game/telemetry.ts`                         |
| `adminRoutes`                             |    336 | `api/routes/admin.ts`                           |
| `claimExpedition`                         |    250 | `api/game/expeditions.ts`                       |
| Fichiers « fourre-tout » d'un seul tenant |        | `shared/index.ts` (1 753), `content/schemas.ts` |
|                                           |        | (1 831), `db/schema/game.ts` (945),             |
|                                           |        | `web/lib/game.ts` (637, 56 exports)             |

Autres points relevés :

- **Le contenu de test part dans le navigateur des joueurs** : `@poke/content` réexporte
  `seedContent` depuis son `index.ts`, et des textes du seed (« Bourg Palette ») se retrouvent dans
  le fichier JavaScript du jeu, qui n'en a aucun usage.
- **Aucun chargement à la demande** : `HomePage` importe les 17 pages du jeu d'un coup, le wiki et
  les données PokéAPI (`species.json`, 654 Ko) compris.
- **Requêtes SQL dans les routes** : `routes/game.ts`, `player.ts`, `teams.ts`, `tags.ts`,
  `trainers.ts` et `push.ts` parlent directement à la base (≈ 50 requêtes) au lieu de passer par
  les modules `game/*`, contrairement aux autres routes.
- **`api.ts` existe en double** (jeu et admin), la copie de l'admin ayant déjà pris du retard.
- **Hypothèses « un seul processus »** non écrites : limite de requêtes, supervision, cache du
  contenu, tournées périodiques (push, coffres de guilde, compteurs d'espèces) vivent en mémoire.
  Rien de faux aujourd'hui, mais rien ne le dit à qui voudra lancer un second processus.
- **Statut du seed flou** : ≈ 9 000 lignes de contenu de test (`seed-*.ts`) alors que la source de
  vérité est la base et son instantané `content/game-content.json`.

---

## 2. Objectifs

| Objectif                  | Critère vérifiable en fin de plan                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------- |
| Lisible                   | Plus aucune fonction de 300 lignes et plus ; moins de 15 de 150 lignes et plus, chacune justifiée     |
| Rangé                     | Un dossier par domaine dans le jeu ; plus aucun fichier de code de plus de 800 lignes                 |
| Documenté                 | Une carte du projet lisible en une heure ; chaque fichier dit son rôle ; chaque export a sa phrase    |
| Stable                    | Aucun changement de comportement : résultats identiques à graine égale, tests existants inchangés     |
| Capable de grossir        | Chargement initial du jeu divisé par 2 au moins ; hypothèses « un seul processus » isolées et écrites |
| Protégé contre la rechute | La CI refuse le code mort, les promesses oubliées et les fonctions géantes nouvelles                  |

---

## 3. Règles du chantier

1. **Aucun changement fonctionnel.** Un bug découvert en chemin est noté dans la section
   « Trouvé en chemin » de la phase et corrigé dans un commit à part, jamais mêlé à un déplacement.
2. **Déplacer puis modifier, jamais les deux dans le même commit** (`git mv` d'abord) : l'historique
   de chaque fichier reste lisible et une relecture reste possible.
3. **Vérification après chaque étape** : `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`,
   puis un tour dans le navigateur sur les écrans touchés.
4. **Un filet avant de découper** : pas de découpage d'un gros morceau sans test qui prouve que le
   résultat est le même avant et après (voir phase 0).
5. **Intouchables** : les migrations déjà appliquées, le contenu en base, les entrées du journal
   des nouveautés déjà en production, `PLAN.md`.
6. **Aucune migration de base** n'est attendue de ce plan. Le découpage du schéma Drizzle doit
   produire un `pnpm db:generate` vide.
7. **Petites livraisons** : chaque phase (ou sous-phase pour la 5) part en production seule, pour
   qu'une régression soit immédiatement attribuable.
8. **Style des commentaires** (celui de `tx.ts`) : en-tête de fichier qui dit le rôle du module et
   ses règles ; une phrase sur chaque export (unités, cas limites, pourquoi) ; aucun commentaire qui
   répète le code.

---

## 4. Phases

Tailles : S (une séance), M (deux à trois), L (une semaine de séances), XL (davantage).

### Phase 0 : Filets de sécurité et outillage (M)

Rien n'est découpé avant que cette phase soit en place.

- [x] **0.1 Mesures de départ** gardées dans ce fichier (tableau de la section 5) : tailles du
      bundle, nombre de fonctions longues, durée des tests, chiffres de `scripts/load-test`.
- [x] **0.2 Tests « à graine égale »** dans `game-core` : pour quelques centaines de graines,
      le résultat complet d'une expédition, d'un combat, d'un donjon, d'une ponte et d'un combat
      légendaire est enregistré, puis comparé après chaque découpage. Tout est déjà piloté par un
      générateur à graine : le moindre écart de comportement fait échouer le test.
- [x] **0.3 Banc de tests du jeu et de l'admin** : Vitest + Testing Library + jsdom, avec une
      fausse API alimentée par le contenu de test. Un test « l'écran s'affiche et son action
      principale part » par onglet du jeu et par page de l'admin, écrits **avant** de toucher aux
      composants.
- [x] **0.4 Détection du code mort** (`knip`) : exports, fichiers et dépendances inutilisés.
      Premier passage : suppression de ce qui est mort, dans un commit dédié.
- [x] **0.5 ESLint renforcé** :
  - règles typées `no-floating-promises`, `no-misused-promises`,
    `switch-exhaustiveness-check` (une promesse oubliée dans l'API est une action perdue) ;
  - `max-lines-per-function` et `complexity` en **avertissement**, avec la liste des dépassements
    actuels comme plafond qui ne peut que baisser ;
  - frontières entre paquets : le jeu n'importe ni `@poke/db` ni le seed, `game-core` n'importe
    rien du serveur, pas de dépendance circulaire.
- [x] **0.6 Couverture de tests** (`@vitest/coverage-v8`) publiée par la CI, à titre d'indicateur
      (sans seuil bloquant au départ).
- **But** : pouvoir découper sans crainte, et mesurer le chemin parcouru.
- **Nouvelles dépendances de développement** (aucune en production) : `knip`,
  `@testing-library/react`, `jsdom`, `@vitest/coverage-v8`.

- **Réalisé** le 10 novembre (écarts avec le plan) :
  - 0.1 : mesures dans le tableau de la section 5. Les chiffres de `scripts/load-test` ne sont pas
    pris ici (il faut un serveur lancé et des comptes préparés) : ils le seront avant et après la
    phase 4 (étape 4.7), seule à pouvoir les faire bouger.
  - 0.2 : `packages/game-core/src/golden.test.ts`, 800 situations tirées au hasard (200
    expéditions, 150 combats de dresseurs, 150 donjons, 100 combats légendaires, 200 œufs), une
    empreinte par résultat complet dans `__snapshots__/`. Vérifié : un multiplicateur changé de
    0,01 % fait échouer les trois familles de combats.
  - 0.3 : le banc ne simule pas l'API, il lance **la vraie** en mémoire
    (`apps/api/src/testing/test-api.ts` : PGlite, migrations, contenu de test, compte admin) ;
    rien à tenir à jour quand une route change. `apps/web/test/tabs.test.tsx` affiche les 16
    onglets pour un joueur tout neuf, `apps/admin/test/pages.test.tsx` les 24 pages de l'admin.
    Les tests d'**action** (lancer une expédition, enregistrer un formulaire…) ne sont pas écrits
    d'avance : ils le seront domaine par domaine, juste avant chaque découpage (5.5 et 6.1), quand
    l'écran est lu de près. Pour l'admin, la table des routes est sortie de `main.tsx`
    (`src/routes.tsx`) afin de pouvoir l'afficher dans un test.
  - 0.4 : `pnpm deadcode` (knip), dans la CI. 44 exports rendus internes, un composant jamais
    affiché supprimé (`XpPreview`). Les exports des `index.ts` des paquets ne sont pas encore
    contrôlés (étape 3.6).
  - 0.5 : les règles typées n'ont trouvé **aucune** promesse oubliée ni `switch` incomplet, et
    les frontières entre paquets étaient déjà respectées : elles sont maintenant garanties. 97
    avertissements de longueur ou de complexité, plafond inscrit dans `pnpm lint`
    (`--max-warnings 97`) : à baisser à chaque découpage. Pas de détection des dépendances
    circulaires entre fichiers (aucun outil retenu) : à revoir en phase 7 si le besoin apparaît.
  - 0.6 : `pnpm test:coverage`, lancé par la CI à la place de `pnpm test`. Lignes couvertes :
    `game-core` 91 %, `content` 92 %, `api` 93 %.

### Phase 1 : La carte du projet (M)

Faite tôt : elle fixe le vocabulaire et les règles que les phases suivantes appliquent.

- [x] **1.1 `docs/ARCHITECTURE.md`** : schéma des paquets et de qui dépend de qui ; trajet d'une
      action du joueur (écran → `api()` → route → `playerTransaction` → `game-core` → base → DTO) ;
      contenu versionné (brouillon, publication, instantané, cache) ; rattrapage à la connexion
      (`PlayerSettler`) ; horloge et hasard injectables ; ce qui tourne en tâche de fond.
- [x] **1.2 `docs/GLOSSAIRE.md`** : chaque terme du jeu et son nom dans le code (PE, pitié, chaîne
      chromatique, fuyard, assistant, poste, palier, complétion, instantané…).
- [x] **1.3 `docs/RECETTES.md`**, pas à pas avec les pièges déjà rencontrés : ajouter un champ de
      contenu (et l'instantané), écrire une migration de schéma puis de données, ajouter une route,
      un onglet, un effet d'objet, un talent, une région ; mettre en production et tenir le journal
      des nouveautés.
- [x] **1.4 `docs/DECISIONS.md`** : les choix structurants et leur raison (PGlite en local, `tsx`
      en production, un seul processus, contenu en base comme source de vérité, verrou par joueur,
      PWA écrite à la main, TypeScript 6.0).
- [x] **1.5 Rangement des guides** : `DEMARRAGE`, `INSTALLATION-SERVEUR`, `MISE-A-JOUR`,
      `MISE-EN-PRODUCTION`, `SURCHARGE` et les plans passent dans `docs/` (liens mis à jour) ;
      le `README.md` devient la porte d'entrée : démarrage en 5 lignes, puis sommaire. Sa section
      « Boucle de jeu (phase 1) », dépassée, est remplacée par un renvoi à l'architecture.
- [x] **1.6 `CLAUDE.md`** à la racine : conventions, commandes, pièges (un seul processus sur
      PGlite, instantané de contenu, migrations ciblées), pour que les prochaines séances
      assistées suivent les mêmes règles sans avoir à les redire.
- [x] **1.7 Un `README.md` court par paquet et par application** : rôle, points d'entrée, ce qu'il
      a le droit d'importer, où ajouter quoi.
- **But** : quelqu'un qui ouvre le dépôt sait en une heure où est chaque chose et pourquoi.

- **Réalisé** le 10 novembre (écarts avec le plan) :
  - 1.1 : `docs/ARCHITECTURE.md`. La section 10 liste ce qui vit dans la mémoire du serveur et ce
    qu'il faudrait changer pour lancer plusieurs processus (préparation de l'étape 4.4).
  - 1.5 : guides dans `docs/`, plans dans `docs/plans/` (ce fichier compris), renvois mis à jour
    dans le code, les scripts de déploiement et la CI. Les sections du `README` qui décrivaient
    les phases 1 à 8 du plan d'origine, en partie dépassées, sont remplacées par le sommaire de la
    documentation ; ce qui restait vrai est repris dans l'architecture et les `README` des
    paquets.
  - 1.7 : huit `README.md` (trois applications, cinq paquets). Ils décrivent l'organisation
    **actuelle** : à tenir à jour à chaque découpage des phases 2 à 6, puis relus en 7.2.
  - Les documents citent des fichiers et des fonctions par leur nom : chaque nom a été vérifié
    dans le code au moment de l'écriture.

### Phase 2 : Paquets partagés (`shared`, `content`, `db`) (M)

Découpages sans risque : les `index.ts` continuent de tout réexporter, aucun import ne change.

- [x] **2.1 `shared`** : `index.ts` (1 753 lignes) → un fichier par domaine (profil, Pokémon,
      expéditions, combats, donjons, pension, ferme, guildes, boutique, admin…).
- [x] **2.2 Catalogue des codes d'erreur** dans `shared` : un type `ErrorCode` et sa liste.
      `GameError` n'accepte plus qu'un code connu, et la table des libellés du jeu devient
      `Record<ErrorCode, string>` : un code sans message ne compile plus.
- [x] **2.3 `content/schemas.ts`** (1 831 lignes) → `schemas/` par domaine (équilibrage, régions et
      zones, dresseurs, quêtes, objets et butin, talents, donjons, guildes, menu).
- [x] **2.4 `content/integrity.ts`** : `contentIssues` (776 lignes) → un vérificateur par entité,
      assemblés par une liste ; un test par règle là où il en manque.
- [x] **2.5 Seed** : rangé dans `content/src/seed/`, sorti de l'`index.ts` (export dédié
      `@poke/content/seed`), et son rôle écrit en tête : jeu de données des tests et base neuve
      sans instantané, **pas** la source de vérité. Le jeu n'embarque plus le seed.
- [x] **2.6 `db/schema/game.ts`** (945 lignes) → un fichier par domaine. Contrôle :
      `pnpm db:generate` ne produit aucune migration.
- [x] **2.7 `db/content-repo.ts`** : en-têtes et documentation du cycle brouillon → publication.
- **But** : on trouve un type, un schéma ou une table par son domaine, pas par une recherche.

- **Réalisé** le 10 novembre (écarts avec le plan) :
  - Chaque découpage est mécanique (un script déplace les instructions et recalcule les imports)
    et contrôlé par la comparaison des exports avant et après : 231 pour `shared`, 193 pour les
    schémas de `content`, 37 pour le schéma de la base. Aucun import n'a changé ailleurs.
  - **Écart avec la règle 2** : le déplacement et la correction des imports sont dans le même
    commit, pour que chaque commit compile. Git suit quand même les renommages.
  - 2.2 : le catalogue est `packages/shared/src/errors.ts` (`PLAYER_ERROR_CODES`, 143 codes, et
    `ADMIN_ERROR_CODES`, 3 codes que l'admin affiche tels quels). 21 codes s'affichaient bruts
    dans le jeu : chacun a maintenant son message. Deux messages jamais envoyés par le serveur
    sont retirés. Les refus que six routes du jeu envoyaient à la main passent par `GameError`
    (même réponse) ; restent hors catalogue ceux du contenu de l'admin (`ContentError`, qui a ses
    propres codes et messages) et les 401/403 de la session, à reprendre en 4.1.
  - 2.4 : pas de test par règle. À la place, un filet global écrit **avant** le découpage
    (`integrity.golden.test.ts` : 300 contenus abîmés au hasard, liste des erreurs et alertes
    comparée dans l'ordre), qui couvrait 88 % des lignes de l'ancien fichier. `contentIssues` est
    maintenant une liste de 16 contrôles, un fichier par entité dans `integrity/`.
  - 2.5 : le contenu de test n'est plus dans le JavaScript du jeu : 560 → 509 Ko compressés.
    ESLint interdit au jeu d'importer `@poke/content/seed`.
  - 2.6 : `drizzle-kit generate` sur une copie ne voit aucun changement de schéma.
  - Indicateurs à ce stade : 21 fichiers de plus de 800 lignes (25 au départ), 94 avertissements
    de longueur ou de complexité (97), plafond `--max-warnings` baissé d'autant.

### Phase 3 : Logique de jeu (`game-core`) (L)

Sous la protection des tests « à graine égale » (0.2).

- [x] **3.1 `dungeon.ts`** (1 899 lignes) → dossier `dungeon/` : types et état, préparation,
      tour de combat, statuts, météo, talents, décisions de l'adversaire. `simulateDungeon`
      (470 lignes) devient une boucle courte qui appelle des étapes nommées.
- [x] **3.2 `expedition.ts`** (1 135 lignes) → dossier `expedition/` : rencontres, capture et
      pitié, butin, durée et cadence, fuyards. `createExpeditionRun` (184 lignes) découpée.
- [x] **3.3 `abilities.ts`** (1 079 lignes) → un fichier par famille d'effets (modificateurs,
      combat, assistants, météo).
- [x] **3.4 Documentation des règles** : en tête de chaque module, la règle de jeu en clair et sa
      formule (PE, capture, pitié, chromatique, XP, ponte), avec les clés d'équilibrage qui la
      pilotent. Une phrase sur chaque export.
- [x] **3.5 Mesure de vitesse** (`vitest bench`) sur une expédition de 24 h et un donjon complet :
      on n'optimise que ce que la mesure désigne, et le chiffre est gardé comme référence.
- [x] **3.6 Surface publique** : `index.ts` n'exporte plus que ce qui sert hors du paquet
      (liste donnée par `knip`), le reste devient interne.
- **But** : lire une règle du jeu sans devoir tenir 1 900 lignes en tête.

- **Réalisé** le 10 novembre (écarts avec le plan) :
  - 3.1 : `dungeon/` (11 fichiers). `simulateDungeon` (431 lignes) est une boucle de 40 lignes :
    l'état du combat et ses opérations sont dans la classe `Combat` (`combat.ts`), les étapes
    (commande, tic, attaque) dans `simulation.ts`. `withAbilities` est découpée en trois fonctions.
    Les tests à graine égale passent sans réenregistrement.
  - 3.2 : `expedition/` (9 fichiers). Le tirage des rencontres sort de `createExpeditionRun`
    (`encounterSource`).
  - 3.3 : `abilities/` (9 fichiers), par rôle (activités, paramètres, environnement, effets,
    modificateurs, PE, rencontres, textes, assistants) plutôt que par famille d'effets : les effets
    de combat étaient déjà dans `dungeon/traits.ts`.
  - Exports comparés avant et après chaque découpage : 56, 68 et 49, aucun écart.
  - 3.4 : chaque export de `game-core` a sa phrase ; les formules sont en tête de `pokemon.ts`,
    `breeding.ts`, `expedition/capture.ts`, `expedition/xp.ts`, `dungeon/rules.ts`.
  - 3.5 : `pnpm --filter @poke/game-core bench` (`src/perf.bench.ts`). Une expédition de 24 h se
    rejoue en 0,43 ms, un combat complet en 0,04 ms : aucune optimisation n'est désignée. Chiffres
    dans le README du paquet. Vitest 5 a changé l'API : `bench` est fourni au test
    (`test('…', async ({ bench }) => …)`).
  - 3.6 : `index.ts` est une liste explicite (`export { … } from './module'`) au lieu de
    `export *` : 303 exports publics sur 451. 33 déclarations ne sont plus exportées par leur
    module, et 8 définitions que plus rien n'appelait sont supprimées (`NO_BALL_PLAN`,
    `isPlotRipe`, `plotRemainingMs`, `PlotGrowth`, `guildQuestChest`, `questEncounter`,
    `QuestEncounterInput`, `hasRoamer`). Le reste des exports non publics sert entre modules du
    paquet ou à ses tests.
  - Avertissements ESLint : 94 → 90 (plafond baissé).
  - Les outils de découpage (script qui déplace les instructions et recalcule les imports,
    comparaison des exports) ne sont pas dans le dépôt : ils étaient jetables.

### Phase 4 : API (L)

- [ ] **4.1 Routes fines** : une route valide l'entrée, appelle un module `game/*`, renvoie un
      DTO. Les requêtes SQL de `routes/game.ts`, `player.ts`, `teams.ts`, `tags.ts`, `trainers.ts`
      et `push.ts` rejoignent des modules `game/*`.
- [ ] **4.2 Utilitaires communs** : un seul type `RouteDeps` (au lieu de 20 copies de `Deps`) ;
      `userId(request)` typé à la place des 132 `request.user!`.
- [ ] **4.3 Découpage des gros modules** :
  - `game/guilds.ts` (1 044) → `guilds/` : adhésion, quêtes, coffres, messages, lectures ;
  - `game/expeditions.ts` (956) : `claimExpedition` (250 lignes) en étapes nommées ;
  - `game/store.ts` (707, fourre-tout) → Pokémon, sac, Pokédex, progression ;
  - `game/telemetry.ts` : une fonction par bloc de statistiques ;
  - `routes/admin.ts` (336 lignes d'un tenant) → contenu, joueurs, supervision.
- [ ] **4.4 Tâches de fond regroupées** dans `jobs/` (push, coffres de guilde, compteurs
      d'espèces), démarrées par un seul `startJobs()` et coupables par une variable
      d'environnement. C'est la seule préparation « plusieurs processus » faite ici ; le reste est
      décrit dans `docs/ARCHITECTURE.md` (ce qui vit en mémoire et ce qu'il faudrait partager).
- [ ] **4.5 Tests rangés** : les 30 fichiers à la racine de `src/` rejoignent un dossier `test/`
      par domaine ; les aides communes (création de joueur, horloge, contenu) dans un seul module.
- [ ] **4.6 Documentation** : en-tête par module `game/*` (règles côté serveur, verrous pris,
      ce qui est rattrapé à la connexion), et tableau des routes dans le `README` de l'API.
- [ ] **4.7 Contrôle de charge** : `scripts/load-test` avant et après la phase, pour confirmer
      qu'aucune requête n'a été ajoutée ou alourdie.
- **But** : pour une action donnée, un seul endroit à lire, et le même plan dans chaque domaine.

### Phase 5 : Le jeu (`apps/web`) (XL, en sous-phases livrées une à une)

Le plus gros du travail : c'est là que le code est le moins commenté et le plus massif.

- [ ] **5.1 Chargement à la demande** (livrable seul, gain immédiat pour les joueurs) :
  - une page par onglet chargée à l'ouverture (`React.lazy`), wiki compris ;
  - données PokéAPI et bibliothèques dans des fichiers à part, gardés en cache entre deux mises en
    ligne ;
  - vérification du service worker et de la proposition de rechargement après mise en ligne ;
  - plafond de taille contrôlé par la CI.
- [ ] **5.2 Couche de données** : `lib/game.ts` (56 exports) → `lib/queries/` par domaine (clés,
      lectures, actions et ce que chaque action invalide). Les 91 appels `api()` et 83
      `useQuery` / `useMutation` des écrans y sont déplacés : un écran n'écrit plus d'URL.
- [ ] **5.3 Utilitaires** : `lib/storage.ts` (un seul `usePersistentState` pour les 12 fichiers qui
      manipulent `localStorage`) ; `components/ui.tsx` (22 composants) → un fichier par composant ;
      `lib/labels.ts` par domaine ; `api.ts` partagé avec l'admin (paquet `@poke/client`).
- [ ] **5.4 Un dossier par domaine** : `pages/game` (63 fichiers à plat) → `features/expeditions`,
      `pc`, `battles`, `dungeons`, `daycare`, `farm`, `museum`, `center`, `guild`, `quests`,
      `shop`, `pokedex`, `teams`, `trainer`, `wiki`, `buildings` ; le commun (choix d'équipe,
      révélations, cartes) dans `features/common`. Déplacements seuls, sans modification.
- [ ] **5.5 Découpage des composants géants**, un domaine par livraison, dans cet ordre :
  1. Expéditions : `LaunchExpeditionForm` (1 016), `ExpeditionsPage`, `ZoneCard`, `LootReveal` ;
  2. PC : `PokemonDetail` (745), `PcPage`, `ItemUseDialog`, `DepositDialog` (626) ;
  3. Équipes et combats : `TeamPicker` (720), `DungeonCombat` (652), `BattlesPage`, dialogues de
     départ ;
  4. Coquille : `HomePage` (646, 18 hooks) → menu, pastilles, onglets verrouillés, en-tête ;
  5. Bâtiments : `BuildingsColumn` (1 897), pension, ferme, Musée, Centre ;
  6. Le reste : fiche Dresseur, guilde, quêtes, wiki, boutique, réglages.

  Méthode à chaque fois : l'état et les règles sortent dans un hook nommé (`useLaunchExpedition`)
  et des fonctions pures testées ; l'affichage est découpé en sous-composants ; cible ≈ 250 lignes
  par composant, sans dogme.

- [ ] **5.6 Journal des nouveautés** : les données de `ChangelogPage.tsx` (1 122 lignes) passent
      dans un fichier de données à part, **à l'identique** (les entrées en production ne sont pas
      retouchées).
- [ ] **5.7 Documentation** : en-tête par dossier de domaine (ce que fait l'écran, d'où viennent
      ses données, ses actions), une phrase par composant et par hook exportés.
- **But** : ouvrir un écran et comprendre en cinq minutes ce qu'il affiche, d'où ça vient et ce
  qui se passe quand on clique.

### Phase 6 : L'administration (`apps/admin`) (M)

- [ ] **6.1 Découpage des formulaires** : `BalanceForm` (911) → une section par domaine
      d'équilibrage ; `ItemForm` (481), `TrainerForm` (383), `DungeonForm` (323), `ZoneForm`,
      `QuestConditionEditor`, `UnlockEditor`, `PowerCalculatorPage` (414), `TelemetryPage` (329).
- [ ] **6.2 Un modèle unique de page de contenu** autour de `EntityPage` : liste, formulaire,
      validation, enregistrement, écrits une fois et documentés.
- [ ] **6.3 Pages chargées à la demande** (une par route).
- [ ] **6.4 Client d'API commun** avec le jeu (`@poke/client`, voir 5.3).
- [ ] **6.5 Documentation** : comment ajouter une page d'édition pour une nouvelle entité de
      contenu.
- **But** : ajouter un réglage dans l'admin sans chercher dans 1 400 lignes.

### Phase 7 : Verrouillage et passage de relais (S)

- [ ] **7.1 CI durcie** : code mort, plafond de taille du bundle, avertissements de longueur
      passés en erreurs au niveau atteint, couverture minimale sur `game-core` et `api`.
- [ ] **7.2 Relecture complète de la documentation** contre le code final (`docs/`, `README` des
      paquets, `CLAUDE.md`), et parcours « par où commencer » dans le `README`.
- [ ] **7.3 Tableau avant / après** de la section 5 rempli.
- [ ] **7.4 Liste de ce qui reste** : ce qui a été volontairement laissé, et pourquoi.
- **But** : que la qualité obtenue tienne toute seule.

---

## 5. Indicateurs (avant / après)

| Indicateur                                           |                10 nov. 2026 | Cible                     | Après |
| ---------------------------------------------------- | --------------------------: | ------------------------- | ----: |
| Fichiers de code de plus de 800 lignes               |                          25 | 0                         |       |
| Fonctions de 300 lignes et plus                      |                          21 | 0                         |       |
| Fonctions de 150 lignes et plus                      |                          84 | moins de 15               |       |
| JavaScript chargé à l'ouverture du jeu (compressé)   |                      560 Ko | moins de 250 Ko           |       |
| Fichiers de tests : jeu / admin                      |                       1 / 0 | un par onglet et par page |       |
| Appels `api()` dans les écrans                       |                          91 | 0                         |       |
| Exports et fichiers inutilisés                       |    45 (0 depuis la phase 0) | 0                         |       |
| Documents d'architecture (fait en phase 1)           |                           0 | 4 + un README par paquet  |       |
| Avertissements de longueur ou de complexité (ESLint) |                          97 | moins de 15               |       |
| JavaScript de l'admin (compressé)                    |                      510 Ko | moins de 250 Ko           |       |
| Durée de `pnpm test`                                 | 31 s (49 s avec les écrans) | sans dérive               |       |
| Lignes couvertes : `game-core` / `content` / `api`   |          91 % / 92 % / 93 % | au moins autant           |       |
| Erreurs de lint / de types                           |                       0 / 0 | 0 / 0                     |       |

---

## 6. Ordre conseillé et points à valider

**Ordre** : 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7. Les phases 0 à 2 sont rapides et rendent les suivantes
sûres ; la 5.1 (chargement à la demande) peut être avancée juste après la phase 0 si l'on veut un
gain visible tout de suite.

**À valider avant de commencer :**

1. **Périmètre** : tout le plan, ou s'arrêter après certaines phases ? (Conseil : tout, dans
   l'ordre ; les phases 3 à 6 sont indépendantes entre elles si une priorité change.)
2. **Dépendances de développement** : `knip`, `@testing-library/react`, `jsdom`,
   `@vitest/coverage-v8`. (Conseil : oui, aucune ne part en production.)
3. **Guides déplacés dans `docs/`** (1.5), plans compris. (Conseil : oui ; seul le `README` reste
   à la racine avec `CLAUDE.md`.)
4. **Réorganisation du jeu en `features/`** (5.4) : beaucoup de fichiers déplacés d'un coup.
   (Conseil : oui, en un commit de déplacements purs.)
5. **Nouveautés du jeu pendant le chantier** : pendant qu'un domaine est découpé (5.5), éviter
   d'y développer une fonctionnalité en parallèle, sinon les conflits sont assurés.
6. **Journal des nouveautés** : ce chantier est invisible pour les joueurs, sauf la 5.1.
   (Conseil : une seule ligne « Le jeu se charge plus vite » à la mise en ligne de la 5.1, rien
   pour le reste.)

## 7. Hors périmètre

- Toute nouvelle fonctionnalité, tout changement d'équilibrage ou de contenu.
- Refonte graphique, accessibilité, traduction du jeu.
- Lancer réellement plusieurs processus d'API ou sortir la base du serveur
  ([SURCHARGE.md](../SURCHARGE.md), 2.1 et 3.x) : le plan se limite à isoler et documenter ce qui
  l'empêche aujourd'hui.
- Compiler l'API avant le démarrage au lieu de la lancer avec `tsx` (SURCHARGE.md, 2.2).
- Fusionner les 139 migrations en une base de départ : possible plus tard, mais risqué pour un
  gain faible.
- Réécrire le seed (≈ 9 000 lignes de données) : il est rangé et son rôle documenté, pas refait.
