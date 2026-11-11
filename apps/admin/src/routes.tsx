import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router';
import { AdminGate } from './components/AdminGate';
import { Layout } from './components/Layout';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { CURRENT_PHASE, SECTIONS } from './sections';

/**
 * Chaque page, par chemin (`''` : le tableau de bord), chargée à la demande : son code n'est
 * téléchargé qu'à sa première visite, et le menu reste sur la page d'avant le temps du chargement.
 */
const PAGES: Record<string, () => Promise<ComponentType>> = {
  '': async () => (await import('./pages/DashboardPage')).DashboardPage,
  'audit-log': async () => (await import('./pages/AuditLogPage')).AuditLogPage,
  'api-health': async () => (await import('./pages/ApiHealthPage')).ApiHealthPage,
  balance: async () => (await import('./pages/content/BalancePage')).BalancePage,
  regions: async () => (await import('./pages/content/RegionsPage')).RegionsPage,
  species: async () => (await import('./pages/content/SpeciesPage')).SpeciesPage,
  zones: async () => (await import('./pages/content/ZonesPage')).ZonesPage,
  'expedition-simulator': async () =>
    (await import('./pages/ExpeditionSimulatorPage')).ExpeditionSimulatorPage,
  'power-calculator': async () => (await import('./pages/PowerCalculatorPage')).PowerCalculatorPage,
  trainers: async () => (await import('./pages/content/TrainersPage')).TrainersPage,
  dungeons: async () => (await import('./pages/content/DungeonsPage')).DungeonsPage,
  abilities: async () => (await import('./pages/content/AbilitiesPage')).AbilitiesPage,
  items: async () => (await import('./pages/content/ItemsPage')).ItemsPage,
  'loot-tables': async () => (await import('./pages/content/LootTablesPage')).LootTablesPage,
  shop: async () => (await import('./pages/content/ShopPage')).ShopPage,
  guilds: async () => (await import('./pages/content/GuildsPage')).GuildsPage,
  evolutions: async () => (await import('./pages/content/EvolutionsPage')).EvolutionsPage,
  progression: async () => (await import('./pages/content/ProgressionPage')).ProgressionPage,
  quests: async () => (await import('./pages/content/QuestsPage')).QuestsPage,
  telemetry: async () => (await import('./pages/TelemetryPage')).TelemetryPage,
  players: async () => (await import('./pages/PlayersPage')).PlayersPage,
  menu: async () => (await import('./pages/content/MenuPage')).MenuPage,
  bag: async () => (await import('./pages/content/BagPage')).BagPage,
};

/**
 * Pages de l'admin : tout passe par `AdminGate` (rôle vérifié par le serveur) puis `Layout` (menu).
 * Les sections des phases à venir de docs/plans/PLAN.md affichent un emplacement réservé.
 */
export const routes: RouteObject[] = [
  {
    element: <AdminGate />,
    // Affiché tant que la première page ouverte se télécharge.
    hydrateFallbackElement: <p className="p-8 text-slate-500">Chargement…</p>,
    children: [
      {
        element: <Layout />,
        children: [
          ...Object.entries(PAGES).map(([path, load]) => ({
            ...(path ? { path } : { index: true as const }),
            lazy: async () => ({ Component: await load() }),
          })),
          ...SECTIONS.filter((s) => s.phase > CURRENT_PHASE).map((section) => ({
            path: section.path.slice(1),
            element: <PlaceholderPage section={section} />,
          })),
        ],
      },
    ],
  },
];
