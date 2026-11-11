/**
 * Contenu de l'onglet affiché, chargé à son ouverture.
 */
import { Suspense } from 'react';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import {
  BattlesPage,
  CenterPage,
  DaycarePage,
  DungeonsPage,
  ExpeditionsPage,
  FarmPage,
  GuildPage,
  InventoryPage,
  LeaderboardPage,
  MuseumPage,
  PcPage,
  PokedexPage,
  QuestsPage,
  ShopPage,
  TeamsPage,
  TrainerCardPage,
  WikiPage,
} from '../../features/pages';
import { WIKI_HASH } from '../../features/wiki/wiki';
import { WINDOWED_TABS } from './menu';
import type { HomeModel } from './useHomeShell';

/** Page de l'onglet affiché ; une erreur dans un onglet n'emporte pas la navigation. */
export function GameMain({ h }: { h: HomeModel }) {
  const { profile, ctx, tab, progressLoaded, gated } = h;
  return (
    <main className="min-w-0 flex-1">
      {!ctx ? (
        <p className="text-slate-600 dark:text-slate-300">Chargement…</p>
      ) : (
        // Une erreur dans un onglet n'emporte pas la navigation ; changer d'onglet la réinitialise.
        <ErrorBoundary key={tab}>
          {gated && !progressLoaded ? (
            <p className="text-slate-600 dark:text-slate-300">Chargement…</p>
          ) : (
            // Les Expéditions et les bâtiments découpent leur page en fenêtres ; les autres
            // pages tiennent dans une. Le code de la page arrive à son ouverture.
            <Suspense fallback={<PageLoading />}>
              <div className={WINDOWED_TABS.has(tab) ? '' : 'card p-3 md:p-5'}>
                {tab === 'expeditions' && <ExpeditionsPage ctx={ctx} profile={profile} />}
                {tab === 'battles' && <BattlesPage ctx={ctx} />}
                {tab === 'dungeons' && <DungeonsPage ctx={ctx} />}
                {tab === 'center' && <CenterPage ctx={ctx} />}
                {tab === 'daycare' && <DaycarePage ctx={ctx} />}
                {tab === 'museum' && <MuseumPage ctx={ctx} />}
                {tab === 'farm' && <FarmPage ctx={ctx} />}
                {tab === 'quests' && <QuestsPage ctx={ctx} />}
                {tab === 'shop' && <ShopPage ctx={ctx} />}
                {tab === 'pc' && <PcPage ctx={ctx} />}
                {tab === 'teams' && <TeamsPage ctx={ctx} />}
                {tab === 'pokedex' && <PokedexPage ctx={ctx} />}
                {tab === 'bag' && <InventoryPage ctx={ctx} />}
                {tab === 'trainer' && <TrainerCardPage ctx={ctx} profile={profile} />}
                {tab === 'guild' && <GuildPage ctx={ctx} />}
                {tab === 'leaderboard' && <LeaderboardPage />}
                {tab === WIKI_HASH && <WikiPage ctx={ctx} />}
              </div>
            </Suspense>
          )}
        </ErrorBoundary>
      )}
    </main>
  );
}

/** Affiché le temps que le code d'une page arrive. */
function PageLoading() {
  return <p className="text-slate-600 dark:text-slate-300">Chargement…</p>;
}
