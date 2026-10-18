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
