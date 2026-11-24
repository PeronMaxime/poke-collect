# Plan de sécurité : audit avant l'arrivée de nouveaux joueurs

Rédigé le 23 novembre 2026 après un audit de tout le dépôt (`apps/api`, `apps/web`, `apps/admin`,
`packages/*`, `deploy/`, `Dockerfile`, `docker-compose.prod.yml`, `.github/workflows`), de
l'historique Git et des dépendances (`pnpm audit --prod`). Objectif : **aucune faille exploitable
le jour où beaucoup de joueurs arrivent**, puis un audit court et répétable à chaque mise à jour.

Le dépôt est **public** (lien GitHub de la page Documentation de l'admin) : tout le code, les
règles et les constantes sont lisibles par un attaquant. Rien ne doit reposer sur le secret du code.

Ce plan ne change aucune règle du jeu. Les étapes visibles par les joueurs (vérification de
l'e-mail, captcha, suspension) demandent une ligne dans le journal des nouveautés.

## Points ouverts (à reprendre le 24 novembre 2026)

Phases 1 à 5 faites et poussées sur `dev`, pas encore en production (phases 3 à 5 le 24
novembre). Restent :

- [x] **Commits** : poussés sur `dev` le 24 novembre en trois commits (code des phases 1 à 4,
      phase 5, docs) : les phases touchent les mêmes fichiers, un découpage plus fin aurait laissé
      des commits qui ne compilent pas.
- [ ] **Tâche `secrets` et Dependabot** (phase 5.1) : jamais lancés sur GitHub. À la première
      PR, vérifier que la tâche `secrets` passe et, dans l'onglet Insights → Dependency graph →
      Dependabot, que `.github/dependabot.yml` est lu sans erreur.
- [ ] **Réglages GitHub** (Settings → Code security) : activer les alertes Dependabot, la
      recherche de secrets et sa protection à l'envoi (_push protection_), gratuites pour un dépôt
      public.
- [ ] **Première routine de mise en production** (`docs/SECURITE.md`, section 4) à la PR
      `dev` → `main` des phases 1 à 5 : `/security-review` sur tout l'écart, ligne dans le journal
      des audits.
- [ ] **Tâche `images` de la CI** (phase 4.2) : jamais lancée (pas de Docker sur le poste de
      développement). Elle tournera à la PR `dev` → `main` ; si elle échoue, lire les journaux des
      conteneurs qu'elle affiche avant de toucher aux restrictions.
- [x] **Captcha** : pas activé (décidé le 24 novembre). Le code reste prêt : il suffirait de
      créer les clés Turnstile chez Cloudflare (`docs/INSTALLATION-SERVEUR.md`), de les mettre dans
      `.env.production` et d'ajouter une ligne au journal des nouveautés.
- [x] **QR code de l'enrôlement** : paquet `uqr` ajouté à l'admin le 24 novembre
      (`components/TotpQrCode.tsx`, chargé à la demande : l'admin reste à 128,2 Ko à l'ouverture).
      La clé à recopier et le lien `otpauth://` restent affichés.
- [ ] **Écran d'activation du second facteur** (admin) : pas encore essayé dans un vrai
      navigateur, seul le parcours serveur est testé. À faire en local avec son compte admin (qui
      devra de toute façon activer le second facteur à la prochaine connexion).
- [ ] **Poids des pages** : JavaScript initial à 378,2 Ko / 380 (jeu) et 128,5 Ko / 130 (admin)
      après la phase 3 ; la prochaine fonction lourde fera sauter le plafond.
- [ ] **Budgets de requêtes** (phase 3.4) : valeurs choisies sans mesure (120 par lecture lourde,
      300 écritures par minute). La première semaine, relire les refus 429 par route dans « Santé
      de l'API » et ajuster `RATE_LIMIT_HEAVY_PER_MINUTE` / `RATE_LIMIT_WRITES_PER_MINUTE`.
- [ ] **Écrans de la modération** (fiche joueur, « Guildes et discussions ») et écran de
      suspension du jeu : testés par les tests de pages et de l'API, pas encore essayés dans un
      vrai navigateur.
- [ ] **Journal des nouveautés** : entrée datée du 24 novembre (date provisoire), à recaler sur
      le jour de la mise en ligne.
- [ ] **À la mise en production** :
  - ~~`caddy validate` sur le serveur~~ : fait par la CI depuis le 24 novembre (`ci.yml`) ; juste
    après le déploiement, relire quand même `logs caddy` (certificats, vrais domaines) ;
  - activer tout de suite le second facteur de chaque administrateur (le mot de passe seul suffit
    pour l'activer tant que ce n'est pas fait) ; secours : `pnpm admin:promote <email> --reset-2fa` ;
  - vérifier qu'une inscription reçoit bien l'e-mail de confirmation (SMTP de production) ;
  - **avant** la mise en ligne de la phase 4, aucune valeur négative en production (sinon la
    migration 0155 la ramène à 0 sans trace) : `$C exec postgres psql -U poke -d poke_collect -c
"select (select count(*) from player_profiles where currency < 0 or farm_plots < 0) as profils,
(select count(*) from inventory where quantity < 0) as sac, (select count(*) from candies where
quantity < 0) as bonbons, (select count(*) from pokemon where level < 1 or xp < 0) as pokemon,
(select count(*) from expeditions where balls < 0 or berries < 0 or encounter_berries < 0) as
expeditions"` (tout à 0 attendu ; sinon noter les lignes avant de déployer) ;
  - après le déploiement de la phase 4 : `$C ps` (les trois services `Up`), le jeu et l'admin
    s'ouvrent, `$C logs --tail 50 caddy` sans erreur ; puis, une fois, le propriétaire du volume
    des illustrations (`docs/MISE-A-JOUR.md`, « Illustrations ») ;
  - sauvegardes : créer la clé `age` sur son ordinateur, remplir `BACKUP_REMOTE` et
    `BACKUP_AGE_RECIPIENT`, puis faire une fois l'essai de restauration depuis la copie distante
    (`docs/INSTALLATION-SERVEUR.md` étape 9, `docs/MISE-A-JOUR.md`) ;
  - réglage GitHub des workflows des forks (phase 1.4, `docs/INSTALLATION-SERVEUR.md` étape 10).
- [ ] **Une semaine après la mise en production** : relire la console (jeu, admin, Google/Discord,
      notifications) puis passer la CSP de `-Report-Only` à appliquée (phase 1.3).

---

## 1. État des lieux

### 1.1 Ce qui est déjà sain (à ne pas casser)

- **Injection SQL** : toutes les requêtes passent par Drizzle, paramétrées ; aucun `sql.raw` ; les
  recherches `LIKE`/`ILIKE` échappent `\`, `%` et `_` (`game/trainers.ts`, `game/guilds/reads.ts`).
- **Validation des entrées** : chaque route passe par un schéma Zod borné (tableaux plafonnés,
  entiers bornés, UUID, slugs) ; corps limité à 1 Mo (défaut Fastify).
- **Contrôle de propriété** : chaque lecture ou écriture d'un Pokémon, d'une expédition, d'un
  combat filtre sur `ownerId` ; aucune route trouvée qui accède aux données d'un autre joueur.
- **Courses entre requêtes** : `playerTransaction` (verrou par joueur), débits conditionnels
  (`currency >= prix`), réclamations marquées une seule fois (`isNull(claimedAt)`), tests
  d'actions simultanées sur un vrai Postgres en CI.
- **Le serveur décide** : graines tirées par `crypto.randomInt`, résultats recalculés côté
  serveur ; la graine de capture des légendaires est distincte de celle du combat envoyée au jeu.
- **Sessions** : cookies `HttpOnly`, `SameSite=Lax`, `Secure` en HTTPS ; CORS limité aux
  origines connues ; rôle jamais fourni par le client (`input: false`) ; l'administration relit
  la session en base à chaque requête ; toutes les routes `/api` (hors santé, config, contenu
  publié, sprites, authentification) exigent une session.
- **Fuites** : une erreur 500 ne renvoie rien d'interne ; aucun e-mail dans les réponses publiques
  (classement, fiches, guildes) ; aucun `dangerouslySetInnerHTML` dans le jeu (le seul, dans la
  page Documentation de l'admin, affiche les fichiers du dépôt).
- **Serveur** : SSH par clé seulement, `root` interdit, `ufw`, mises à jour automatiques ; Postgres
  et l'API ne publient aucun port ; clé de déploiement limitée à `deploy/deploy.sh` (`restrict`,
  `command=`), version vérifiée (`^[0-9a-f]{40}$`) ; HTTPS automatique par Caddy.
- **Secrets** : aucun secret trouvé dans l'historique Git ; `.env` exclu de Git et de l'image
  Docker (`.dockerignore`).

### 1.2 Constats

Gravité : **Élevée** = exploitable aujourd'hui avec un impact réel ; **Moyenne** = exploitable
dans des conditions limitées, ou indispensable avant un afflux de joueurs ; **Faible** = défense
en profondeur.

| #   | Constat                                                                     | Gravité | Phase |
| --- | --------------------------------------------------------------------------- | ------- | ----- |
| S1  | Requêtes du serveur vers une adresse choisie par le joueur (Web Push)       | Élevée  | 1     |
| S2  | Dépendances vulnérables (Zod, Fastify, Nodemailer, ip-address, fast-uri)    | Élevée  | 1     |
| S3  | Compte administrateur protégé par un simple mot de passe                    | Élevée  | 2     |
| S4  | Aucun en-tête de sécurité HTTP (HSTS, CSP, anti-iframe)                     | Moyenne | 1     |
| S5  | Déploiement déclenchable par une PR venant d'un fork                        | Moyenne | 1     |
| S6  | Rôles de guilde vérifiés hors transaction (deux chefs possibles)            | Moyenne | 1     |
| S7  | Aucun moyen de suspendre un joueur ni de modérer noms et discussions        | Moyenne | 3     |
| S8  | Discussion de guilde sans limite de débit ni durée de conservation          | Moyenne | 3     |
| S9  | Inscriptions sans vérification de l'e-mail ni protection anti-robots        | Moyenne | 2     |
| S10 | Limites de requêtes uniformes : routes lourdes aussi ouvertes que légères   | Moyenne | 3     |
| S11 | Sauvegardes de la base non chiffrées (e-mails, empreintes de mots de passe) | Moyenne | 4     |
| S12 | API lancée en `root` dans son conteneur, sans restriction                   | Faible  | 4     |
| S13 | Aucune contrainte `CHECK` en base (argent, quantités ≥ 0)                   | Faible  | 4     |
| S14 | Force de `BETTER_AUTH_SECRET` non vérifiée                                  | Faible  | 2     |
| S15 | Noms de dresseur et de guilde : ni noms réservés ni lettres trompeuses      | Faible  | 2     |
| S16 | Compte supprimé : guilde laissée sans chef, liste de comptes en mémoire     | Faible  | 4     |
| S17 | Rien dans la CI ne détecte une nouvelle faille ou une route non protégée    | Moyenne | 5     |

---

## 2. Détail des constats

### S1. Requêtes du serveur vers une adresse choisie par le joueur (Web Push)

`POST /api/push/subscriptions` enregistre un `endpoint` validé par `z.url()` seulement
(`packages/shared/src/push.ts:27`). La tournée des notifications et `POST /api/push/test` font
ensuite un `POST` du serveur vers cette adresse (`apps/api/src/game/push.ts:43`).

- **Requête forgée côté serveur (SSRF)** : un joueur enregistre `http://api:3000/...`,
  `http://postgres:5432`, `http://169.254.169.254/...` ou toute adresse du réseau Docker ou du VPS,
  puis appelle `/api/push/test` : le serveur l'atteint depuis l'intérieur. La réponse n'est pas
  renvoyée (requête « aveugle »), mais le réseau interne n'est plus isolé.
- **Blocage de la tournée** : aucun délai maximal sur `sendNotification` et envois l'un après
  l'autre (`push.ts:191`) ; une adresse qui ne répond jamais retarde les notifications de tous.
- **Table sans plafond** : aucun maximum d'appareils par joueur.

### S2. Dépendances vulnérables

`pnpm audit --prod` : 17 alertes (1 élevée, 11 moyennes, 5 faibles).

| Paquet                                   | Version   | Corrigé dans | Risque pour le jeu                                 |
| ---------------------------------------- | --------- | ------------ | -------------------------------------------------- |
| `zod`                                    | 4.6.5     | ≥ 4.6.6      | Élevé : mémoire épuisée sur des tableaux bornés    |
| `fastify`                                | 5.12.5    | ≥ 5.12.6     | Faible : contournement de validation d'en-têtes    |
| `nodemailer`                             | 10.0.x    | ≥ 10.1.4     | Moyen : analyse des adresses, déni de service SMTP |
| `ip-address` (via `@fastify/rate-limit`) | ≤ 10.7.3  | ≥ 10.7.4     | Faible (l'IP vient de Caddy) : temps quadratique   |
| `fast-uri` (via Fastify/ajv)             | 3.x / 4.x | 3.1.9, 4.2.3 | Faible : les URL ne passent pas par ajv ici        |
| `esbuild` (via `drizzle-kit`)            | ≤ 0.24.2  | ≥ 0.25.0     | Développement seulement                            |

### S3. Compte administrateur protégé par un simple mot de passe

Un administrateur publie le contenu, donne des objets, lit la liste des comptes (e-mails compris).
Un mot de passe volé ou deviné suffit, sans second facteur. Les routes `/api/admin/*` répondent
aussi sur le domaine du jeu (Caddy les sert sur les deux domaines).

### S4. Aucun en-tête de sécurité HTTP

`deploy/Caddyfile` n'envoie que `X-Content-Type-Options` et `Referrer-Policy`. Manquent :

- `Strict-Transport-Security` (Caddy ne l'ajoute pas seul) : un premier accès en HTTP sur un
  réseau hostile peut être intercepté ;
- une politique de contenu (`Content-Security-Policy`) : dernier rempart si une injection de code
  apparaît un jour ;
- `frame-ancestors 'none'` : le jeu peut être affiché dans une iframe d'un autre site
  (détournement de clic : relâcher un Pokémon, supprimer son compte) ;
- `Permissions-Policy` (caméra, micro, géolocalisation inutiles).

### S5. Déploiement déclenchable par une PR venant d'un fork

`.github/workflows/deploy.yml` se lance après toute CI réussie dont la branche s'appelle `main`.
La CI tourne aussi sur `pull_request` : une PR d'un fork dont la branche s'appelle `main`
déclenche le déploiement, avec les secrets SSH, vers le commit du fork. Aujourd'hui `deploy.sh`
échoue sur ce commit inconnu de `origin`, mais la protection est accidentelle. Les workflows
n'ont pas de bloc `permissions:` et les actions sont épinglées par étiquette (`@v6`), pas par
empreinte.

### S6. Rôles de guilde vérifiés hors transaction

Dans `apps/api/src/game/guilds/membership.ts`, `kickMember`, `setMemberRole`,
`answerJoinRequest`, `leaveGuild` et `updateGuild` lisent le rôle de l'acteur et la cible
**avant** `playerTransaction`, et ne verrouillent que l'acteur. Exemples :

- un chef envoie deux « passer la main » simultanés à deux membres : les deux deviennent chefs ;
- un officier exclut un joueur qui vient de quitter la guilde pour en rejoindre une autre : la
  suppression, faite sur `userId` seul, l'exclut de sa nouvelle guilde.

C'est contraire à la règle du projet « toute action d'un joueur qui écrit passe par
`playerTransaction`, vérifications comprises ».

### S7. Aucun outil de modération

Ni suspension de compte, ni renommage d'un dresseur ou d'une guilde au nom injurieux, ni lecture
ou suppression des messages de guilde depuis l'admin. Avec beaucoup de nouveaux joueurs, le
premier abus ne pourra se régler qu'en SQL sur la production.

### S8. Discussion de guilde sans limite

`postGuildMessage` (`game/guilds/messages.ts:47`) écrit sans limite propre : seule la limite
générale (600 requêtes par minute) s'applique, soit jusqu'à 600 messages de 500 caractères par
minute et par joueur. Les messages ne sont jamais purgés.

### S9. Inscriptions ouvertes sans garde-fou

- Pas de vérification de l'e-mail : on peut s'inscrire avec l'adresse d'un autre. Better Auth
  refuse alors de rattacher la connexion Google de la vraie personne à ce compte
  (`requireLocalEmailVerified`, actif par défaut) : elle est bloquée tant qu'elle ne réinitialise
  pas le mot de passe.
- Pas de captcha : création de comptes par robots limitée seulement par la limite de Better Auth.
- La limite de Better Auth (active en production, en mémoire) n'est vérifiée par aucun test.

### S10. Limites de requêtes uniformes

600 requêtes par minute et par joueur, 1 500 par IP, quelle que soit la route. Quelques routes
coûtent bien plus que les autres : `GET /api/pokemon` (toute la collection, sérialisée et hachée),
`GET /api/trainers?q=` (parcours complet des profils avec `translate(lower(...))`), la recherche
de guildes, le classement. Quelques comptes suffisent à charger la base.

### S11. Sauvegardes non chiffrées

`deploy/backup.sh` écrit un `pg_dump` compressé en clair sur le VPS et le recopie tel quel par
`rclone` : e-mails et empreintes de mots de passe lisibles par quiconque accède au stockage distant.

### S12. Conteneur de l'API en `root`

L'image `api` (`Dockerfile`) n'a pas d'instruction `USER`, garde toutes les dépendances de
développement et le code source, et `docker-compose.prod.yml` ne restreint rien (`cap_drop`,
`no-new-privileges`, système de fichiers en lecture seule). Une faille d'exécution de code dans
l'API donnerait `root` dans le conteneur.

### S13. Pas de contraintes en base

`player_profiles.currency` et les colonnes `quantity` n'ont pas de `CHECK (… >= 0)`. Le code
vérifie bien avant de débiter ; une contrainte rattraperait une future erreur de logique (argent
négatif, objets dupliqués) au lieu de l'enregistrer.

### S14. Secret d'authentification

`env.ts` exige `BETTER_AUTH_SECRET` en production mais accepte n'importe quelle longueur.

### S15. Noms trompeurs

`trainerNameSchema` accepte toutes les lettres Unicode : « Аdmin » (A cyrillique), « Dexpedition »,
« Modérateur » sont libres. Risque d'usurpation dans les guildes et le classement.

### S16. Suppression d'un compte

- Le compte supprimé par Better Auth disparaît de sa guilde par cascade, sans passer par
  `leaveGuild` : une guilde peut rester sans chef.
- `deletedUserIds` (`auth.ts`) vit en mémoire : vidé au redémarrage, inconnu d'un second
  processus. Sans conséquence avec un seul processus ; à remplacer par la suspension (S7).

### S17. Aucune détection automatique

Ni `pnpm audit` ni Dependabot dans la CI, aucun test ne vérifie qu'une nouvelle route exige une
session, aucune liste de contrôle de sécurité dans `docs/`.

### Risques acceptés (hors plan, à garder en tête)

- **Combat en temps réel** : le jeu reçoit la graine du combat (il doit l'animer) et le serveur
  accepte une action jusqu'à 1,5 s dans le passé (`SWITCH_TOLERANCE_MS`). Un robot peut jouer
  parfaitement ; c'est le prix du temps réel.
- **Heure locale fournie par le jeu** (`utcOffsetMinutes`) : un joueur peut choisir le jour ou la
  nuit pour les talents et évolutions horaires.
- **Profils secondaires (bêta)** : trois parties par compte, à retirer comme prévu après la bêta.

---

## 3. Phases

### Phase 1 : Correctifs immédiats (≈ 1 à 2 jours, à mettre en ligne avant l'afflux)

> **Faite le 23 novembre 2026** (branche `dev`, pas encore en production). Écarts et suites :
>
> - 1.1 : liste blanche dans `isAllowedPushEndpoint`, purge par la migration 0151 ; l'envoi ignore
>   (et supprime) aussi une adresse hors liste. Parallélisme : 5 joueurs à la fois, les appareils
>   d'un joueur ensemble (10 au plus). Délai entre deux essais gardé en mémoire (un seul processus).
> - 1.2 : `zod` 4.6.7, `fastify` 5.12.8, `nodemailer` 10.6.1, `@fastify/rate-limit` 11.3.0.
>   `pnpm audit --prod` ne signale plus qu'`esbuild` (moyenne), tiré par `drizzle-kit` via
>   `better-auth` : serveur de développement d'esbuild, jamais lancé en production.
> - 1.3 : en plus du plan, `X-Frame-Options DENY` appliqué tout de suite (`frame-ancestors` est
>   ignoré en observation). Politique vérifiée appliquée dans Chrome (jeu connecté ou non, admin) :
>   seule violation, la sonde `Function('')` de Zod, attendue. `scripts/csp-check.mjs` (CI)
>   vérifie l'empreinte du script de thème. **À faire** : une semaine après la mise en ligne,
>   relire la console en production (jeu, admin, connexion Google/Discord, notifications), puis
>   remplacer `Content-Security-Policy-Report-Only` par `Content-Security-Policy`.
> - 1.4 : lancement manuel limité à `main` en plus. **À faire par l'exploitant** : le réglage
>   GitHub des workflows des forks (voir `docs/INSTALLATION-SERVEUR.md`, étape 10).
> - 1.5 : `lockedMembership` (common.ts) ; messages, suppression de message et retrait de
>   candidature passent aussi par `playerTransaction`. Les deux tests de `concurrency.test.ts`
>   échouent avec l'ancien code.

**1.1 Web Push (S1)**

- `pushSubscriptionInputSchema` : `https:` obligatoire ; côté serveur, liste blanche des services
  push (`fcm.googleapis.com`, `updates.push.services.mozilla.com`, `*.push.apple.com`,
  `*.notify.windows.com`), refus `PUSH_ENDPOINT_REFUSED` (catalogue des erreurs + libellé).
- Abonnements existants hors liste blanche supprimés (migration ciblée `DELETE … WHERE`).
- `sendNotification` avec `timeout` (10 s) ; envois en parallèle limité (5 à la fois).
- Plafond de 10 appareils par joueur (le plus ancien remplacé) ; `/api/push/test` limité à un
  envoi toutes les 30 s.
- Tests : adresse interne refusée, adresse lente abandonnée, plafond respecté.

**1.2 Dépendances (S2)**

- Monter `zod` ≥ 4.6.6, `fastify` ≥ 5.12.6, `nodemailer` ≥ 10.1.4, `@fastify/rate-limit` (pour
  `ip-address` ≥ 10.7.4) ; `pnpm audit --prod` ne doit plus rien signaler d'élevé ou de moyen hors
  développement. Lint, typecheck, tests et build complets après la montée.

**1.3 En-têtes HTTP (S4)**, dans le bloc `(app)` du `Caddyfile`

- `Strict-Transport-Security "max-age=31536000; includeSubDomains"` (préchargement plus tard,
  une fois sûr que tout sous-domaine est en HTTPS) ;
- `Content-Security-Policy` d'abord en `-Report-Only` une semaine, puis appliquée :
  `default-src 'self'; script-src 'self' 'sha256-…'` (empreinte du script de thème
  d'`index.html`), `style-src 'self' 'unsafe-inline'`, `img-src 'self' data:`,
  `connect-src 'self'`, `worker-src 'self'`, `object-src 'none'`, `base-uri 'self'`,
  `frame-ancestors 'none'`, `form-action 'self'` ;
- `Permissions-Policy "camera=(), microphone=(), geolocation=()"` ;
- vérifier dans le navigateur : jeu, admin, connexion Google/Discord, notifications, service worker.

**1.4 CI et déploiement (S5)**

- `deploy.yml` : condition `github.event.workflow_run.event == 'push'` et
  `github.event.workflow_run.head_repository.full_name == github.repository` ;
- `permissions: contents: read` dans les deux workflows ;
- actions épinglées par empreinte de commit (commentaire avec la version) ;
- GitHub → Settings → Actions : approbation obligatoire des workflows des forks.

**1.5 Guildes (S6)**

- Dans `membership.ts`, lire acteur et cible **dans** la transaction, après `lockGuild` ; suppression
  et changement de rôle filtrés aussi sur `guildId` ; `updateGuild` et `postGuildMessage` passent
  par `playerTransaction`.
- Test dans `concurrency.test.ts` : deux passations simultanées donnent un seul chef ; une exclusion
  concurrente d'un départ ne touche pas la nouvelle guilde.

### Phase 2 : Comptes et administration (≈ 2 à 3 jours)

> **Faite le 23 novembre 2026** (branche `dev`, pas encore en production). Écarts et suites :
>
> - 2.1 : Better Auth ne demande le code qu'à la connexion par mot de passe ; la session porte donc
>   `two_factor_verified` (migration 0152), seule à ouvrir l'admin (`ADMIN_2FA_SETUP_REQUIRED`,
>   `ADMIN_2FA_REQUIRED`). Activation réservée aux administrateurs ; le jeu demande aussi le code
>   (un admin qui joue). QR code (`uqr`, ajouté le 24 novembre), clé à recopier ou lien `otpauth://`.
>   Secours : `pnpm admin:promote <email> --reset-2fa`. **À faire par l'exploitant** : activer le
>   second facteur de chaque administrateur dès la mise en ligne.
> - 2.2 : confirmation de l'adresse active par défaut en production avec SMTP (`EMAIL_VERIFICATION`),
>   comptes existants marqués vérifiés (migration 0153). Captcha prêt mais inactif tant que
>   `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` sont vides (CSP et confidentialité déjà à jour) ;
>   **à décider par l'exploitant**. Limites : celles du plan, plus 10 inscriptions par 10 min, 3
>   renvois du lien par heure, 5 codes de second facteur par minute. Messages de Better Auth
>   traduits (`authErrorMessage`).
> - 2.3 : secret d'au moins 32 caractères et différent de celui du développement. Noms : liste
>   dans `packages/shared/src/names.ts`, appliquée par les schémas de création.

**2.1 Double authentification des administrateurs (S3)**

- Greffon `twoFactor` de Better Auth (code TOTP) : tables générées dans le schéma Drizzle, puis
  `pnpm db:generate`.
- `requireAdmin` refuse (`ADMIN_2FA_REQUIRED`) un administrateur sans second facteur ; écran
  d'enrôlement et de saisie du code dans l'admin, codes de secours affichés une fois.
- Caddy : `/api/admin/*` répond 404 sur le domaine du jeu, servi seulement sur `ADMIN_DOMAIN`.

**2.2 Inscriptions (S9)**

- Vérification de l'e-mail (`emailVerification` + `requireEmailVerification`) pour les nouveaux
  comptes ; les comptes existants gardent l'accès. Demande un SMTP configuré en production.
- Captcha (Cloudflare Turnstile ou équivalent, greffon `captcha` de Better Auth) sur inscription,
  connexion et mot de passe oublié. Service extérieur : page de confidentialité à mettre à jour.
- Règles explicites de Better Auth (`rateLimit.customRules`) : connexion 5 par minute, mot de passe
  oublié 3 par heure et par IP ; un test en `NODE_ENV=production` vérifie le refus 429.

**2.3 Secrets et noms (S14, S15)**

- `env.ts` : `BETTER_AUTH_SECRET` d'au moins 32 caractères et différent du secret de développement,
  sinon l'API refuse de démarrer.
- Noms réservés (admin, modérateur, Dexpedition, système, staff…) et refus des noms mêlant plusieurs
  alphabets, pour les dresseurs et les guildes ; les noms existants ne changent pas.

### Phase 3 : Modération et anti-abus (≈ 3 jours)

> **Faite le 24 novembre 2026** (branche `dev`, pas encore en production). Écarts et suites :
>
> - Tout est sous `/api/admin/moderation/*` (`routes/admin/moderation.ts`), pour pouvoir ouvrir ce
>   seul préfixe à un futur rôle de modérateur ; pas de rôle de modérateur pour l'instant.
> - 3.1 : colonnes `suspended_until` et `suspension_reason` (migration 0154), pas `banned_*`, pour
>   ne pas croiser le greffon `admin` de Better Auth. Définitive = an 9999. La connexion reste
>   possible : le jeu affiche la fin, le motif et l'adresse de contact (`SuspendedPage`). Un profil
>   secondaire peut être suspendu seul ; suspendre le compte coupe aussi ses profils. Cache de
>   30 s (`AccountStatusCache`), qui remplace `deletedUserIds`.
> - 3.2 : page « Guildes et discussions » (catégorie Modération) ; la description d'une guilde se
>   corrige aussi. Le texte d'un message supprimé reste dans le journal.
> - 3.3 : `balance.guilds.chat` (réglable dans Équilibrage → Guildes), comptage en base dans la
>   transaction du joueur (index `guild_messages_user`) ; purge chaque heure (`BACKGROUND_JOBS`).
> - 3.4 : liste `HEAVY_READS` dans `rate-limit.ts` (pas de `config.rateLimit` dans les routes),
>   fiche et Pokédex d'un autre dresseur compris ; 120 par minute et par route, 300 écritures par
>   minute, en production seulement. Pas d'index trigramme (rien ne le demande encore).
> - Pas de bouton « Signaler » côté joueurs : à envisager si l'afflux le demande.

**3.1 Suspension (S7, S16)**

- Colonnes `users.banned_until` et `users.ban_reason` (migration) ; `requireUser` refuse un compte
  suspendu (`ACCOUNT_SUSPENDED`, avec la date de fin), lu en base avec un cache court ; sessions du
  compte supprimées à la suspension. Remplace `deletedUserIds`.
- Admin, fiche du joueur : suspendre (durée, motif), lever, journalisé dans `admin_audit_log`.

**3.2 Modération (S7)**

- Admin : renommer un dresseur ou une guilde, lire la discussion d'une guilde, supprimer un message ;
  chaque action journalisée.

**3.3 Discussion de guilde (S8)**

- Au plus un message toutes les 3 s et 20 par tranche de 10 minutes par joueur
  (`GUILD_MESSAGE_RATE_LIMITED`) ; valeurs dans `balance` (réglages = contenu).
- Tâche de fond : messages de plus de 90 jours supprimés.

**3.4 Limites par route (S10)**

- Budgets propres (`config.rateLimit` de `@fastify/rate-limit`) pour les lectures lourdes
  (`/api/pokemon`, recherches de dresseurs et de guildes, classement) et un budget global
  d'écritures par joueur.
- Recherche de dresseurs : au moins 2 caractères ; index trigramme (`pg_trgm`) sur le nom normalisé
  si les mesures de Supervision le justifient.

### Phase 4 : Défense en profondeur (≈ 1 à 2 jours)

> **Faite le 24 novembre 2026** (branche `dev`, pas encore en production). Écarts et suites :
>
> - 4.1 : contraintes sur l'argent, les parcelles, le Sac, les Bonbons, les Balls et baies
>   réservées d'une expédition, le niveau (≥ 1) et l'XP (migration 0155, déclarées dans le schéma
>   Drizzle). Pas de vérification préalable possible depuis le poste de développement : la
>   migration ramène d'abord à la borne une valeur hors limite (requête de contrôle dans les
>   points ouverts). Violation → 409 `INVALID_STATE` (nouveau code du catalogue), transaction
>   annulée, inscrite dans « Dernières erreurs » de la Santé de l'API (`db-constraints.test.ts`).
> - 4.2 : `USER node` et dossier `artwork` à `node` dans l'image ; `no-new-privileges` pour les
>   trois services ; `cap_drop: [ALL]`, `read_only` et `tmpfs` pour l'API et Caddy (Caddy garde
>   `NET_BIND_SERVICE`) ; Postgres garde ses capacités (démarrage en root). Pas d'élagage des
>   dépendances de développement (tsx lance l'API). Vérification : tâche `images` de la CI
>   (`up --wait`, santé à travers Caddy, uid 1000, code non modifiable, pnpm et tsx, écriture dans
>   le volume des illustrations). Volume existant : `chown` à faire une fois (`MISE-A-JOUR.md`).
> - 4.3 : `age` plutôt que `rclone crypt` (la clé de `rclone crypt` vivrait sur le VPS) :
>   `BACKUP_AGE_RECIPIENT` (clé publique) ; copies locales en clair pour `restore.sh`, dossier
>   `chiffre/` seul envoyé ; sans clé, rien n'est envoyé. Script essayé avec de faux `docker`,
>   `age` et `rclone` (rotation suivie, rien d'envoyé sans clé), pas encore sur le serveur.
> - 4.4 : `leaveGuildsBeforeDeletion` (`guilds/membership.ts`), appelé par `beforeDelete` de
>   Better Auth pour le compte et ses profils secondaires, et par la suppression d'un profil
>   secondaire (qui ne peut plus échouer si le profil quitte sa guilde au même moment).

**4.1 Base (S13)** : vérifier qu'aucune ligne n'est négative en production, puis migration
`CHECK (currency >= 0)`, `CHECK (quantity >= 0)` et équivalents ; une violation devient un refus
propre (`pgErrorResponse`, code `23514`) et une alerte dans Supervision.

**4.2 Conteneurs (S12)** : `USER node` dans l'image `api` ; dans `docker-compose.prod.yml`,
`security_opt: [no-new-privileges:true]`, `cap_drop: [ALL]` (Caddy garde `NET_BIND_SERVICE`),
système de fichiers en lecture seule sauf les volumes nécessaires ; vérifier que
`pnpm sprites:download` écrit toujours dans le volume `artwork`.

**4.3 Sauvegardes (S11)** : chiffrement avant l'envoi (`rclone crypt` ou `age`), clé hors du VPS
et notée dans le coffre de l'exploitant ; essai de restauration documenté dans `MISE-A-JOUR.md`.

**4.4 Suppression de compte (S16)** : `beforeDelete` fait quitter la guilde (passation du rôle de
chef) au compte et à ses profils secondaires.

### Phase 5 : Audit continu (≈ 1 jour, puis à chaque mise à jour)

> **Faite le 24 novembre 2026** (branche `dev`, pas encore en production). Écarts et suites :
>
> - 5.1 : `pnpm audit --audit-level high` sur toutes les dépendances, pas `--prod` : l'image de
>   production installe aussi celles de développement, et `--prod` laissait passer trois failles
>   élevées de `sharp` 0.34.3 (`pnpm sprites:download`), passé en 0.35.5 (redimensionnement en
>   WebP essayé). Restent deux failles moyennes d'outils jamais lancés en production (`esbuild`
>   sous `drizzle-kit`, `minimatch` sous `eslint`). Dependabot vers `dev` (main déploie), une PR
>   groupée par semaine pour npm et une pour les actions, TypeScript 7 ignoré. gitleaks 8.30.1 en
>   binaire vérifié par empreinte (tâche `secrets`, tout l'historique) : historique propre en local
>   (126 commits) ; seul `.data/vapid.json`, ignoré par Git, est relevé dans le dossier.
> - 5.2 : `buildApp` renvoie `routes` (relevées par `onRoute`) ; `route-security.test.ts` les
>   appelle toutes : 401 sans session et avec un cookie inventé hors `PUBLIC_ROUTES` (santé,
>   config, contenu publié, sprites, authentification, `OPTIONS` du CORS) ; 403 `FORBIDDEN` à un
>   joueur et `ADMIN_2FA_SETUP_REQUIRED` à un admin sans second facteur sur tout `/api/admin/*` ;
>   404 avec le code attendu pour l'objet d'un autre joueur (Pokémon, étiquette, équipe, œuf,
>   fossile, expédition, combats), le propriétaire le trouvant bien. Les trois routes `/seen`
>   répondent 204 sans rien changer chez l'autre (vérifié en base). Test essayé en retirant un
>   filtre `ownerId` et un `requireUser` : il échoue dans les deux cas. Aucune faille trouvée.
> - 5.3 : `docs/SECURITE.md` (modèle de menace, règles, vérifications de la CI, liste de contrôle,
>   journal des audits), règles dans `CLAUDE.md`, rappel dans `MISE-A-JOUR.md`, recette d'une
>   route, décision dans `DECISIONS.md`.

**5.1 CI (S17)**

- `pnpm audit --prod --audit-level high` dans `ci.yml` (échoue sur une faille élevée) ;
- `.github/dependabot.yml` : npm et GitHub Actions, chaque semaine ;
- recherche de secrets (gitleaks) sur chaque PR.

**5.2 Tests de sécurité automatiques**

- Toutes les routes enregistrées (`onRoute`) hors liste blanche publique répondent 401 sans session,
  et toutes les routes `/api/admin/*` répondent 403 à un joueur : une route ajoutée sans contrôle
  fait échouer la CI.
- Pour chaque route à identifiant (`:id`, `:pokemonId`…), un appel avec l'identifiant d'un autre
  joueur répond 404.

**5.3 Documentation et routine**

- `docs/SECURITE.md` : modèle de menace, règles, liste de contrôle d'une mise à jour, journal des
  audits (date, version, constats).
- `CLAUDE.md`, règles du code : « une adresse fournie par un joueur n'est jamais appelée par le
  serveur sans liste blanche » ; « une nouvelle route publique s'ajoute à la liste blanche du test
  de sécurité ».
- À chaque fusion `dev` → `main` : `/security-review` sur l'écart, `pnpm audit --prod`, relecture
  de la liste de contrôle, ligne dans le journal des audits.

---

## 4. Ordre conseillé

1. **Phase 1 en entier, avant l'afflux** : seule S1 est exploitable aujourd'hui par n'importe quel
   joueur connecté ; S2 à S6 se corrigent en quelques heures chacune.
2. **2.1** (double authentification de l'admin) juste après : c'est le compte qui peut tout casser.
3. **Phase 3** dès les premiers jours de l'afflux : la modération sert au premier abus.
4. **Reste de la phase 2, phase 4** ensuite.
5. **Phase 5** pour finir : elle rend les audits suivants courts et réguliers.

Chaque phase suit la règle du projet : lint, deadcode, format, typecheck, test, build, doc
technique à jour, et une entrée dans le journal des nouveautés pour ce que les joueurs voient.
