import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createBrowserRouter } from 'react-router';
import { AdminGate } from './components/AdminGate';
import { Layout } from './components/Layout';
import { AuditLogPage } from './pages/AuditLogPage';
import { DashboardPage } from './pages/DashboardPage';
import { ExpeditionSimulatorPage } from './pages/ExpeditionSimulatorPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { PlayersPage } from './pages/PlayersPage';
import { PowerCalculatorPage } from './pages/PowerCalculatorPage';
import { TelemetryPage } from './pages/TelemetryPage';
import { AbilitiesPage } from './pages/content/AbilitiesPage';
import { BalancePage } from './pages/content/BalancePage';
import { DungeonsPage } from './pages/content/DungeonsPage';
import { EvolutionsPage } from './pages/content/EvolutionsPage';
import { ItemsPage } from './pages/content/ItemsPage';
import { LootTablesPage } from './pages/content/LootTablesPage';
import { MenuPage } from './pages/content/MenuPage';
import { ProgressionPage } from './pages/content/ProgressionPage';
import { QuestsPage } from './pages/content/QuestsPage';
import { RegionsPage } from './pages/content/RegionsPage';
import { ShopPage } from './pages/content/ShopPage';
import { GuildsPage } from './pages/content/GuildsPage';
import { SpeciesPage } from './pages/content/SpeciesPage';
import { TrainersPage } from './pages/content/TrainersPage';
import { ZonesPage } from './pages/content/ZonesPage';
import { CURRENT_PHASE, SECTIONS } from './sections';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

const router = createBrowserRouter([
  {
    element: <AdminGate />,
    children: [
      {
        element: <Layout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'audit-log', element: <AuditLogPage /> },
          { path: 'balance', element: <BalancePage /> },
          { path: 'regions', element: <RegionsPage /> },
          { path: 'species', element: <SpeciesPage /> },
          { path: 'zones', element: <ZonesPage /> },
          { path: 'expedition-simulator', element: <ExpeditionSimulatorPage /> },
          { path: 'power-calculator', element: <PowerCalculatorPage /> },
          { path: 'trainers', element: <TrainersPage /> },
          { path: 'dungeons', element: <DungeonsPage /> },
          { path: 'abilities', element: <AbilitiesPage /> },
          { path: 'items', element: <ItemsPage /> },
          { path: 'loot-tables', element: <LootTablesPage /> },
          { path: 'shop', element: <ShopPage /> },
          { path: 'guilds', element: <GuildsPage /> },
          { path: 'evolutions', element: <EvolutionsPage /> },
          { path: 'progression', element: <ProgressionPage /> },
          { path: 'quests', element: <QuestsPage /> },
          { path: 'telemetry', element: <TelemetryPage /> },
          { path: 'players', element: <PlayersPage /> },
          { path: 'menu', element: <MenuPage /> },
          ...SECTIONS.filter((s) => s.phase > CURRENT_PHASE).map((section) => ({
            path: section.path.slice(1),
            element: <PlaceholderPage section={section} />,
          })),
        ],
      },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
