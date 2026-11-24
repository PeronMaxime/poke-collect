# Décisions : pourquoi c'est fait ainsi

Les choix qui structurent le projet, avec leur raison et ce qu'ils coûtent. À relire avant de
vouloir en changer un : la plupart répondent à un problème déjà rencontré.

## Le serveur décide, la graine fait foi

**Choix.** Aucun résultat n'est calculé par le navigateur. Chaque activité enregistre une graine
au lancement ; le résultat est calculé à la réclamation par une fonction pure de `game-core`.

**Pourquoi.** Impossible de tricher en modifiant le jeu dans son navigateur ; un résultat
contesté se rejoue à l'identique ; les règles se testent sans base ni réseau.

**Prix.** Une activité en cours se résout avec le code du jour de la réclamation. Changer une
règle demande donc de penser aux activités déjà lancées (voir « Changer une règle » dans
[RECETTES.md](RECETTES.md)).

## Le contenu est en base, versionné, et c'est la base qui fait foi

**Choix.** Zones, dresseurs, objets, équilibrage… sont des données éditées dans l'admin, pas du
code. Un brouillon se prépare puis se publie d'un coup ; les anciennes versions sont gardées.

**Pourquoi.** Régler le jeu sans déployer ; revenir en arrière ; terminer une expédition avec le
contenu de son départ.

**Prix.** Trois copies du contenu coexistent (base, instantané `game-content.json`, contenu de
test) et il faut savoir laquelle fait foi : **la base**. Toute migration de contenu doit être
ciblée pour ne pas écraser les réglages de l'admin, en local comme en production.

## Pas de tâche de fond par joueur : on rattrape à la requête

**Choix.** Rien ne s'exécute pour un joueur absent. Les états qui dépendent du temps sont
calculés à la lecture, ou rattrapés par `PlayerSettler` à sa requête suivante.

**Pourquoi.** Aucune file de tâches à exploiter, aucune charge pour les joueurs inactifs, et un
serveur qui redémarre sans rien perdre.

**Prix.** Chaque lecture doit penser « et si le temps a passé ? ». Les deux seules tâches de
fond (notifications push, coffres de guilde) sont globales, pas par joueur.

## Un verrou par joueur pour toutes ses écritures

**Choix.** `playerTransaction` prend un verrou Postgres au nom du joueur en tête de chaque
transaction d'action.

**Pourquoi.** Deux clics rapprochés, ou deux onglets, donnaient des doubles réclamations et des
Pokémon envoyés deux fois. Un joueur agit à vitesse humaine : faire passer ses actions l'une
après l'autre ne coûte rien et supprime toute cette famille de bugs.

**Prix.** Une action qui touche deux joueurs (guildes) doit verrouiller les deux, toujours dans
le même ordre (`lockPlayers` s'en charge).

## PGlite en développement, Postgres en production

**Choix.** Sans `DATABASE_URL`, l'API utilise PGlite, un Postgres embarqué dans un dossier.

**Pourquoi.** Développer et tester sans Docker ; des tests qui partent d'une base neuve en
mémoire en quelques secondes.

**Prix.** PGlite n'accepte qu'un processus et qu'une connexion : jamais deux programmes sur
`.data/pglite`, et les tests d'actions simultanées exigent un vrai Postgres (en CI).

## Un seul processus d'API

**Choix.** La production fait tourner une API, une base, un serveur web, sur une seule machine.

**Pourquoi.** Suffisant pour la taille du jeu, et bien plus simple à exploiter.

**Prix.** Plusieurs états vivent dans la mémoire du processus (cache du contenu, limite de
requêtes, supervision, tâches de fond). La liste et ce qu'il faudrait changer sont dans
[ARCHITECTURE.md](ARCHITECTURE.md), section 10, et dans [SURCHARGE.md](SURCHARGE.md).

## L'API tourne en TypeScript, sans étape de compilation

**Choix.** L'API est lancée par `tsx`, en développement comme en production. Les paquets
internes exportent directement leurs sources (`"exports": "./src/index.ts"`).

**Pourquoi.** Aucune chaîne de compilation à maintenir entre les paquets ; ce qui tourne en
production est ce qui a été testé.

**Prix.** Quelques secondes de démarrage en plus et la mémoire de `tsx`
([SURCHARGE.md](SURCHARGE.md), 2.2).

## Pas de routeur dans le jeu

**Choix.** Le jeu affiche un écran selon l'état du joueur, puis un onglet selon l'ancre de
l'adresse (`#pc`). L'admin, lui, utilise React Router.

**Pourquoi.** Le jeu est un seul écran à onglets : l'ancre suffit, se partage et survit au
rechargement.

**Prix.** La logique d'onglets (verrouillage, repli, pastilles) est concentrée dans `HomePage`.

## Recharger peu, et seulement ce qui a changé

**Choix.** Les données restent fraîches 30 s ; après une action, on ne recharge que les clés
qu'elle a pu modifier ; la liste des Pokémon et le contenu utilisent un ETag.

**Pourquoi.** Le jeu envoyait une dizaine de requêtes par geste et finissait par se faire
refuser par la limite de requêtes (voir [plans/PLAN-STABILITE.md](plans/PLAN-STABILITE.md)).

**Prix.** Chaque nouvelle action doit dire ce qu'elle invalide. En développement, `lib/api.ts`
avertit dans la console au-delà de 20 requêtes en 5 secondes.

## Un écran long : un hook et des pièces

**Choix.** Un écran ou un formulaire de plus de 150 lignes se découpe en un hook qui rend son
« modèle » (`useBattlesPage`, `useBalanceForm`…) et des pièces qui le reçoivent en un seul
paramètre (`{ m }`) ; une fiche de l'admin, en sections qui reçoivent les mêmes props qu'elle.
ESLint refuse une fonction plus longue (voir [plans/PLAN-QUALITE.md](plans/PLAN-QUALITE.md)).

**Pourquoi.** Les écrans dépassaient le millier de lignes : on ne savait plus où lire l'état, ni
où poser un champ. Le modèle unique évite de recopier une liste de props à chaque pièce, et le
découpage s'est fait sans retaper le JSX, donc sans changer l'affichage.

**Prix.** Une pièce voit tout le modèle, pas seulement ce dont elle se sert ; le type
`…Model = ReturnType<typeof useX>` suit le hook sans qu'on l'écrive.

## Pages chargées à la demande, client d'API partagé

**Choix.** Le jeu (`lazyPage`) et l'admin (`lazy` de React Router) ne téléchargent le code d'une
page qu'à sa première visite. Les deux appellent l'API par le même client, `@poke/client`.

**Pourquoi.** Tout le code partait au premier affichage (560 Ko compressés pour le jeu, 500 pour
l'admin) ; et les deux `api()` divergeaient (délai maximal, erreurs réseau, réessais seulement
dans le jeu).

**Prix.** La première visite d'une page attend son téléchargement (dans le jeu, les pages sont
préchargées dès que le navigateur est libre) ; la CI plafonne le poids à l'ouverture
(`scripts/bundle-size.mjs`).

## PWA écrite à la main

**Choix.** `public/sw.js` et `manifest.webmanifest` sont écrits à la main, sans extension Vite.

**Pourquoi.** Le besoin est petit (installation, cache des sprites, page hors ligne,
notifications) et un service worker généré est difficile à comprendre quand il se trompe.

**Prix.** Le découpage du JavaScript en plusieurs fichiers doit être vérifié avec lui.

## Textes en français dans le code, identifiants en anglais

**Choix.** Le jeu n'existe qu'en français : les textes sont écrits dans les composants. Le code
(noms de fonctions, de tables, de champs) est en anglais, les commentaires en français.

**Pourquoi.** Pas de couche de traduction à entretenir pour une seule langue.

**Prix.** Traduire le jeu demanderait d'extraire tous les textes. Le lien entre les mots du jeu
et ceux du code est tenu dans [GLOSSAIRE.md](GLOSSAIRE.md).

## TypeScript 6.0, pas plus récent

**Choix.** `typescript` est fixé à `~6.0`.

**Pourquoi.** `typescript-eslint` ne prend pas encore en charge TypeScript 7.

**À revoir** quand il le fera.

## Profils secondaires : provisoire

**Choix.** Pendant la bêta, un compte peut ouvrir une seconde partie sans autre inscription
(`beta-profiles.ts`).

**Pourquoi.** Laisser les testeurs recommencer une partie sans perdre la leur.

**À retirer** après la bêta : c'est le seul endroit où l'identité du joueur (`request.user.id`)
diffère de celle du compte (`accountUserId`).

## Le butin suit le rythme des rencontres

**Choix.** L'intervalle entre deux tirages de butin s'allonge à chaque heure passée, dans le même
rapport que celui des rencontres (6 min + 1 min par heure, contre 3 min + 0,5 min) : un tirage
pour deux rencontres, quelle que soit la durée. Réglages `lootIntervalMinutes` et
`lootIntervalGrowthMinutes`, figés au départ de chaque expédition (17 nov., migrations 0140-0141).

**Pourquoi.** Avec un butin à rythme fixe et des rencontres qui ralentissent, une longue
expédition rapportait bien plus de Balls qu'elle n'en lançait (jusqu'à 2,7 fois en 24 h) : la
Boutique et le plan de Balls ne servaient plus. Au même rythme, la part des Balls lancées que le
butin rend ne dépend plus que des tables : la chance d'une Ball (par 1 à 3) vaut cette part, de
40 à 55 % pour les Poké Balls, 15 à 20 % pour les Super, 5 à 10 % pour les Hyper, de la première
zone d'une région à la dernière ; au total, toujours moins de 100 %.

**Prix.** Tout le butin ralentit, baies, fossiles et chances d'objets de quête compris. Les baies
de rencontres accélèrent les rencontres, pas le butin : sous leur effet, on lance plus de Balls
par tirage.

## L'XP d'une expédition se partage entre les membres

**Choix.** Chaque rencontre d'une expédition rapporte son XP (XP de base × niveau / 7, bonus
compris), divisée par le nombre de membres de l'équipe : à 6, chacun en reçoit le sixième ; seul,
un Pokémon garde tout. Les bonus de région (complétions) s'appliquent ensuite à chaque part.
Figé au départ (`expeditions.xp_shared`, 20 nov., migration 0144) : les expéditions déjà parties
donnent encore le total à chaque membre. Combats, donjons et légendaires ne changent pas.

**Pourquoi.** Chaque membre recevait le total : en suivant les zones de Kanto pour tout capturer,
un starter sortait au niveau 68 de la Route Victoire (sauvages 40-48) et finissait la région au
niveau 97 ; en fin de région, 2 à 4 jours d'expéditions suffisaient pour passer du niveau 5 au
niveau 100, et la pension (2 000 XP/h, un Pokémon) ne servait plus. Partagée entre 6, l'XP donne
un niveau 39-41 à la Route Victoire (bonus de complétion compris) et 1 à 2 semaines pour le niveau
100 en fin de région.

**Prix.** Une petite équipe monte plus vite qu'une grande : à poids égal, partir à 3 donne le
double à chacun. Les combats (Champions, Conseil 4) et les seuils de PE de fin de région restent
réglés sur les niveaux d'avant : à recaler si les joueurs bloquent. Écartée : une XP réduite
quand le Pokémon dépasse le niveau des sauvages (elle plafonne chaque zone, mais ne change
presque rien au parcours).

## Une forme régionale ne sert que dans sa région

**Choix.** Un Pokémon sert dans une région (expéditions, combats, quêtes, donjons, onglets du PC)
s'il est d'une espèce de son Pokédex, sauf une forme régionale : elle ne sert que dans la région
de sa forme, lue au début de son suffixe (`alola`, `galar-standard` → `galar`). Ossatueur d'Alola
part à Alola, jamais à Kanto, bien que l'espèce Ossatueur soit du Pokédex de Kanto
(`isRegionalPokemon`, 17 nov.).

**Pourquoi.** Une forme régionale est le Pokémon de sa région, pas de celle de l'espèce
d'origine : elle n'a pas à renforcer les équipes de Kanto.

**Prix.** Une forme régionale capturée hors de sa région (une zone qui en mélange plusieurs) ne
sert pas là où on l'a trouvée. La forme ordinaire d'une espèce reste acceptée partout où son
Pokédex la compte (Caninos ordinaire à Hisui, dont le Pokédex inclut les espèces à forme de Hisui).

## Pas d'évolution par objet en expédition

**Choix.** Aucune zone ne propose un Pokémon qui ne s'obtient qu'en évoluant avec un objet
(pierre, objet tenu, Câble Link qui remplace l'échange) : Raichu, Arcanin, Crustabri… Il faut
capturer la pré-évolution et la faire évoluer. Retirés du contenu publié par la migration 0142 (17
nov.). Une rencontre de ce genre est signalée dans le tableau de bord de l'admin (`ruleIssues`,
`game-core/rule-issues.ts`) dès que l'objet s'obtient (boutique, butin, coffre, récompense) :
Leveinard reste au Parc Safari tant que la Pierre Ovale ne s'obtient nulle part, et sera signalé
le jour où elle s'obtiendra.

**Pourquoi.** Les pierres et objets d'évolution n'ont de valeur que s'ils sont le seul chemin vers
ces Pokémon.

**Prix.** C'est une alerte, pas une erreur : l'admin peut encore en mettre un dans une zone et
publier. Elle se calcule avec les évolutions de `game-core`, donc à part des contrôles de
`@poke/content`.

## Pas de troisième stade en expédition

**Choix.** Aucune zone ne propose un Pokémon au troisième stade de sa lignée (un bébé ne compte
pas comme un stade) : Papilusion, Pharamp, Galeking, Libégon… Il faut faire évoluer sa
pré-évolution. Retirés du contenu publié par la migration 0143 (19 nov.), forme par défaut
seulement : les formes Méga, Gigamax et Prismillon des zones de Kalos et Galar, qu'on n'obtient
pas en évoluant, restent.

**Pourquoi.** Trop d'évolués en expédition dispensent de faire monter ses Pokémon pour compléter
le Pokédex. Les autres évolués finaux se retirent à la main, zone par zone, dans l'admin.

**Prix.** Rien ne l'empêche : un troisième stade remis dans une zone depuis l'admin n'est pas
signalé.

## Peu d'évolués en expédition

**Choix.** Une forme finale n'apparaît que dans une seule zone de sa région, une forme
intermédiaire dans deux au plus, avec un poids bas (environ la moitié de la forme de base), et une
partie des formes finales n'apparaît nulle part. Kanto et Johto ont été réglés ainsi à la main dans
l'admin, puis repris par la migration 0146 ; Hoenn par la migration 0145 (23 nov.). Les évolutions
d'un bébé (Ronflex, Éoko…) comptent comme des formes de base. Ces règles, avec les deux
précédentes, sont écrites dans `packages/content/src/seed/expedition-rules.ts` et vérifiées par
`seed.test.ts` sur toute région qui a son propre fichier de contenu de test.

**Pourquoi.** Même raison que pour le troisième stade : faire évoluer ses Pokémon doit rester le
chemin principal pour remplir le Pokédex.

**Prix.** Le contrôle ne porte que sur le contenu de test : l'admin peut s'en écarter sans alerte.
Six écarts voulus de Kanto et Johto (Roucoups, Machopeur, Rattatac, Rapasdepic, Tentacruel,
Lamantine) sont listés dans `EXPEDITION_RULE_EXCEPTIONS`. Le contrôle des évolutions par objet y
lit PokéAPI directement, sans les surcharges de l'admin que voit `game-core/rule-issues.ts`.

## Les objets de forme se tiennent comme des Méga-Gemmes

**Choix.** Primo-Kyogre, Primo-Groudon et les formes de Deoxys s'obtiennent avec un objet de forme
(effet `formChange`), gagné au bout d'une quête de forme (`quest.kind = 'form'`, 23 nov.). Il se
tient au PC exactement comme une Méga-Gemme : même colonne `pokemon.mega_stone`, mêmes routes
(`/api/pokemon/:id/mega`), mêmes codes d'erreur ; retiré, il revient au sac. Seules les formes
Méga comptent dans la limite d'une Méga par équipe (choix de l'utilisateur) ; une
Primo-Résurgence prend le talent de sa forme (Mer Primaire, Terre Finale), une forme de Deoxys
garde le talent du Pokémon. Les boss des quêtes de formes n'ont pas de légendaire (choix de
l'utilisateur), et les anciens objets de quête « Orbe Bleu » / « Orbe Rouge » des quêtes de Kyogre
et Groudon sont devenus des éclats, pour laisser les noms officiels aux objets de forme.

**Pourquoi.** Le mécanisme de la Méga-Évolution (objet retiré du sac, forme enregistrée au
Pokédex, objet rendu au retrait, au transfert ou au relâcher) convenait tel quel ; le reprendre
évite une seconde colonne et un second jeu de règles à garder d'accord.

**Prix.** Des noms trompeurs : `megaStone`, `megaEvolve` et les codes `ALREADY_MEGA`,
`WRONG_MEGA_STONE`… désignent aussi les objets de forme. Les renommer demanderait une migration
de colonne et de changer les codes d'erreur stables ; on a préféré documenter (commentaires de la
colonne et du DTO).

## Le Pokédex ne garde que les espèces et les formes régionales

**Choix.** Depuis le 23 nov. (demande de l'utilisateur), le Pokédex du joueur n'a plus que les
espèces et la section des formes régionales (`DEX_FORM_SECTIONS`) ; son total, celui de l'onglet
et les classements `species` / `shiny` (`dexForms`) ne comptent plus que ces formes. Les
Méga-Évolutions, formes Gigamax, Primo-Résurgences et formes de combat se complètent dans les
collections : une par région pour les Méga et les Gigamax (les formes seules, sans leur Pokémon
de base), une par espèce pour les Primo et les formes de combat (forme par défaut comprise), comme Deoxys parmi les
formes naturelles (`specialFormCollections` du contenu de test, migrations 0149 et 0150). L'admin et le
wiki gardent toutes les sections (`FORM_SECTIONS`).

**Pourquoi.** Ces formes sont des états passagers (objet tenu, combat) plutôt que des Pokémon à
part : les ranger avec les collections laisse le Pokédex refléter les espèces, et récompense quand
même celui qui les obtient.

**Prix.** Les classements baissent pour ceux qui avaient des Méga. Les collections des formes
Gigamax et de combat ne s'obtiennent pas encore (alerte de cohérence « Introuvable en jeu »),
comme une partie des formes naturelles. Une collection peut donc n'avoir aucune espèce, mais pas
être vide (`collectionSchema`) ; l'éditeur de l'admin propose alors les formes d'une espèce choisie
à part, sans l'ajouter à la collection.

## Le serveur n'appelle que les services push des navigateurs

**Choix.** Depuis le 23 nov. (plan de sécurité, S1), un abonnement Web Push n'est accepté que vers
FCM (Chrome, Edge, Opera…), Mozilla, Apple et Windows (`isAllowedPushEndpoint`,
`apps/api/src/game/push.ts`), en HTTPS sur le port par défaut ; refus `PUSH_ENDPOINT_REFUSED`. Les
anciens abonnements hors liste ont été purgés (migration 0151) et l'envoi les ignore. Chaque
envoi est abandonné après 10 s, 5 joueurs sont notifiés à la fois, 10 appareils au plus par
joueur, une notification d'essai toutes les 30 s.

**Pourquoi.** L'adresse vient du navigateur, donc du joueur : sans liste blanche, le serveur
envoyait une requête où on le lui demandait, réseau Docker et services internes compris.

**Prix.** Un navigateur dont le service push n'est pas dans la liste ne peut pas s'abonner ; il
faut l'ajouter (ici et dans une migration si l'on purge à nouveau). Le délai entre deux essais
est gardé en mémoire : il repart de zéro au redémarrage de l'API.

## Une politique de contenu stricte, d'abord en observation

**Choix.** Caddy envoie HSTS (un an), `X-Frame-Options DENY`, une `Permissions-Policy` et une
politique de contenu (`deploy/Caddyfile`) : tout vient du site lui-même, le seul script en ligne
(thème d'`apps/web/index.html`) est autorisé par son empreinte, pas d'`'unsafe-eval'`. Elle est
d'abord envoyée en `Content-Security-Policy-Report-Only` (violations dans la console), puis
appliquée. Le 23 nov., le jeu (connecté et non connecté) et l'admin ont été ouverts sous la
politique appliquée : seule la sonde `Function('')` de Zod est signalée, et Zod se passe alors de
compilation.

**Pourquoi.** Dernier rempart si une injection de code apparaît un jour, et pas d'affichage du jeu
dans un autre site (détournement de clic sur « relâcher » ou « supprimer le compte »).

**Prix.** Retoucher le script de thème change son empreinte : `scripts/csp-check.mjs` le détecte
en CI et affiche la nouvelle à recopier. Un service extérieur (captcha, statistiques) devra être
ajouté à la politique.

## L'admin exige un second facteur, marqué sur la session

**Choix.** Depuis le 23 nov. (plan de sécurité, S3), `requireAdmin` refuse un administrateur sans
second facteur (`ADMIN_2FA_SETUP_REQUIRED` : l'admin affiche l'activation) et une session ouverte
sans lui (`ADMIN_2FA_REQUIRED`). Le second facteur est un code TOTP (greffon `twoFactor` de Better
Auth, 10 codes de secours) ; la session porte `two_factor_verified`, posée par le serveur selon la
route qui la crée. Activation réservée aux administrateurs ; `/api/admin/*` n'existe que sur le
domaine de l'admin. Secours : `pnpm admin:promote <email> --reset-2fa`.

**Pourquoi.** Un administrateur publie le contenu, donne des objets, lit les e-mails des joueurs :
un mot de passe volé ne doit pas suffire. Better Auth ne demande le code qu'à la connexion par mot
de passe ; sans la marque, une connexion Google ou Discord l'aurait contourné.

**Prix.** Une dépendance de plus dans l'admin, `uqr` (QR code du lien `otpauth://`, sans
dépendance, chargé à la demande pour ne pas peser à l'ouverture) ; la clé à recopier et le lien
restent affichés pour qui ne peut pas scanner. « Se souvenir de cet appareil » n'est pas proposé (une session ainsi
ouverte n'a pas la marque). Tant qu'un administrateur n'a pas activé son second facteur, son mot de
passe seul permet de l'activer : à faire dès la mise en ligne.

## Inscriptions : adresse confirmée, captcha facultatif, limites par IP

**Choix.** Avec SMTP en production, un nouveau compte ne s'ouvre qu'après le clic sur le lien
envoyé (24 h, renvoyé à chaque tentative de connexion) ; les comptes antérieurs sont marqués
vérifiés (migration 0153). Le captcha Cloudflare Turnstile protège inscription, connexion et mot
de passe oublié dès que ses clés sont fournies. Better Auth limite par IP : 5 connexions par
minute, 10 inscriptions par 10 min, 3 mots de passe oubliés et 3 renvois de lien par heure,
5 codes de second facteur par minute (`AUTH_RATE_LIMITS`, `apps/api/src/auth.ts`).

**Pourquoi.** Sans confirmation, on pouvait s'inscrire avec l'adresse d'un autre et lui bloquer sa
connexion Google ; sans captcha ni limite, créer des comptes en masse.

**Prix.** Un joueur dont l'e-mail tarde (spams) attend avant de jouer. Le captcha ajoute un
service extérieur (politique de confidentialité, CSP) et ne s'affiche pas avec certains bloqueurs.
Les limites sont en mémoire (remises à zéro au redémarrage) et par IP : un établissement derrière
une seule adresse partage le même budget.

## Noms : ni compte officiel imité, ni alphabets mêlés

**Choix.** À la création d'un dresseur ou d'une guilde, `nameRefusal` (`packages/shared/src/names.ts`)
refuse les noms qui contiennent admin, modérateur, Dexpedition, staff, officiel, système (après
normalisation : accents, pleine largeur, chiffres sosies) ou valent modo, root, support…, et ceux
dont les lettres viennent de plusieurs alphabets. Les noms existants ne changent pas.

**Pourquoi.** Usurpation dans les guildes et le classement (« Аdmin » avec un A cyrillique).

**Prix.** Quelques noms innocents refusés (« Badminton », « Ψ Team ») : le message dit pourquoi.

## Modération : dans l'admin, sous un préfixe à part, sans rôle de modérateur

**Choix.** Suspendre un compte, renommer un dresseur, corriger une guilde et supprimer un message
se font dans l'admin, réservée au rôle admin avec second facteur. Toutes ces routes sont sous
`/api/admin/moderation/*` et chaque action est journalisée (`moderation.*`). Une suspension porte
une date de fin (an 9999 pour une suspension définitive) et un motif montré au joueur ; elle ferme
les sessions du compte, mais la connexion reste possible pour que le jeu affiche la fin et le
motif. Le contrôle se fait à chaque requête de jeu par un cache de 30 s de l'état des comptes
(`AccountStatusCache`), qui remplace la liste des comptes supprimés gardée en mémoire. Colonnes
`suspended_until` et `suspension_reason`, pas celles du greffon `admin` de Better Auth.

**Pourquoi.** Le premier abus doit se régler sans SQL en production. Un rôle de modérateur demande
un second contrôle d'accès et une admin qui masque le contenu : inutile tant qu'une seule personne
modère. Le préfixe permet de l'ajouter plus tard en n'ouvrant que lui. Lire l'état en base (et pas
dans le cookie de session, gardé 5 min) coupe l'accès tout de suite dans ce processus, au plus 30 s
après dans un autre.

**Prix.** Une lecture de `users` par joueur et par tranche de 30 s. Un suspendu peut créer un autre
compte : la suspension vise un compte, pas une personne. Pas de bouton « Signaler » côté joueurs :
un abus se découvre en le voyant, ou par e-mail.

## Débit : budgets par route lourde et pour les écritures, discussion limitée en base

**Choix.** En plus de la limite générale (600 requêtes par minute et par joueur), chaque lecture
lourde (`HEAVY_READS` : collection, recherches, classements, fiche et Pokédex d'un autre dresseur)
a son propre compteur, 120 par minute et par joueur, et les écritures ont un budget commun de 300
par minute (`RATE_LIMIT_HEAVY_PER_MINUTE`, `RATE_LIMIT_WRITES_PER_MINUTE`, actifs en production
seulement). La discussion de guilde a sa propre règle, dans le contenu (`balance.guilds.chat`) :
un message toutes les 3 s, 20 sur 10 min, comptés en base dans la transaction du joueur ; les
messages de plus de 90 jours sont purgés chaque heure. Une recherche de dresseur demande au moins
2 caractères.

**Pourquoi.** Une recherche sans index ou toute une collection coûte cent fois une requête
ordinaire : sous la limite générale, quelques comptes suffisaient à charger la base. La
discussion, elle, écrit pour les autres : compter en base garde la limite juste après un
redémarrage.

**Prix.** Valeurs choisies larges, sans mesure de la production : un joueur qui enchaîne très vite
les actions qui rechargent sa collection (Bonbons, évolutions) peut atteindre 120 par minute ; les
profils secondaires d'un compte partagent ses compteurs. Surveiller les 429 par route dans « Santé
de l'API » et ajuster les variables (`docs/SURCHARGE.md`, 1.7). Les compteurs de requêtes sont en
mémoire, remis à zéro au redémarrage. Pas d'index trigramme sur les noms tant que les mesures ne le
demandent pas.

## Garde-fous en base : CHECK sur les compteurs de valeur

**Choix.** L'argent, les objets du Sac, les Bonbons, les parcelles achetées, les Balls et baies
réservées d'une expédition, le niveau et l'XP d'un Pokémon portent une contrainte `CHECK` (≥ 0, ou
≥ 1 pour le niveau ; migration 0155, déclarées aussi dans le schéma Drizzle). Une violation
(`23514`) répond 409 `INVALID_STATE` et s'inscrit dans les erreurs de « Santé de l'API ». La
migration ramène d'abord à la borne une valeur déjà hors limite.

**Pourquoi.** Le code vérifie avant de débiter (`quantity >= n` dans la même requête), mais une
future erreur de logique enregistrerait un solde négatif ou des objets en trop sans que personne
le voie. La contrainte l'arrête au dernier endroit sûr et annule toute la transaction.

**Prix.** La remise à la borne efface la trace d'une éventuelle valeur négative déjà en
production (aucune attendue : vérifier avant la mise en ligne, requête dans
`docs/plans/PLAN-SECURITE.md`, 4.1). Pas de borne haute : les plafonds (niveau 100, bonheur…)
restent des règles du jeu, dans le contenu.

## Conteneurs restreints : l'API sans root, en lecture seule

**Choix.** L'image `api` tourne en utilisateur `node` ; dans `docker-compose.prod.yml`, aucun
service ne peut gagner de droits (`no-new-privileges`), l'API et Caddy perdent toutes leurs
capacités Linux (Caddy garde l'ouverture des ports 80 et 443) et n'écrivent que dans leurs volumes
et dans `/tmp` (`read_only`, `tmpfs`). Postgres garde ses capacités. La tâche `images` de la CI
lance ces conteneurs tels quels.

**Pourquoi.** Une faille d'exécution de code dans l'API ne donnerait qu'un utilisateur sans droits,
incapable de modifier le code servi ou d'installer quoi que ce soit dans le conteneur. Postgres
démarre en root pour préparer son dossier de données avant de passer à l'utilisateur `postgres` :
lui retirer ses capacités demande une liste fine, invérifiable sans le serveur.

**Prix.** Le code de l'API ne peut écrire aucun fichier hors de `/tmp` en production (l'instantané
du contenu n'est écrit qu'en développement). Le volume des illustrations doit appartenir à `node`
(uid 1000) : un volume créé avant ce changement se corrige une fois (`docs/MISE-A-JOUR.md`).

## Sauvegardes chiffrées hors du VPS, clé privée hors du VPS

**Choix.** `deploy/backup.sh` garde ses sauvegardes en clair sur le VPS, mais n'envoie hors de
lui que des copies chiffrées par `age` pour une clé publique (`BACKUP_AGE_RECIPIENT`). La clé
privée est créée sur l'ordinateur de l'exploitant et rangée dans son coffre ; sans clé publique,
rien n'est envoyé.

**Pourquoi.** Les sauvegardes contiennent les e-mails et les empreintes de mots de passe : le
stockage distant (un compte chez un hébergeur) ne doit rien pouvoir en lire. Une clé publique sur
le VPS suffit pour chiffrer ; même un VPS compromis ne déchiffre pas les copies déjà envoyées.
Les copies locales restent en clair pour que `restore.sh` répare vite une mise à jour ratée : le
VPS porte de toute façon la base.

**Prix.** Clé privée perdue = copies distantes illisibles : la garder en deux endroits. Une
restauration depuis la copie distante passe par l'ordinateur de l'exploitant (déchiffrement), puis
`scp` vers le VPS (`docs/MISE-A-JOUR.md`). Le disque du VPS porte chaque sauvegarde deux fois.

## Audit continu : toutes les dépendances, tout l'historique, toutes les routes

**Choix.** La CI lance `pnpm audit --audit-level high` sur **toutes** les dépendances (pas
`--prod`), gitleaks sur **tout** l'historique Git à chaque fois (binaire officiel vérifié par son
empreinte, pas l'action GitHub), et `route-security.test.ts` appelle **toutes** les routes que
`buildApp` déclare (`routes`, relevées par un `onRoute`), plutôt qu'une liste écrite à la main.
Dependabot ouvre ses PR vers `dev`, groupées par semaine.

**Pourquoi.** L'image de production installe aussi les dépendances de développement (tsx lance
l'API, sharp sert à `pnpm sprites:download`) : `--prod` laissait passer trois failles élevées de
sharp. Le dépôt est public : un secret retiré par un commit suivant reste lisible, d'où la relecture
de tout l'historique (quelques secondes). Une liste de routes à tenir à jour oublierait justement
la route ajoutée sans contrôle ; relever les routes déclarées fait échouer la CI dès qu'une
nouvelle route n'est ni protégée ni déclarée publique, et une nouvelle route à `:id` ni classée.
L'action gitleaks demande une licence pour les comptes d'organisation et s'exécute avec un jeton ;
le binaire n'a besoin de rien.

**Prix.** Une faille élevée publiée dans un outil de développement bloque la CI, donc le
déploiement, jusqu'à la mise à jour ou à son acceptation écrite (`pnpm.auditConfig.ignoreGhsas`,
`docs/SECURITE.md`). La version de gitleaks se monte à la main (version et empreinte dans
`ci.yml`). Le test des routes ne voit pas une fuite qui répondrait quand même 404 (refus d'un
autre contrôle placé avant celui du propriétaire) : il exige le code de refus attendu, et vérifie
que le propriétaire, lui, trouve l'objet.
