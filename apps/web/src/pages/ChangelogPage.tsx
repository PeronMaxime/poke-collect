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
