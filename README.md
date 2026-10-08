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
| `pnpm build`                                   | Build des fronts                                                                                        |
| `pnpm import:pokeapi [--gens 1,2,3,4]`         | Régénère `packages/data/generated` depuis PokéAPI (cache disque dans `scripts/import-pokeapi/.cache`)   |
| `pnpm sprites:download [--force]`              | Télécharge les images (Pokémon, objets, dresseurs) dans `apps/api/sprites`, servies sous `/api/sprites` |
| `pnpm db:generate`                             | Génère une migration SQL après une modification du schéma Drizzle                                       |
| `pnpm db:migrate`                              | Applique les migrations (l'API le fait aussi au démarrage)                                              |
| `pnpm admin:promote <email>`                   | Donne le rôle admin à un compte                                                                         |

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
- **Instantané versionné** : `content/game-content.json` contient le contenu publié. Hors production, l'API le réécrit au démarrage (migrations de contenu comprises) et à chaque publication (`CONTENT_SNAPSHOT_WRITE=0` pour désactiver, `CONTENT_SNAPSHOT_PATH` pour le déplacer). Une base neuve, dont celle de production, part de ce fichier ; le seed (`packages/content`) ne sert que s'il est absent. Les migrations de contenu sont ciblées (champs modifiés, ajouts sans écrasement) pour préserver les réglages faits dans l'admin.
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

1. `POST /api/battles` : le serveur vérifie que le dresseur est débloqué (région + condition : % du Pokédex, dresseur battu, nombre de badges, ou plusieurs de ces conditions à la fois) et disponible (pas déjà battu s'il est unique, pas en recharge s'il est répétable), que l'équipe respecte ses conditions (nombre, niveau max, types imposés / interdits, PE minimale) et que chaque Pokémon est **disponible** : ni occupé (expédition, combat, pension), ni K.O. Cette vérification est commune aux trois activités.
2. `POST /api/battles/:id/claim` : `game-core` calcule la probabilité de victoire (PE du joueur corrigée par l'avantage de types, rapportée à la PE du dresseur, sur une sigmoïde bornée) puis tire le résultat avec le seed. Victoire : Poké Dollars, butin, XP, bonheur, badge à la première victoire. Défaite : une fraction de l'XP, et l'équipe est K.O. (`pokemon.ko_until`) pendant la durée réglée.
3. La table des types vient de PokéAPI (`type.damage_relations`, dans `packages/data/generated/types.json`).

## Expansion (phase 8)

- **Régions** : l'import PokéAPI couvre toutes les générations par défaut (1025 espèces ; `--gens` pour en limiter le nombre). Le contenu de test enchaîne Kanto, Johto, Hoenn, Sinnoh, Unys, Kalos, Alola, Galar, Hisui (espèces propres et espèces à forme de Hisui) et Paldea, chacune débloquée par 50 % du Pokédex de la précédente. Les espèces sans habitat PokéAPI (Gén. IV+) reçoivent un habitat maison déduit des espèces proches (types, forme, couleur), marqué « déduit » et surchargeable dans l'admin (Espèces).
- **Formes** (`packages/data/generated/forms.json`, champ `kind`) : toutes les variétés PokéAPI (régionales, alternatives, Méga-Évolutions, Primo-Résurgences, Gigamax, formes de combat, Pokémon Dominants) et les formes d'apparence (Zarbi, Prismillon, Charmilly… ; identifiant = 100 000 + identifiant `pokemon-form`). Une forme remplace les types, statistiques et talents de l'espèce et a ses propres sprites (`pokemonSprite`) ; elle s'indique sur les rencontres, les dresseurs et les Pokémon offerts par les quêtes. Les Méga et Gigamax sont des formes à collectionner (Tour Maîtrise à Kalos, Antre Dynamax à Galar), sans transformation en jeu. Le Pokédex reste par espèce.
- **Évolutions et formes** : les conditions PokéAPI propres à une forme sont respectées (Miaouss d'Alola évolue par le bonheur, Miaouss de Galar en Berserkatt) et une évolution peut mener à une forme précise, au choix du joueur (Pikachu → Raichu ou Raichu d'Alola). Sinon, la forme suit son suffixe (Sancoki Orient → Tritosor Orient) ; une forme régionale sans équivalent, une Méga, un Gigamax ou une forme de combat n'évolue pas. Les surcharges de l'admin remplacent l'évolution générale vers une espèce, pas les évolutions propres à une forme. L'œuf prend la forme de la mère.
- **PWA** : `apps/web/public/manifest.webmanifest` et `sw.js` (jeu installable, cache des sprites, page hors ligne). L'onglet « Réglages » du jeu propose l'installation et les notifications.
- **Notifications Web Push** : une tournée périodique de l'API (`PUSH_INTERVAL_SECONDS`, 60 s par défaut) prévient les joueurs abonnés quand une expédition ou un combat est terminé, ou qu'un œuf est prêt à éclore (une notification groupée, chaque élément une seule fois). Clés VAPID : `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (sinon, en dev, une paire générée dans `.data/vapid.json`).
- **Télémétrie** (admin → Télémétrie) : temps de complétion des étapes du parcours (première expédition, régions, badges, paliers, quêtes) et goulets (dresseurs où les joueurs restent bloqués, étapes de quête, zones délaissées), activité et économie. Tout est déduit des tables de jeu.
