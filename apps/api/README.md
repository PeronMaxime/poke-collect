# `@poke/api` : le serveur

Fastify, Better Auth (comptes et sessions), Drizzle (base). Le serveur décide de tous les
résultats du jeu ; le navigateur ne fait qu'afficher et demander.

Vue d'ensemble : [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md). Ajouter une route :
[docs/RECETTES.md](../../docs/RECETTES.md).

## Organisation

```
src/
  server.ts          Démarrage : base, migrations, contenu initial, application, tâches de fond, écoute
  app.ts             Assemble l'application (buildApp) : erreurs, limites, supervision, routes
  env.ts             Lecture de la configuration (.env à la racine du dépôt)
  auth.ts            Better Auth : e-mail, Google, Discord, second facteur, captcha, limites
  mail.ts            Envoi des e-mails (SMTP, ou console en développement)
  content-cache.ts   Contenu publié gardé en mémoire (ContentCache)
  content-snapshot.ts  Lecture et écriture de content/game-content.json
  monitoring.ts      Requêtes lentes, erreurs, durées par route (admin « Santé de l'API »)
  rate-limit.ts      Limite de requêtes par joueur et par IP
  beta-profiles.ts   Profils secondaires de la bêta (provisoire)
  plugins/           Session (requireUser, requireAdmin, rattrapage) et routes d'authentification
  routes/            Une famille de routes par fichier : valider, appeler game/, répondre
    deps.ts          Ce que reçoit chaque famille (RouteDeps) et le joueur de la requête
    admin/           Routes de l'administration : contenu, joueurs, supervision
  game/              Les modules de jeu : base de données + règles de @poke/game-core
    store/           Lectures et écritures communes
    expeditions/     Les expéditions, une étape par fichier
    guilds/          Les guildes
  jobs/              Tâches de fond, lancées par startJobs() (server.ts)
  testing/           API de test en mémoire, pour les tests d'écran du jeu et de l'admin
  scripts/           promote-admin.ts (pnpm admin:promote, --revoke, --reset-2fa)
test/
  support/api.ts     Mise en place commune des tests (testApi)
  player/ expeditions/ battles/ buildings/ progression/ platform/
                     Les tests, un dossier par domaine
```

## Les modules de jeu (`src/game/`)

Un dossier s'importe par son nom (`../game/store`) : son `index.ts` réexporte ce qui sert ailleurs.

| Fichier                                     | Rôle                                                                    |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| `tx.ts`                                     | Transactions : verrou par joueur, réessais, `afterCommit`               |
| `errors.ts`                                 | `GameError` : refus d'une action, avec un code stable                   |
| `settle.ts`                                 | `PlayerSettler` : rattrapage du temps écoulé avant chaque requête       |
| `profile.ts`                                | Profil du dresseur : création, starter, starter d'une région            |
| `store/pokemon.ts`                          | Pokémon du PC : lecture, ajout, modification, DTO                       |
| `store/inventory.ts`                        | Sac : lire, ajouter, retirer des objets ; bonus chromatiques            |
| `store/pokedex.ts`                          | Pokédex des espèces et des formes                                       |
| `store/progress.ts`                         | Avancement : onglets et places ouverts, quêtes, récompenses réclamées   |
| `expeditions/start.ts`                      | Départ d'une expédition                                                 |
| `expeditions/balls.ts`                      | Balls lancées au fil de l'eau                                           |
| `expeditions/claim.ts`                      | Arrêt et réclamation : résultat rejoué à partir de la graine            |
| `expeditions/state.ts`, `views.ts`          | Chaînes chromatiques, fuyards, rythmes ; affichage et historique        |
| `battles.ts`, `dungeons.ts`, `legendary.ts` | Combats en temps réel : départ, ordres, fin, réclamation                |
| `daycare.ts`                                | Pension, œufs, couveuses, transfert et Bonbons                          |
| `museum.ts`, `center.ts`, `farm.ts`         | Fossiles, soins, baies                                                  |
| `assistants.ts`, `closed-places.ts`         | Assistants des bâtiments ; places perdues rendues au joueur             |
| `progression.ts`, `quests.ts`               | Évolutions, objets utilisés, récompenses, quêtes                        |
| `shop.ts`                                   | Boutique : achats, reventes, articles vus                               |
| `teams.ts`, `tags.ts`                       | Équipes enregistrées, étiquettes de Pokémon                             |
| `guilds/membership.ts`                      | Créer, rejoindre, quitter une guilde ; rôles et exclusions              |
| `guilds/quests.ts`, `chests.ts`             | Quêtes de guilde et leur règlement en fin de période ; coffres          |
| `guilds/reads.ts`, `messages.ts`            | Onglet Guilde, liste et classement des guildes ; discussion             |
| `trainers.ts`                               | Les autres dresseurs : recherche, fiche, Pokédex, vitrine               |
| `leaderboard.ts`, `favorite.ts`, `stats.ts` | Classements, avatar du dresseur, chiffres de la fiche                   |
| `push.ts`                                   | Notifications Web Push : abonnements (liste blanche), réglages, tournée |
| `capture-stats.ts`                          | Compteurs globaux par espèce, écrits par lots                           |
| `telemetry.ts`, `admin-players.ts`          | Admin : télémétrie d'équilibrage, fiche et outils de test d'un joueur   |

## Les tâches de fond (`src/jobs/`)

Lancées par `startJobs()` dans `server.ts`, dans le processus de l'API (pas de worker séparé).
`BACKGROUND_JOBS=0` coupe les notifications, les coffres de guilde et la purge des discussions,
pour un processus lancé en plus du premier ; les compteurs d'espèces tournent toujours, chaque
processus écrivant les siens.

| Fichier                   | Rôle                                                                  |
| ------------------------- | --------------------------------------------------------------------- |
| `push-notifier.ts`        | Tournée des notifications push (`PUSH_INTERVAL_SECONDS`)              |
| `guild-rewards.ts`        | Coffres de guilde distribués à la fin de chaque période               |
| `guild-messages-purge.ts` | Messages de guilde plus vieux que `balance.guilds.chat.retentionDays` |
| `species-counts.ts`       | Écriture par lots des compteurs d'espèces (`game/capture-stats`)      |

## Les routes

Toutes sous `/api`. Sauf mention, elles exigent une session (`requireUser`).

| Fichier (`src/routes/`)                              | Chemins                                                                                 |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `player.ts`                                          | `/content` (public), `/me`, `/presence`, `/profile`, `/starter`                         |
| `game.ts`                                            | `/pokemon`, `/pokedex`, `/inventory`, `/expeditions`                                    |
| `battles.ts`                                         | `/battles`                                                                              |
| `dungeons.ts`                                        | `/dungeons`                                                                             |
| `legendary.ts`                                       | `/legendary-battles`, `/quests/:id/battle`, `/pokemon/:id/release`                      |
| `breeding.ts`                                        | `/daycare`, `/eggs`, `/pokemon/transfer`, `/candies`                                    |
| `museum.ts`, `center.ts`, `farm.ts`, `assistants.ts` | `/museum`, `/center`, `/farm`, `/assistants`                                            |
| `progression.ts`                                     | `/pokemon/:id/evolve`, `/mega`, `/use-item`, `/progression`, `/trainer-card`, `/quests` |
| `shop.ts`                                            | `/shop`                                                                                 |
| `guilds.ts`                                          | `/guild`, `/guilds`, `/items/open-chest`                                                |
| `tags.ts`, `teams.ts`                                | `/tags`, `/teams`                                                                       |
| `trainers.ts`, `leaderboard.ts`                      | `/trainers` (fiches des autres dresseurs), `/trainer-card`, `/leaderboard`              |
| `push.ts`                                            | `/push`                                                                                 |
| `sprites.ts`                                         | `/sprites` (public, fichiers de `apps/api/sprites`)                                     |
| `admin/content.ts`                                   | `/admin/*` : brouillon, publication et versions du contenu                              |
| `admin/players.ts`                                   | `/admin/*` : joueurs, fiche d'un joueur, outils de test                                 |
| `admin/moderation.ts`                                | `/admin/moderation/*` : suspension, renommage, guildes et leur discussion               |
| `admin/supervision.ts`                               | `/admin/*` : télémétrie, statistiques d'espèces, santé de l'API, journal                |
| `plugins/auth-routes.ts`                             | `/auth/*` (Better Auth)                                                                 |
| `beta-profiles.ts`                                   | `/beta/profiles`                                                                        |

Un compte suspendu par la modération (ou le profil secondaire actif, s'il l'est seul) reçoit
`403 ACCOUNT_SUSPENDED` sur toute route qui exige une session, avec la fin et le motif ; un compte
supprimé reçoit `401`. Leur état est relu en base au plus toutes les 30 s (`AccountStatusCache`,
`game/moderation.ts`), même quand le cookie de session, gardé 5 min, reste valable.

Les routes `/admin/*` vérifient à chaque requête le rôle admin et le second facteur : activé sur
le compte (sinon `ADMIN_2FA_SETUP_REQUIRED`) et passé pour ouvrir la session (sinon
`ADMIN_2FA_REQUIRED` : une connexion Google ou Discord ne le passe pas). Hors session :
`/api/health` (supervision) et `/api/config` (ce que l'écran de connexion propose).

## Configuration

Lue par `env.ts` depuis `.env` à la racine (modèles : `.env.example`,
`.env.production.example`). Toutes les variables ont une valeur par défaut en développement.

| Variable                                                   | Rôle                                                                    |
| ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| `DATABASE_URL`                                             | Postgres ; absente : PGlite dans `PGLITE_DATA_DIR` (`.data/pglite`)     |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `TRUSTED_ORIGINS` | Sessions et origines autorisées                                         |
| `GOOGLE_CLIENT_*`, `DISCORD_CLIENT_*`                      | Connexion par Google ou Discord (facultatif)                            |
| `SMTP_URL`, `MAIL_FROM`                                    | E-mails de réinitialisation ; absents : affichés en console en dev      |
| `EMAIL_VERIFICATION`                                       | Confirmation de l'adresse ; par défaut en prod avec `SMTP_URL`          |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`               | Captcha Cloudflare Turnstile (facultatif)                               |
| `AUTH_RATE_LIMIT`                                          | Limites de Better Auth par IP ; par défaut en production                |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`   | Notifications push ; en dev, une paire est générée                      |
| `PUSH_INTERVAL_SECONDS`                                    | Tournée des notifications (60 s ; 0 pour la couper)                     |
| `BACKGROUND_JOBS`                                          | `0` : ni push, ni coffres, ni purge des discussions (processus en plus) |
| `RATE_LIMIT_PER_MINUTE`, `RATE_LIMIT_PER_IP_PER_MINUTE`    | Limites de requêtes (0 : aucune, valeur par défaut hors prod)           |
| `RATE_LIMIT_HEAVY_PER_MINUTE`                              | Budget propre de chaque lecture lourde, par joueur (120 en prod)        |
| `RATE_LIMIT_WRITES_PER_MINUTE`                             | Budget d'écritures par joueur, toutes routes (300 en prod)              |
| `CONTENT_SNAPSHOT_PATH`, `CONTENT_SNAPSHOT_WRITE`          | Instantané du contenu ; réécrit hors production                         |
| `API_HOST`, `API_PORT`, `TRUST_PROXY`                      | Écoute ; derrière Caddy en production                                   |

## Tests

```sh
pnpm --filter @poke/api test
```

Les tests sont dans `test/`, un dossier par domaine. Chaque fichier lance la vraie application
sur sa propre base PGlite en mémoire, avec `testApi()` (`test/support/api.ts`) :

```ts
const api = testApi({ start: '2026-10-07T10:00:00Z' });

it('…', async () => {
  const { call } = await api.newPlayer('sacha@test.fr', 'Sacha');
  api.advance(60); // minutes
  expect((await call('GET', '/api/expeditions')).status).toBe(200);
});
```

`testApi` applique les migrations, importe le contenu de test et donne une horloge que le test
fait avancer. `platform/concurrency.test.ts` ne tourne qu'avec `TEST_DATABASE_URL` (un vrai
Postgres, fourni par la CI). `platform/route-security.test.ts` appelle toutes les routes déclarées
(`routes`, renvoyé par `buildApp`) : sans session, en joueur sur l'admin, et avec l'identifiant
de l'objet d'un autre joueur ; une nouvelle route publique ou à `:id` s'y déclare.
