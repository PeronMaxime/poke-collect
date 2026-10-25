import { useEffect } from 'react';
import { navigate } from './LegalPages';

/**
 * Page des nouveautés (changelog), lisible sans être connecté. Ajouter une entrée en tête de
 * `RELEASES` à chaque mise en production, en décrivant les changements du point de vue du joueur.
 */

export const CHANGELOG_PATH = '/nouveautes';

interface Release {
  /** Date de mise en production, en toutes lettres. */
  date: string;
  title: string;
  changes: { section: string; items: string[] }[];
}

const RELEASES: Release[] = [
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

/** Dernière mise à jour vue par le joueur sur cet appareil (date de l'entrée du haut). */
const SEEN_KEY = 'dexpedition.changelogSeen';
const LATEST = RELEASES[0]?.date;

/** Vrai tant que le joueur n'a pas ouvert la page depuis la dernière mise à jour. */
export function hasUnseenChangelog(): boolean {
  try {
    return !!LATEST && localStorage.getItem(SEEN_KEY) !== LATEST;
  } catch {
    return false;
  }
}

export function ChangelogPage() {
  useEffect(() => {
    try {
      if (LATEST) localStorage.setItem(SEEN_KEY, LATEST);
    } catch {
      // Stockage indisponible (navigation privée) : l'indicateur restera affiché.
    }
  }, []);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <a
        href="/"
        onClick={(e) => navigate(e, '/')}
        className="text-sm text-slate-500 hover:underline"
      >
        ← Retour au jeu
      </a>
      <article className="card mt-4 space-y-6 text-sm leading-relaxed">
        <h1 className="text-2xl font-bold">Nouveautés</h1>
        {RELEASES.map((release) => (
          <section
            key={release.date + release.title}
            className="space-y-3 border-t border-slate-200 pt-6 first-of-type:border-t-0 first-of-type:pt-0 dark:border-slate-800"
          >
            <h2 className="text-xl font-bold">
              {release.title}{' '}
              <span className="text-base font-normal text-slate-500">— {release.date}</span>
            </h2>
            {release.changes.map(({ section, items }) => (
              <div key={section}>
                <h3 className="font-medium">{section}</h3>
                <ul className="list-disc space-y-1 pl-5">
                  {items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))}
      </article>
    </main>
  );
}
