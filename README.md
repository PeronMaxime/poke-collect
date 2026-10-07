# Poké Collect

Jeu web idle de collection Pokémon. Voir [PLAN.md](PLAN.md) pour la vision, l'architecture et la roadmap.

> Projet de fan non commercial. Pokémon © Nintendo / Creatures / Game Freak. Données : [PokéAPI](https://pokeapi.co).

## Prérequis

- Node.js ≥ 22
- pnpm 10 (`corepack install -g pnpm@10.18.0`, ou `npm i -g pnpm`)
- Optionnel : Docker, pour un vrai Postgres local. Sans Docker, l'API utilise **PGlite** (Postgres embarqué, fichier dans `.data/pglite`).

## Démarrage

> Guide détaillé, avec les explications et les problèmes fréquents : [DEMARRAGE.md](DEMARRAGE.md).

```sh
pnpm install
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

| Commande                                       | Rôle                                                                                                  |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `pnpm dev`                                     | API + jeu + admin en mode watch                                                                       |
| `pnpm test`                                    | Tests Vitest de tous les paquets (la base de test est un PGlite en mémoire)                           |
| `pnpm lint` / `pnpm format` / `pnpm typecheck` | Qualité du code                                                                                       |
| `pnpm build`                                   | Build des fronts                                                                                      |
| `pnpm import:pokeapi [--gens 1,2]`             | Régénère `packages/data/generated` depuis PokéAPI (cache disque dans `scripts/import-pokeapi/.cache`) |
| `pnpm db:generate`                             | Génère une migration SQL après une modification du schéma Drizzle                                     |
| `pnpm db:migrate`                              | Applique les migrations (l'API le fait aussi au démarrage)                                            |
| `pnpm admin:promote <email>`                   | Donne le rôle admin à un compte                                                                       |

## Structure

```
apps/
  api/         Fastify + Better Auth ; routes joueur (/api/*) et admin (/api/admin/*, rôle vérifié côté serveur)
  web/         Jeu (React + Vite + Tailwind + TanStack Query)
  admin/       Panneau d'administration (même stack + React Router)
packages/
  game-core/   Logique pure : RNG seedé, stats et PE, capture, pitié, expéditions, simulateur de zone
  data/        Données PokéAPI importées (JSON) + types + URLs des sprites
  content/     Schémas Zod du contenu configurable + contenu de test (seed)
  db/          Schéma Drizzle, migrations, contenu versionné (brouillon / publié), journal d'admin
  shared/      Schémas et types de l'API
scripts/
  import-pokeapi/
```

## Contenu versionné

- Le contenu (équilibrage, régions, surcharges d'espèces, objets, tables de butin, zones… puis quêtes) est stocké en base, rattaché à une `content_version`.
- Une seule version **publiée** (celle que voient les joueurs) et au plus un **brouillon**.
- Créer un brouillon copie la version publiée ; le publier archive l'ancienne version. Restaurer une version archivée = créer un brouillon à partir d'elle, puis le publier.
- Chaque nouvelle table de contenu doit être ajoutée à `versionedContentTables` (`packages/db/src/schema/content.ts`) pour être copiée avec les brouillons.
- L'API garde le contenu publié en cache mémoire et l'invalide à chaque publication.
- La publication exige un contenu cohérent (références entre zones, régions, objets, tables de butin…). Les erreurs et avertissements s'affichent dans le tableau de bord de l'admin.
- Une expédition enregistre la version active à son départ : elle est résolue avec ce contenu-là, même si une nouvelle version est publiée entre-temps.
- Le tableau de bord permet d'exporter / importer le contenu en JSON, et de recharger le contenu de test dans un brouillon (utile pour une base créée avant la phase 1, qui n'a ni zones ni objets).

## Boucle de jeu (phase 1)

1. Le joueur choisit un starter parmi ceux de la première région, et reçoit l'inventaire de départ.
2. `POST /api/expeditions` : le serveur vérifie la zone (déblocage, PE minimale, types requis), réserve une Ball (et une baie) par rencontre, puis enregistre un seed.
3. `POST /api/expeditions/:id/claim` : une fois la durée écoulée, `game-core` calcule le résultat (rencontres, captures, pitié, butin, XP) à partir du seed, et le serveur l'applique en une transaction.

## Élevage (phase 2)

1. `POST /api/daycare` : le joueur dépose deux Pokémon compatibles (même groupe d'œufs et sexes opposés, ou un Métamorph ; jamais le groupe `no-eggs`, sauf surcharge « élevable » dans l'admin). Les objets tenus (Nœud Destin, Pierre Stase…) sont réservés dans l'inventaire et rendus au retrait. Les parents sont occupés, comme en expédition.
2. Le couple pond un œuf toutes les `breeding.eggMinutes` minutes, calculé paresseusement depuis `started_at`. `POST /api/daycare/:slot/collect` place les œufs dans la couveuse (capacité `breeding.maxEggs`) ; au-delà de cette capacité, les œufs en attente sont perdus.
3. Chaque œuf fige ses parents, la version de contenu et un seed. Il éclot après `hatch_counter × breeding.hatchMinutesPerCounter` minutes : `POST /api/eggs/hatch` calcule le bébé avec `game-core` (forme de base de la mère, IV hérités, nature, talent caché).
4. `POST /api/pokemon/transfer` échange des Pokémon (ni favoris, ni occupés) contre des Bonbons de lignée (une lignée = une chaîne d'évolution PokéAPI) ; `POST /api/pokemon/:id/candies` les convertit en XP.

## Combats de dresseurs (phase 3)

1. `POST /api/battles` : le serveur vérifie que le dresseur est débloqué (région + condition : % du Pokédex, dresseur battu, nombre de badges) et disponible (pas déjà battu s'il est unique, pas en recharge s'il est répétable), que l'équipe respecte ses conditions (nombre, niveau max, types imposés / interdits, PE minimale) et que chaque Pokémon est **disponible** : ni occupé (expédition, combat, pension), ni K.O. Cette vérification est commune aux trois activités.
2. `POST /api/battles/:id/claim` : `game-core` calcule la probabilité de victoire (PE du joueur corrigée par l'avantage de types, rapportée à la PE du dresseur, sur une sigmoïde bornée) puis tire le résultat avec le seed. Victoire : Poké Dollars, butin, XP, bonheur, badge à la première victoire. Défaite : une fraction de l'XP, et l'équipe est K.O. (`pokemon.ko_until`) pendant la durée réglée.
3. La table des types vient de PokéAPI (`type.damage_relations`, dans `packages/data/generated/types.json`).
