# Plan de stabilité et de performance

Rédigé le 4 novembre 2026 après relecture du code (jeu `apps/web`, API `apps/api`, base
`packages/db`), à partir de deux symptômes vus en production :

1. dans le PC, passer d'un Pokémon à l'autre avec les flèches finit par afficher une erreur de
   limite de requêtes (« Too Many Requests ») ;
2. pendant des transferts, le jeu disparaît derrière « Impossible de joindre le serveur. L'API
   est-elle lancée ? ».

Les deux viennent de la même cause : **chaque geste du joueur déclenche une dizaine de requêtes**,
et la moindre requête refusée sur `/api/me` remplace tout le jeu par l'écran d'erreur. Le plan
commence par les correctifs qui suppriment ces deux symptômes (phase A), puis réduit le nombre et
le coût des requêtes, et corrige les courses et les erreurs serveur trouvées en chemin.

L'administration (`apps/admin`) n'est pas concernée.

---

## 1. Diagnostic

### 1.1 Fiche du PC : ~11 requêtes par flèche

- TanStack Query est réglé sans `staleTime` (`apps/web/src/main.tsx:13`) : une donnée est
  « périmée » dès qu'elle est arrivée, et **chaque composant qui se monte la recharge**.
- La fiche est remontée à chaque Pokémon (`key={selected.id}`, `PcPage.tsx:383`). Elle et ses
  sous-composants (`KoDetail`, `EvolutionPanel`, `MegaPanel`, `TagPicker`) appellent `useTags`,
  `useAssistants`, `useExpeditions`, `useCandies`, `useInventory`, `usePokemon`, `usePokedex`,
  `usePokedexForms` et `usePlayerProgress` (Pokédex, combats, pension, quêtes) : **11 requêtes
  par flèche**, toutes déjà en cache.
- Côté serveur, ces lectures ne sont pas gratuites : `GET /api/pokemon` règle d'abord les donjons,
  les combats et les places fermées puis renvoie **toute** la collection ; `GET /api/quests` ouvre
  une transaction d'écriture ; chaque requête relit la session (1 à 2 requêtes SQL) et, sur la
  branche `expedition`, rattrape les Balls des expéditions (`app.ts:67`).
- La limite est de 300 requêtes par minute **et par adresse IP** (`env.ts:79`) : ~27 flèches par
  minute suffisent, et une touche maintenue enfoncée l'atteint en quelques secondes. Un foyer, un
  réseau mobile (IP partagée) ou les profils secondaires se partagent la même limite.

### 1.2 Transferts : ~15 requêtes par action, puis l'écran d'erreur

- Après presque chaque action, 44 endroits du jeu invalident les 18 clés de `PLAYER_STATE_KEYS`
  (`lib/game.ts:75`). `HomePage` garde en permanence ~14 requêtes actives (pastilles du menu) :
  **un transfert = 1 POST + ~14 rechargements**, ~25 si la fiche passe ensuite au Pokémon suivant.
- `['me']` fait partie de ces clés. Or `App.tsx:50` affiche « Impossible de joindre le serveur »
  dès que `me.isError` est vrai, **même quand les données sont déjà là** (avec TanStack Query v5,
  un rechargement raté passe la requête en erreur en gardant ses données).
- Aucune requête n'est réessayée (`retry: false`). Il suffit donc d'un seul refus : 429 (limite
  atteinte, cas le plus probable vu le volume ci-dessus), 502 pendant une mise en ligne (l'API
  redémarre, Caddy n'attend pas), ou 500 ponctuel.

### 1.3 Autres problèmes relevés

Bugs (résultat faux ou erreur) :

1. **Transfert sans verrou** (`game/daycare.ts:426`, `game/store.ts:404`) : les Pokémon sont lus,
   puis supprimés sans vérifier combien l'ont été. Deux transferts simultanés des mêmes Pokémon
   (double clic, deux onglets) **créditent deux fois les Bonbons**.
2. **Vérifications « occupé » et « dernier Pokémon » sans verrou** (`pokemonActivities`,
   `store.ts:193`, dans toutes les actions) : un Pokémon peut être transféré pendant qu'il part
   en expédition, et l'équipe pointe alors vers un Pokémon supprimé.
3. **Compteurs globaux `species_captures`** mis à jour dans la transaction de chaque joueur, sans
   ordre (`store.ts:150` et `store.ts:433`) : interblocages possibles entre deux joueurs
   (erreur 500), et tous les joueurs attendent les uns après les autres sur les espèces courantes.
4. **Erreurs SQL renvoyées en 500 avec leur message brut** (`app.ts:89`) : un doublon d'index
   unique (deux départs sur la même place, par exemple) donne un 500 au lieu d'un 409, et des
   détails internes partent au navigateur.
5. **Aucun délai maximal** : ni sur les requêtes SQL et les verrous (`packages/db/src/client.ts:40`),
   ni sur `fetch` côté jeu (`lib/api.ts`). Une requête bloquée attend indéfiniment et le bouton
   reste figé.
6. **Mises en ligne** : Caddy répond 502 tant que l'API redémarre (`deploy/Caddyfile:17`), donc
   chaque déploiement automatique fait apparaître l'écran d'erreur aux joueurs connectés.
7. **Messages** : un 429 s'affiche « Too Many Requests », une coupure réseau « Erreur inconnue »
   (`lib/labels.ts:422`) ; le joueur ne sait pas qu'il suffit de patienter.

Coût inutile (charge de l'API et de la base) :

8. **Lectures qui écrivent** : `GET /api/quests` ouvre une transaction (`game/quests.ts:93`),
   `GET /api/pokemon` fait 3 rattrapages, `/api/daycare`, `/api/museum`, `/api/battles` et
   `/api/dungeons` aussi ; chaque rechargement coûte plusieurs requêtes SQL et des verrous.
9. **Rattrapage des Balls à chaque requête authentifiée** (branche `expedition`, `app.ts:67`,
   `plugins/session.ts:73`) : une requête SQL de plus partout, une simulation complète dès
   qu'une rencontre est due.
10. **N+1 dans `expeditionPaces`** (`expeditions.ts:258`) : une requête par expédition pour son
    équipe, dans `GET /api/expeditions`, rechargé chaque minute.
11. **Session relue en base à chaque requête** (pas de cache de cookie Better Auth, `auth.ts`) :
    1 à 2 requêtes SQL de plus par appel.
12. **`/api/content`** (~750 Ko de JSON) resérialisé à chaque appel.
13. **Ping de présence** toutes les minutes (`lib/presence.ts`) alors que les rechargements
    réguliers mettent déjà la présence à jour.
14. **Discussion de guilde** rechargée toutes les 5 s (`GuildPage.tsx:27`).

Affichage :

15. **PC redessiné chaque seconde** : `useNow()` au niveau de la page (`PcPage.tsx:108`), liste
    recalculée (PE, talents, évolutions, `PcBrowser.tsx:74`) et grille entière affichée sans
    limite ; `HomePage` recalcule les évolutions de tout le PC toutes les 5 s
    (`HomePage.tsx:161`). Saccades avec une grosse collection, surtout sur mobile.

Tests :

16. **Tests de l'API sur PGlite**, qui n'a qu'une connexion et sérialise tout : les courses et
    interblocages ci-dessus ne peuvent pas y apparaître.

---

## 2. Objectifs

- Flèche dans la fiche du PC : **0 requête** (contre ~11).
- Transfert : **1 requête + 2 ou 3 rechargements ciblés** (contre ~15).
- Plus aucune action ni mise en ligne ne fait disparaître le jeu : une erreur passagère se
  réessaie seule, avec au pire un bandeau discret.
- Plus aucun 500 dû à une course, un doublon ou un interblocage.
- PC fluide avec plusieurs milliers de Pokémon.

---

## 3. Phases

### Phase A : Correctifs immédiats (≈ 1 jour, à mettre en ligne seuls)

- [x] **A1. Données fraîches 30 s par défaut** (`main.tsx`) : `staleTime: 30_000` pour toutes les
      requêtes. Ouvrir une fiche, changer d'onglet ou de Pokémon réutilise le cache ; les
      invalidations après une action et les rechargements périodiques restent, donc rien ne
      s'affiche en retard. Supprime à lui seul les ~11 requêtes par flèche.
- [x] **A2. Ne plus remplacer le jeu par l'écran d'erreur** (`App.tsx`) : écran plein seulement
      si `/api/me` n'a **jamais** répondu (`me.data === undefined`) ; sinon le jeu reste affiché,
      avec un bandeau « Connexion au serveur perdue, nouvel essai… » tant que ça échoue.
- [x] **A3. Réessais automatiques des lectures** : jusqu'à 3 essais espacés (1 s, 2 s, 4 s) pour
      les coupures réseau, 429, 502, 503 et 504, en respectant `Retry-After` ; jamais pour les
      refus métier (4xx). Les actions (POST…) ne sont pas réessayées.
- [x] **A4. Limite de requêtes par joueur** (`app.ts`) : `keyGenerator` sur le cookie de session
      (haché), l'IP seulement sans session ; 600 par minute et par joueur, plus une limite large
      par IP (1 500) contre les abus. Réponse 429 au format du jeu :
      `{ error: 'RATE_LIMITED', retryAfter }`.
- [x] **A5. Messages d'erreur clairs** (`api.ts`, `labels.ts`) : coupure réseau → `NETWORK`
      (« Connexion au serveur perdue »), `RATE_LIMITED` (« Trop d'actions d'un coup, réessaie
      dans quelques secondes »), 502/503/504 (« Serveur en cours de redémarrage »).
- [x] **A6. Mises en ligne sans coupure** (`deploy/Caddyfile`) : `reverse_proxy` avec
      `lb_try_duration 20s` et `lb_try_interval 250ms` : pendant le redémarrage de l'API, Caddy
      garde les requêtes au lieu de répondre 502 (seules les connexions refusées sont retentées,
      une action n'est donc jamais envoyée deux fois).
- [x] **A7. Transfert sans double crédit** (`daycare.ts`, `store.ts`) : `DELETE … RETURNING` et
      Bonbons comptés sur les lignes réellement supprimées ; si le compte ne correspond pas,
      annulation avec `POKEMON_NOT_FOUND`. Le transfert automatique de la branche `expedition`
      passe par la même fonction (`transferRows`) et en profite.
- [x] Entrée du changelog (`ChangelogPage.tsx`) à la mise en ligne.
- **But** : les deux symptômes disparaissent, sans changer l'architecture.

### Phase B : Moins de requêtes après chaque action (≈ 2 à 3 jours)

- [x] **B1. Invalidation ciblée** : remplacer les 44 invalidations de `PLAYER_STATE_KEYS` par un
      assistant `refresh(queryClient, …clés)` et, pour chaque action, la liste des données
      qu'elle touche. Point de départ (à vérifier route par route) :

  | Action                         | Clés à recharger                                                                     |
  | ------------------------------ | ------------------------------------------------------------------------------------ |
  | Transfert                      | `pokemon`, `candies` (+ `inventory` si Méga-Gemme rendue)                            |
  | Bonbons, objet utilisé         | `pokemon`, `candies` ou `inventory`                                                  |
  | Évolution, Méga-Évolution      | `pokemon`, `pokedex`, `inventory`, `quests`                                          |
  | Départ d'expédition            | `expeditions`, `pokemon`, `inventory`                                                |
  | Récupération d'expédition      | `expeditions`, `pokemon`, `pokedex`, `inventory`, `candies`, `quests`, `guild`, `me` |
  | Centre Pokémon (soins, Rappel) | `pokemon` (+ `inventory` pour le Rappel)                                             |
  | Boutique                       | `shop`, `inventory`, `me`                                                            |

- [x] **B2. `me` rechargé seulement quand l'argent ou la région change** (boutique, quêtes,
      combats, donjons, guilde, récupérations), plus jamais après un transfert ou un favori.
- [x] **B3. Les actions renvoient ce qui a changé** et le jeu l'applique avec `setQueryData`,
      sans relire : transfert → identifiants supprimés et nouveaux totaux de Bonbons ; Bonbons,
      objet, soins, évolution → Pokémon à jour (+ entrées du Pokédex créées). Le favori le fait
      déjà (`FavoriteToggle`) : généraliser.
- [x] **B4. `/api/content` en cache long** : chaîne JSON et `ETag` gardés par version côté API ;
      côté jeu `staleTime: Infinity`, rechargé seulement quand la version publiée change (numéro
      de version renvoyé par `/api/me` ou dans un en-tête).
- [x] **B5. Retirer le ping de présence** (`presence.ts`) : les rechargements périodiques
      (inventaire, expéditions) passent déjà par la session, qui met à jour `last_seen_at`.
- [x] **B6. Discussion de guilde** rechargée toutes les 15 s (au lieu de 5 s), seulement quand
      elle est affichée.
- [x] **B7. Compteur de requêtes en développement** (`api.ts`) : avertissement dans la console
      au-delà de 20 requêtes en 5 s, pour repérer tout retour en arrière.
- **But** : une action coûte une requête et deux ou trois rechargements, pas quinze.
- **Réalisé** (écarts avec le plan) : assistants dans `lib/game.ts` (`refresh`, `PROGRESS_KEYS`,
  `refreshAfterExpeditionStart / Claim / Combat / Reward`, `applyTransfer`, `patchPokemon`,
  `setItemQuantity`). Seul le choix du starter recharge encore tout (`PLAYER_STATE_KEYS`). La
  récupération d'une expédition ne recharge pas `me` : aucune expédition ne donne d'argent ; `me`
  ne l'est plus qu'avec les combats, donjons, quêtes, récompenses et la boutique. Le contenu
  porte un `ETag` (`W/"content-<version>"`, 304 sans corps) ; `/api/me` renvoie `contentVersion`
  et rappelle toutes les 5 min pour voir passer une nouvelle version. L'ancienne route
  `/api/presence` reste pour les clients déjà ouverts.

### Phase C : Requêtes serveur plus légères (≈ 3 jours)

- [x] **C1. Cache de session** (`auth.ts`) : `session.cookieCache` de Better Auth (5 min), soit
      1 à 2 requêtes SQL de moins par appel. Vérifier les profils secondaires et garder une
      relecture en base pour `requireAdmin` (un rôle retiré doit agir tout de suite).
- [x] **C2. Un seul rattrapage par joueur, et pas à chaque requête** : regrouper
      `settleFinishedDungeonRun`, `settleFinishedBattle`, `settleClosedPlaces` et (branche
      `expedition`) `settleExpeditionBalls` dans un `settlePlayer(userId)`. Garder en mémoire la
      prochaine échéance de chaque joueur (fin de combat, prochaine rencontre…) : rien à faire,
      donc aucune requête SQL, tant qu'elle n'est pas passée. Les actions qui en dépendent
      l'appellent sans attendre.
- [x] **C3. `GET /api/quests` en lecture seule** : calculer l'avancement sans transaction et
      n'enregistrer que ce qui a changé (ou mettre à jour l'avancement au moment des captures,
      victoires et éclosions).
- [x] **C4. Supprimer les N+1** : équipes de toutes les expéditions en une requête dans
      `expeditionPaces` ; repérer les autres `for … await` sur la base dans `game/*.ts`.
- [x] **C5. Liste des Pokémon allégée** : compteur de révision par joueur (incrémenté à chaque
      changement de ses Pokémon) et `ETag` → réponse 304 sans corps quand rien n'a changé ;
      retirer les champs inutiles au jeu. Plus tard, si besoin : envoi des seuls changements.
- [x] **C6. Index et requêtes lentes** : activer `pg_stat_statements` et
      `log_min_duration_statement` en production (voir SURCHARGE.md, 1.4), vérifier avec
      `EXPLAIN` les requêtes les plus fréquentes (Pokémon d'un joueur triés par date
      d'obtention, expéditions dont une rencontre est due) et ajouter les index manquants.
- **But** : une lecture coûte 1 à 3 requêtes SQL, sans écriture.
- **Réalisé** (écarts avec le plan) :
  - C1 : `cookieCache` de 5 min ; le cookie rafraîchi est renvoyé au navigateur (sans cela le cache
    ne se renouvelait jamais). `requireAdmin` relit la base (`disableCookieCache`). Une session
    révoquée depuis un autre appareil reste valable au plus 5 min ; un compte supprimé est refusé
    tout de suite (liste en mémoire, `deletedUserIds`).
  - C2 : `game/settle.ts` (`PlayerSettler`). Deux portées : les requêtes ne rattrapent d'office que
    les Balls (`balls`), les lectures qui en dépendent (`/api/pokemon`, `/api/daycare`,
    `/api/museum`) et les départs de combat / donjon appellent `hooks.settleAll` (`all`) ; les
    routes de réclamation ne rattrapent pas les combats, sinon elles répondraient `ALREADY_CLAIMED`.
    Prochaine échéance gardée en mémoire (prochaine rencontre d'expédition, sinon 30 s ; combat ou
    donjon en cours : à chaque appel), appels simultanés d'un joueur fusionnés,
    `hooks.invalidateSettle` après un départ d'expédition, de combat ou de donjon.
  - C3 : l'avancement est calculé sans transaction ; la transaction ne s'ouvre que si une étape
    est franchie (état relu à l'intérieur).
  - C4 : `expeditionPaces` charge toutes les équipes en une requête ; stock de Balls des
    rattrapages en une requête (`itemQuantities`). Les autres boucles relevées (attaques de
    donjon, 6 au plus, récompenses de guilde) sont rares et bornées : laissées telles quelles.
  - C5 : un compteur de révision en base ne suffit pas (`busy` dépend des expéditions, pensions,
    combats, assistants…) : `ETag` calculé sur le corps de la réponse, 304 sans corps quand rien
    n'a changé. La requête SQL reste faite ; seuls le transfert et le traitement côté jeu sont
    économisés. Les champs du DTO sont tous utilisés par le jeu : rien retiré.
  - C6 : `docker-compose.prod.yml` active `log_min_duration_statement=500` et `pg_stat_statements`
    (commande `create extension` à lancer une fois, voir SURCHARGE.md 1.4). Aucun index ajouté
    sans mesure : à faire avec `pg_stat_statements` en production.

### Phase D : Écritures sûres (≈ 3 jours)

- [x] **D1. Verrou par joueur** : assistant `lockPlayer(tx, userId)`
      (`pg_advisory_xact_lock`) en tête de chaque transaction d'action (transferts, départs,
      dépôts, assistants, objets, évolutions, Bonbons, boutique, réclamations). Les actions d'un
      même joueur passent l'une après l'autre (elles vont à vitesse humaine) : plus de course
      entre « vérifier » et « écrire » (Pokémon occupé, dernier Pokémon, double réclamation).
- [x] **D2. Compteurs globaux hors des transactions des joueurs** : `species_captures` cumulé en
      mémoire et écrit toutes les 30 s en une requête triée par espèce (compteur de statistiques
      admin : quelques secondes perdues en cas d'arrêt brutal sont acceptables). À défaut,
      au minimum trier les lignes par `speciesId` pour éviter les interblocages.
- [x] **D3. Erreurs SQL traduites** (`app.ts`) : doublon d'index unique (23505) → 409
      `CONFLICT` ; interblocage ou conflit de sérialisation (40P01, 40001) → transaction rejouée
      jusqu'à 3 fois, puis 503 `BUSY` ; délai dépassé (57014, 55P03) → 503. Aucun message
      interne renvoyé au joueur pour une erreur 500 (seulement dans les journaux).
- [x] **D4. Délais maximaux** : sur la connexion Postgres (`client.ts`) `statement_timeout`
      10 s, `lock_timeout` 5 s, `idle_in_transaction_session_timeout` 30 s, `connect_timeout` ;
      côté jeu, `fetch` abandonné après 20 s (`AbortSignal.timeout`).
- [x] **D5. Contenu jamais chargé dans une transaction** : juste après une publication, un
      `content.get()` ou `content.version()` appelé pour la première fois dans une transaction
      réclame une autre connexion ; avec 10 transactions dans ce cas, le pool (10 connexions) se
      bloque. Charger le contenu avant d'ouvrir chaque transaction (comme
      `preloadExpeditionContent`).
- [x] **D6. Tests de concurrence sur un vrai Postgres** : service Postgres dans la CI et une
      série de tests lancés seulement là : double transfert, transfert pendant un départ en
      expédition, deux réclamations simultanées, captures croisées de deux joueurs (compteurs).
- **But** : aucune action simultanée ne peut dupliquer, perdre ou bloquer quoi que ce soit.
- **Réalisé** (écarts avec le plan) :
  - D1 : `game/tx.ts` : `playerTransaction(db, userId, fn)` (verrou `pg_advisory_xact_lock` sur
    `hashtextextended('player:<id>')`, réentrant) et `transaction(db, fn, { players })` (verrous
    triés). Toutes les transactions de `game/*.ts`, `routes/` et `beta-profiles.ts` y passent.
    Les commandes de combat et de donjon (changement, objet, fuite) relisent désormais le combat
    dans la transaction. Les coffres de guilde (plusieurs joueurs, ajouts seuls) et la remise à
    zéro des quêtes de guilde n'ont que les réessais, sans verrou de joueur.
  - D2 : `game/capture-stats.ts` : compteurs cumulés en mémoire **après la validation** de la
    transaction (jamais comptés pour une transaction annulée ou rejouée), écrits toutes les 30 s
    et à l'arrêt en une requête triée ; `speciesStats` (admin) les écrit d'abord. Repli dans une
    transaction ouverte autrement : écriture triée.
  - D3 : 23505 → 409 `CONFLICT` ; 40P01, 40001 → transaction rejouée (3 essais) puis 503
    `BUSY` ; 57014, 55P03, 25P03 → 503 `BUSY` avec `Retry-After: 1`. Une erreur 500 ne renvoie
    plus que `{ error: 'INTERNAL' }` (le message de Drizzle contenait la requête et ses
    paramètres). Libellés `BUSY`, `CONFLICT`, `INTERNAL`, `TIMEOUT` côté jeu.
  - D4 : délais par défaut dans `createDb` (`DEFAULT_DB_TIMEOUTS`, option `timeouts`) ; les
    migrations ont leur propre connexion, sans délai. Côté jeu, `TIMEOUT` après 20 s (lecture de
    la réponse comprise), réessayé comme une erreur passagère pour les lectures.
  - D5 : plutôt que de précharger partout, `ContentCache` charge le contenu par la connexion de la
    transaction en cours (`currentTransaction()`, `AsyncLocalStorage`) : couvre aussi les
    versions lues dans la transaction (réclamations). Une transaction ouverte sur la base depuis
    une autre du même appel passe par celle-ci (sinon le joueur attendrait son propre verrou).
  - D6 : `concurrency.test.ts` (ignoré sans `TEST_DATABASE_URL`), service `postgres:17-alpine`
    dans la CI ; une base neuve est créée puis supprimée. 7 tests : double transfert, transfert
    pendant un départ, réclamations simultanées, captures croisées, interblocage rejoué, verrou
    trop long, contenu rechargé dans 12 transactions (pool de 10). Vérifié en local sur un
    Postgres 17 : sans le verrou, les deux premiers échouent ; sans D5, le dernier bloque.

### Phase E : Affichage fluide (≈ 2 jours)

- [x] **E1. Une seule horloge partagée** pour `useNow` (un intervalle commun via
      `useSyncExternalStore`, au lieu d'un par composant), utilisée seulement par les composants
      qui affichent un compte à rebours.
- [x] **E2. PC mémoïsé** : liste de `usePcBrowser` (PE, talent, évolutions) calculée avec
      `useMemo` sur les Pokémon, le contenu, l'inventaire et les filtres ; plus de `useNow` au
      niveau de `PcPage` (seulement dans les cartes en soins).
- [x] **E3. Affichage progressif des grilles** (PC, choix d'équipe) : les 120 premiers Pokémon,
      puis la suite au défilement (`IntersectionObserver`).
- [x] **E4. Pastilles du menu mémoïsées** (`HomePage`) : évolutions disponibles calculées quand
      les Pokémon ou l'inventaire changent, pas toutes les 5 s.
- [x] **E5. Index plutôt que recherches** : `Map` au lieu de `.find` sur le Pokédex dans
      `EvolutionPanel`, `MegaPanel` et les fiches.
- **But** : PC fluide avec plusieurs milliers de Pokémon, sur mobile compris.
- **Réalisé** (écarts avec le plan) :
  - E1 : `useNow` (`components/ui.tsx`) garde un seul `setInterval` par durée (`useSyncExternalStore`,
    arrêté quand plus personne n'écoute). `sharedNow()` donne l'heure de l'horloge partagée, sans
    abonnement, pour une décision ponctuelle au rendu.
  - E2 : `usePcBrowser` calcule sa liste (PE, talent, évolution) et sa liste filtrée / triée avec
    `useMemo`. `PcPage`, `TeamsPage` et la vitrine n'écoutent plus l'horloge : `KoBadge` ne s'abonne
    (`HealingBadge`) que pour un Pokémon encore en soins, et la prop `now` des cartes est retirée.
  - E3 : `ProgressiveItems` (`components/ProgressiveGrid.tsx`) : 120 cartes puis 120 de plus quand la
    fin approche (`IntersectionObserver`, 600 px d'avance). Utilisé par le PC, « Équipe Pkmn », la
    vitrine et le choix d'équipe (`TeamPicker`). `resetKey` (`browser.viewKey`) ramène à la première
    tranche quand l'onglet, la recherche, le tri ou un filtre change, pas à un simple rechargement.
    La navigation par flèches de la fiche suit toujours la liste complète.
  - E4 : `HomePage` calcule les Pokémon qui peuvent évoluer quand les Pokémon, le sac ou le Pokédex
    changent ; seul le filtre « disponible » suit l'horloge de 5 s.
  - E5 : `useDexIndex` (Pokédex par espèce et par forme) et `useItemQuantities` (sac) dans
    `lib/game.ts`, utilisés par `EvolutionPanel` et `MegaPanel`.

### Phase F : Surveillance et tests de charge (≈ 1 à 2 jours)

- [x] **F1. Journaux utiles** : requêtes lentes (> 500 ms : route, durée), nombre de 429 et de
      500 par minute ; ne plus journaliser chaque requête réussie (les 3 × 10 Mo de journaux
      tiennent alors bien plus longtemps).
- [x] **F2. Scénario de charge** (`scripts/load-test`) rejouant une session type contre une copie
      de la base : chargement du jeu, 50 flèches dans le PC, transfert de 500 Pokémon,
      récupérations d'expéditions, à plusieurs joueurs en parallèle. Chiffres avant / après
      chaque phase.
- [x] **F3. (Optionnel) Télémétrie admin** : requêtes par minute, taux d'erreur et temps de
      réponse par route, gardés en mémoire.
- **But** : savoir avant les joueurs quand ça sature, et mesurer chaque amélioration.
- **Réalisé** (écarts avec le plan) :
  - F1 : `monitoring.ts`. Fastify ne journalise plus chaque requête (`LogController` avec
    `disableRequestLogging`). Reste journalisé : chaque requête de plus de 500 ms (« Requête lente » :
    route par son motif, statut, durée), et chaque minute un résumé (« Dernière minute : … ») s'il y a eu
    au moins un refus 429, une erreur 5xx ou une requête lente. Les erreurs 500 et les erreurs SQL
    traduites étaient déjà journalisées par le gestionnaire d'erreurs.
  - F2 : `scripts/load-test/load-test.mjs` (sans dépendance, voir son README) : comptes
    `load-<n>@load.test` préparés une fois (`--prepare`, puis `pnpm admin:promote` pour leur donner des
    Pokémon de test), ouverture du jeu, rechargements du PC (ETag), expédition, transfert par lots,
    à plusieurs joueurs en parallèle ; rapport JSON et `--compare` avant / après. Les « 50 flèches »
    du plan ne font plus aucune requête côté jeu (A1) : le scénario mesure à la place le coût serveur
    de 50 rechargements conditionnels de la liste.
  - F3 : `Monitoring` garde en mémoire (aucune écriture) les requêtes, erreurs 5xx, refus 429 et durées
    par route (palier de durée, p95 approché) depuis le démarrage, et par minute sur 2 heures.
    `GET /api/admin/metrics` (admin) et section **Santé de l'API** de l'admin (rechargée toutes les
    30 s). Les compteurs repartent de zéro à chaque redémarrage, donc à chaque mise en ligne.

---

## 4. Ordre conseillé

1. **Phase A seule**, mise en ligne rapidement (dev → main) : elle règle les deux symptômes.
2. **Phases B et C** ensemble : ce sont elles qui divisent la charge de l'API.
3. **Phase D** : les corrections de fond sur les écritures (D1 et D2 d'abord).
4. **Phases E et F** selon le temps disponible.

La branche `expedition` (à l'essai) ajoute le rattrapage des Balls à chaque requête : si elle est
gardée, C2 doit l'intégrer ; si elle est abandonnée, la ligne correspondante de C2 tombe.

## 5. Hors périmètre, à étudier plus tard

- Envoi des changements par le serveur (SSE ou WebSocket) à la place des rechargements
  périodiques.
- Plusieurs processus d'API (SURCHARGE.md, 2.1) : la limite de requêtes devra alors être
  partagée (Redis ou Postgres) au lieu d'être gardée en mémoire.
- Synchronisation par différences de la liste des Pokémon (suite de C5).
