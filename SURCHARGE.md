# Que faire en cas de surcharge : le guide

Ce guide liste, **du plus rapide au plus lourd**, les actions à mener si le serveur ne suit plus.
Il part de l'installation actuelle (voir [INSTALLATION-SERVEUR.md](INSTALLATION-SERVEUR.md)) :

```
Internet ──► Caddy (HTTPS, pages, sprites) ──► API Node (1 processus) ──► Postgres 17
                          tout sur un VPS : 2 vCores, 4 Go de mémoire, 40 Go de disque
```

**Ordre de grandeur actuel** (estimation, à confirmer par un test de charge) : ~200 à 500
requêtes API par seconde, soit ~1 000 à 3 000 joueurs actifs en même temps, ou ~10 000 à 30 000
joueurs par jour.

---

## 0. Diagnostiquer avant d'agir

Il faut d'abord savoir **ce qui** sature. Sur le VPS :

```bash
docker stats                       # CPU et mémoire de chaque service (api, postgres, caddy)
htop                               # charge globale, swap utilisé
df -h && docker system df          # disque
docker compose -f docker-compose.prod.yml logs --tail 200 api   # erreurs, requêtes lentes
```

| Symptôme                                   | Cause probable                   | Aller à  |
| ------------------------------------------ | -------------------------------- | -------- |
| `api` bloqué à ~100 % de CPU               | L'API n'utilise qu'un seul cœur  | 1.3, 2.1 |
| `postgres` très chargé                     | Requêtes lentes, index manquants | 1.4, 2.3 |
| Mémoire pleine, swap utilisé               | 4 Go trop justes                 | 1.1, 1.5 |
| Lenteurs seulement pendant un déploiement  | Images construites sur le VPS    | 1.2      |
| Disque plein                               | Sauvegardes, journaux, images    | 1.6      |
| Beaucoup de réponses 429                   | Limite de requêtes trop basse    | 1.7      |
| Pic soudain venant de quelques adresses IP | Robots ou abus                   | 1.7      |

---

## 1. Actions rapides (moins d'une heure, sans changer l'architecture)

### 1.1 Ajouter un fichier d'échange (swap)

Il évite que le système tue un service quand la mémoire est pleine (pendant un déploiement par
exemple).

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 1.2 Déployer en dehors des heures de pointe

`deploy/deploy.sh` construit les images **sur le VPS** (`build --pull`) : la compilation peut
prendre tout le processeur et 1 à 2 Go de mémoire pendant une ou deux minutes. En cas de forte
affluence, fusionner dans `main` le matin plutôt que le soir.

Solution durable : construire les images dans GitHub Actions et les envoyer dans un registre
(GitHub Container Registry). Le VPS se contente alors de `docker compose pull && up -d`.

### 1.3 Passer à l'offre VPS supérieure

C'est **le levier le plus rapide** : chez la plupart des hébergeurs, le passage à l'offre
supérieure (4 vCores et 8 Go, par exemple) se fait depuis l'espace client, sans réinstallation,
avec un redémarrage de quelques minutes. Pour en profiter pleinement, enchaîner avec le point 2.1
(sinon l'API reste sur un seul cœur).

### 1.4 Trouver les requêtes lentes

Activer le journal des requêtes lentes de Postgres, en ajoutant dans `docker-compose.prod.yml`
(service `postgres`) :

```yaml
command: ['postgres', '-c', 'log_min_duration_statement=200']
```

Puis lire `docker compose ... logs postgres`. Une requête lente qui revient souvent se corrige
en général avec un index (une migration).

### 1.5 Régler Postgres pour la machine

L'image Postgres utilise des réglages très prudents. Pour un VPS de 4 Go (à adapter si la mémoire
change, en gros ¼ de la mémoire pour `shared_buffers`) :

```yaml
command:
  - postgres
  - -c
  - shared_buffers=1GB
  - -c
  - effective_cache_size=2GB
  - -c
  - work_mem=16MB
```

### 1.6 Libérer le disque

```bash
docker system prune -f             # images et conteneurs inutilisés
du -sh /var/backups/poke-collect/*  # sauvegardes de deploy/backup.sh
```

Les sauvegardes sont déjà limitées (7 quotidiennes, 4 hebdomadaires, 5 de déploiement), les
journaux Docker à 3 × 10 Mo par service, et `deploy.sh` supprime les anciennes images. Si le
disque se remplit quand même, c'est la base qui grossit : voir 2.3 (nettoyage) ou agrandir le
disque.

### 1.7 Ajuster la limite de requêtes

La limite est réglée par `RATE_LIMIT_PER_MINUTE` dans `.env` (300 par défaut, par adresse IP).

- Beaucoup de joueurs légitimes bloqués (réseaux d'écoles ou d'entreprises derrière une seule
  adresse) : **monter** la valeur.
- Abus ou robots : la **baisser**, ou bloquer les adresses fautives. Pour une vraie attaque,
  passer le domaine derrière Cloudflare (voir 3.1).

Après modification : `docker compose -f docker-compose.prod.yml up -d api`.

---

## 2. Actions moyennes (une demi-journée à quelques jours de développement)

### 2.1 Lancer plusieurs processus d'API

Node n'utilise qu'un cœur par processus. Avec 4 vCores ou plus, lancer 2 ou 3 copies de l'API
derrière Caddy :

```yaml
api:
  deploy:
    replicas: 2
```

Caddy répartit automatiquement entre les copies (`reverse_proxy api:3000` résout toutes les
adresses du service). **À vérifier avant :**

- **Notifications push** (`apps/api/src/game/push.ts`) : la tournée tourne dans un `setInterval`
  de chaque processus. Avec 2 copies, elle tournerait 2 fois (notifications en double). Il faut
  la protéger par un verrou Postgres (`pg_try_advisory_lock`) ou la réserver à une seule copie
  (variable d'environnement `PUSH_SCHEDULER=on` sur une seule).
- **Migrations** appliquées au démarrage : deux copies qui démarrent ensemble ne doivent pas les
  jouer en même temps (verrou, ou migrations dans une étape à part du déploiement).
- **Limite de requêtes** : elle est comptée en mémoire, par processus. Avec 2 copies, un
  joueur peut faire jusqu'à 2 × la limite. Acceptable, ou passer à un stockage Redis (voir 3.2).
- **Connexions à la base** : chaque processus ouvre jusqu'à 10 connexions
  (`packages/db/src/client.ts`, `max: 10`). Rester sous la limite de Postgres (100 par défaut).

### 2.2 Ne plus compiler TypeScript au démarrage

L'API démarre avec `node --import tsx` (le TypeScript est transpilé à la volée). Compiler à
l'avance en JavaScript (dans l'étape `build` du `Dockerfile`) réduit la mémoire utilisée et le
temps de démarrage. C'est un petit gain, mais il compte quand on multiplie les processus.

### 2.3 Alléger la base

- **Sessions** : Better Auth relit la session dans Postgres à chaque requête. Activer son cache
  de session dans un cookie (`session.cookieCache` dans `apps/api/src/auth.ts`) supprime cette
  requête dans la plupart des cas.
- **Index** sur les colonnes filtrées par les requêtes lentes repérées en 1.4.
- **Classements** : s'ils sont recalculés à chaque visite, les mettre en cache quelques minutes
  (en mémoire ou dans une vue matérialisée rafraîchie régulièrement).
- **Nettoyage** : purger régulièrement les données expirées (sessions, vérifications, historiques
  anciens).

### 2.4 Mettre en cache les réponses qui changent peu

Le contenu du jeu (Pokédex, régions, donjons…) est déjà gardé en mémoire par l'API
(`content-cache.ts`). Les réponses identiques pour tous les joueurs peuvent en plus être servies
avec un en-tête `Cache-Control` pour que le navigateur ne les redemande pas.

### 2.5 Surveiller en continu

Plutôt que de découvrir la surcharge par les joueurs :

- une sonde externe gratuite (UptimeRobot, Better Stack…) sur `https://dexpedition.fr/api/health`,
  avec alerte par courriel ;
- un tableau de bord simple (Netdata s'installe en une commande) pour l'historique CPU, mémoire,
  disque.

### 2.6 Faire un test de charge

Pour connaître la vraie limite, lancer `k6` ou `autocannon` **depuis un autre ordinateur**, sur
une copie du serveur (pas sur la production), en visant les routes les plus lourdes : expéditions,
combats de donjon, ouverture du Pokédex.

---

## 3. Grande échelle (long terme)

À envisager à partir de plusieurs dizaines de milliers de joueurs par jour. Chaque étape peut se
faire seule, dans cet ordre.

### 3.1 Un CDN devant le site

Mettre **Cloudflare** (offre gratuite) devant le domaine : les pages, les fichiers de Vite et les
sprites sont servis depuis le monde entier sans toucher au VPS, et la protection contre les
attaques par saturation est incluse. À prévoir : laisser Cloudflare gérer le certificat (ou
garder Caddy en mode « Full (strict) ») et transmettre la vraie adresse IP des joueurs à l'API
(`CF-Connecting-IP`) pour que la limite de requêtes reste correcte.

Variante : déplacer les sprites vers un stockage objet (Cloudflare R2, Scaleway Object Storage…)
pour qu'ils ne passent plus du tout par le VPS.

### 3.2 Séparer la base de données

1. **Postgres sur sa propre machine**, ou une **base gérée** (OVHcloud, Scaleway, Neon…) :
   sauvegardes automatiques, mises à jour, et l'API récupère tout le processeur du VPS.
2. **PgBouncer** entre les API et Postgres quand le nombre de processus grandit (il mutualise
   les connexions).
3. **Réplique en lecture** pour les requêtes lourdes et non urgentes (classements, fiches des
   autres dresseurs, statistiques de l'admin).

### 3.3 Plusieurs serveurs d'API

Une fois la base séparée, l'API ne garde plus rien d'important sur le disque. On peut alors :

- lancer **plusieurs VPS d'API** derrière un répartiteur de charge (celui de l'hébergeur, ou
  Caddy sur une petite machine dédiée) ;
- ajouter **Redis** pour ce qui doit être partagé entre serveurs : limite de requêtes, caches,
  verrous ;
- sortir les **tâches de fond** (notifications push, nettoyages) dans un processus « worker »
  unique, distinct des API qui répondent aux joueurs.

Prérequis : les images construites par la CI (voir 1.2) et un déploiement qui met les serveurs à
jour l'un après l'autre (pas de coupure).

### 3.4 Plateforme gérée

Si l'administration des serveurs devient trop lourde, déplacer les conteneurs vers une
plateforme qui gère la mise à l'échelle automatiquement (Scaleway Serverless Containers,
Fly.io, Railway, Render…) avec une base gérée. Plus cher à charge égale, mais presque rien à
maintenir. Kubernetes n'est utile qu'à une échelle bien supérieure.

### 3.5 Optimiser le jeu lui-même

À très grande échelle, les gains viennent aussi du code :

- regrouper les appels faits à l'ouverture d'une page en une seule requête ;
- calculer les classements et statistiques par une tâche périodique, et non à la demande ;
- partitionner les grosses tables d'historique par date ;
- n'envoyer au client que les données modifiées.

---

## Résumé

| Étape                                            | Délai           | Gain                                | Coût                        |
| ------------------------------------------------ | --------------- | ----------------------------------- | --------------------------- |
| Swap, déploiement hors pointe, réglages Postgres | < 1 h           | Stabilité                           | Gratuit                     |
| VPS supérieur + 2 processus d'API                | 1 h à 1 jour    | ×2 à ×3                             | Quelques € par mois         |
| Cache de session, index, cache des classements   | Quelques jours  | ×1,5 à ×3 sur la base               | Gratuit                     |
| Cloudflare                                       | 1 h             | Statique et attaques gérés ailleurs | Gratuit                     |
| Base séparée ou gérée                            | 1 jour          | Tout le CPU du VPS pour l'API       | 15 à 50 € par mois          |
| Plusieurs serveurs d'API + Redis + worker        | Plusieurs jours | Sans limite pratique                | Selon le nombre de serveurs |
