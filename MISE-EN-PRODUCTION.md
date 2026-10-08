# Poké Collect — Plan de mise en production

> Objectif : mettre le jeu en ligne sur un VPS pour une **bêta fermée entre amis**, puis l'ouvrir
> en vraie production sur la même infrastructure.

---

## 1. Décisions prises

| Sujet                      | Choix                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| Hébergement                | **VPS OVH VPS-1** (≈ 4 vCPU, 8 Go de RAM, 75 Go de SSD), centre de données au **Canada (Beauharnois)** |
| Système                    | **Ubuntu 26.04 LTS** (sinon 24.04 LTS si l'image n'est pas proposée)                                   |
| Déploiement                | **Docker Compose** sur le VPS : Caddy + API + Postgres                                                 |
| Base de données            | **Postgres 17** en production (via `DATABASE_URL`) ; PGlite reste pour le développement                |
| Lancement                  | **Bêta fermée** d'abord, ouverture ensuite                                                             |
| Connexion Google / Discord | Facultative pour la bêta : e-mail + mot de passe suffit ; à ajouter plus tard sans toucher au code     |

Pourquoi pas Vercel : l'API est un processus qui tourne en continu (tournée des notifications
push), elle lit les sprites sur le disque et utilise PGlite en local. Ça ne colle pas au modèle
« fonctions à la demande » de Vercel sans réécrire une partie du serveur.

Pourquoi le Canada : les VPS européens étaient en rupture de stock. Le Canada bénéficie d'une
décision d'adéquation de l'UE (pas de souci RGPD), et la latence depuis la France (≈ 80 à 100 ms)
est imperceptible pour un jeu idle. Un déménagement vers l'Europe reste simple (`pg_dump`,
restauration, changement DNS : ≈ 30 min de coupure).

### Questions encore ouvertes

1. Nom définitif du jeu et **nom de domaine** (à acheter tôt : HTTPS, OAuth, propagation DNS).
2. Service d'envoi d'e-mails (Resend, Brevo…) pour la réinitialisation du mot de passe.
3. Où stocker les sauvegardes hors du VPS (OVH Object Storage, Backblaze B2…).

---

## 2. Architecture cible

```
                     ┌──────────────────────── VPS OVH ────────────────────────┐
navigateur ──HTTPS──►│ Caddy (ports 80/443, certificats automatiques)          │
                     │  ├─ mondomaine.fr          → pages du jeu (statiques)   │
                     │  ├─ admin.mondomaine.fr    → pages de l'admin           │
                     │  ├─ */api/sprites/*        → sprites (cache long)       │
                     │  └─ */api/*                → API Node (port 3000)       │
                     │                                 │                       │
                     │                                 ▼                       │
                     │                            Postgres 17 (volume)         │
                     └─────────────────────────────────────────────────────────┘
```

Contraintes qui découlent du code actuel :

- **Même origine pour les pages et l'API** : le jeu et l'admin appellent `/api` sur leur propre
  adresse (`window.location.origin`) avec des cookies de session. Caddy doit donc servir les pages
  **et** transmettre `/api` sur chaque domaine. Pas de CORS entre domaines à gérer.
- **Admin sur un sous-domaine** (`admin.mondomaine.fr`) : aucun changement de chemin de base Vite
  nécessaire. Les deux origines vont dans `TRUSTED_ORIGINS`.
- **Une seule instance de l'API** : la tournée des notifications push tourne dans le processus de
  l'API (`server.ts`). Deux instances enverraient chaque notification en double.
- **Artworks hors de Git** (`.gitignore`) : à télécharger sur le serveur (`pnpm sprites:download`)
  ou à placer dans un volume.
- **La base de production devient la référence du contenu** : une base neuve reçoit
  `content/game-content.json` au premier démarrage, puis les modifications faites dans l'admin de
  production ne reviennent plus dans Git. Ne **jamais** écraser la production avec l'instantané
  local ; les changements de contenu livrés par le code passent par des **migrations ciblées**.

---

## 3. Phases

### Phase 0 : Mettre le code au propre

- [x] Vérifier que `pnpm lint`, `pnpm format:check`, `pnpm typecheck` et `pnpm test` passent
- [x] Commiter le travail en cours (Johto, sprites de dresseurs…)
- [x] CI GitHub au vert

### Phase 1 : Préparer la production dans le code

- [x] `Dockerfile` (deux images : `api` lancée avec `tsx`, `caddy` avec les pages et les sprites)
- [x] Construction des pages du jeu et de l'admin (`vite build`) servies par Caddy
- [x] `docker-compose.prod.yml` : services `caddy`, `api`, `postgres`, volumes persistants
- [x] `deploy/Caddyfile` : deux domaines, `/api` vers l'API, sprites avec cache long, compression
- [x] `.env.production.example` documentant toutes les variables de production
- [x] Route `GET /api/health` (API + base joignables) pour la supervision
- [x] Limitation du nombre de requêtes : `@fastify/rate-limit` sur `/api` (300 / min / IP par
      défaut), plus celle de Better Auth sur la connexion (3 essais / 10 s)
- [x] Sprites : versionnés dans l'image Caddy ; illustrations dans le volume `artwork`, remplies
      une fois avec `docker compose -f docker-compose.prod.yml run --rm api pnpm sprites:download`
- [x] Derrière un proxy : `trustProxy` en production (Caddy remplace `X-Forwarded-For`, pas de
      contournement de la limite) ; cookies `Secure` automatiques avec une `BETTER_AUTH_URL` en HTTPS
- [x] Test local de la construction de production **sans Docker** : pages compilées, API en
      `NODE_ENV=production` sur une base neuve, Caddy avec le vrai Caddyfile (HTTP), parcours
      inscription → profil → starter, connexion depuis le domaine de l'admin
- [x] CI : actions mises à jour (Node 24)
- [ ] Première construction des images Docker : sur le VPS (pas de Docker en local)

### Phase 2 : Comptes et sécurité

- [x] Réinitialisation du mot de passe par e-mail : envoi SMTP (`SMTP_URL`, `MAIL_FROM`), lien
      valable 1 h et à usage unique, déconnexion de tous les appareils ; en développement, le
      lien s'affiche dans la console de l'API ; sans SMTP en production, le lien « Mot de passe
      oublié ? » est masqué
- [x] Suppression de compte par le joueur (obligation RGPD) : Réglages → Compte, mot de passe
      demandé, données du jeu supprimées en cascade ; refusée pour un compte admin
- [x] Secrets de production documentés dans `.env.production.example` (génération :
      `openssl rand -hex 32`, `npx web-push generate-vapid-keys`)
- [ ] Choisir le service d'envoi d'e-mails, déclarer le domaine (SPF, DKIM) et remplir `SMTP_URL`
- [ ] Remplir le `.env` du serveur (phase 3)
- [ ] Premier compte admin : inscription dans le jeu, puis sur le serveur
      `docker compose -f docker-compose.prod.yml exec api pnpm admin:promote <email>`
- Plus tard : connexion Google et Discord (voir section 4)

### Phase 3 : Serveur

- [ ] Commander le VPS-1 (vérifier le prix **sans engagement**), Ubuntu 26.04, centre de données au Canada (Beauharnois)
- [ ] Acheter le nom de domaine ; enregistrements DNS `A` pour `mondomaine.fr` et
      `admin.mondomaine.fr` vers l'IP du VPS
- [ ] Sécuriser le serveur : utilisateur non root, connexion SSH par clé uniquement, pare-feu
      (`ufw` : 22, 80, 443), mises à jour de sécurité automatiques (`unattended-upgrades`)
- [ ] Installer Docker (dépôt officiel)
- [ ] Premier déploiement : cloner le dépôt, remplir `.env`, `docker compose up -d`
- [ ] Vérifier HTTPS, inscription, expédition, notifications push sur mobile, installation PWA

### Phase 4 : Données et exploitation

- [ ] Sauvegarde nocturne `pg_dump`, compressée, copiée **hors du VPS**, rotation (7 jours + 4 semaines)
- [ ] **Tester une restauration** sur une base vide au moins une fois
- [ ] Déploiement automatique : action GitHub déclenchée après la CI sur `main` (connexion SSH,
      `git pull`, reconstruction, redémarrage). Les migrations s'appliquent au démarrage de l'API.
- [ ] Supervision : UptimeRobot (ou équivalent) sur `/api/health`, alerte par e-mail
- [ ] Facultatif : Sentry pour les erreurs de l'API et du front
- [ ] Procédure écrite pour livrer du contenu par migration ciblée, avec sauvegarde juste avant
- [ ] Guide `MISE-A-JOUR.md` : mettre à jour la production après des modifications (code, migrations,
      contenu, sprites), vérifications, retour arrière en cas de problème

### Phase 5 : Aspects légaux (France)

- [ ] Avertissement visible : projet de fan **non commercial**, Pokémon © Nintendo / Game Freak /
      The Pokémon Company, aucune monétisation
- [ ] Mentions légales (éditeur du site, hébergeur : OVH, serveur situé au Canada)
- [ ] Politique de confidentialité (données stockées : e-mail, progression, abonnements push ;
      durée de conservation ; droit à la suppression ; hébergement au Canada)
- [ ] Liens vers ces pages depuis l'accueil et l'écran d'inscription

### Phase 6 : Lancement

- [ ] **Bêta fermée** : quelques amis, retours sur l'équilibrage, les notifications et la PWA
- [ ] Corrections et ajustements dans l'admin
- [ ] Facultatif pour la bêta : inscriptions limitées (liste d'adresses ou code d'invitation)
- [ ] **Ouverture**

---

## 4. Connexion Google et Discord (facultatif)

Les boutons n'apparaissent que si les deux variables du fournisseur sont renseignées.

| Fournisseur | Où                       | Adresse de retour à déclarer                      | Variables                                    |
| ----------- | ------------------------ | ------------------------------------------------- | -------------------------------------------- |
| Google      | Google Cloud Console     | `https://mondomaine.fr/api/auth/callback/google`  | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`   |
| Discord     | Discord Developer Portal | `https://mondomaine.fr/api/auth/callback/discord` | `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` |

Google demande aussi un écran d'autorisation (nom du jeu, logo, lien vers la politique de
confidentialité) : la phase 5 doit être faite avant.

---

## 5. Ce qui se fait sans le VPS

Tout ce qui touche au dépôt peut avancer avant d'avoir le serveur : phases 0, 1, 2 (sauf les
secrets réels), 5, et la préparation de la phase 4 (scripts de sauvegarde, action GitHub, guide
d'installation). Le VPS et le domaine ne sont nécessaires qu'à partir de la phase 3.

Le développement se fait sans Docker : la pile Docker complète sera testée pour la première fois
sur le VPS.

---

## 6. Coûts estimés

| Poste                    | Coût                         |
| ------------------------ | ---------------------------- |
| VPS OVH VPS-1            | ≈ 4 € / mois                 |
| Nom de domaine           | ≈ 5 à 10 € / an              |
| Stockage des sauvegardes | quelques centimes / mois     |
| E-mails, supervision     | offres gratuites suffisantes |
