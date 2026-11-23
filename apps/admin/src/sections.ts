/**
 * Le menu de l'admin : le tableau de bord, puis les pages rangées par catégorie (une section
 * repliable du menu par catégorie). `routes.tsx` associe une page à chaque chemin.
 */

/** Une page du menu. */
export interface AdminSection {
  path: string;
  label: string;
  /** Ce qu'on y règle : affiché au survol du lien. */
  description: string;
}

/** Une catégorie du menu et ses pages, dans l'ordre. */
export interface AdminSectionGroup {
  title: string;
  sections: AdminSection[];
}

/** Le tableau de bord, toujours visible en tête du menu (hors catégorie). */
export const DASHBOARD: AdminSection = {
  path: '/',
  label: 'Tableau de bord',
  description: 'Versions de contenu, brouillon en cours, alertes de cohérence.',
};

/** Les catégories du menu, dans l'ordre. */
export const SECTION_GROUPS: AdminSectionGroup[] = [
  {
    title: 'Monde',
    sections: [
      {
        path: '/regions',
        label: 'Régions',
        description: 'Ordre, nom, image, espèces incluses, condition de déblocage.',
      },
      {
        path: '/zones',
        label: 'Zones d’expédition',
        description: 'Accès, durées, rencontres, butin, affinités.',
      },
      {
        path: '/zone-species',
        label: 'Espèces par zone',
        description:
          'Grille espèces × zones d’une région : première apparition, doublons, absentes ; ajout et retrait de rencontres.',
      },
      {
        path: '/trainers',
        label: 'Dresseurs',
        description: 'Équipe, PE, conditions, récompenses, badges, rejouabilité.',
      },
      {
        path: '/dungeons',
        label: 'Donjons',
        description:
          'Méga-Évolutions : lignée, adversaires, boss, temps imparti, Méga-Gemme ; réglages de combat.',
      },
    ],
  },
  {
    title: 'Pokémon',
    sections: [
      {
        path: '/species',
        label: 'Espèces',
        description: 'Base PokéAPI en lecture seule et surcharges.',
      },
      {
        path: '/evolutions',
        label: 'Évolutions',
        description: 'Surcharge des conditions d’évolution PokéAPI.',
      },
      {
        path: '/abilities',
        label: 'Talents',
        description: 'Talents, talents cachés, Pokémon qui les possèdent et effets.',
      },
    ],
  },
  {
    title: 'Objets et économie',
    sections: [
      {
        path: '/items',
        label: 'Objets',
        description: 'Catalogue PokéAPI et objets maison, effets.',
      },
      {
        path: '/loot-tables',
        label: 'Tables de butin',
        description: 'Tables réutilisables partagées entre zones, quêtes et paliers.',
      },
      {
        path: '/shop',
        label: 'Boutique',
        description:
          'Catégories, articles, conditions d’apparition, limites, dates, aperçu joueur.',
      },
    ],
  },
  {
    title: 'Quêtes et progression',
    sections: [
      {
        path: '/quests',
        label: 'Quêtes',
        description: 'Chaînes, étapes, conditions et récompenses (légendaires).',
      },
      {
        path: '/guilds',
        label: 'Guildes',
        description:
          'Quêtes de guilde du jour et de la semaine (catalogue du tirage) et lots des coffres.',
      },
      {
        path: '/progression',
        label: 'Progression',
        description: 'Collections thématiques, complétion des expéditions et bâtiments.',
      },
    ],
  },
  {
    title: 'Réglages du jeu',
    sections: [
      {
        path: '/balance',
        label: 'Équilibrage',
        description:
          'Réglages globaux : expéditions, combats, capture, pitié, chromatiques, élevage, XP, pensions.',
      },
      {
        path: '/menu',
        label: 'Menu du jeu',
        description:
          'Ordre des onglets et groupes du menu, et condition de déblocage de chaque onglet.',
      },
      {
        path: '/bag',
        label: 'Sac du jeu',
        description:
          'Onglets du Sac, rubriques (catégories d’objets) qu’ils regroupent et leurs titres.',
      },
    ],
  },
  {
    title: 'Outils',
    sections: [
      {
        path: '/expedition-simulator',
        label: 'Simulateur d’expédition',
        description: 'Expédition instantanée avec les écrans du jeu, sur la version de travail.',
      },
      {
        path: '/power-calculator',
        label: 'Calculateur de PE',
        description:
          'Équipes de test, PE par zone et niveau requis pour équilibrer les expéditions.',
      },
      {
        path: '/docs',
        label: 'Documentation',
        description: 'Toute la documentation technique du dépôt au même endroit, avec recherche.',
      },
    ],
  },
  {
    title: 'Suivi',
    sections: [
      {
        path: '/players',
        label: 'Joueurs',
        description: 'Joueurs inscrits, présence et activité, fiche dresseur.',
      },
      {
        path: '/telemetry',
        label: 'Télémétrie',
        description: 'Temps de complétion, goulets (dresseurs, quêtes, zones), activité, économie.',
      },
      {
        path: '/api-health',
        label: 'Santé de l’API',
        description: 'Requêtes, erreurs 5xx, refus 429 et durées par route.',
      },
      {
        path: '/audit-log',
        label: 'Versions et journal',
        description: 'Historique des modifications d’administration.',
      },
    ],
  },
];

/** Toutes les pages du menu à plat, tableau de bord compris (tests de pages). */
export const SECTIONS: AdminSection[] = [DASHBOARD, ...SECTION_GROUPS.flatMap((g) => g.sections)];
