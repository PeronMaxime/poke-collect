/** Phase de la roadmap en cours : les sections des phases suivantes sont des emplacements réservés. */
export const CURRENT_PHASE = 6;

/** Sections du panneau d'administration, dans l'ordre de PLAN.md (section 5.2). */
export interface AdminSection {
  path: string;
  label: string;
  description: string;
  /** Phase de la roadmap où la section devient fonctionnelle. */
  phase: number;
}

export const SECTIONS: AdminSection[] = [
  {
    path: '/',
    label: 'Tableau de bord',
    description: 'Versions de contenu, brouillon en cours, alertes de cohérence.',
    phase: 0,
  },
  {
    path: '/balance',
    label: 'Équilibrage',
    description:
      'Réglages globaux : expéditions, combats, capture, pitié, shiny, élevage, XP, pensions.',
    phase: 1,
  },
  {
    path: '/regions',
    label: 'Régions',
    description: 'Ordre, nom, image, espèces incluses, condition de déblocage.',
    phase: 1,
  },
  {
    path: '/species',
    label: 'Espèces',
    description: 'Base PokéAPI en lecture seule et surcharges.',
    phase: 1,
  },
  {
    path: '/evolutions',
    label: 'Évolutions',
    description: 'Surcharge des conditions d’évolution PokéAPI.',
    phase: 5,
  },
  {
    path: '/zones',
    label: 'Zones d’expédition',
    description: 'Accès, durées, rencontres, butin, affinités.',
    phase: 1,
  },
  {
    path: '/trainers',
    label: 'Dresseurs',
    description: 'Équipe, PE, conditions, récompenses, badges, rejouabilité.',
    phase: 3,
  },
  {
    path: '/items',
    label: 'Objets',
    description: 'Catalogue PokéAPI et objets maison, effets.',
    phase: 1,
  },
  {
    path: '/loot-tables',
    label: 'Tables de butin',
    description: 'Tables réutilisables partagées entre zones, quêtes et paliers.',
    phase: 1,
  },
  {
    path: '/shop',
    label: 'Boutique',
    description: 'Catégories, articles, conditions d’apparition, limites, dates, aperçu joueur.',
    phase: 4,
  },
  {
    path: '/quests',
    label: 'Quêtes',
    description: 'Chaînes, étapes, conditions et récompenses.',
    phase: 7,
  },
  {
    path: '/progression',
    label: 'Progression',
    description: 'Paliers du Pokédex et collections thématiques.',
    phase: 5,
  },
  {
    path: '/events',
    label: 'Événements',
    description: 'Périodes, zones temporaires, multiplicateurs.',
    phase: 8,
  },
  {
    path: '/players',
    label: 'Joueurs',
    description: 'Consultation de profil et outils de support.',
    phase: 8,
  },
  {
    path: '/audit-log',
    label: 'Versions et journal',
    description: 'Historique des modifications d’administration.',
    phase: 0,
  },
];
