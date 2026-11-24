# Sécurité : modèle de menace, règles et routine d'audit

Ce qui protège le jeu, ce que la CI vérifie seule, et ce qu'on relit à chaque mise en production.
L'audit complet du 23 novembre 2026 et ses corrections sont dans
[plans/PLAN-SECURITE.md](plans/PLAN-SECURITE.md) (constats S1 à S17) ; ce fichier en garde ce qui
sert à chaque mise à jour.

## 1. Modèle de menace

**Le dépôt est public.** Code, règles, constantes, contenu (`content/game-content.json`) et
configuration du serveur sont lisibles par tous : rien ne repose sur le secret du code. Seuls
restent secrets le `.env` de production, les clés (SSH, `age`, VAPID) et la base.

| Qui                                   | Ce qu'il peut faire                                       | Ce qui l'arrête                                                                                          |
| ------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Visiteur sans compte, robot           | Appeler toutes les routes, créer des comptes en masse     | Session exigée partout sauf la liste publique ; e-mail vérifié ; limites de Better Auth et par IP        |
| Joueur connecté (avec un script)      | Envoyer n'importe quelle requête, en rafale, en parallèle | Validation Zod, `ownerId` partout, `playerTransaction`, le serveur recalcule tout, budgets de débit      |
| Joueur malveillant envers les autres  | Noms trompeurs, discussion abusive, adresses à appeler    | Noms réservés, modération, débit de la discussion, liste blanche des adresses Web Push                   |
| Voleur du mot de passe d'un admin     | Tout l'admin                                              | Second facteur exigé à chaque requête de l'admin                                                         |
| Dépendance ou action GitHub piégée    | Code exécuté dans la CI ou en production                  | `pnpm audit` et gitleaks en CI, Dependabot, actions épinglées par empreinte, déploiement limité à `main` |
| Faille d'exécution de code dans l'API | Lire la base, modifier le code servi                      | Conteneur sans root, en lecture seule, sans capacités ; Postgres non exposé                              |
| Accès au stockage des sauvegardes     | Lire e-mails et empreintes de mots de passe               | Copies distantes chiffrées par `age`, clé privée hors du VPS                                             |

Risques acceptés (graine du combat en temps réel connue du jeu, heure locale fournie par le jeu,
profils secondaires de la bêta) : voir la fin de la section 2 du plan.

## 2. Règles

Elles sont aussi dans `CLAUDE.md` ; la CI en vérifie une partie (section 3).

- **Le serveur décide** : le jeu n'envoie que des intentions, tout résultat est recalculé à partir
  de la graine enregistrée (`crypto.randomInt`), jamais repris du client.
- **Toute route exige une session**, sauf la liste publique de
  `apps/api/test/platform/route-security.test.ts` (`PUBLIC_ROUTES`) : une nouvelle route publique
  s'y ajoute, avec la raison. Les routes de l'admin sont sous `/api/admin/*` (rôle, second
  facteur).
- **Un objet se cherche avec son propriétaire** (`ownerId` dans le `where`, pas après) : un
  identifiant d'un autre joueur répond 404, comme un identifiant inconnu. Une nouvelle route à
  `:id` se classe dans `OWNED` ou `NOT_OWNED` du même test.
- **Toute action qui écrit passe par `playerTransaction`**, vérifications comprises ; dans une
  guilde, rôles et cibles se lisent après `lockedMembership`.
- **Une adresse fournie par un joueur n'est jamais appelée par le serveur sans liste blanche**
  (`isAllowedPushEndpoint`, `apps/api/src/game/push.ts`).
- **Entrées bornées** : chaque corps et paramètre passe par un schéma Zod (tableaux plafonnés,
  entiers bornés, UUID, slugs). Aucune requête SQL écrite à la main avec une valeur du client
  (`sql.raw` interdit), recherches `LIKE` échappées.
- **Rien d'interne dans une réponse** : une erreur 500 répond `INTERNAL` ; aucune adresse e-mail
  dans ce qu'un joueur voit d'un autre.
- **Compteurs ≥ 0 en base** (`CHECK`) ; une violation est un défaut du code (409 `INVALID_STATE`).
- **Actions sur un autre joueur** sous `/api/admin/moderation/*`, journalisées ; lectures lourdes
  dans `HEAVY_READS`.
- **Pas de secret dans Git** : `.env` et `.data/` sont ignorés ; un secret publié par erreur se
  **révoque** (nouvelle clé), le retirer de l'historique ne suffit pas (dépôt public, copies).
- **Pas de nouveau script en ligne, d'`eval` ni de ressource d'un autre site** sans adapter la
  CSP (`deploy/Caddyfile`).

## 3. Ce que la CI vérifie seule

| Vérification                      | Où                                                              | Ce qu'elle attrape                                                      |
| --------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `pnpm audit --audit-level high`   | `ci.yml`, tâche `check`                                         | Faille connue élevée ou critique dans une dépendance                    |
| gitleaks (tout l'historique)      | `ci.yml`, tâche `secrets`                                       | Clé, jeton ou mot de passe commité                                      |
| Contrôles d'accès de chaque route | `apps/api/test/platform/route-security.test.ts`                 | Route sans session, route d'admin ouverte, objet d'un autre joueur      |
| Comptes et administration         | `apps/api/test/platform/auth-security.test.ts`                  | Second facteur, e-mail vérifié, captcha, limites, secret de production  |
| Modération, discussion            | `platform/moderation.test.ts`, `progression/guild-chat.test.ts` | Suspension, renommage, débit et purge de la discussion                  |
| Liste blanche Web Push            | `platform/push.test.ts`                                         | Adresse de notification hors des services connus                        |
| Garde-fous de la base             | `platform/db-constraints.test.ts`                               | Solde ou quantité sous zéro                                             |
| Actions simultanées               | `platform/concurrency.test.ts` (vrai Postgres)                  | Double dépense, double réclamation, interblocages                       |
| Scripts en ligne autorisés        | `scripts/csp-check.mjs`                                         | Script modifié sans nouvelle empreinte dans la CSP                      |
| Caddyfile valide                  | `caddy validate`                                                | En-têtes de sécurité perdus à cause d'un serveur web qui ne démarre pas |
| Conteneurs restreints             | `ci.yml`, tâche `images`                                        | API qui tournerait en root ou pourrait réécrire son code                |

Dependabot (`.github/dependabot.yml`) ouvre chaque lundi une PR groupée vers `dev` pour les
dépendances npm et les actions GitHub ; chaque version majeure a sa propre PR. Les alertes de
sécurité de GitHub (Settings → Code security) ouvrent leurs PR vers `main` : refaire la mise à
jour sur `dev` plutôt que les fusionner telles quelles (fusionner sur `main` déploie).

**Une faille acceptée** (dépendance de développement sans correctif, sans effet en production) se
note dans `pnpm.auditConfig.ignoreGhsas` (`package.json`) et dans le journal ci-dessous, avec la
raison et la date de réexamen. **Un faux positif de gitleaks** s'ajoute à `.gitleaksignore` (son
empreinte, affichée dans le journal de la tâche).

## 4. À chaque mise en production (`dev` → `main`)

1. `/security-review` dans Claude Code sur l'écart avec `main` (`git diff main...dev`) ; corriger
   ou noter chaque constat.
2. `pnpm audit` (toutes les dépendances : l'image de production installe aussi celles de
   développement) ; une faille moyenne se corrige si un correctif existe.
3. Relire la liste ci-dessous pour ce que l'écart touche :
   - nouvelle route : session ou liste publique, `ownerId` dans la recherche, `playerTransaction`
     si elle écrit, `HEAVY_READS` si elle parcourt beaucoup de lignes, schéma Zod borné ;
   - nouvelle route d'admin agissant sur un joueur : `/api/admin/moderation/*`, journalisée ;
   - texte libre d'un joueur (nom, message) : longueur bornée, noms réservés, modérable, affiché
     en texte (jamais en HTML) ;
   - adresse ou fichier fourni par un joueur : liste blanche, jamais appelé ou lu tel quel ;
   - nouveau compteur (argent, stock) : son `CHECK (… >= 0)` dans la migration ;
   - nouvelle variable d'environnement secrète : dans `.env.production.example` sans valeur,
     validée par `loadEnv` ;
   - nouveau script dans une page, nouveau domaine appelé par le jeu : CSP de `deploy/Caddyfile` ;
   - changement de `Dockerfile`, `docker-compose.prod.yml` ou des workflows : droits minimaux
     gardés (pas de root, `permissions: contents: read`, actions épinglées par empreinte).
4. Une ligne dans le journal des audits (section 5) : date, version (commit de `dev`), constats.

## 5. Journal des audits

| Date         | Version             | Constats                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------ | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 23 nov. 2026 | `de864a6`           | Audit complet : 17 constats (S1 à S17), corrigés par les phases 1 à 5 du plan.                                                                                                                                                                                                                                                                                                                                                                  |
| 24 nov. 2026 | `dev`, non commitée | Phase 5. `pnpm audit` : `sharp` 0.34.3 (3 failles élevées, installé dans l'image de production pour `pnpm sprites:download`) passé en 0.35.5 ; restent 2 failles moyennes d'outils de développement jamais lancés en production (`esbuild` sous `drizzle-kit`, `minimatch` sous `eslint`). gitleaks : historique propre (126 commits). Test des routes : `GET /api/content` public exprès (contenu déjà dans le dépôt) ; rien d'autre d'ouvert. |
