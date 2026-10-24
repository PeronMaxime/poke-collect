import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { MeResponse, PlayerProfileDto } from '@poke/shared';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useNow } from '../components/ui';
import { authClient } from '../lib/auth-client';
import { MENU_TABS, normalizeMenuGroups } from '@poke/content';
import type { MenuTabId as TabId } from '@poke/content';
import { claimableRewardCount, eggsLaid } from '@poke/game-core';
import {
  centerState,
  isUsable,
  useBattles,
  useClaimedRewards,
  useDaycare,
  useDexCatches,
  useDungeons,
  useExpeditions,
  useFarm,
  useGameContext,
  useMuseum,
  useNewEvolutionChecker,
  usePokemon,
  useQuests,
  useShop,
} from '../lib/game';
import { formatMoney } from '../lib/labels';
import { BattlesPage } from './game/BattlesPage';
import { CenterPage } from './game/CenterPage';
import { DaycarePage } from './game/DaycarePage';
import { DungeonsPage } from './game/DungeonsPage';
import { ExpeditionsPage } from './game/ExpeditionsPage';
import { InventoryPage } from './game/InventoryPage';
import { LeaderboardPage } from './game/LeaderboardPage';
import { FarmPage } from './game/FarmPage';
import { MuseumPage } from './game/MuseumPage';
import { PcPage } from './game/PcPage';
import { PokedexPage } from './game/PokedexPage';
import { QuestsPage } from './game/QuestsPage';
import { ShopPage } from './game/ShopPage';
import { TeamsPage } from './game/TeamsPage';
import { TrainerCardPage } from './game/TrainerCardPage';
import { WikiPage } from './game/WikiPage';
import { WIKI_HASH, wikiLink } from './game/wiki';
import { CHANGELOG_PATH, hasUnseenChangelog } from './ChangelogPage';
import { FanDisclaimer, LegalLinks, navigate } from './LegalPages';
import { SettingsDialog } from './SettingsDialog';

const TAB_LABELS = Object.fromEntries(MENU_TABS.map((t) => [t.id, t.label])) as Record<
  TabId,
  string
>;

/** Onglet du menu, ou page du wiki (lien de l'en-tête). */
type PageId = TabId | typeof WIKI_HASH;

const PAGE_LABELS: Record<PageId, string> = { ...TAB_LABELS, [WIKI_HASH]: 'Wiki' };

function tabFromHash(): PageId {
  // `#expeditions/<zone>` : l'onglet, suivi d'une cible propre à la page.
  const hash = window.location.hash.slice(1).split('/')[0] ?? '';
  return hash in PAGE_LABELS ? (hash as PageId) : 'expeditions';
}

/** Coquille du jeu : en-tête, onglets (synchronisés avec l'ancre de l'URL) et pied de page. */
export function HomePage({ me, profile }: { me: MeResponse; profile: PlayerProfileDto }) {
  const queryClient = useQueryClient();
  const ctx = useGameContext();
  const [tab, setTab] = useState<PageId>(tabFromHash);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Groupes d'onglets réglés dans l'admin (Menu du jeu), séparés par un trait.
  const menuGroups = useMemo(() => normalizeMenuGroups(ctx?.content.balance.menu?.groups), [ctx]);
  const [unseenChangelog] = useState(hasUnseenChangelog);
  const expeditions = useExpeditions();
  const daycare = useDaycare();
  const museum = useMuseum();
  const farm = useFarm();
  const battles = useBattles();
  const dungeons = useDungeons();
  const shop = useShop();
  const quests = useQuests();
  const pokemon = usePokemon();
  const claimed = useClaimedRewards();
  const hasNewEvolution = useNewEvolutionChecker(ctx);

  useEffect(() => {
    const onHash = () => {
      setTab(tabFromHash());
      setMenuOpen(false);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const now = useNow(5000);
  const finished = expeditions.data?.active.filter((e) => Date.parse(e.endsAt) <= now).length ?? 0;
  const dexCatches = useDexCatches();
  const caught = dexCatches.caughtSpeciesIds.size;
  // Paliers et collections à réclamer, Pokémon disponibles prêts à évoluer vers une espèce
  // ou forme qui manque encore au Pokédex (même règle que la pastille « Évol. » du PC).
  const rewardsReady = ctx ? claimableRewardCount(ctx, dexCatches, claimed) : 0;
  const evolutionsReady =
    pokemon.data?.filter((p) => isUsable(p, now) && hasNewEvolution(p)).length ?? 0;
  const questsReady = quests.data?.quests.filter((q) => q.status === 'completed').length ?? 0;
  // Articles débloqués pas encore vus (évalués par le serveur à chaque chargement de la boutique).
  const shopNew = shop.data?.entries.filter((e) => e.isNew).length ?? 0;
  // Œufs à faire éclore + pensions où des œufs attendent d'être ramassés.
  const daycareReady =
    (daycare.data?.eggs.filter((e) => Date.parse(e.hatchAt) <= now).length ?? 0) +
    (ctx && daycare.data
      ? daycare.data.pensions.filter(
          (p) => eggsLaid(ctx, new Date(p.startedAt), new Date(now), p.eggMinutes) > 0,
        ).length
      : 0);

  const fossilsReady =
    museum.data?.revivals.filter((r) => Date.parse(r.readyAt) <= now).length ?? 0;
  const berriesReady =
    farm.data?.planted.filter((p) => p.readyAt && Date.parse(p.readyAt) <= now).length ?? 0;
  // Pokémon K.O. qui attendent leurs soins (comptés seulement s'il reste de la place).
  const center = ctx && pokemon.data ? centerState(ctx, pokemon.data, now) : null;
  const koWaiting = center && center.free > 0 ? center.knockedOut.length : 0;

  // Une action attend le joueur quelque part : point sur le bouton du menu mobile.
  const pending =
    finished +
      daycareReady +
      fossilsReady +
      berriesReady +
      koWaiting +
      questsReady +
      shopNew +
      rewardsReady +
      evolutionsReady >
      0 ||
    !!dungeons.data?.active ||
    !!battles.data?.active ||
    unseenChangelog;

  /** Liens des onglets, partagés par la barre latérale et le menu mobile. */
  function tabLinks() {
    return menuGroups.map((group, i) => (
      <div
        key={i}
        className={`flex flex-col gap-0.5 ${i > 0 ? 'mt-2 border-t border-slate-200 pt-2 dark:border-slate-800' : ''}`}
      >
        {group.map((id) => (
          <a
            key={id}
            href={`#${id}`}
            onClick={() => setMenuOpen(false)}
            className={`relative flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition md:py-2 ${
              tab === id
                ? 'bg-brand-500/10 text-brand-600 dark:text-brand-500'
                : 'text-slate-500 hover:bg-slate-200/60 hover:text-slate-900 dark:hover:bg-slate-800/60 dark:hover:text-slate-100'
            }`}
          >
            {TAB_LABELS[id]}
            {tabBadges(id)}
            {tab === id && (
              <span className="absolute inset-y-2 left-0 w-0.5 rounded bg-brand-500" />
            )}
          </a>
        ))}
      </div>
    ));
  }

  /** Pastilles d'un onglet (compteurs, objets à réclamer…). */
  function tabBadges(id: TabId) {
    return (
      <span className="ml-auto flex items-center">
        {id === 'expeditions' && expeditions.data && (
          <span className="ml-1.5 text-xs text-slate-400" title="Emplacements utilisés">
            {expeditions.data.active.length}/{expeditions.data.slots}
          </span>
        )}
        {id === 'expeditions' && finished > 0 && (
          <span className="ml-1.5 rounded-full bg-brand-500 px-1.5 text-xs text-white">
            {finished}
          </span>
        )}
        {id === 'battles' && battles.data?.active && (
          <span
            className="ml-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-brand-500"
            title="Combat en cours"
          />
        )}
        {id === 'dungeons' && dungeons.data?.active && (
          <span
            className="ml-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-brand-500"
            title="Donjon en cours"
          />
        )}
        {id === 'daycare' && daycareReady > 0 && (
          <span className="ml-1.5 rounded-full bg-brand-500 px-1.5 text-xs text-white">
            {daycareReady}
          </span>
        )}
        {id === 'center' && koWaiting > 0 && (
          <span
            className="ml-1.5 rounded-full bg-red-500 px-1.5 text-xs text-white"
            title="Pokémon K.O. à soigner"
          >
            {koWaiting}
          </span>
        )}
        {id === 'museum' && fossilsReady > 0 && (
          <span className="ml-1.5 rounded-full bg-brand-500 px-1.5 text-xs text-white">
            {fossilsReady}
          </span>
        )}
        {id === 'farm' && berriesReady > 0 && (
          <span className="ml-1.5 rounded-full bg-brand-500 px-1.5 text-xs text-white">
            {berriesReady}
          </span>
        )}
        {id === 'quests' && questsReady > 0 && (
          <span
            className="ml-1.5 rounded-full bg-amber-400 px-1.5 text-xs text-amber-950"
            title="Récompenses de quête à réclamer"
          >
            {questsReady}
          </span>
        )}
        {id === 'shop' && shopNew > 0 && (
          <span className="ml-1.5 rounded-full bg-amber-400 px-1.5 text-xs text-amber-950">
            {shopNew}
          </span>
        )}
        {id === 'pokedex' && ctx && <span className="ml-1.5 text-xs text-slate-400">{caught}</span>}
        {id === 'pokedex' && rewardsReady > 0 && (
          <span
            className="ml-1.5 rounded-full bg-amber-400 px-1.5 text-xs text-amber-950"
            title="Récompenses à réclamer"
          >
            {rewardsReady}
          </span>
        )}
        {id === 'pc' && evolutionsReady > 0 && (
          <span
            className="ml-1.5 rounded-full bg-emerald-500 px-1.5 text-xs text-white"
            title="Pokémon prêts à évoluer"
          >
            {evolutionsReady}
          </span>
        )}
      </span>
    );
  }

  /** Liens du compte : en-tête sur ordinateur, bas du menu burger sur mobile. */
  function accountLinks(className: string) {
    return (
      <>
        {me.user.role === 'admin' && (
          <a className={className} href={import.meta.env.VITE_ADMIN_URL ?? 'http://localhost:5174'}>
            Admin
          </a>
        )}
        <a
          className={`${className} relative`}
          href={CHANGELOG_PATH}
          onClick={(e) => navigate(e, CHANGELOG_PATH)}
        >
          Nouveautés
          {unseenChangelog && (
            <span
              className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-slate-50 dark:ring-slate-950"
              title="Nouvelle mise à jour"
            />
          )}
        </a>
        <a
          className={`${className} ${tab === WIKI_HASH ? 'text-brand-600 dark:text-brand-500' : ''}`}
          href={wikiLink()}
          onClick={() => setMenuOpen(false)}
        >
          Wiki
        </a>
        <button
          className={className}
          onClick={() => {
            setMenuOpen(false);
            setSettingsOpen(true);
          }}
        >
          Réglages
        </button>
        <button className={className} onClick={signOut}>
          Déconnexion
        </button>
      </>
    );
  }

  async function signOut() {
    await authClient.signOut();
    // `clear()` retirerait aussi `['me']` du cache sans prévenir son observateur (App) :
    // l'écran resterait figé. On bascule d'abord `me` à null, puis on vide le reste.
    queryClient.setQueryData(['me'], null);
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-10">
      <header className="hidden flex-wrap items-center justify-between gap-3 py-5 md:flex">
        <div className="flex items-end gap-4">
          <div>
            <p className="text-xs text-slate-500">Dresseur</p>
            <h1 className="text-xl font-bold">{profile.trainerName}</h1>
          </div>
          <p
            className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300"
            title="Poké Dollars"
          >
            {formatMoney(profile.currency)}
          </p>
        </div>
        <div className="flex items-center gap-2">{accountLinks('btn-ghost')}</div>
      </header>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <div className="md:flex md:items-start md:gap-6">
        {/* Mobile : barre avec bouton burger, menu en tiroir depuis la gauche. */}
        <div className="sticky top-0 z-10 -mx-4 mb-6 flex items-center gap-2 border-b border-slate-200 bg-slate-50/90 px-2 py-2 backdrop-blur md:hidden dark:border-slate-800 dark:bg-slate-950/90">
          <button
            className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800"
            onClick={() => setMenuOpen(true)}
            aria-label="Ouvrir le menu"
            aria-expanded={menuOpen}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            {pending && (
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-brand-500 ring-2 ring-slate-50 dark:ring-slate-950" />
            )}
          </button>
          <span className="min-w-0 flex-1 truncate font-semibold">{PAGE_LABELS[tab]}</span>
          <span
            className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-sm font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300"
            title="Poké Dollars"
          >
            {formatMoney(profile.currency)}
          </span>
          <span className="max-w-[35%] shrink-0 truncate font-bold">{profile.trainerName}</span>
        </div>
        {menuOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
            <nav className="absolute inset-y-0 left-0 flex w-64 max-w-[80vw] flex-col gap-0.5 overflow-y-auto bg-slate-50 p-3 shadow-xl dark:bg-slate-950">
              <div className="mb-2 flex items-center justify-between px-3 py-1">
                <span className="text-sm font-semibold text-slate-400">Menu</span>
                <button
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800"
                  onClick={() => setMenuOpen(false)}
                  aria-label="Fermer le menu"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
              {tabLinks()}
              <div className="mt-2 flex flex-col gap-0.5 border-t border-slate-200 pt-2 dark:border-slate-800">
                {accountLinks(
                  'rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-500 hover:bg-slate-200/60 hover:text-slate-900 dark:hover:bg-slate-800/60 dark:hover:text-slate-100',
                )}
              </div>
            </nav>
          </div>
        )}

        {/* Bureau : barre latérale fixe à gauche. */}
        <nav className="sticky top-4 hidden w-48 shrink-0 flex-col gap-0.5 md:flex">
          {tabLinks()}
        </nav>

        <main className="min-w-0 flex-1">
          {!ctx ? (
            <p className="text-slate-500">Chargement…</p>
          ) : (
            // Une erreur dans un onglet n'emporte pas la navigation ; changer d'onglet la réinitialise.
            <ErrorBoundary key={tab}>
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
              {tab === 'leaderboard' && <LeaderboardPage />}
              {tab === WIKI_HASH && <WikiPage ctx={ctx} />}
            </ErrorBoundary>
          )}
        </main>
      </div>

      <footer className="mt-12 space-y-2 text-center text-xs text-slate-400">
        <p>
          <FanDisclaimer /> Données : PokéAPI. Contenu v{ctx?.content.versionId ?? '…'}
        </p>
        <LegalLinks />
      </footer>
    </div>
  );
}
