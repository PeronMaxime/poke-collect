-- Page « À faire » de l’admin : tâches de suivi de l’exploitant (à faire, à surveiller).
CREATE TYPE "public"."admin_task_kind" AS ENUM('todo', 'watch');--> statement-breakpoint
CREATE TABLE "admin_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "admin_task_kind" DEFAULT 'todo' NOT NULL,
	"title" text NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"due_on" date,
	"done_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_tasks" ADD CONSTRAINT "admin_tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_tasks_open" ON "admin_tasks" USING btree ("done_at","due_on");--> statement-breakpoint
-- Liste de départ : les suites de la mise en production du plan de sécurité (24 novembre 2026,
-- docs/plans/PLAN-SECURITE.md, « Points ouverts »).
INSERT INTO "admin_tasks" ("kind", "title", "details", "due_on") VALUES
('todo', 'Activer le second facteur de chaque administrateur', 'Tant qu’un admin ne l’a pas activé, son mot de passe seul suffit pour l’activer. Ranger les 10 codes de secours dans le gestionnaire de mots de passe. Secours : pnpm admin:promote <email> --reset-2fa (dans le conteneur api).', NULL),
('todo', 'Vérifier les services après le déploiement du 24 novembre', 'Sur le serveur : $C ps (postgres, api et caddy « Up »), $C logs --tail 50 caddy (certificats, vrais domaines) et $C logs --tail 50 api (migrations appliquées).', NULL),
('todo', 'Donner le volume des illustrations à l’utilisateur de l’API', 'Une seule fois, sinon pnpm sprites:download ne peut plus écrire : docker run --rm -v poke-collect_artwork:/artwork alpine chown -R 1000:1000 /artwork (docs/MISE-A-JOUR.md, « Illustrations »).', NULL),
('todo', 'Tester l’inscription en production', 'Créer un compte avec une vraie adresse : l’e-mail de confirmation arrive (regarder les indésirables) et le lien fait entrer dans le jeu. Supprimer ensuite le compte.', NULL),
('todo', 'Essayer la modération dans un vrai navigateur', 'Avec le compte de test : suspendre puis rétablir (fiche du joueur, écran de suspension du jeu), renommer ; « Guildes et discussions » : lire une discussion, supprimer un message.', NULL),
('todo', 'Mettre en place les sauvegardes chiffrées hors du VPS', 'Sur son ordinateur : age-keygen -o dexpedition-backup.key, clé privée rangée en deux endroits. Dans le .env du serveur : BACKUP_AGE_RECIPIENT (clé publique age1…) et BACKUP_REMOTE. Puis un essai de restauration depuis la copie distante (docs/INSTALLATION-SERVEUR.md étape 9, docs/MISE-A-JOUR.md).', NULL),
('todo', 'Réglages de sécurité de GitHub', 'Settings → Code security : alertes Dependabot, recherche de secrets et protection à l’envoi (push protection). Settings → Actions : approbation des workflows des forks (docs/INSTALLATION-SERVEUR.md, étape 10).', NULL),
('todo', 'Fusionner la PR #29 de Dependabot dans dev', 'actions/setup-node 7.0.0 → 7.1.0, une fois sa CI verte. Part en production avec la prochaine fusion dev → main.', NULL),
('todo', 'Durcir le second facteur', 'Constat de la première revue de sécurité (sous le seuil) : refuser /two-factor/get-totp-uri, /two-factor/disable et /two-factor/generate-backup-codes à une session sans twoFactorVerified quand le second facteur est activé, et révoquer les autres sessions du compte à l’activation (apps/api/src/auth.ts).', NULL),
('todo', 'Appliquer la politique de contenu (CSP)', 'S’il n’y a eu aucun rapport CSP dans la console pendant la semaine : passer Content-Security-Policy-Report-Only à Content-Security-Policy dans deploy/Caddyfile (plan de sécurité, 1.3).', '2026-12-01'),
('todo', 'Recaler les budgets de requêtes', 'D’après les refus 429 relevés pendant la semaine : RATE_LIMIT_HEAVY_PER_MINUTE (120) et RATE_LIMIT_WRITES_PER_MINUTE (300) dans le .env, puis $C up -d.', '2026-12-01'),
('watch', 'Refus 429 dans « Santé de l’API »', 'Des joueurs normaux bloqués sur une route ? Les budgets ont été choisis sans mesure (plan de sécurité, 3.4).', NULL),
('watch', 'Erreurs INVALID_STATE dans « Santé de l’API »', 'Un garde-fou de la base (solde ou quantité sous zéro) a refusé une écriture : c’est un défaut du code à corriger.', NULL),
('watch', 'Rapports CSP dans la console du navigateur', 'Jeu, admin, connexion, notifications : noter tout message « Content-Security-Policy » avant d’appliquer la CSP.', NULL),
('watch', 'Tâche npm de Dependabot', 'Elle échoue tant qu’un paquet du lockfile a moins de 3 jours (fast-json-stringify 7.3.10, jusqu’au 25 novembre). Vérifier que celle du lundi passe et ouvre sa PR vers dev.', '2026-11-30'),
('watch', 'Poids des pages', 'JavaScript à l’ouverture : 378,3 Ko / 380 (jeu) et 128,5 Ko / 130 (admin). La prochaine fonction lourde fera sauter le plafond : découper ou charger à la demande.', NULL),
('watch', 'Comptes de robots', 'Afflux d’inscriptions suspectes : activer le captcha Turnstile (clés Cloudflare dans .env.production, docs/INSTALLATION-SERVEUR.md) et ajouter une ligne au journal des nouveautés.', NULL),
('watch', 'Routine de sécurité avant chaque fusion dev → main', 'docs/SECURITE.md, section 4 : /security-review sur l’écart, pnpm audit, liste de contrôle, ligne dans le journal des audits.', NULL),
('watch', 'Profils secondaires (bêta)', 'À retirer à la fin de la bêta (Réglages → nouvelle partie sans compte, cookie dex_profile).', NULL);
