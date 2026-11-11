import { Suspense } from 'react';
import type { MeResponse, PlayerProfileDto } from '@poke/shared';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { BuildingsColumn } from '../features/pages';
import { WidgetsDialog } from '../features/buildings/WidgetsDialog';
import { BUILDING_TABS } from '../lib/widgets';
import { RoamerSightingNotice } from '../features/expeditions/RoamerSightingNotice';
import { FanDisclaimer, LegalLinks } from './LegalPages';
import { SettingsDialog } from './SettingsDialog';
import { useHomeShell } from './home/useHomeShell';
import { TabLinks } from './home/TabMenu';
import { DesktopHeader, MobileBar, MobileMenu } from './home/HomeHeader';
import { GameMain } from './home/GameMain';

/** Coquille du jeu : en-tête, onglets (synchronisés avec l'ancre de l'URL) et pied de page. */
export function HomePage(props: { me: MeResponse; profile: PlayerProfileDto }) {
  const h = useHomeShell(props);
  const {
    ctx,
    settingsOpen,
    setSettingsOpen,
    widgetsOpen,
    setWidgetsOpen,
    lockedTabs,
    progressLoaded,
    expeditions,
  } = h;
  return (
    <div className="pb-10">
      {/* Bureau : bandeau du dresseur sur toute la largeur. */}
      {/* Trois colonnes : infos du dresseur à gauche, titre centré sur la bannière, compte à
          droite. Les colonnes latérales font la même largeur (1fr) pour garder le titre au centre. */}
      <DesktopHeader h={h} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <WidgetsDialog
        open={widgetsOpen}
        onClose={() => setWidgetsOpen(false)}
        lockedTabs={lockedTabs}
      />
      <RoamerSightingNotice ctx={ctx} expeditions={expeditions.data?.active} />

      <div className="mx-auto max-w-[2200px] px-4 md:flex md:items-start md:gap-5 md:px-6 md:pt-5">
        <MobileBar h={h} />
        <MobileMenu h={h} />

        {/* Bureau : menu du jeu dans une fenêtre, fixe à gauche (façon menu START). `sticky` crée
            un contexte d'empilement : sans z-index, les infobulles des onglets verrouillés passent
            sous les fenêtres de la page (expéditions en cours…). */}
        <nav className="card sticky top-[calc(var(--hud-h,0px)+1rem)] z-20 hidden w-60 shrink-0 flex-col gap-0.5 p-2.5 md:flex">
          <TabLinks h={h} />
        </nav>

        <GameMain h={h} />

        {/* Grand écran : les bâtiments débloqués en version réduite, à droite. */}
        {ctx && progressLoaded && (
          <ErrorBoundary>
            <Suspense fallback={null}>
              <BuildingsColumn
                ctx={ctx}
                buildings={BUILDING_TABS.filter((id) => !lockedTabs.has(id))}
              />
            </Suspense>
          </ErrorBoundary>
        )}
      </div>

      <footer className="mt-12 space-y-2 px-4 text-center text-xs text-slate-600 dark:text-slate-400">
        <p>
          <FanDisclaimer /> Données : PokéAPI. Contenu v{ctx?.content.versionId ?? '…'}
        </p>
        <LegalLinks />
      </footer>
    </div>
  );
}
