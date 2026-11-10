# Dexpedition

Jeu web idle de collection Pokémon, en ligne sur [dexpedition.fr](https://dexpedition.fr).

> Projet de fan non commercial. Pokémon © Nintendo / Creatures / Game Freak. Données : [PokéAPI](https://pokeapi.co).

## Prérequis

- Node.js ≥ 22
- pnpm 10 (`corepack install -g pnpm@10.18.0`, ou `npm i -g pnpm`)
- Optionnel : Docker, pour un vrai Postgres local. Sans Docker, l'API utilise **PGlite** (Postgres embarqué, fichier dans `.data/pglite`).

## Démarrage

> Guide détaillé, avec les explications et les problèmes fréquents : [docs/DEMARRAGE.md](docs/DEMARRAGE.md).

```sh
pnpm install
pnpm sprites:download       # illustrations des Pokémon (ignorées par Git) ; aussi au déploiement
cp .env.example .env        # optionnel en dev : des valeurs par défaut existent
pnpm dev                    # API :3000, jeu :5173, admin :5174
```

Au premier lancement, l'API applique les migrations et importe le contenu de test (version 1, publiée).

### Avec Postgres (Docker)

```sh
docker compose up -d
# dans .env : DATABASE_URL=postgres://poke:poke@localhost:5432/poke_collect
pnpm dev
```

### Devenir administrateur

1. Créer un compte depuis le jeu (http://localhost:5173).
2. Arrêter l'API si elle tourne sur PGlite (un seul processus peut ouvrir la base), puis :
   ```sh
   pnpm admin:promote ton@email.fr      # --revoke pour retirer le rôle
   ```
3. Se connecter au panneau d'admin (http://localhost:5174).

## Scripts

| Commande                                       | Rôle                                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                                     | API + jeu + admin en mode watch                                                                         |
| `pnpm test`                                    | Tests Vitest de tous les paquets (la base de test est un PGlite en mémoire)                             |
| `pnpm lint` / `pnpm format` / `pnpm typecheck` | Qualité du code                                                                                         |
| `pnpm deadcode`                                | Code mort : exports, fichiers et dépendances inutilisés (knip)                                          |
| `pnpm test:coverage`                           | Les tests, avec la part de code couverte                                                                |
| `pnpm build`                                   | Build des fronts                                                                                        |
| `pnpm import:pokeapi [--gens 1,2,3,4]`         | Régénère `packages/data/generated` depuis PokéAPI (cache disque dans `scripts/import-pokeapi/.cache`)   |
| `pnpm sprites:download [--force]`              | Télécharge les images (Pokémon, objets, dresseurs) dans `apps/api/sprites`, servies sous `/api/sprites` |
| `pnpm db:generate`                             | Génère une migration SQL après une modification du schéma Drizzle                                       |
| `pnpm db:migrate`                              | Applique les migrations (l'API le fait aussi au démarrage)                                              |
| `pnpm admin:promote <email>`                   | Donne le rôle admin à un compte                                                                         |

## Structure

```
apps/
  api/         Le serveur : Fastify, Better Auth, Drizzle ; routes du jeu (/api/*) et de l'admin (/api/admin/*)
  web/         Le jeu : React, Vite, Tailwind, TanStack Query
  admin/       Le panneau d'administration : même pile, avec React Router
packages/
  game-core/   Les règles du jeu, en fonctions pures (hasard à graine, sans base ni réseau)
  content/     Schémas du contenu réglable dans l'admin, cohérence, contenu de test
  data/        Données PokéAPI importées (JSON), types, adresses des sprites
  db/          Schéma Drizzle, migrations, contenu versionné, journal d'admin
  shared/      Contrat de l'API : schémas des entrées, types des réponses
scripts/       Import PokéAPI et sprites, scénario de charge
content/       Instantané du contenu publié (game-content.json)
deploy/        Scripts et configuration du serveur de production
docs/          Documentation
```

Chaque dossier de `apps/` et de `packages/` a son `README.md` : rôle, points d'entrée, où
ajouter quoi.

## Documentation

**Par où commencer** : [ARCHITECTURE](docs/ARCHITECTURE.md), puis le
[GLOSSAIRE](docs/GLOSSAIRE.md) au fil de la lecture du code.

| Document                                                     | Pour                                                                  |
| ------------------------------------------------------------ | --------------------------------------------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                 | Comprendre le projet : paquets, trajet d'une action, contenu, tests   |
| [docs/GLOSSAIRE.md](docs/GLOSSAIRE.md)                       | Retrouver dans le code une notion du jeu (PE, pitié, fuyard…)         |
| [docs/RECETTES.md](docs/RECETTES.md)                         | Ajouter une route, un champ de contenu, une migration, un onglet…     |
| [docs/DECISIONS.md](docs/DECISIONS.md)                       | Savoir pourquoi c'est fait ainsi avant d'y toucher                    |
| [docs/DEMARRAGE.md](docs/DEMARRAGE.md)                       | Lancer le projet en local, et les problèmes fréquents                 |
| [docs/MISE-A-JOUR.md](docs/MISE-A-JOUR.md)                   | Mettre une nouvelle version en production                             |
| [docs/INSTALLATION-SERVEUR.md](docs/INSTALLATION-SERVEUR.md) | Installer le serveur de production (une seule fois)                   |
| [docs/MISE-EN-PRODUCTION.md](docs/MISE-EN-PRODUCTION.md)     | La liste de ce qui a été fait pour ouvrir le jeu                      |
| [docs/SURCHARGE.md](docs/SURCHARGE.md)                       | Que faire si le serveur sature                                        |
| [docs/plans/](docs/plans)                                    | Les plans du projet : vision d'origine, stabilité, qualité du code    |
| [CLAUDE.md](CLAUDE.md)                                       | Les conventions et les pièges, en une page (aussi lu par Claude Code) |
