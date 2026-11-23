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
