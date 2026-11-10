# Mettre à jour la production : le guide

Ce guide explique comment mettre en ligne tes modifications une fois le jeu installé sur le VPS
(voir [INSTALLATION-SERVEUR.md](INSTALLATION-SERVEUR.md)), quoi vérifier ensuite, et comment
revenir en arrière si quelque chose casse.

---

## 1. Le principe

```
ton PC ──git push──► GitHub (main) ──CI verte──► déploiement automatique ──► VPS
```

1. Tu développes et testes **en local** (`pnpm dev`), comme d'habitude.
2. Tu pousses sur `main`.
3. La CI vérifie tout (lint, format, typecheck, tests).
4. Si elle est verte, l'action **Déploiement** met le VPS à jour toute seule
   (`deploy/deploy.sh`) :
   1. sauvegarde de la base ;
   2. récupération du code ;
   3. reconstruction des images ;
   4. redémarrage, migrations de la base appliquées, vérification que l'API répond.

Le jeu est coupé **quelques secondes à une minute** pendant le redémarrage. Les expéditions,
combats et œufs en cours ne sont pas affectés : tout est calculé à partir de dates.

Si la CI échoue, rien n'est déployé : la production garde l'ancienne version.

**Travail en cours ?** Tout ce qui arrive sur `main` part en ligne. Pour une fonctionnalité pas
finie, travaille sur une **branche** : la CI la vérifie, mais elle n'est pas déployée.

---

## 2. Avant de pousser

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
```

Et un essai dans le navigateur avec `pnpm dev` pour ce qui touche à l'écran.

---

## 3. Selon ce que tu as modifié

### Code du jeu, de l'API ou de l'admin

Rien de spécial : pousse sur `main`.

### Dépendances (`pnpm add …`)

Rien de spécial : commite `package.json` **et** `pnpm-lock.yaml`, les images sont reconstruites.

### Structure de la base (`packages/db/src/schema`)

1. `pnpm db:generate` crée une migration dans `packages/db/drizzle/`.
2. Relis le SQL généré et commite-le avec le code.
3. Au déploiement, l'API l'applique en démarrant (après la sauvegarde automatique).

Prudence avec ce qui **supprime** (colonne, table) ou **renomme** : les données disparaissent.
Préfère ajouter d'abord, migrer les données, et supprimer dans une mise à jour suivante.

### Contenu du jeu (zones, dresseurs, objets, équilibrage…)

En production, **la base est la référence du contenu** : ce que tu modifies dans l'admin de
production n'existe que là.

- **Petits réglages** (taux, prix, durées, une zone…) : directement dans l'**admin de
  production** (`https://admin.mondomaine.fr`) → brouillon → publier. Aucun déploiement.
- **Gros ajouts** (nouvelle région, refonte comme Kanto ou Johto) : en local, avec un seed et une
  **migration ciblée** (comme `0016` ou `0019`) qui ajoute sans écraser ce qui a été retouché dans
  l'admin. Elle s'applique au déploiement.
- ⛔ **Ne jamais importer le contenu local dans l'admin de production** : publier un import
  remplace tout le contenu et efface les réglages faits en production.

**Ramener le contenu de la production en local** (pour développer sur le même contenu) :

1. Admin de production → tableau de bord → **Exporter**.
2. Admin local (`pnpm dev`) → tableau de bord → **Importer** ce fichier, puis **publier**.
3. L'instantané `content/game-content.json` se met à jour tout seul : commite-le, Git suit
   ainsi la production.

### Sprites

- **Pokémon, objets, dresseurs** (`apps/api/sprites/…`, dans Git) : commite les fichiers, ils
  sont inclus au déploiement.
- **Illustrations** (`artwork/`, hors Git) : après l'ajout de nouvelles espèces, sur le serveur :

  ```bash
  cd ~/poke-collect
  docker compose -f docker-compose.prod.yml run --rm api pnpm -w sprites:download
  ```

### Réglages du serveur (`.env` : e-mails, notifications, Google/Discord…)

Pas de push : sur le serveur,

```bash
cd ~/poke-collect
nano .env
docker compose -f docker-compose.prod.yml up -d    # redémarre ce qui est concerné
```

---

## 4. Vérifier après une mise à jour

1. GitHub → **Actions** : « CI » puis « Déploiement » en vert.
2. Le jeu s'ouvre et tu vois tes changements. Si l'ancienne version s'affiche encore, recharge
   la page : le jeu installé (PWA) peut demander un second rechargement.
3. Au besoin, sur le serveur :

   ```bash
   cd ~/poke-collect
   docker compose -f docker-compose.prod.yml ps               # api « healthy »
   docker compose -f docker-compose.prod.yml logs --tail 100 api
   cat deploy/.history                                        # versions déployées
   ```

---

## 5. Déployer à la main

Si le déploiement automatique n'est pas activé, ou pour relancer :

- depuis GitHub : Actions → **Déploiement** → **Run workflow** ;
- ou sur le serveur :

  ```bash
  cd ~/poke-collect
  deploy/deploy.sh
  ```

---

## 6. Quand ça casse : revenir en arrière

Pendant une réparation, coupe le déploiement automatique pour qu'un push n'aggrave rien :
GitHub → Settings → Secrets and variables → Actions → Variables → `DEPLOY_ENABLED` = `false`.

### Le jeu ne marche plus après une mise à jour (code)

Le déploiement s'arrête avec « L'API ne répond pas » et affiche le journal, ou bien le jeu a un
bug visible. Remets la version précédente :

```bash
cd ~/poke-collect
cat deploy/.history            # ex. « 2026-11-02 18:04:11 1f52fc6 → 8a3c0d2 »
deploy/deploy.sh 1f52fc6       # la version d'avant
```

Corrige ensuite en local, pousse, et réactive `DEPLOY_ENABLED`.

### Des données ont été abîmées (migration ratée, mauvaise manipulation)

Chaque déploiement a fait une sauvegarde juste avant, dans `/var/backups/poke-collect/deploy/`
(les 5 dernières), et il y en a une chaque nuit dans `daily/` (7 jours) et `weekly/` (4 semaines).

⚠️ Restaurer **efface tout ce qui a été joué depuis la sauvegarde**.

1. D'abord le code d'avant (sinon l'API rejouerait la migration fautive) :

   ```bash
   deploy/deploy.sh <version d'avant>
   ```

2. Puis la base, avec la sauvegarde prise **juste avant le déploiement fautif** (comparer les
   heures avec `deploy/.history` ; les heures sont en UTC) :

   ```bash
   ls -lt /var/backups/poke-collect/deploy/
   deploy/restore.sh /var/backups/poke-collect/deploy/poke-collect_<date>.sql.gz
   ```

   Le script demande de taper `RESTAURER`, sauvegarde l'état actuel par précaution, puis
   remplace la base.

Si les sauvegardes du VPS sont perdues : `rclone copy backup:poke-collect-backups /tmp/sauvegardes`
les récupère depuis la copie hors du VPS.

---

## 7. Commandes utiles (sur le serveur)

```bash
cd ~/poke-collect
C="docker compose -f docker-compose.prod.yml"

$C ps                          # état des services
$C logs -f api                 # journal de l'API en direct (Ctrl+C pour quitter)
$C logs --tail 100 caddy       # journal du serveur web (certificats, erreurs)
$C restart api                 # redémarrer l'API
$C exec postgres psql -U poke -d poke_collect     # console SQL (\q pour quitter)
$C exec api pnpm admin:promote ami@adresse.fr     # donner le rôle admin
df -h /                        # place restante sur le disque
docker system df               # place prise par Docker
```
