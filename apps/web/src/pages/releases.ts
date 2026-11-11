/**
 * Journal des nouveautés : une entrée par mise en production, la plus récente en tête, décrite du
 * point de vue du joueur (voir `docs/RECETTES.md`). Une entrée déjà en production ne se modifie
 * jamais ; tant que celle du haut n'est pas sur `main`, on la complète.
 */

/** Une mise en production et ce qu'elle change, rubrique par rubrique. */
interface Release {
  /** Date de mise en production, en toutes lettres. */
  date: string;
  title: string;
  changes: { section: string; items: string[] }[];
}

export const RELEASES: Release[] = [
  {
    date: '11 novembre 2026',
    title: 'Un jeu plus rapide à ouvrir',
    changes: [
      {
        section: 'Confort',
        items: [
          'Le jeu s’ouvre plus vite : chaque page n’est chargée qu’au moment où tu en as besoin, et ce qui ne change pas d’une mise à jour à l’autre reste gardé par ton navigateur.',
        ],
      },
    ],
  },
  {
    date: '10 novembre 2026',
    title: 'Un nouveau look rétro, des dresseurs en plus et ton Pokémon favori',
    changes: [
      {
        section: 'Nouveau look',
        items: [
          'Tout le jeu change d’apparence, façon fenêtres de jeu portable rétro : cadres doubles, polices pixel, bandeau du dresseur sur toute la largeur avec ton argent, et menu dans une fenêtre fixe à gauche avec sa flèche devant l’onglet affiché. Les thèmes clair et sombre ont chacun leur palette.',
          'Les chiffres ont été redessinés pour rester lisibles même en police pixel.',
          'En fond de page, les silhouettes des Pokémon de la vitrine de ta Fiche Dresseur (complétées par des starters), avec un reflet doré pour les chromatiques.',
          'Les Expéditions, les bâtiments (Centre, Pension, Musée, Ferme) et les Combats sont découpés en une fenêtre par section, que tu peux replier ; ton choix est retenu.',
        ],
      },
      {
        section: 'Colonne des bâtiments (grand écran)',
        items: [
          'Sur un grand écran, tes bâtiments débloqués s’affichent en petites fenêtres dans une colonne à droite : un clic ouvre leur page. Ils quittent alors le menu de gauche.',
          'Glisse une fenêtre par sa poignée pour changer l’ordre, replie-la pour n’en garder que le titre, ou masque-la depuis le bouton « Widgets » du bandeau.',
          'Depuis la fenêtre de la Pension, un clic sur un Pokémon permet de le retirer ou de le changer, et « + » dépose un Pokémon sur une place libre.',
        ],
      },
      {
        section: 'Expéditions',
        items: [
          'Une expédition dure désormais 24 h au plus, au lieu de 48 h. Les expéditions déjà parties gardent leur date de retour.',
          'Les rencontres s’espacent au fil du temps : 30 secondes de plus entre deux rencontres à chaque heure passée. Les expéditions déjà parties gardent leur rythme.',
          'Nouvelle fenêtre de départ : le bandeau de la zone, tes réglages à gauche et l’aperçu des rencontres et du butin à droite. Elle indique le rythme des rencontres, les captures attendues par heure, les Balls consommées par heure et combien de temps ton stock tiendra.',
          'Les expéditions en cours montrent ton équipe qui marche dans un décor en pixel art selon la zone. Au survol, un résumé : durée, météo, taux chromatique, Balls et baies, règles de capture et talents.',
          'Nouveau récap au retour : le bandeau de la zone, les rencontres, captures, Balls et chromatiques en cases, puis le butin et l’XP de l’équipe.',
        ],
      },
      {
        section: 'Équipes',
        items: [
          'Le choix de l’équipe s’ouvre dans une grande fenêtre : tes Pokémon à gauche (recherche, tri, filtres, équipes enregistrées), l’équipe en cases à droite avec le talent de chacun et son effet ici, puis les conditions de départ. En bas : Vider, Auto et Valider. Sur téléphone, les deux parties passent en onglets.',
          'En combat, l’ordre d’entrée et l’attaque de chaque Pokémon se règlent directement dans les cases, avec les adversaires visibles en haut. Les Pokémon hors des règles du dresseur (niveau, types interdits) sont grisés.',
          'Dans l’onglet « Équipe Pkmn », l’ordre des Pokémon d’une équipe se change en glissant leurs cartes (ou au clavier avec les flèches).',
        ],
      },
      {
        section: 'Combats',
        items: [
          'Nouveaux dresseurs : trois dresseurs répétables avant chaque Champion d’arène et avant le Conseil 4, à Kanto, Johto et Hoenn. Il faut les battre dans l’ordre pour atteindre le Champion, et ils rapportent de l’argent.',
          'Une boîte à badges en haut de la page : chaque badge s’affiche avec sa vraie image une fois gagné ; un clic t’emmène jusqu’au Champion.',
          'Les dresseurs ont un bandeau aux couleurs de leur zone, avec sa météo actuelle. Champions, Conseil 4 et Maître sont mis en avant sur toute la largeur.',
          'La fenêtre de combat (dresseurs, donjons et légendaires) est refaite : PV encadrés, boîtes de message, équipe en cases. Sur ordinateur, elle est agrandie jusqu’à une fois et demie tant qu’elle tient dans l’écran.',
        ],
      },
      {
        section: 'Fiche Dresseur',
        items: [
          'Nouveau : ton Pokémon favori. Clique sur le Pokémon de ta Fiche Dresseur pour en choisir un parmi ceux capturés au Pokédex (en chromatique si tu l’as capturé ainsi). Il te représente sur ta fiche, dans les classements, la recherche de dresseurs et ta guilde, à la place de ton starter.',
          'L’ordre de la vitrine se change en glissant ses Pokémon (ou au clavier avec les flèches).',
        ],
      },
      {
        section: 'PC et Pokédex',
        items: [
          'Les fiches du PC et du Pokédex sont refaites dans une grande fenêtre, avec ‹ › pour passer au Pokémon voisin de la grille.',
          'Fiche du Pokédex : bascule normal / chromatique, taille et poids, formes, lignée, où le trouver avec un bouton « Envoyer une équipe », talents et lien vers le Wiki.',
          'Fiche du PC : état du Pokémon (disponible, occupé, K.O., en soins), Bonbons dans le bloc du niveau, effets du talent en clair, et un bouton Pokédex qui ouvre sa fiche du Pokédex.',
          'Le tri du PC est retenu d’une visite à l’autre, et un bouton efface d’un coup tous les filtres actifs.',
        ],
      },
      {
        section: 'Pension',
        items: [
          'Plus besoin de déposer un couple : chaque parent se dépose, se change ou se retire seul. Chacun gagne son XP depuis son propre dépôt, et la reçoit en partant.',
          'Avant un changement, les œufs déjà prêts sont couvés (ou rangés dans le sac s’il n’y a plus de place).',
        ],
      },
      {
        section: 'Objets',
        items: [
          'Bonbons, Super Bonbons et objets de bonheur : le Pokémon choisi reste sélectionné, pour lui en donner plusieurs à la suite. Un filtre n’affiche que ceux qui évoluent par niveau ou par bonheur, et la fenêtre indique combien il en faut encore avant l’évolution.',
          'Rappel : choisis plusieurs Pokémon K.O., puis ranime-les d’un coup (un Rappel par Pokémon). Un bouton choisit ceux de plus haut niveau, dans la limite de tes Rappels.',
          'Deux nouvelles rubriques du Sac : « Soin » (Rappel) et « Entraînement » (Super Bonbon). Les rubriques du Sac se replient.',
        ],
      },
      {
        section: 'Pokédex, Quêtes et Assistants',
        items: [
          'Récompenses du Pokédex : un bouton « Tout réclamer » récupère d’un coup toutes celles qui sont prêtes, dans toutes les régions.',
          'Quêtes : une vitrine des légendaires de la région en haut (capturés en couleur, les autres en silhouette), l’avancement en cases et les quêtes terminées rangées à part, en bas.',
          'Un assistant doit désormais servir à quelque chose : un Pokémon dont le talent n’a aucun effet à ce poste est refusé (l’arrosage de la ferme accepte toujours tout Pokémon Eau). Les assistants déjà en poste restent.',
        ],
      },
      {
        section: 'Corrections',
        items: [
          'Une quête terminée avant sa réécriture s’affiche bien comme terminée, avec toutes ses étapes validées.',
          'Un combat déjà réglé (par exemple depuis un autre onglet) ne reste plus bloqué à l’écran : son résultat s’affiche.',
          'Sur téléphone, certaines listes déroulantes (guilde, transfert automatique) ne sortent plus de l’écran, et le classement laisse toute la place au nom du dresseur.',
        ],
      },
    ],
  },
  {
    date: '6 novembre 2026',
    title: 'Combats légendaires, une pension plus généreuse et des Bonbons revus',
    changes: [
      {
        section: 'À savoir : des quêtes recommencent',
        items: [
          'Si tu n’as pas encore capturé le légendaire d’une quête, elle recommence depuis la première étape avec sa nouvelle histoire, même si tu l’avais déjà terminée ou réclamée (sa récompense est de nouveau à gagner). Les expéditions légendaires pas encore récupérées sont annulées, et leurs Balls et baies te sont rendues.',
          'Un légendaire déjà capturé reste à toi : sa quête ne bouge pas. Tu peux le relâcher, mais il faudra alors refaire toute la nouvelle quête pour le retrouver. Un légendaire capturé avec la nouvelle quête, lui, se recombat directement après avoir été relâché.',
        ],
      },
      {
        section: 'Légendaires',
        items: [
          'Fini les expéditions légendaires : une fois la récompense de sa quête réclamée, le légendaire s’affronte en combat en temps réel, lancé depuis l’onglet Quêtes, contre ton équipe de six Pokémon au plus (du Pokédex de la région de la quête).',
          'Le légendaire est bien plus résistant qu’un Pokémon ordinaire, et sous la moitié de ses PV il se déchaîne : ses statistiques augmentent. Changements de Pokémon et objets restent permis pendant le combat.',
          'Les plus grands d’entre eux (Mewtwo, Lugia, Ho-Oh, Kyogre et Groudon) sont encore plus coriaces : prévois une équipe solide et de quoi la soigner.',
          'Victoire : lance la Ball de ton choix. Chaque légendaire a sa propre chance de capture, de 20 à 35 % selon sa rareté, affichée avant le lancer (la Master Ball, elle, ne rate jamais). Défaite, fuite ou Ball ratée : le légendaire se retire, et tu peux retenter le combat une heure plus tard.',
          'Chaque tentative augmente un peu la chance qu’il soit chromatique, comme une chaîne de rencontres.',
          'Les fuyards (Raikou, Entei, Suicune, Latias, Latios…) ne se combattent pas : ils restent à croiser en expédition, mais se capturent désormais trois fois plus facilement.',
          'Un légendaire capturé peut être relâché depuis sa fiche du PC : il ne rapporte aucun Bonbon, mais retourne à sa quête, où tu peux de nouveau l’affronter et tenter de le capturer (un fuyard, lui, se remet à errer).',
        ],
      },
      {
        section: 'Quêtes',
        items: [
          'Toutes les quêtes de légendaires de Kanto, Johto et Hoenn ont été réécrites : une vraie histoire à suivre, étape par étape, avec un dénouement qui s’affiche une fois l’étape validée. Les étapes déjà validées gardent leur dénouement, à relire à tout moment.',
          'Nouveau : les objets de quête. Certaines étapes demandent de trouver un objet en expédition dans une zone précise : chaque tirage de butin a une petite chance de le faire apparaître, seulement pendant cette étape. Ils se rangent dans une nouvelle catégorie du Sac.',
          'Certaines étapes demandent aussi un Pokémon précis dans l’équipe, une météo particulière au départ de l’expédition (celle de la zone, ou celle qu’impose un talent de l’équipe comme Crachin ou Sécheresse) ou un départ de jour ou de nuit.',
          'Nouveau : les dresseurs de quêtes. Plus de Champion d’arène à rebattre dans les étapes : chaque quête de légendaire fait affronter un dresseur propre à son histoire (Team Rocket, Aqua et Magma, chasseurs de légendes, gardiens…), marqué « (quête) ». Il n’apparaît qu’une fois l’étape atteinte, tout en bas de l’onglet Combats dans la section « Dresseurs de quêtes », et ne se bat qu’une fois : le bouton « Affronter » de l’étape mène directement à son combat. Les quêtes s’ouvrant après la Ligue, ils sont aussi forts que le Maître de la région.',
        ],
      },
      {
        section: 'Pension',
        items: [
          'Les parents gagnent de l’XP pendant tout leur séjour en pension. Tu la reçois en les retirant : l’XP déjà gagnée et le niveau atteint s’affichent sous chaque parent.',
          'Une pension garde désormais jusqu’à 10 œufs en attente avant de faire une pause.',
          'Deux boutons pour récupérer les œufs : « Ramasser » les range dans ton sac, « Couver » les place dans la couveuse, et ceux qui n’y tiennent pas vont dans le sac au lieu de rester à la pension.',
          'Les œufs du sac s’affichent à la Pension, sous la couveuse : un clic suffit pour les couver dès qu’une place se libère. Tu les retrouves aussi dans ton Sac.',
          'Au moment de déposer un couple, la liste ne propose par défaut que les partenaires compatibles avec le premier Pokémon choisi. Décoche ce filtre pour déposer deux Pokémon qui ne peuvent pas s’accoupler : ils ne pondront pas, mais gagneront de l’XP. Leur cœur est alors grisé.',
        ],
      },
      {
        section: 'Bonbons',
        items: [
          'Un Bonbon ne donne plus une quantité d’XP fixe, mais une part du niveau en cours : il faut 5 Bonbons pour passer un niveau au début, puis de plus en plus jusqu’à 20 pour les derniers niveaux. Le coût est le même pour tous les Pokémon, qu’ils montent vite ou lentement.',
          'Le Bonbon qui termine un niveau reporte son surplus sur le suivant, et les bonus d’XP de région rendent chaque Bonbon plus efficace. Il faut désormais environ 1 240 Bonbons pour monter un Pokémon du niveau 1 au niveau 100.',
          'La fiche du Pokémon au PC indique combien de Bonbons demande son niveau actuel.',
        ],
      },
      {
        section: 'Complétion des expéditions',
        items: [
          'Chaque expédition complétée (tous ses Pokémon capturés) donne une nouvelle récompense à réclamer dans le Pokédex, onglet « Expéditions » : +2 % d’XP pour tous les Pokémon de sa région, pour de bon. Les bonus s’additionnent : compléter 10 expéditions de Kanto, c’est +20 % d’XP pour tes Pokémon de Kanto.',
          'Ce bonus compte pour toutes les façons de gagner de l’XP : expéditions, combats, donjons, pension et Bonbons. Les expéditions déjà complétées donnent aussi leur récompense.',
          'L’onglet « Expéditions » du Pokédex se range par région, avec des onglets comme partout ailleurs. Un point signale les régions où une récompense attend, et le bonus d’XP déjà gagné dans la région s’affiche en haut.',
          'Dans cet onglet, chaque expédition a une seule carte avec sa complétion normale, puis sa complétion chromatique juste en dessous. La complétion de la région n’a plus sa propre section : elle s’affiche en haut à droite des expéditions.',
        ],
      },
      {
        section: 'Équipes',
        items: [
          'Nouveau bouton « ⚡ Sélection auto » au départ des expéditions, des combats et des donjons : il choisit d’un clic tes Pokémon les plus forts en affinité, puis les plus forts sans affinité, en servant d’abord les types exigés. Il respecte les règles des dresseurs (types interdits, niveau maximal) et ne prend qu’un seul Méga-Évolué.',
          'Le choix de l’équipe est réorganisé : ton équipe et sa PE en haut, avec « Sélection auto » et « Vider », puis la recherche, le tri et les filtres des Pokémon disponibles, avec un bouton pour remettre les filtres à zéro. Le tri par statistique est aussi proposé contre les dresseurs.',
        ],
      },
      {
        section: 'Sac',
        items: [
          'Le Sac se range en onglets : « Tout », puis un onglet par catégorie avec le nombre d’objets qu’elle contient. Les œufs et les Bonbons de lignée y ont aussi le leur.',
        ],
      },
      {
        section: 'Corrections',
        items: [
          'En combat, la tempête de sable, la grêle, la brûlure et le poison font perdre des PV toutes les 3 secondes aux deux Pokémon en face, et non plus après chaque attaque : un Pokémon rapide n’y perd plus davantage qu’un lent.',
          'Contre un boss de donjon, ces pertes et celles des talents comme Peau Dure se calculent sur ses PV d’origine, et non plus sur ses PV renforcés : ses PV multipliés ne multiplient plus ces pertes. Même règle pour les légendaires.',
          'Le bandeau « Connexion au serveur perdue » ne s’affiche plus après avoir réclamé une récompense, fait un achat ou terminé un combat : ton profil se recharge normalement.',
        ],
      },
    ],
  },
  {
    date: '5 novembre 2026',
    title: 'Expéditions à durée libre et un jeu plus stable',
    changes: [
      {
        section: 'Expéditions',
        items: [
          'Plus de durée fixe : chaque zone a une durée minimum, ensuite tu arrêtes l’expédition quand tu veux pour récupérer ses captures et son butin (48 h au plus). Les expéditions de légendaires gardent leur durée fixe.',
          'Les Balls se choisissent par catégorie de rencontre : nouveau Pokémon, shiny, déjà capturé, et même selon le nombre d’IV parfaits. Elles ne sont plus réservées au départ : chaque Ball est prise dans ton sac au moment de la rencontre.',
          'Une baie Framby (capture) et une baie Nanana (rencontres) peuvent servir en même temps ; chaque baie dure 10 minutes, et celles pas encore entamées te sont rendues au retour.',
          'Le nombre de rencontres et de tirages de butin affiché pendant l’expédition est désormais exact.',
          'Un Pokémon fuyard croisé en expédition est annoncé tout de suite, sans attendre la fin.',
          'Nouveau : le transfert automatique. Les captures déjà au Pokédex, jusqu’au nombre d’IV parfaits que tu choisis, sont transférées contre des Bonbons au retour. Un réglage commun à toutes les expéditions, ou un propre à chaque zone ; désactivé par défaut. Les Pokémon transférés comptent quand même pour le Pokédex, les quêtes et la guilde.',
          '« Relancer » renvoie l’expédition avec la même équipe, les mêmes Balls, baies et le même transfert automatique.',
          'Le récapitulatif du retour est plus court : les Pokémon déjà connus qui se sont échappés sont résumés en une ligne, seuls les nouveaux, les shiny et les fuyards restent détaillés.',
        ],
      },
      {
        section: 'Stabilité',
        items: [
          'Passer d’un Pokémon à l’autre dans le PC avec les flèches ne recharge plus tout à chaque fois : plus de message « Too Many Requests » en parcourant ta collection.',
          'Une coupure passagère du serveur (ou une mise en ligne) ne cache plus le jeu derrière un écran d’erreur : un bandeau apparaît, le jeu réessaie tout seul et reprend dès que le serveur répond.',
          'Les messages d’erreur sont plus clairs : connexion perdue, trop d’actions d’un coup, serveur en cours de redémarrage.',
          'Les mises en ligne ne coupent plus les actions en cours : le serveur patiente quelques secondes le temps de redémarrer.',
          'La limite d’actions par minute est désormais comptée par joueur, plus par connexion internet : plusieurs dresseurs sur le même réseau ne se gênent plus.',
          'Transferts, évolutions, objets et Bonbons ne rechargent plus que ce qui a changé : le jeu réagit plus vite et ménage le serveur.',
          'Une action restée sans réponse est abandonnée au bout de 20 secondes, avec un message, au lieu de laisser le bouton figé.',
          'Le PC reste fluide même avec des milliers de Pokémon : la grille s’affiche par tranches au fil du défilement et ne se redessine plus chaque seconde (le choix d’équipe, les équipes enregistrées et la vitrine aussi).',
        ],
      },
      {
        section: 'Progression',
        items: [
          'Une nouvelle région s’ouvre désormais aux trois quarts (75 %) du Pokédex de la région précédente, au lieu de la moitié. Les régions que tu as déjà ouvertes le restent.',
          'Le pourcentage du Pokédex de chaque région ne compte plus que les espèces : les formes alternatives (régionales, Méga…) sont comptées à part, juste en dessous.',
          'Zigzaton de Galar ne se montre plus à Hoenn : il faudra attendre Galar pour le croiser.',
        ],
      },
      {
        section: 'Menu',
        items: [
          'Le menu est rangé en sections repliables : Aventure, Bâtiments, Collection et Dresseur. Ton choix est gardé, et une section repliée affiche un point quand un de ses onglets t’attend.',
        ],
      },
      {
        section: 'Corrections',
        items: [
          'Les noms longs (Pikachu Casquette Originale…) passent sur deux lignes au lieu de déborder de leur case.',
          'En combat, le bonus de statistique d’un talent s’affiche tel qu’annoncé : Coloforce montre bien +50 % d’Attaque (et non +56 % sur une petite statistique, à cause de l’arrondi).',
          'Transférer deux fois les mêmes Pokémon en même temps (double clic, deux onglets) ne donne plus les Bonbons en double.',
          'Deux actions lancées en même temps passent désormais l’une après l’autre : un Pokémon ne peut plus être transféré pendant qu’il part en expédition, ni une récompense réclamée deux fois.',
          'Deux dresseurs qui capturent au même moment ne se bloquent plus l’un l’autre (erreur du serveur dans de rares cas).',
        ],
      },
    ],
  },
  {
    date: '30 octobre 2026',
    title: 'La région de Hoenn et une nouvelle progression',
    changes: [
      {
        section: 'Hoenn',
        items: [
          'Une troisième région s’ouvre quand tu as complété la moitié du Pokédex de Johto : Hoenn et ses 135 Pokémon, légendaires compris.',
          'Comme à Johto, tu y repars de zéro : choisis Arcko, Poussifeu ou Gobou, puis monte une équipe de Pokémon de Hoenn. Seuls eux partent en expédition et combattent dans la région.',
          'Trente zones d’expédition, des Routes 101 à 103 jusqu’à la Zone de Combat, avec une difficulté qui monte comme à Kanto et Johto. Des Pokémon de Kanto et de Johto s’y montrent aussi.',
          'Huit Champions à battre (Roxanne, Bastien, Voltère, Adriane, Norman, Alizée, Lévy et Tatia, Juan), puis le Conseil 4 et le Maître Marc. Un ancien Maître t’attend ensuite à la Zone de Combat…',
          'Des zones spéciales cachent des Pokémon introuvables ailleurs : le Labo du Prof. Seko, les Chutes Météore, l’Épave Abandonnée, le Parc Safari de Hoenn et la Zone de Combat.',
          'Lilia et Anorith renaissent au Musée, à partir des fossiles trouvés sur les Routes 111 à 113.',
        ],
      },
      {
        section: 'Déblocage au fil de l’aventure',
        items: [
          'Certaines parties du jeu s’ouvrent désormais peu à peu. Dans le menu, un onglet fermé porte un cadenas et affiche ce qu’il te reste à faire.',
          'Pension : 2 badges de Kanto. Musée : 6 badges de Kanto. Quêtes : victoire contre le Maître de Kanto. Guilde : Johto débloqué. Ferme à baies : Hoenn débloqué.',
          'Un onglet où tu as quelque chose en cours (œufs, fossiles, baies, quête commencée) reste ouvert.',
        ],
      },
      {
        section: 'Quêtes',
        items: [
          'Dix quêtes légendaires : Regirock, Registeel, Regice, Kyogre, Groudon, Rayquaza, Jirachi et Deoxys.',
          'Latias et Latios sont des fuyards : une fois leur quête terminée, ils changent de zone de Hoenn à chaque heure, comme les bêtes de Johto.',
          'Les quêtes de chaque région s’ouvrent après la victoire contre son Maître de la Ligue, et leurs objectifs sont revus dans toutes les régions.',
          'Les captures ne comptent plus que dans la région de la quête, voire dans une zone précise quand l’étape l’indique.',
        ],
      },
      {
        section: 'Expéditions',
        items: [
          'Les zones demandent plus de PE, surtout en début de région : une équipe au niveau du dernier Champion battu y entre presque toujours, sinon quelques niveaux de plus suffisent.',
          'Jusqu’à 9 expéditions en même temps au lieu de 6 : une place de plus en débloquant Johto, une autre avec Hoenn.',
          'Chaque zone a son propre butin : Poké Balls, baies, objets d’évolution et fossiles dépendent de l’endroit. Chaque fossile ne se trouve plus que dans une seule zone.',
          'Les affinités de chaque zone sont revues : ce sont les types super efficaces sur le type le plus présent parmi ses Pokémon.',
          'La chaîne chromatique monte moins vite, mais bien plus haut : jusqu’à × 6 au lieu de × 3.',
        ],
      },
      {
        section: 'Complétion des expéditions',
        items: [
          'Nouvel onglet « Expéditions » au Pokédex, avec des récompenses à réclamer quand tu as capturé tous les Pokémon d’une zone.',
          'Chaque zone complétée en chromatique donne +1 % de chance de chromatique, pour de bon.',
          'Chaque région complétée donne une couveuse de plus.',
        ],
      },
      {
        section: 'Combats de dresseurs',
        items: [
          'Les dresseurs sont plus forts, surtout le Conseil 4 et les Maîtres, mais rapportent 50 % de Poké Dollars en plus.',
          'Ils ne donnent plus d’objets, seulement des Poké Dollars.',
          'Plus de PE minimale ni de niveau maximal pour les affronter : à toi de juger si ton équipe est prête.',
          'Les Pokémon adverses croisés en combat ou en donjon sont maintenant marqués comme vus au Pokédex.',
        ],
      },
      {
        section: 'Bâtiments',
        items: [
          'Les bâtiments s’agrandissent avec l’aventure. Pension : une de plus au 2e badge de Johto, puis au 2e badge de Hoenn. Musée : 2 places de plus au 4e badge de Hoenn. Centre Pokémon : un de plus en débloquant Johto, puis Hoenn.',
          'La ferme démarre avec une seule parcelle. Les suivantes s’achètent à la Boutique, jusqu’à 18 : 10 000 ₽ la première, et le prix augmente de moitié à chaque achat.',
          'Au-delà de 9 parcelles, un second champ s’ouvre, avec son arroseur et son assistant de récolte.',
          'Une pension pleine ne perd plus d’œufs : la ponte se met en pause jusqu’à ce que tu les ramasses.',
          'Si tu as maintenant moins de places qu’avant : tes expéditions en cours se terminent normalement, puis l’emplacement en trop disparaît. Pour une pension ou une place du Musée en trop, les parents et les assistants retournent au PC, les objets tenus et les fossiles au sac, même un fossile déjà restauré. Les œufs prêts vont en couveuse s’il y a de la place ; les autres sont perdus.',
        ],
      },
      {
        section: 'Boutique',
        items: [
          'Les articles verrouillés n’apparaissent plus tant que tu ne peux pas les acheter.',
          'Super Ball au 2e badge de Kanto, Hyper Ball au 4e, Rappel au 8e. Pilule Talent (50 000 ₽) une fois Hoenn débloqué, Patch Talent au 4e badge de Hoenn.',
          'Fin de la vente des Aromates, des Capsules d’Argent et d’Or et des objets d’évolution : ils se trouvent désormais dans les coffres de guilde ou le butin de certaines zones.',
          'Pierre Stase (dès le 3e badge de Kanto) et Nœud Destin (dès le 6e) restent en vente, au rayon Élevage.',
        ],
      },
      {
        section: 'Rencontres spéciales',
        items: [
          'Certaines zones d’expédition cachent des Pokémon spéciaux, qu’on ne croise qu’avec le bon Pokémon dans l’équipe. Le Pokémon exact, pas une de ses évolutions !',
          'Treize formes spéciales à trouver de Kanto à Hoenn : Pikachu et Évoli Partenaires, les casquettes de Pikachu, Pikachu Cosplayeur et ses costumes de Concours, et Pichu Troizépi.',
          'Quand tu possèdes le Pokémon qu’il faut, une phrase énigmatique apparaît sur la zone et la forme spéciale rejoint la liste de ses Pokémon. Elle reste rare, n’est jamais chromatique, ne peut pas évoluer, et une Ball lui est toujours lancée.',
          'Ces formes ne se transmettent pas : l’œuf d’un Évoli Partenaire donne un Évoli normal.',
          'Le wiki indique où et comment trouver chacune d’elles.',
        ],
      },
      {
        section: 'Donjons',
        items: [
          'Les donjons ferment pour l’instant : ils rouvriront avec le premier badge de Kalos, une région à venir. Un donjon déjà en cours peut être terminé.',
          'Trois nouveaux donjons extrêmes t’y attendront : Méga-Latias, Méga-Latios et Méga-Rayquaza.',
        ],
      },
      {
        section: 'Talents',
        items: [
          'Les talents des Pokémon de Hoenn ont maintenant un effet : Garde Mystik, Peau Dure, Lavabo, Air Lock, Force Pure…',
        ],
      },
      {
        section: 'Pokédex',
        items: [
          'La section des Pokémon Dominants disparaît : ils ne feront pas partie du jeu.',
          'Les paliers du Pokédex disparaissent. Les objets et Poké Dollars déjà reçus te restent, mais leurs emplacements d’expédition, leurs pensions et leur bonus de capture sont retirés : les places suivent désormais les nouvelles règles de déblocage.',
          'Une forme reste cachée au Pokédex tant que tu ne l’as pas rencontrée : avoir vu la forme normale de l’espèce ne suffit plus.',
          'Les collections sont refaites : chacune réunit un Pokémon et toutes ses formes (l’alphabet des Zarbi, les motifs de Prismillon, les fleurs de Flabébé, les appareils de Motisma…). Chacune rapporte un petit bonus permanent d’XP, de Poké Dollars ou de capture.',
          'L’onglet Collections ne montre plus que les collections des régions que tu as débloquées, rangées par région.',
          'Les anciennes collections (Insectes de la Forêt de Jade, Famille Nidoran, Starters de Kanto) disparaissent, avec leurs récompenses.',
        ],
      },
      {
        section: 'Compte',
        items: [
          'Mot de passe oublié ? Tu peux désormais le réinitialiser depuis l’écran de connexion : un lien t’est envoyé par e-mail.',
          'Tu peux supprimer un profil secondaire depuis les réglages, pour libérer sa place et repartir de zéro.',
        ],
      },
      {
        section: 'Interface',
        items: [
          'Nouveau réglage « Thème » : clair, sombre ou comme ton appareil.',
          'Dans la liste des membres d’une guilde, un point indique qui est connecté. Il remplace le détail de ce que chacun apporte aux quêtes de la semaine.',
          'Face à un légendaire, la Master Ball n’est plus proposée en premier, pour éviter de la gâcher par mégarde.',
        ],
      },
    ],
  },
  {
    date: '27 octobre 2026',
    title: 'Classement des guildes et tous les Aromates',
    changes: [
      {
        section: 'Guildes',
        items: [
          'Nouveau classement « Guildes » : les guildes y sont rangées selon le nombre de quêtes de guilde terminées depuis leur création.',
          'Chaque guilde a sa fiche, avec sa présentation et la liste de ses membres. On y accède depuis le classement, la recherche de guildes ou la fiche d’un dresseur, qui affiche désormais sa guilde.',
          'L’arrivée d’un nouveau membre relève l’objectif des quêtes en cours, comme s’il était là au tirage.',
        ],
      },
      {
        section: 'Quêtes de guilde',
        items: [
          'Nouvelles quêtes du jour : chaque jour à minuit, ta guilde reçoit deux quêtes faciles (coffre Bronze) et une difficile (coffre Argent).',
          'Les quêtes de la semaine changent aussi : deux faciles (coffre Argent) et une difficile (coffre Or), renouvelées le lundi à minuit.',
          'Les objectifs sont bien plus grands : il faudra que toute la guilde s’y mette !',
          'Une quête dont l’objectif est atteint continue d’avancer jusqu’à la fin de la journée ou de la semaine : tout le monde peut encore y participer. Les coffres sont distribués à la fin de la période, à chaque membre qui l’a fait avancer.',
        ],
      },
      {
        section: 'Objets',
        items: [
          'Tous les Aromates sont là : un pour chacune des 20 natures qui modifient les statistiques, plus l’Aromate Sérieux pour une nature neutre. On les trouve en boutique, dans le butin d’élite et dans les coffres de guilde Argent et Or.',
        ],
      },
      {
        section: 'Expéditions',
        items: [
          'Les talents qui attirent un type de Pokémon (Statik, Magnépiège…) attirent aussi les Pokémon fuyards de ce type.',
          'Après une expédition avec des Baies Nanana, « Relancer » ne t’avertit plus à tort d’un manque de baies : il en compte bien une par heure, et non une par rencontre.',
        ],
      },
      {
        section: 'Interface',
        items: [
          'Au PC, la bulle d’un talent affiche sa description et tous ses effets ; ceux qui n’agissent pas sur l’activité en cours du Pokémon sont grisés.',
          'À la ferme, la description de chaque baie s’affiche au survol, dans la liste comme sur les parcelles.',
          'Chaque onglet s’ouvre désormais en haut de page.',
          'Une fenêtre ouverte (ou le menu sur mobile) ne fait plus défiler la page en dessous.',
        ],
      },
      {
        section: 'Corrections',
        items: [
          'Héricendre n’affiche plus deux niveaux d’évolution : il évolue au niveau 14.',
          '« Sélectionner les doublons » compte les chromatiques à part : avec un Roucool chromatique et un Roucool normal, aucun des deux n’est sélectionné.',
          'Sur mobile, le sac, les coffres et les équipes de 6 des expéditions en cours ne dépassent plus de l’écran.',
        ],
      },
    ],
  },
  {
    date: '25 octobre 2026',
    title: 'Guildes et talents à débloquer',
    changes: [
      {
        section: 'Guildes',
        items: [
          'Nouvel onglet « Guilde » sous la Fiche Dresseur : fonde ta guilde pour 100 000 ₽ ou rejoins-en une grâce à la recherche (jusqu’à 30 membres).',
          'Le chef choisit si sa guilde est ouverte à tous ou sur demande ; il peut nommer des officiers, qui l’aident à accepter les candidatures et à gérer les membres.',
          'Une discussion permet aux membres d’échanger, et la liste des membres montre ce que chacun apporte aux quêtes de la semaine.',
          'Après avoir quitté une guilde, il faut attendre 24 h avant d’en rejoindre ou d’en fonder une autre.',
        ],
      },
      {
        section: 'Quêtes de guilde et coffres',
        items: [
          'Chaque semaine, 5 quêtes à réaliser tous ensemble : captures, expéditions, combats, donjons, œufs… Chaque action d’un membre les fait avancer.',
          'Les quêtes repartent à zéro chaque lundi à minuit : une quête non terminée est perdue.',
          'Chaque quête terminée donne un coffre Bronze, Argent ou Or à tous les membres qui l’ont fait avancer.',
          'Ouvre tes coffres depuis le sac : Poké Balls, Super Balls et Hyper Balls par lots, Super Bonbons, pierres évolutives, Nœud Destin, Capsules d’Argent et d’Or, Aromates… et même la Master Ball. Plus tu progresses dans le jeu, plus les coffres contiennent d’objets différents.',
        ],
      },
      {
        section: 'Talents',
        items: [
          'Les nouveaux Pokémon (captures, œufs, fossiles, récompenses) arrivent sans talent. Ceux que tu as déjà gardent le leur.',
          'Pilule Talent : donne au Pokémon l’un de ses talents normaux, au hasard. Une deuxième Pilule le fait passer à l’autre talent normal, s’il en a deux.',
          'Patch Talent : donne au Pokémon son talent caché. Une Pilule Talent le ramène ensuite à un talent normal.',
        ],
      },
      {
        section: 'Divers',
        items: [
          'Ruines d’Alpha : on n’y rencontre plus que Zarbi, sous ses 28 formes (A à Z, ! et ?), toutes aussi fréquentes. Queulorior se trouve désormais au Parc Safari de Johto.',
          'Le jeu parle désormais partout de Pokémon « chromatiques » plutôt que « shiny ».',
        ],
      },
    ],
  },
  {
    date: '24 octobre 2026',
    title: 'Ferme à baies, nouvelles baies et un assistant par place',
    changes: [
      {
        section: 'Ferme à baies',
        items: [
          'Nouvel onglet sous le Musée : un champ de 9 parcelles où planter tes baies.',
          'Les baies ne poussent que si le champ est arrosé : confie-le à un assistant de type Eau. Sans lui, la pousse se met en pause et reprend là où elle en était. Avec le talent Moiteur, l’arroseur fait pousser les baies 25 % plus vite.',
          'Un second poste, l’assistant de récolte, accueille les Pokémon dont le talent augmente la récolte : avec le talent Récolte, chaque parcelle récoltée donne une baie de plus.',
          'Une Baie Framby pousse en 1 h et en donne de 1 à 3 à la récolte : clique sur une baie mûre pour la récolter. Tant qu’elle n’est pas mûre, tu peux l’arracher pour la récupérer.',
          'La baie grossit au fil de sa pousse. Le bouton « Tout récolter » ramasse toutes les baies mûres d’un coup, et « Remplir le champ » plante la baie choisie dans toutes les parcelles libres (tant qu’il t’en reste).',
        ],
      },
      {
        section: 'Nouvelles baies',
        items: [
          'Baie Sitrus : en combat de dresseur ou en donjon, un bouton à son image (avec le nombre qu’il te reste) la donne à ton Pokémon actif, qui récupère un quart de ses PV. Une fois toutes les 10 secondes au plus.',
          'Baie Grena : donne-la à un Pokémon depuis le Sac ou depuis sa fiche au PC, son bonheur augmente de 1.',
          'Baie Nanana : emporte-la en expédition à la place de la Baie Framby pour 25 % de rencontres en plus. Il en faut une par heure d’expédition (au moins une).',
          'Toutes se plantent à la ferme à baies.',
        ],
      },
      {
        section: 'Baies plus rares',
        items: [
          'Les baies ne se trouvent plus qu’en expédition, et rarement : la Boutique ne vend plus de Baie Framby et les nouveaux dresseurs n’en reçoivent plus au départ.',
          'Une fois ta première baie trouvée, cultive-la à la ferme pour en avoir davantage.',
        ],
      },
      {
        section: 'Assistants',
        items: [
          'Chaque pension et chaque place du Musée ont désormais leur propre assistant, choisi directement depuis la pension ou la place. Son talent n’agit que sur le couple de sa pension, ou sur le fossile déposé à sa place.',
          'La couveuse et le Centre Pokémon gardent un assistant chacun, qui agit sur leurs 6 places.',
          'Tes assistants déjà en poste restent à la première pension et à la première place du Musée.',
          'Tu choisis la pension où déposer un couple en cliquant sur la pension libre voulue. Les œufs, fossiles et Pokémon à soigner prennent la première place libre.',
        ],
      },
      {
        section: 'Expéditions',
        items: [
          'Chaque zone affiche deux barres de progression : les Pokémon de la zone que tu as capturés, et ceux que tu as capturés en shiny (par exemple 7 / 8).',
          'Au survol d’une expédition en cours, son taux de shiny est de nouveau affiché, avec la chaîne et le Charme Chroma.',
          'Avant de partir dans la zone d’un fuyard, il apparaît parmi les rencontres possibles avec sa chance de capture. Son pourcentage est sa part de chaque rencontre : les autres Pokémon se partagent le reste, le total fait 100 %. Ses chances de le croiser sur toute l’expédition restent indiquées dans l’encadré au-dessus.',
        ],
      },
      {
        section: 'Combats',
        items: [
          'Le décor des combats de dresseurs et des donjons montre la météo : soleil éclatant, pluie, tempête de sable ou grêle. Par temps clair, rien ne change.',
          'Quand un talent impose sa météo (Sable Volant, Sécheresse…), le combat s’ouvre sur la météo du lieu, puis une annonce montre quel Pokémon la change, et le décor bascule. C’est cette météo-là qui compte pour tout le combat.',
        ],
      },
      {
        section: 'Recherche',
        items: [
          'Les recherches ne tiennent plus compte des accents : « evoli » trouve Évoli, au PC, dans les choix d’équipe, à la Pension, dans le Wiki ou parmi les dresseurs.',
          'À la Pension, la recherche se vide une fois le premier parent choisi, pour voir tous ses partenaires possibles.',
        ],
      },
      {
        section: 'PC',
        items: [
          'Dans la fiche d’un Pokémon, le bouton « Objet » ouvre la liste des objets du sac utilisables sur lui (Capsules, Aromates, Pilule et Patch Talent), au lieu de tout afficher dans la fiche.',
          'La description du talent ne s’affiche plus en permanence dans la fiche : survole son nom (souligné en pointillés) pour la voir.',
        ],
      },
    ],
  },
  {
    date: '23 octobre 2026',
    title: 'Centre Pokémon, Pokémon fuyards, talents mieux affichés et formes au Pokédex',
    changes: [
      {
        section: 'Pokémon fuyards',
        items: [
          'Raikou, Entei et Suicune sont désormais des fuyards : une fois la récompense de leur quête réclamée, plus d’expédition légendaire, ils se cachent dans une zone d’expédition de Johto et en changent à chaque heure.',
          'Un petit logo du fuyard apparaît sur la zone où il se trouve. Pendant une expédition dans cette zone, chaque rencontre a une petite chance d’être lui (une fois au plus), et une Ball lui est toujours lancée s’il t’en reste, quel que soit ton filtre de capture.',
          'L’expédition lancée dans sa zone l’emmène avec elle : il n’apparaît plus nulle part tant qu’elle n’est pas récupérée. Si tu ne l’as pas croisé, il reste dans la même zone jusqu’à l’heure suivante ; si tu l’as croisé sans le capturer, il fuit aussitôt vers une autre zone (et en repart quand même à l’heure pile). Ces expéditions ne peuvent pas être relancées.',
          'Trois nouvelles quêtes à Kanto, après celle de Mewtwo : Artikodin, Électhor et Sulfura de Galar, eux aussi des fuyards, dans les zones de Kanto.',
          'Depuis les Quêtes, le bouton « Le traquer » mène directement à la zone où se cache le fuyard.',
          'Une expédition partie dans la zone d’un fuyard affiche « Sur la piste de… » tant qu’elle est en cours.',
        ],
      },
      {
        section: 'Centre Pokémon',
        items: [
          'Nouveau bâtiment dans le menu, juste au-dessus de la Pension : le Centre Pokémon soigne jusqu’à 6 Pokémon à la fois, en 30 minutes.',
          'Un Pokémon mis K.O. en combat ou en donjon ne se repose plus tout seul : il reste K.O. jusqu’à ce que tu le confies au Centre. Depuis sa fiche au PC, un bouton l’y envoie directement s’il reste de la place.',
          'À la fin d’un combat ou d’un donjon, un bouton envoie directement tes Pokémon K.O. au Centre (les plus forts d’abord s’il manque de la place).',
          'Une pastille sur l’onglet du Centre indique combien de Pokémon K.O. attendent leurs soins, tant qu’il reste de la place.',
          'Les Pokémon qui étaient en plein repos au moment de la mise à jour sont eux aussi K.O. : confie-les au Centre.',
          'Les talents qui réduisaient la durée de K.O. (Médic Nature, Attention, Tempo Perso, Mue) raccourcissent maintenant les soins de leur porteur au Centre.',
          'Le Centre a aussi son poste d’assistant : un Pokémon au talent Cœur Soin y accélère les soins de tous les patients.',
          'Nouvel objet : le Rappel ranime aussitôt un Pokémon K.O., sans passer par le Centre. En vente à la Boutique (rayon Soins, 2 000 ₽) dès ton 4e badge de Kanto. Utilise-le depuis le Sac, ou depuis la fiche d’un Pokémon K.O. au PC.',
        ],
      },
      {
        section: 'Talents',
        items: [
          'Face à un légendaire, la chance de capture affichée tient compte des talents de ton équipe (Pression…) et de tes bonus de collection, et les talents actifs sont listés.',
          'Avant une expédition, la chance de capture de chaque Pokémon tient aussi compte de tes bonus de collection.',
          'Le bouton « Relancer » emporte autant de Balls que la nouvelle expédition aura de rencontres, talents compris, si tu en avais pris le maximum.',
          'Au survol d’une expédition en cours, sa météo au départ est indiquée : c’est elle qui active les talents comme Glissade, même si la météo de la zone a changé depuis.',
          'Seuls les effets utiles sont affichés : ceux de la Pension pour un parent ou l’assistant de la Pension, ceux de l’activité en cours au PC pour un Pokémon occupé, ceux du combat pendant un combat. Au choix de l’équipe, survole le talent d’un Pokémon pour voir ce qu’il fera.',
        ],
      },
      {
        section: 'Pension',
        items: [
          'Le talent des parents et ses effets sur la ponte sont affichés, à la Pension comme au moment de les déposer.',
          'La chance d’obtenir un œuf shiny est affichée pour le couple en pension, avec les bonus qui s’appliquent (Masuda, Charme Chroma) ; l’assistant de la Pension est compté s’il est en poste.',
        ],
      },
      {
        section: 'Choix de l’équipe',
        items: [
          'Nouveau filtre « ♥ Favoris » dans les expéditions, les combats et les donjons.',
          'Le filtre « Talent actif » arrive dans les donjons.',
        ],
      },
      {
        section: 'Pokédex et classements',
        items: [
          'Le compteur du Pokédex compte maintenant aussi les formes (régionales, Méga-Évolutions…), dans le Pokédex normal comme dans le Pokédex shiny.',
          'Les classements « Pokémon capturés » et « Chromatiques » comptent eux aussi les formes.',
        ],
      },
      {
        section: 'Wiki',
        items: [
          'Les faiblesses et résistances d’un Pokémon reprennent la règle du jeu : une immunité divise les dégâts par 4 au lieu de les annuler.',
        ],
      },
    ],
  },
  {
    date: '21 octobre 2026',
    title: 'Talents, combats en temps réel, météo et wiki',
    changes: [
      {
        section: 'Talents',
        items: [
          'Les talents des Pokémon ont désormais de vrais effets, proches de ceux des jeux : plus d’XP ou de Poké Dollars, rencontres plus nombreuses, meilleure chance de capture ou de shiny, statistiques renforcées, dégâts augmentés ou réduits, immunités, statuts infligés, météo déclenchée…',
          'Certains talents n’agissent que dans certaines conditions : en tête d’équipe, selon l’heure, la météo, le type de la zone, les PV restants du Pokémon…',
          'Au PC, la fiche d’un Pokémon résume l’effet de son talent, et sa puissance en tient compte.',
          'Au choix de l’équipe d’une expédition, les talents qui agiront sont listés, et le filtre « Talent actif » n’affiche que les Pokémon dont le talent servira dans cette zone. Survole une expédition en cours pour revoir ses talents actifs.',
          'L’XP prévue, les durées et les chances affichées avant un départ tiennent compte des talents de ton équipe.',
        ],
      },
      {
        section: 'Assistants',
        items: [
          'Nouveaux postes d’assistant à la Pension, à la couveuse et au Musée : place un Pokémon pour faire profiter le bâtiment de son talent (ponte plus rapide, éclosion accélérée avec Corps Ardent, restauration des fossiles…). Il reste occupé tant qu’il y travaille, et tu peux le libérer à tout moment.',
          'Les talents des parents comptent aussi à la Pension : vitesse de ponte, IV transmis, chance de talent caché…',
        ],
      },
      {
        section: 'Combats de dresseurs',
        items: [
          'Les combats de dresseurs se jouent maintenant en temps réel, comme les donjons : envoie tes Pokémon un par un, choisis leur attaque et bats toute l’équipe adverse avant la fin du temps imparti.',
          'Un seul combat de dresseur à la fois, indépendamment du donjon en cours : il n’y a plus d’emplacements de combat à débloquer.',
          'Un dresseur répétable se repose un moment après chaque combat ; un dresseur unique (Champion d’arène, Conseil 4, Maître) peut être retenté aussitôt après une défaite.',
          'La page des combats est refaite : les Champions d’arène, le Conseil 4 et le Maître de la Ligue ont chacun leur grande carte, en fin de liste.',
          'Le combat a lieu sous la météo de la zone où se trouve le dresseur.',
        ],
      },
      {
        section: 'Combats et donjons',
        items: [
          'Nouveaux coups critiques, qui infligent plus de dégâts.',
          'Les statuts arrivent en combat : paralysie, brûlure, poison, sommeil et gel, affichés au-dessus du Pokémon touché.',
          'Les hausses et baisses de statistiques (Intimidation…) s’affichent sous chaque combattant, et son talent est expliqué au survol.',
          'Les Pokémon adverses ont eux aussi leur talent.',
          'La météo compte : le soleil renforce le Feu et affaiblit l’Eau, la pluie fait l’inverse, et la tempête de sable et la grêle blessent les Pokémon qui n’y résistent pas. Certains donjons ont leur propre météo.',
          'Un Pokémon rappelé doit attendre quelques secondes avant de revenir au combat.',
        ],
      },
      {
        section: 'Météo',
        items: [
          'La météo des zones d’expédition change désormais au fil des heures : à chaque heure pile, elle a une chance de changer, et elle est la même pour tous les dresseurs. Survole l’icône de météo d’une zone pour voir les météos possibles et l’heure du prochain changement.',
          'La météo au départ d’une expédition peut activer certains talents (Chlorophylle sous le soleil, Glissade sous la pluie…).',
        ],
      },
      {
        section: 'Wiki',
        items: [
          'Nouveau lien « Wiki » en haut de l’écran (en bas du menu sur mobile) : la fiche de chaque Pokémon et de ses formes avec les endroits où le trouver, la liste des talents et de leurs effets, et un tutoriel pour bien débuter.',
        ],
      },
      {
        section: 'Profils secondaires (bêta)',
        items: [
          'Pendant la bêta, tu peux lancer une nouvelle partie sans créer de nouveau compte : dans Réglages, « Créer un profil secondaire ». Ces profils portent le préfixe « Alt » suivi de ton pseudo (Alt1_Sacha…), jusqu’à 3 par compte, et tu passes de l’un à l’autre depuis les Réglages.',
          'Les profils secondaires pourront être supprimés à la fin de la bêta.',
        ],
      },
    ],
  },
  {
    date: '17 octobre 2026',
    title: 'Fiches des autres dresseurs et légendaires protégés',
    changes: [
      {
        section: 'Fiche Dresseur',
        items: [
          'Clique sur le nom d’un dresseur dans les classements pour voir sa fiche : badges, statistiques et Pokémon mis en avant.',
          'Cherche n’importe quel dresseur par son nom depuis ta Fiche Dresseur.',
          'Sur la fiche d’un autre dresseur, le bouton « Voir son Pokédex » affiche toutes ses captures, normales et shiny.',
          'Mets en avant jusqu’à 6 Pokémon de ton PC sur ta fiche (bouton « Modifier ») : les autres dresseurs les verront. Un Pokémon transféré quitte la vitrine.',
        ],
      },
      {
        section: 'PC',
        items: [
          'Les Pokémon légendaires et fabuleux ne peuvent plus être transférés : ils ne sont jamais proposés parmi les doublons et le bouton « Transférer » ne leur est plus accessible.',
        ],
      },
      {
        section: 'Donjons',
        items: [
          'Les immunités ne bloquent plus tout : en donjon, une attaque sans effet divise ses dégâts par 4 au lieu de n’en faire aucun. La fiche du boss en tient compte (×¼, ×⅛…).',
          'Une fois fermé, le résultat d’un donjon ne réapparaît plus sur tes autres appareils.',
        ],
      },
      {
        section: 'Équipes',
        items: [
          'Au choix de l’équipe, un Pokémon que tu sélectionnes ne saute plus en haut de la liste : les Pokémon choisis passent en tête dès que tu changes de tri ou de filtre.',
        ],
      },
      {
        section: 'Pension',
        items: ['À l’éclosion des œufs, le bouton « Favori » répond de nouveau du premier coup.'],
      },
    ],
  },
  {
    date: '16 octobre 2026',
    title: 'Aperçu de l’XP, fiche du boss et filtre des doublons',
    changes: [
      {
        section: 'XP',
        items: [
          'Avant de lancer une expédition, un combat ou un donjon, l’XP que gagnera chaque Pokémon s’affiche, avec le niveau qu’il atteindra : une moyenne pour les expéditions, la victoire et la défaite pour les combats, le maximum (tous les adversaires vaincus) pour les donjons.',
        ],
      },
      {
        section: 'Donjons',
        items: [
          'Nouvel onglet « Tous » qui regroupe les donjons de toutes tes régions. Les donjons sont désormais toujours rangés du plus facile au plus difficile.',
          'Survole le boss (ou touche-le sur mobile) pour voir sa fiche : statistiques, faiblesses et résistances, et l’attaque qu’il utilise.',
          'Au choix de l’équipe, trie tes Pokémon par statistique (Attaque, Vitesse…) et survole-les pour voir toutes leurs statistiques.',
          'Quand tu envoies un Pokémon au combat, il entre aussitôt, sans petit temps de latence.',
        ],
      },
      {
        section: 'Équipes',
        items: [
          'Au choix de l’équipe, les Pokémon sélectionnés restent en tête de la liste, dans leur ordre de passage, quel que soit le tri.',
        ],
      },
      {
        section: 'Expéditions',
        items: [
          'Sur la fiche d’une zone, les Pokémon dont tu as capturé la version shiny s’affichent en shiny, avec quelques étoiles.',
          'Lors de la rencontre d’un légendaire, la chance de capture affichée tient bien compte des types de ton équipe.',
        ],
      },
      {
        section: 'PC',
        items: [
          'Nouveau bouton ⚙ à côté de « Sélectionner les doublons » pour régler le filtre : garder le meilleur de chaque Pokémon ou de chaque lignée, nombre d’IV parfaits à partir duquel un doublon est gardé, et étiquettes dont les Pokémon peuvent être proposés. Tes réglages sont retenus.',
        ],
      },
      {
        section: 'Accueil et fiche dresseur',
        items: [
          'Sur l’accueil, les expéditions et les combats indiquent combien d’emplacements sont occupés.',
          'Sur la fiche dresseur, « Donjons réussis » compte désormais toutes tes victoires en donjon, et non plus seulement les donjons différents.',
        ],
      },
    ],
  },
  {
    date: '15 octobre 2026',
    title: 'Donjons, Méga-Évolutions et équipes enregistrées',
    changes: [
      {
        section: 'Donjons',
        items: [
          'Nouvel onglet « Donjons » : chaque Pokémon capable de méga-évoluer a son donjon, rangé par région. Un donjon apparaît dès que tu captures un membre de sa lignée, et s’ouvre quand tu as capturé toute la lignée (par exemple Salamèche, Reptincel et Dracaufeu).',
          'Dans un donjon, tu combats en temps réel une suite de Pokémon de la lignée, jusqu’au boss : la Méga-Évolution elle-même. Un seul Pokémon de chaque camp combat à la fois, et chacun attaque à son rythme selon sa Vitesse. Les faiblesses et résistances comptent.',
          'Avant d’entrer, choisis ton équipe, son ordre d’entrée et l’attaque de chaque Pokémon : un de ses types, en physique ou en spécial. Ton choix est retenu pour la prochaine fois.',
          'Pendant le combat, clique sur un Pokémon de ton équipe pour l’envoyer au combat. Quand ton Pokémon est K.O., le suivant prend le relais. Le combat s’affiche dans sa propre fenêtre : ferme-la pour revenir à la liste, il continue de tourner (même si tu quittes la page) et un bouton en haut de la liste permet de le réafficher, puis d’en voir le résultat une fois terminé.',
          'Bats le boss avant la fin du temps imparti pour gagner des Poké Dollars, avec une chance sur dix de remporter sa Méga-Gemme. Chaque adversaire vaincu rapporte de l’XP à toute l’équipe, même en cas de défaite. Le bouton « Fuir » arrête tout, sans récompense.',
          'Chaque donjon a sa difficulté, affichée sur sa fiche : Facile pour un Pokémon seul dans sa lignée, Difficile pour un Pokémon évolué, Très difficile pour un starter, Extrême pour un légendaire. Le boss t’attend au niveau 50, 65, 80 ou 95 selon la difficulté : prépare ton équipe en conséquence !',
          'Les Pokémon mis K.O. dans un donjon doivent se reposer, et un donjon se referme un moment après chaque tentative.',
        ],
      },
      {
        section: 'Méga-Évolution',
        items: [
          'Au PC, la fiche d’un Pokémon capable de méga-évoluer affiche ses Méga-Évolutions et la Méga-Gemme requise. Si tu l’as dans ton sac, le bouton « Méga-Évoluer » lui fait tenir la gemme et le transforme : nouvelles statistiques, nouveaux types, nouveau talent.',
          'Ta première Méga-Évolution d’une espèce l’ajoute au Pokédex, et elle y reste même si ton Pokémon redevient normal.',
          'Pour le rendre normal, retire-lui sa Méga-Gemme au même endroit : elle revient dans ton sac. Avec plusieurs exemplaires d’une gemme, tu peux méga-évoluer plusieurs Pokémon de la même espèce.',
          'Un seul Pokémon méga-évolué par équipe, en expédition, en combat comme en donjon : dès que tu en choisis un, les autres sont grisés.',
          'Un Pokémon méga-évolué ne peut ni évoluer ni aller à la pension. Si tu le transfères, sa Méga-Gemme revient dans ton sac.',
        ],
      },
      {
        section: 'Sac',
        items: ['Nouvelle catégorie « Méga-Gemmes » pour ranger les gemmes remportées.'],
      },
      {
        section: 'Équipes',
        items: [
          'Nouvel onglet « Équipe Pkmn » : compose et enregistre tes équipes à partir de ton PC, avec tous ses filtres (région, type, étiquettes, favoris, shiny…). Touche un Pokémon pour l’ajouter à l’équipe en cours, et règle son ordre de passage.',
          'Un même Pokémon ne peut faire partie que d’une seule équipe à la fois : ceux déjà rangés ailleurs sont grisés, avec le nom de leur équipe.',
          'Au départ d’une expédition, d’un combat ou d’un donjon, choisis une équipe enregistrée d’un clic. Seuls ses membres disponibles partent : ceux qui sont occupés, K.O. ou hors du Pokédex de la région restent au PC.',
        ],
      },
      {
        section: 'Menu',
        items: [
          'Sur ordinateur, les onglets passent dans une barre latérale à gauche, rangés par groupes.',
          'Sur mobile, le menu s’ouvre avec le bouton ☰ en haut de l’écran. Un point sur ce bouton te signale qu’une action t’attend (expédition terminée, récompense à réclamer…). Ton nom de dresseur et tes Poké Dollars restent toujours visibles.',
        ],
      },
    ],
  },
  {
    date: '14 octobre 2026',
    title: 'Relance express et Pokédex relié aux expéditions',
    changes: [
      {
        section: 'Expéditions',
        items: [
          'Quand tu filtres les captures, l’option shiny « Toujours tenter » est désormais choisie par défaut : un shiny est tenté même s’il ne correspond pas à tes autres critères (espèces, IV, nouveaux Pokémon).',
          'Nouveau bouton « Relancer » dans le récapitulatif d’une expédition : elle repart aussitôt avec la même équipe, la même durée, les mêmes Balls, baie et filtres. Pratique pour faire grimper une chaîne. Un avertissement s’affiche s’il ne te reste pas assez de Balls ou de baies.',
          'Au choix de l’équipe, les types requis par la zone s’affichent : un clic sur l’un d’eux n’affiche que les Pokémon de ce type.',
          '« Tout afficher » dévoile bien tout le récapitulatif d’un coup et t’amène directement au butin et aux boutons. Même correction pour les combats et les éclosions.',
        ],
      },
      {
        section: 'Pokédex',
        items: [
          'La fiche d’un Pokémon vu ou capturé indique les expéditions où il se trouve. Un clic sur l’une d’elles ouvre directement l’envoi d’une équipe, si un emplacement est libre.',
        ],
      },
      {
        section: 'Boutique',
        items: [
          'Chaque article indique entre parenthèses, à côté de son nom, combien tu en as déjà dans ton sac.',
        ],
      },
      {
        section: 'Incubateur',
        items: [
          'Nouveau bouton « Tout transférer » à l’éclosion des œufs pour transférer d’un coup tous les Pokémon éclos (favoris exclus, après confirmation).',
        ],
      },
      {
        section: 'PC',
        items: ['La bulle des IV ne reste plus affichée après un clic sur un Pokémon.'],
      },
    ],
  },
  {
    date: '13 octobre 2026',
    title: 'Chasse aux légendaires shiny et expéditions favorites',
    changes: [
      {
        section: 'Expéditions légendaires',
        items: [
          'La Ball et la baie se choisissent au retour de l’expédition, une fois le légendaire découvert : tu vois tout de suite s’il est shiny.',
          'Pas shiny ? Prends la fuite (ton équipe ne gagne alors pas d’XP) et relance l’expédition depuis les Quêtes : la chaîne shiny fonctionne aussi pour les légendaires et augmente tes chances à chaque relance.',
          'Un légendaire a toujours 3 IV parfaits, quelle que soit la chaîne.',
          'La chaîne en cours et le délai pour relancer sont affichés sur la carte de la quête.',
        ],
      },
      {
        section: 'Expéditions',
        items: [
          'Mets tes zones préférées en favori avec l’étoile : elles apparaissent en tête de page, dans une section « Favoris ».',
          'Survole une expédition en cours pour voir son résumé : équipe, Balls, baies et filtres de capture.',
        ],
      },
      {
        section: 'PC',
        items: [
          'Ajoute ou retire un favori directement depuis la liste, avec le cœur de chaque Pokémon.',
          'Nouveau filtre par type.',
          'Bouton « Max » pour donner autant de Bonbons que possible, avec un aperçu de l’XP gagnée et du niveau atteint.',
          'À l’évolution, le Pokémon évolué apparaît comme dans le Pokédex : en ombre s’il n’a jamais été vu, grisé s’il a été vu, en couleur s’il a déjà été capturé.',
          'Transfère un Pokémon dès son éclosion, sa restauration au Musée ou sa capture, sans passer par le PC.',
        ],
      },
      {
        section: 'Pokédex',
        items: [
          'Pokédex shiny : un Pokémon reste en ombre tant que tu n’as pas croisé sa version shiny.',
        ],
      },
      {
        section: 'Boutique',
        items: [
          'Une Honor Ball offerte toutes les 10 Poké Balls achetées d’un coup (2 pour 20, etc.).',
        ],
      },
      {
        section: 'Carte de dresseur',
        items: ['Nouvelle statistique « Shiny ratés » : les shiny rencontrés mais pas capturés.'],
      },
    ],
  },
  {
    date: '12 octobre 2026',
    title: 'Expéditions légendaires et classement',
    changes: [
      {
        section: 'Quêtes',
        items: [
          'Les légendaires ne sont plus offerts directement : une fois la récompense de quête réclamée, pars à leur recherche avec une expédition légendaire, lancée depuis l’onglet Quêtes.',
          'Une seule Ball est lancée : choisis bien ta Ball, ta baie et une équipe en affinité (les faiblesses du légendaire). La chance de capture est affichée avant le départ.',
          'En cas d’échec, le légendaire s’enfuit et tu peux retenter autant de fois que nécessaire.',
        ],
      },
      {
        section: 'Classement',
        items: [
          'Nouvel onglet « Classement » : espèces capturées, fortune, badges et chromatiques.',
          'Les 50 meilleurs dresseurs sont affichés, et ton rang apparaît même si tu n’en fais pas partie.',
        ],
      },
      {
        section: 'PC',
        items: [
          'Nouveau filtre « Peut évoluer » : seuls les Pokémon pouvant évoluer vers une espèce ou forme absente du Pokédex sont affichés.',
          'Le tri choisi est conservé d’une visite à l’autre.',
          '« Sélectionner les doublons » ne tient compte que des Pokémon affichés (recherche et filtres en cours).',
          'Avertissement avant de transférer le dernier exemplaire d’une espèce.',
          'Un Pokémon évolué rapporte deux fois plus de Bonbons au transfert.',
        ],
      },
      {
        section: 'Expéditions et combats',
        items: [
          'Recherche par nom et filtre par type dans le choix de l’équipe.',
          'Au retour d’expédition, mets en favori ou étiquette un Pokémon capturé sans passer par le PC.',
          'Les Pokémon qui se sont enfuis sont mis en évidence en rouge.',
          'Les formes régionales déjà capturées apparaissent en couleur sur les cartes de zone.',
          'Les dresseurs sont rangés par onglet de région.',
        ],
      },
      {
        section: 'Confort',
        items: [
          'Le sexe des Pokémon est affiché à l’éclosion, à la Pension et au retour d’expédition.',
          'Survole un Pokémon dans la Pension pour voir ses IV.',
          '« Nouveau au Pokédex ! » s’affiche aussi pour les nouvelles formes (régionales, Méga…).',
          'Le Pokédex a des onglets de région, et l’onglet choisi est retenu dans le Pokédex, les Expéditions, les Combats et les Quêtes.',
          'Quand une nouvelle version du jeu est en ligne, un message propose de recharger la page.',
          'Correction de quelques bugs.',
        ],
      },
    ],
  },
  {
    date: '11 octobre 2026',
    title: 'PC plus pratique et IV en un coup d’œil',
    changes: [
      {
        section: 'PC',
        items: [
          'Le sexe des Pokémon est affiché sur leur carte.',
          'Le PC est trié par N° de Pokédex par défaut.',
          'La pastille « Évol. » n’apparaît plus si l’évolution est déjà dans ton Pokédex.',
          'Nouveau bouton « Transférer » dans la fiche d’un Pokémon pour le transférer seul.',
          '« Sélectionner les doublons » ignore désormais les Pokémon étiquetés, en plus des favoris.',
          'Avertissement avant de sélectionner des doublons ayant un IV parfait : tu choisis de les inclure ou de les exclure du transfert.',
        ],
      },
      {
        section: 'Expéditions',
        items: [
          'Sur les cartes de zone, seuls les Pokémon déjà capturés sont en couleur : ceux que tu as seulement vus sont grisés.',
          'Au retour d’expédition, survole un Pokémon capturé pour voir ses IV.',
        ],
      },
      {
        section: 'Pension et Musée',
        items: [
          'Survole un Pokémon à l’éclosion d’un œuf ou à la restauration d’un fossile pour voir ses IV.',
        ],
      },
    ],
  },
  {
    date: '10 octobre 2026',
    title: 'Revente d’objets, Pension plus pratique et chaînes renforcées',
    changes: [
      {
        section: 'Expéditions',
        items: [
          'Les chaînes de zone garantissent désormais des IV parfaits aux Pokémon sauvages : 1 IV à 31 dès 5 maillons, 2 à 10, 3 à 15 et 4 à 20.',
          'Les IV garantis par la chaîne en cours sont affichés sur la zone et au lancement de l’expédition.',
          'Nouveau filtre de capture « Nouveaux Pokémon uniquement » : seuls les Pokémon absents du Pokédex sont tentés, jusqu’à en capturer un de chaque.',
        ],
      },
      {
        section: 'Pension',
        items: [
          'Recherche, filtres (sexe, groupe d’œufs, étiquette, shiny) et tri dans la fenêtre de dépôt.',
          'Une fois le premier parent choisi, seuls ses partenaires compatibles sont proposés.',
          'Étiquettes et groupes d’œufs affichés sur les Pokémon de la fenêtre de dépôt.',
          'Mise en favori et étiquettes directement depuis l’écran d’éclosion.',
        ],
      },
      {
        section: 'Boutique',
        items: [
          'Nouvel onglet « Vendre » : revends les objets de ton sac contre des Poké Dollars, en général à la moitié de leur prix d’achat.',
          'Certains objets précieux, comme le Charme Chroma, ne se revendent pas.',
        ],
      },
    ],
  },
  {
    date: '9 octobre 2026',
    title: 'Expéditions plus pratiques et étiquettes',
    changes: [
      {
        section: 'Expéditions',
        items: [
          'Filtre de capture : choisis les espèces, les IV à 31 ou les shinies à attraper. Les rencontres hors filtre sont ignorées sans dépenser de Ball ni de baie.',
          'Choix du nombre de Balls emportées.',
          'Balls et baies triées du plus faible au plus fort multiplicateur : la Ball proposée par défaut reste la plus courante.',
          'Tri de l’équipe par PE, affinité ou niveau, et contour lumineux pour les Pokémon en affinité avec la zone.',
          'Annulation d’une expédition ou d’un combat en cours : la réserve emportée est rendue.',
          'Les rencontres s’affichent plus vite au retour des longues expéditions.',
        ],
      },
      {
        section: 'Étiquettes',
        items: [
          'Crée tes propres étiquettes (10 caractères au plus, couleur au choix) depuis le PC.',
          'Attribue une ou plusieurs étiquettes à un Pokémon depuis sa fiche.',
          'Filtre et tri par étiquette dans le PC et au départ des expéditions et des combats.',
        ],
      },
      {
        section: 'Combats',
        items: ['Tri de l’équipe par PE, niveau ou étiquette dans la fenêtre de combat.'],
      },
    ],
  },
];
