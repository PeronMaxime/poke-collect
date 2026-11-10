# `@poke/api` : le serveur

Fastify, Better Auth (comptes et sessions), Drizzle (base). Le serveur décide de tous les
résultats du jeu ; le navigateur ne fait qu'afficher et demander.

Vue d'ensemble : [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md). Ajouter une route :
[docs/RECETTES.md](../../docs/RECETTES.md).

## Organisation

```
src/
  server.ts          Démarrage : base, migrations, contenu initial, tâches de fond, écoute
  app.ts             Assemble l'application (buildApp) : erreurs, limites, supervision, routes
  env.ts             Lecture de la configuration (.env à la racine du dépôt)
  auth.ts            Better Auth : e-mail et mot de passe, Google, Discord
  content-cache.ts   Contenu publié gardé en mémoire (ContentCache)
  content-snapshot.ts  Lecture et écriture de content/game-content.json
  monitoring.ts      Requêtes lentes, erreurs, durées par route (admin « Santé de l'API »)
  rate-limit.ts      Limite de requêtes par joueur et par IP
  beta-profiles.ts   Profils secondaires de la bêta (provisoire)
  plugins/           Session (requireUser, requireAdmin, rattrapage) et routes d'authentification
  routes/            Une famille de routes par fichier : valider, appeler game/, répondre
  game/              Les modules de jeu : base de données + règles de @poke/game-core
  testing/           API de test en mémoire, pour les tests d'écran du jeu et de l'admin
  scripts/           promote-admin.ts (pnpm admin:promote)
  *.test.ts          Tests : la vraie application sur une base PGlite en mémoire
```

## Les modules de jeu (`src/game/`)

| Fichier                                     | Rôle                                                                    |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| `tx.ts`                                     | Transactions : verrou par joueur, réessais, `afterCommit`               |
| `errors.ts`                                 | `GameError` : refus d'une action, avec un code stable                   |
| `settle.ts`                                 | `PlayerSettler` : rattrapage du temps écoulé avant chaque requête       |
| `store.ts`                                  | Lectures et écritures communes : Pokémon, sac, Pokédex, avancement, DTO |
| `expeditions.ts`                            | Départ, arrêt, réclamation, Balls au fil de l'eau, chaînes, fuyards     |
| `battles.ts`, `dungeons.ts`, `legendary.ts` | Combats en temps réel : départ, ordres, fin, réclamation                |
| `daycare.ts`                                | Pension, œufs, couveuses, transfert et Bonbons                          |
| `museum.ts`, `center.ts`, `farm.ts`         | Fossiles, soins, baies                                                  |
| `assistants.ts`, `closed-places.ts`         | Assistants des bâtiments ; places perdues rendues au joueur             |
| `progression.ts`, `quests.ts`               | Évolutions, objets utilisés, récompenses, quêtes                        |
| `shop.ts`                                   | Boutique : achats, reventes, articles vus                               |
| `guilds.ts`                                 | Guildes : membres, quêtes, coffres, messages, classement                |
| `leaderboard.ts`, `favorite.ts`, `stats.ts` | Classements, avatar du dresseur, chiffres de la fiche                   |
| `push.ts`                                   | Abonnements et tournée des notifications Web Push                       |
| `capture-stats.ts`                          | Compteurs globaux par espèce, écrits par lots                           |
| `telemetry.ts`, `admin-players.ts`          | Admin : télémétrie d'équilibrage, fiche et outils de test d'un joueur   |

## Les routes

Toutes sous `/api`. Sauf mention, elles exigent une session (`requireUser`).

| Fichier (`src/routes/`)                              | Chemins                                                                                  |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `player.ts`                                          | `/content` (public), `/me`, `/presence`, `/profile`, `/starter`                          |
| `game.ts`                                            | `/pokemon`, `/pokedex`, `/inventory`, `/expeditions`                                     |
| `battles.ts`                                         | `/battles`                                                                               |
| `dungeons.ts`                                        | `/dungeons`                                                                              |
| `legendary.ts`                                       | `/legendary-battles`, `/quests/:id/battle`, `/pokemon/:id/release`                       |
| `breeding.ts`                                        | `/daycare`, `/eggs`, `/pokemon/transfer`, `/candies`                                     |
| `museum.ts`, `center.ts`, `farm.ts`, `assistants.ts` | `/museum`, `/center`, `/farm`, `/assistants`                                             |
| `progression.ts`                                     | `/pokemon/:id/evolve`, `/mega`, `/use-item`, `/progression`, `/trainer-card`, `/quests`  |
| `shop.ts`                                            | `/shop`                                                                                  |
| `guilds.ts`                                          | `/guild`, `/guilds`, `/items/open-chest`                                                 |
| `tags.ts`, `teams.ts`                                | `/tags`, `/teams`                                                                        |
| `trainers.ts`, `leaderboard.ts`                      | `/trainers` (fiches des autres dresseurs), `/trainer-card`, `/leaderboard`               |
| `push.ts`                                            | `/push`                                                                                  |
| `sprites.ts`                                         | `/sprites` (public, fichiers de `apps/api/sprites`)                                      |
| `admin.ts`                                           | `/admin/*` (rôle admin vérifié à chaque requête) : contenu, joueurs, télémétrie, journal |
| `plugins/auth-routes.ts`                             | `/auth/*` (Better Auth)                                                                  |
| `beta-profiles.ts`                                   | `/beta/profiles`                                                                         |

Hors session : `/api/health` (supervision) et `/api/config` (fournisseurs de connexion actifs).

## Configuration

Lue par `env.ts` depuis `.env` à la racine (modèles : `.env.example`,
`.env.production.example`). Toutes les variables ont une valeur par défaut en développement.

| Variable                                                   | Rôle                                                                |
| ---------------------------------------------------------- | ------------------------------------------------------------------- |
| `DATABASE_URL`                                             | Postgres ; absente : PGlite dans `PGLITE_DATA_DIR` (`.data/pglite`) |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `TRUSTED_ORIGINS` | Sessions et origines autorisées                                     |
| `GOOGLE_CLIENT_*`, `DISCORD_CLIENT_*`                      | Connexion par Google ou Discord (facultatif)                        |
| `SMTP_URL`, `MAIL_FROM`                                    | E-mails de réinitialisation ; absents : affichés en console en dev  |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`   | Notifications push ; en dev, une paire est générée                  |
| `PUSH_INTERVAL_SECONDS`                                    | Tournée des notifications (60 s ; 0 pour la couper)                 |
| `RATE_LIMIT_PER_MINUTE`, `RATE_LIMIT_PER_IP_PER_MINUTE`    | Limites de requêtes (0 : aucune, valeur par défaut hors prod)       |
| `CONTENT_SNAPSHOT_PATH`, `CONTENT_SNAPSHOT_WRITE`          | Instantané du contenu ; réécrit hors production                     |
| `API_HOST`, `API_PORT`, `TRUST_PROXY`                      | Écoute ; derrière Caddy en production                               |

## Tests

```sh
pnpm --filter @poke/api test
```

Chaque fichier crée sa base en mémoire, applique les migrations, importe le contenu de test et
construit l'application avec une horloge qu'il fait avancer. `concurrency.test.ts` ne tourne
qu'avec `TEST_DATABASE_URL` (un vrai Postgres, fourni par la CI).
