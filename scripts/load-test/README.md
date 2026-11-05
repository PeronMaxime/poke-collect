# Scénario de charge

Rejoue une session type de plusieurs joueurs en parallèle contre une API lancée, et mesure les
durées, les refus 429 et les erreurs 5xx (phase F de `PLAN-STABILITE.md`). Sans dépendance : Node 22
suffit.

**Ne jamais le lancer contre la production** : il crée des comptes, des Pokémon de test et supprime
des Pokémon par transfert. Utiliser une API locale (`pnpm dev`) ou une copie de la base.

## La session rejouée (par joueur, tous en parallèle)

1. **Ouverture du jeu** : les ~20 lectures que le jeu fait au chargement.
2. **PC** : `LOAD_ARROWS` rechargements conditionnels de la liste des Pokémon (`If-None-Match`,
   réponse 304 tant que rien ne change). Le jeu lui-même ne refait plus de requête à chaque flèche
   (voir A1) : ce volet mesure le coût serveur d'un rechargement de la liste.
3. **Expéditions** : récupération de celles qui tournent déjà, puis départ d'une nouvelle. Une zone
   impose une durée minimale : une récupération trop tôt répond `409 NOT_FINISHED` et un départ sans
   place libre `409 NO_FREE_SLOT`. C'est normal lors de relances rapprochées ; les récupérations
   réussies viennent des relances espacées d'au moins la durée minimale de la zone.
4. **Transfert** de `LOAD_TRANSFER` Pokémon par lots de `LOAD_BATCH`, puis rechargement des
   Pokémon et des Bonbons.

## Préparation (une fois par base)

Les Pokémon de test ne se donnent qu'aux comptes administrateurs : les joueurs de charge sont donc
des comptes `load-1@load.test`, `load-2@load.test`… promus administrateurs.

```sh
pnpm dev                                               # ou une API sur une copie de la base
LOAD_PLAYERS=10 node scripts/load-test/load-test.mjs --prepare
pnpm admin:promote load-1@load.test                    # une fois par compte (API arrêtée si PGlite)
```

Avec PGlite (base locale), la base n'accepte qu'un processus à la fois : arrêter l'API avant
`admin:promote`, puis la relancer.

## Lancer

```sh
LOAD_PLAYERS=10 LOAD_TRANSFER=500 LOAD_ARROWS=50 LOAD_LABEL=apres-phase-E \
  LOAD_OUT=charge-apres-E.json node scripts/load-test/load-test.mjs
```

| Variable        | Défaut                  | Rôle                                                |
| --------------- | ----------------------- | --------------------------------------------------- |
| `LOAD_API_URL`  | `http://localhost:3000` | API visée                                           |
| `LOAD_ORIGIN`   | `http://localhost:5173` | En-tête `Origin` (doit être dans `TRUSTED_ORIGINS`) |
| `LOAD_PLAYERS`  | `5`                     | Joueurs en parallèle                                |
| `LOAD_TRANSFER` | `500`                   | Pokémon transférés par joueur                       |
| `LOAD_ARROWS`   | `50`                    | Rechargements de la liste du PC                     |
| `LOAD_BATCH`    | `250`                   | Pokémon par lot de transfert                        |
| `LOAD_PASSWORD` | `charge-motdepasse-1`   | Mot de passe des comptes de charge                  |
| `LOAD_LABEL`    | `essai`                 | Nom du rapport (colonne de la comparaison)          |
| `LOAD_OUT`      | _(aucun)_               | Fichier JSON du rapport                             |

Les `409 POKEMON_LEGENDARY` du transfert sont attendus : le serveur refuse tout un lot qui contient
un légendaire ou un fabuleux, le script coupe donc le lot en deux jusqu'à l'isoler. Seuls les
`5xx`, les `429` (si les limites sont activées) et les coupures signalent un problème.

Un joueur non administrateur joue la session sans le gros transfert (il n'a que son starter).
Le code de sortie est 1 s'il y a eu une erreur 5xx ou une coupure, 2 si le scénario n'a pas pu
démarrer.

Les limites de requêtes valent en production (600/min par joueur, 1 500/min par IP) mais pas en
développement (`RATE_LIMIT_PER_MINUTE=0`) : pour reproduire les 429, lancer l'API avec
`RATE_LIMIT_PER_MINUTE=600 RATE_LIMIT_PER_IP_PER_MINUTE=1500`. Toutes les sessions partent de la même
adresse : avec 10 joueurs, la limite par IP est la plus probable.

## Comparer avant / après

```sh
node scripts/load-test/load-test.mjs --compare charge-avant.json charge-apres.json
```

Chiffres du rapport : requêtes, durée totale, p50 / p95 / p99, refus 429, erreurs 5xx, durée
moyenne de chaque étape. Le rapport JSON contient aussi les routes les plus lentes vues par le
serveur (`/api/admin/metrics`, si un joueur est administrateur). La même vue est dans l'admin,
section **Santé de l'API**.
