# Recettes : comment ajouter ou changer quelque chose

Pas à pas pour les modifications courantes, avec les pièges déjà rencontrés. Lire d'abord
[ARCHITECTURE.md](ARCHITECTURE.md) ; les mots du jeu sont dans [GLOSSAIRE.md](GLOSSAIRE.md).

## Avant toute modification

```sh
pnpm lint          # ESLint (règles typées, frontières entre paquets, longueur des fonctions)
pnpm deadcode      # knip : exports, fichiers et dépendances inutilisés
pnpm format:check  # Prettier (pnpm format pour corriger)
pnpm typecheck
pnpm test          # tous les paquets ; les bases de test sont en mémoire
pnpm build         # le jeu et l'admin
```

La CI lance les mêmes commandes. Trois règles à ne jamais oublier :

1. **Un seul processus sur la base locale.** Sans Docker, la base est PGlite
   (`.data/pglite`), qu'un seul processus peut ouvrir. Tant que `pnpm dev` tourne, ne lancer ni
   seconde API, ni `pnpm db:migrate`, ni script qui ouvre cette base : elle serait corrompue.
   Pour essayer une migration, travailler sur une **copie** du dossier, faite API arrêtée.
2. **`pnpm dev` applique les migrations tout seul.** L'API redémarre à chaque fichier TypeScript
   enregistré et applique alors toute migration nouvelle. Un fichier de migration encore vide ou
   à moitié écrit peut donc être appliqué (voir « Migrations », plus bas).
3. **La base est la source de vérité du contenu.** Ne jamais écraser ce qui a été réglé dans
   l'admin (voir « Changer le contenu »).

## Ajouter une route d'API

1. **Contrat** dans `packages/shared` : schéma Zod de l'entrée (`…InputSchema`) et type de la
   réponse (`…Dto` ou `…Response`).
2. **Module de jeu** dans `apps/api/src/game/` : une fonction qui reçoit `db`, le contenu, le
   joueur et `now`, vérifie, écrit, et renvoie des lignes. Une action qui écrit passe par
   `playerTransaction(db, userId, async (tx) => { … })` : vérifications **et** écritures à
   l'intérieur, avec `tx`. Un refus : `throw new GameError(409, 'MON_CODE')`.
3. **Route** dans `apps/api/src/routes/` : valider (`schema.parse(request.body)`), appeler le
   module, renvoyer le DTO. Pas de requête SQL ni de règle de jeu dans la route.
4. **Code d'erreur** : ajouter chaque nouveau code à `PLAYER_ERROR_CODES`
   (`packages/shared/src/errors.ts`), puis son message à `GAME_ERRORS`
   (`apps/web/src/lib/labels/errors.ts`). `GameError` refuse un code hors catalogue, et le jeu ne
   compile pas tant que le message manque.
5. **Test** dans `apps/api/src/` : la vraie application sur une base en mémoire (modèle :
   `game.test.ts`), avec l'horloge injectée pour faire passer le temps.
6. **Côté jeu** : la lecture (`useQuery`) et l'action (`useMutation`) dans `apps/web/src/lib/`,
   en ne rechargeant après l'action que les données qu'elle change (`refresh(queryClient, …)`).

Une règle de jeu (un calcul, une probabilité, une condition) ne s'écrit pas dans l'API : elle va
dans `packages/game-core`, en fonction pure avec son test, et l'API l'appelle.

## Changer le schéma de la base

1. Modifier `packages/db/src/schema/*.ts`.
2. `pnpm db:generate` écrit la migration SQL dans `packages/db/drizzle/`.
3. La relire, puis redémarrer l'API (elle l'applique) ou lancer les tests.

Pièges :

- **Renommer une colonne** : `drizzle-kit` pose une question et échoue sans terminal interactif.
  Faire deux étapes : ajouter la nouvelle colonne (avec la copie des données dans la même
  migration), générer ; puis retirer l'ancienne, générer.
- **Données à reprendre** (un `UPDATE` qui remplit une nouvelle colonne) : le mettre dans une
  migration **à part**, créée avec `pnpm --filter @poke/db exec drizzle-kit generate --custom` et
  remplie **avant** de toucher un fichier TypeScript. Sinon `pnpm dev` applique la migration vide
  au premier enregistrement, et ne la rejouera plus.
- Si c'est arrivé : écrire une migration suivante **idempotente** qui refait le travail. On ne
  modifie jamais une migration déjà appliquée en production.

## Changer le contenu

Le contenu se règle d'abord **dans l'admin** (brouillon, puis publication) : aucune ligne de code.
Le code n'intervient que pour ajouter un champ, une entité, ou pousser un changement en production.

### Ajouter un champ à une entité existante

1. **Schéma** : `packages/content/src/schemas/`. Un champ ajouté doit rester lisible pour les
   anciennes versions du contenu : `.optional()` ou `.default(…)`.
2. **Table** : la colonne correspondante dans `packages/db/src/schema/content.ts` (même nom que le
   champ), puis `pnpm db:generate`.
3. **Valeurs** pour le contenu déjà en base : une migration de contenu **ciblée** (voir
   ci-dessous).
4. **Instantané** : ajouter le champ à `content/game-content.json`, avec les mêmes valeurs.
   L'API lit et valide ce fichier à chaque démarrage : un champ obligatoire absent la fait planter
   avant qu'elle ait pu le réécrire.
5. **Contenu de test** : `packages/content/src/seed/`, pour les tests et les bases neuves.
6. **Cohérence** : si le champ cite une autre entité, la règle dans
   `packages/content/src/integrity/`.
7. **Admin** : le champ dans le formulaire de la page (`apps/admin/src/pages/content/`).

### Ajouter une entité de contenu

En plus des étapes ci-dessus : la table dans `versionedContentTables`
(`packages/db/src/schema/content.ts`, sinon elle n'est pas copiée dans les brouillons), l'entité
dans `entityDefs` (`packages/db/src/content-repo.ts`), sa route dans `ENTITY_ROUTES`
(`apps/api/src/routes/admin/content.ts`), son accès dans `GameContext`
(`packages/game-core/src/context.ts`), et sa page dans l'admin (`routes.tsx`, `sections.ts`).

### Migration de contenu

Pour qu'un changement de contenu arrive en production (dont la base a ses propres réglages) :

- **Cibler** : `UPDATE` des seuls champs voulus, `jsonb_set` pour un réglage d'équilibrage,
  `INSERT … ON CONFLICT DO NOTHING` pour un ajout. Jamais de remplacement de lignes entières,
  jamais de suppression d'une entité créée dans l'admin.
- Traiter **la version publiée et le brouillon** s'il y en a un.
- **Essayer sur une copie** de la base, deux fois de suite : la migration doit donner le même
  résultat à la seconde (idempotente), et le tableau de bord de l'admin ne doit signaler aucune
  alerte de cohérence.
- Mettre aussi à jour le contenu de test et vérifier le diff de `content/game-content.json`
  après le redémarrage de l'API.

## Ajouter un onglet au jeu

1. `MENU_TABS` dans `packages/content/src/schemas/` (identifiant et libellé). Un onglet absent
   du menu réglé dans l'admin est ajouté à la fin automatiquement (`normalizeMenu`).
2. La page dans `apps/web/src/pages/game/`, branchée dans `HomePage.tsx`.
3. Sa condition de déblocage éventuelle : `balance.tabUnlocks`, réglable dans l'admin
   (Progression).
4. Le test `apps/web/test/tabs.test.tsx` couvre le nouvel onglet sans modification : il parcourt
   `MENU_TABS`.

## Ajouter un effet d'objet ou de talent

Les effets sont des unions discriminées par `type`, dans `packages/content/src/schemas/`
(`itemEffectSchema`, effets et conditions des talents).

1. Ajouter la variante au schéma.
2. La traiter dans `packages/game-core` : objets dans le module de l'activité concernée, talents
   dans `abilities/` (et `dungeon/traits.ts` pour les effets de combat). ESLint
   (`switch-exhaustiveness-check`) signale chaque `switch` qui ne traite pas le nouveau cas.
3. Son éditeur dans l'admin (`ItemsPage.tsx`, `AbilityEffectEditor.tsx`) et son libellé dans le
   jeu (`apps/web/src/lib/labels/effects.ts`).
4. Un test de la règle dans `game-core`. Les tests « à graine égale » ne doivent **pas** bouger
   tant que le contenu de test n'utilise pas le nouvel effet.

## Changer une règle de jeu

1. Modifier la fonction dans `packages/game-core` et son test.
2. `pnpm --filter @poke/game-core test` : `golden.test.ts` échoue, c'est voulu. Lire les lignes
   qui ont changé (elles doivent correspondre à la règle modifiée, et à elle seule), puis
   réenregistrer : `pnpm --filter @poke/game-core test -- -u`, dans le même commit.
3. Une activité déjà lancée se résout avec la **nouvelle** règle et l'**ancien** contenu : si
   c'est gênant, garder l'ancien comportement pour les anciennes lignes (exemple :
   `intervalGrowthMinutes` figé au départ d'une expédition).

## Ajouter une région

Le plus simple est de partir de la dernière ajoutée : `packages/content/src/seed/hoenn.ts` et sa
migration `0084_hoenn`. Une région, c'est : la région elle-même (ordre, starters, condition
d'ouverture), ses zones et leurs tables de butin (`seed/loot.ts`), ses dresseurs (Champions,
paliers, Conseil 4), ses quêtes et légendaires, ses badges (`badge-sprites.ts`), ses talents.
Elle arrive désactivée (`enabled: false`) et s'active dans l'admin.

Avant de durcir la condition d'ouverture d'une région existante : les joueurs qui y ont déjà
accès le gardent (table `opened_regions`).

## Mettre en production

Le détail est dans [MISE-A-JOUR.md](MISE-A-JOUR.md). En bref :

1. Le travail se fait sur la branche `dev`. Un `push` sur `dev` ne déploie rien.
2. Une _pull request_ `dev` → `main` lance la CI.
3. Fusionner déploie : la CI de `main`, puis l'action « Déploiement », qui sauvegarde la base,
   met le code à jour et redémarre. Les migrations s'appliquent au démarrage de l'API.

### Le journal des nouveautés

À chaque changement visible par les joueurs, une ligne dans `RELEASES`
(`apps/web/src/pages/ChangelogPage.tsx`) :

- une entrée par mise en production ; tant que l'entrée du haut n'est pas sur `main`, on la
  complète, sinon on en crée une nouvelle en tête ;
- **on ne modifie jamais une entrée déjà en production**, même pour la corriger ;
- ton du jeu (tutoiement), sans détail technique ; rien sur l'admin ni sur les changements
  internes ;
- la date de l'entrée est mise au jour de la fusion, juste avant celle-ci.

## Quand le navigateur n'affiche pas la modification

Après plusieurs enregistrements rapprochés, Vite peut servir une ancienne version d'un fichier.
Comparer ce qu'il sert (`curl localhost:5173/src/…`) au fichier sur le disque ; ré-enregistrer le
fichier suffit à le relancer.
