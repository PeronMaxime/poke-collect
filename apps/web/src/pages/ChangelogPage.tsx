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

export function ChangelogPage() {
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
          <section key={release.date + release.title} className="space-y-3">
            <h2 className="text-base font-semibold">
              {release.title} <span className="font-normal text-slate-500">— {release.date}</span>
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
