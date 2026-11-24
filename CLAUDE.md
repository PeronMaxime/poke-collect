# Dexpedition : conventions et pièges

Jeu web idle de collection Pokémon (monorepo pnpm, TypeScript). Ce fichier tient en une page ce
qu'il faut savoir avant de modifier le code ; le détail est dans `docs/`.

- Comprendre le projet : `docs/ARCHITECTURE.md`
- Les mots du jeu et leur nom dans le code : `docs/GLOSSAIRE.md`
- Comment ajouter une route, un champ de contenu, une migration… : `docs/RECETTES.md`
- Pourquoi c'est fait ainsi : `docs/DECISIONS.md`
- Sécurité (menaces, règles, audit de chaque mise en production) : `docs/SECURITE.md`

## Commandes

```sh
pnpm dev            # API :3000, jeu :5173, admin :5174
pnpm lint           # ESLint, avertissements restants plafonnés (le plafond ne peut que baisser)
pnpm deadcode       # knip
pnpm format         # Prettier (format:check dans la CI)
pnpm typecheck
pnpm test           # tous les paquets, bases en mémoire
pnpm build          # le jeu et l'admin
pnpm db:generate    # migration SQL après une modification du schéma Drizzle
```

Avant de considérer un travail comme fini : lint, deadcode, format, typecheck, test, build, et la
doc technique à jour (`docs/`, README des dossiers touchés, ce fichier si une règle ou un piège
change) : elle se met à jour avec le code, jamais « plus tard ».

## Règles du code

- **Où va quoi.** Une règle de jeu : `packages/game-core`, en fonction pure avec son test. Une
  lecture ou écriture en base : `apps/api/src/game/`. Une route : valider, appeler, répondre, rien
  d'autre. Un type échangé avec le jeu : `packages/shared`. Un réglage : du contenu, pas une
  constante.
- **Le serveur décide.** Le jeu n'affiche que des aperçus ; tout résultat est recalculé côté
  serveur à partir de la graine enregistrée.
- **Une adresse fournie par un joueur n'est jamais appelée par le serveur sans liste blanche**
  (modèle : `isAllowedPushEndpoint` dans `apps/api/src/game/push.ts`).
- **Toute route exige une session.** Une nouvelle route publique s'ajoute à `PUBLIC_ROUTES`, une
  nouvelle route à `:id` à `OWNED` ou `NOT_OWNED` (`apps/api/test/platform/route-security.test.ts`),
  sinon ce test échoue ; un objet se cherche avec son `ownerId` dans le `where`.
- **Pas de `Math.random()` ni de `new Date()` dans les règles** : `createRng(seed)` et l'horloge
  injectée (`now`).
- **Toute action d'un joueur qui écrit passe par `playerTransaction`**, vérifications comprises.
  Dans une guilde, rôles et cibles se lisent après le verrou de la guilde (`lockedMembership`).
- **Modération et débit.** Une action sur un autre joueur ou une guilde va sous
  `/api/admin/moderation/*`, journalisée (`moderation.*`). Une lecture qui parcourt beaucoup de
  lignes s'ajoute à `HEAVY_READS` (`apps/api/src/rate-limit.ts`), qui lui donne son budget.
- **Un refus = `GameError(statut, 'CODE')`** : le code dans le catalogue
  (`packages/shared/src/errors.ts`), son message dans `GAME_ERRORS` (`apps/web/src/lib/labels/errors.ts`).
- **Après une action, le jeu ne recharge que ce qu'elle change** (`refresh(queryClient, …)`),
  jamais toutes les données.
- **Frontières entre paquets** : vérifiées par ESLint. Le jeu et l'admin n'importent jamais
  `@poke/db` ; `game-core` n'importe ni la base ni le serveur.
- **Langue** : identifiants en anglais ; commentaires, textes du jeu et messages de commit en
  français.
- **Commentaires** : un en-tête par fichier qui dit son rôle ; une phrase sur chaque export
  (unités, cas limites, pourquoi) ; rien qui répète le code. Modèle : `apps/api/src/game/tx.ts`.
- **Longueur** : une fonction de plus de 150 lignes (ou de complexité au-delà de 40) se découpe
  (hooks nommés et fonctions pures côté écrans) : ESLint la refuse. Seuls les fichiers de la liste
  « dette restante » d'`eslint.config.js` gardent un avertissement ; quand on en retire un,
  baisser `--max-warnings` dans `package.json` et sortir le fichier remis d'aplomb de la liste.
- TypeScript reste en `~6.0` (typescript-eslint ne prend pas encore en charge la version 7).

## Pièges

- **Un seul processus sur `.data/pglite`.** Tant que `pnpm dev` tourne, ne lancer ni seconde API,
  ni `pnpm db:migrate`, ni script ouvrant cette base : elle serait corrompue. Vérifier d'abord
  qu'aucun `tsx watch src/server.ts` ne tourne. Pour essayer une migration : une copie du dossier.
- **`pnpm dev` applique les migrations à chaque redémarrage**, donc à chaque fichier TypeScript
  enregistré. Une migration de données se crée avec `drizzle-kit generate --custom` et se remplit
  avant de toucher au code, sinon elle est appliquée vide.
- **La base est la source de vérité du contenu.** Les réglages faits dans l'admin (local et
  production) ne s'écrasent jamais : migrations ciblées (`UPDATE` des champs voulus,
  `INSERT … ON CONFLICT DO NOTHING`), jamais de remplacement de lignes entières.
- **Nouveau champ de contenu : aussi dans `content/game-content.json`.** L'API valide ce fichier
  à chaque démarrage et plante s'il manque un champ obligatoire.
- **On ne modifie jamais une migration déjà appliquée**, ni une entrée du journal des nouveautés
  déjà en production (`RELEASES` dans `apps/web/src/pages/releases.ts`).
- **`docs/plans/PLAN.md` n'est pas formaté par Prettier** : ne pas le reformater.
- **En production, l'API tourne en utilisateur `node`, système de fichiers en lecture seule**
  (`docker-compose.prod.yml`) : elle n'écrit que dans `/tmp` et ses volumes. La tâche `images` de
  la CI lance les conteneurs avec ces restrictions.
- **Un compteur de valeur (argent, stock, réserve) a son `CHECK (… >= 0)` en base** ; une
  violation répond 409 `INVALID_STATE` et apparaît dans « Santé de l'API » : c'est un défaut du code.
- **Un test qui appelle `/api/admin/*` passe par `promoteAdmin`** (`apps/api/test/support/api.ts`) :
  le rôle seul ne suffit plus, il faut le second facteur. Utiliser ensuite le cookie renvoyé (la
  session d'avant est remplacée).
- **Le script de thème d'`apps/web/index.html` est autorisé par son empreinte** dans la politique
  de contenu (`deploy/Caddyfile`) : le retoucher (ou le reformater) demande de recopier la nouvelle
  empreinte, que `node scripts/csp-check.mjs apps/web/dist apps/admin/dist` affiche après le build.
  Pas de nouveau script en ligne, d'`eval` ni de ressource d'un autre site sans adapter la CSP.
- **Changer une règle fait échouer `golden.test.ts`** : c'est voulu. Relire l'écart, puis
  réenregistrer avec `pnpm --filter @poke/game-core exec vitest run -u` (`test -- -u` ne
  réenregistre rien).

## Git et mise en production

- Le travail se fait sur `dev`. **Un `push` sur `main` déploie en production** : rien sur `main`
  sans demande explicite.
- Un changement visible par les joueurs s'accompagne d'une ligne dans le journal des nouveautés
  (voir `docs/RECETTES.md`).
- Avant chaque fusion `dev` → `main` : la routine de `docs/SECURITE.md` (section 4 :
  `/security-review`, `pnpm audit`, liste de contrôle, ligne dans le journal des audits).
- Déplacer un fichier et le modifier se font dans deux commits distincts.
