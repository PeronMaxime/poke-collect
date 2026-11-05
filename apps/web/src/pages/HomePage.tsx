import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { MeResponse, PlayerProfileDto } from '@poke/shared';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useBodyScrollLock, useNow } from '../components/ui';
import { authClient } from '../lib/auth-client';
import { DEX_FORM_SECTIONS, getForm } from '@poke/data';
import { MENU_TABS, normalizeMenu, tabUnlock } from '@poke/content';
import type { MenuTabId as TabId } from '@poke/content';
import { claimableRewardCount, eggsLaid, isTabUnlocked } from '@poke/game-core';
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
  usePlayerProgress,
  usePokedex,
  usePokedexForms,
  usePokemon,
  useQuests,
  useShop,
} from '../lib/game';
import { formatMoney, unlockConditionText } from '../lib/labels';
import { BattlesPage } from './game/BattlesPage';
import { CenterPage } from './game/CenterPage';
import { DaycarePage } from './game/DaycarePage';
import { DungeonsPage } from './game/DungeonsPage';
import { ExpeditionsPage } from './game/ExpeditionsPage';
import { InventoryPage } from './game/InventoryPage';
import { LeaderboardPage } from './game/LeaderboardPage';
import { FarmPage } from './game/FarmPage';
import { GuildPage } from './game/GuildPage';
import { MuseumPage } from './game/MuseumPage';
import { PcPage } from './game/PcPage';
import { PokedexPage } from './game/PokedexPage';
import { QuestsPage } from './game/QuestsPage';
import { RoamerSightingNotice } from './game/RoamerSightingNotice';
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

const DEX_FORM_KINDS = new Set<string | undefined>(DEX_FORM_SECTIONS.map((s) => s.kind));

/** Onglet du menu, ou page du wiki (lien de l'en-tête). */
type PageId = TabId | typeof WIKI_HASH;

const PAGE_LABELS: Record<PageId, string> = { ...TAB_LABELS, [WIKI_HASH]: 'Wiki' };

/** Sections du menu repliées par le joueur (par titre), gardées d'une visite à l'autre. */
const CLOSED_SECTIONS_KEY = 'dexpedition.menuClosedSections';

function readClosedSections(): Set<string> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(CLOSED_SECTIONS_KEY) ?? '[]');
    return new Set(Array.isArray(saved) ? saved.filter((t) => typeof t === 'string') : []);
  } catch {
    return new Set();
  }
}

function saveClosedSections(closed: ReadonlySet<string>) {
  try {
    localStorage.setItem(CLOSED_SECTIONS_KEY, JSON.stringify([...closed]));
  } catch {
    // Stockage indisponible (navigation privée…) : le choix ne dure que le temps de la visite.
  }
}

function tabFromHash(): PageId {
  // `#expeditions/<zone>` : l'onglet, suivi d'une cible propre à la page.
  const hash = window.location.hash.slice(1).split('/')[0] ?? '';
  return hash in PAGE_LABELS ? (hash as PageId) : 'expeditions';
}

/** Coquille du jeu : en-tête, onglets (synchronisés avec l'ancre de l'URL) et pied de page. */
export function HomePage({ me, profile }: { me: MeResponse; profile: PlayerProfileDto }) {
  const queryClient = useQueryClient();
  const ctx = useGameContext();
  const [hashTab, setTab] = useState<PageId>(tabFromHash);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Sections d'onglets réglées dans l'admin (Menu du jeu), repliables une à une.
  const menuSections = useMemo(() => normalizeMenu(ctx?.content.balance.menu), [ctx]);
  const [closedSections, setClosedSections] = useState(readClosedSections);
  // Onglet sur lequel le joueur a replié la section de l'onglet affiché (sinon elle reste ouverte).
  const [collapsedOn, setCollapsedOn] = useState<PageId | null>(null);
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
  const pokedex = usePokedex();
  const progress = usePlayerProgress();

  // Onglets verrouillés (condition réglée dans l'admin). Un onglet où le joueur a encore quelque
  // chose en cours reste ouvert, pour le récupérer ; rien n'est verrouillé avant le chargement.
  const lockedTabs = useMemo(() => {
    const locked = new Set<TabId>();
    if (!ctx || !pokedex.data || !battles.data || !daycare.data || !quests.data) return locked;
    const ongoing: Partial<Record<TabId, boolean>> = {
      daycare: daycare.data.pensions.length > 0 || daycare.data.eggs.length > 0,
      museum: (museum.data?.revivals.length ?? 0) > 0,
      farm: (farm.data?.planted.length ?? 0) > 0,
      dungeons: !!dungeons.data?.active,
      quests: quests.data.quests.some(
        (q) => q.status === 'completed' || (q.status === 'active' && (q.step > 0 || q.count > 0)),
      ),
    };
    for (const { id } of MENU_TABS) {
      if (!ongoing[id] && !isTabUnlocked(ctx, id, progress)) locked.add(id);
    }
    return locked;
  }, [
    ctx,
    progress,
    pokedex.data,
    battles.data,
    daycare.data,
    quests.data,
    museum.data,
    farm.data,
    dungeons.data,
  ]);

  useEffect(() => {
    const onHash = () => {
      setTab(tabFromHash());
      setMenuOpen(false);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Chaque onglet s'ouvre en haut de page, au lieu de reprendre le défilement du précédent.
  // Un onglet verrouillé ne s'ouvre pas, même par son adresse : les expéditions à la place.
  const tab: PageId = hashTab !== WIKI_HASH && lockedTabs.has(hashTab) ? 'expeditions' : hashTab;
  useEffect(() => {
    if (tab === hashTab) return;
    // Remplace l'adresse, puis la relit (sinon l'onglet verrouillé s'ouvrirait à son déblocage).
    window.history.replaceState(null, '', '#expeditions');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }, [tab, hashTab]);

  // La section de l'onglet affiché est dépliée, même repliée auparavant ; le joueur peut la
  // replier tant qu'il reste sur cet onglet.
  const tabSection = menuSections.find((s) => (s.tabs as PageId[]).includes(tab))?.title;
  const sectionOpen = (title: string) =>
    !closedSections.has(title) || (title === tabSection && collapsedOn !== tab);
  function toggleSection(title: string) {
    const open = sectionOpen(title);
    const next = new Set(closedSections);
    if (open) next.add(title);
    else next.delete(title);
    setClosedSections(next);
    saveClosedSections(next);
    if (title === tabSection) setCollapsedOn(open ? tab : null);
  }

  const shownTab = useRef(tab);
  useEffect(() => {
    if (shownTab.current === tab) return;
    shownTab.current = tab;
    window.scrollTo(0, 0);
  }, [tab]);

  useBodyScrollLock(menuOpen);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const now = useNow(5000);
  // Les évolutions possibles ne se recalculent que si les Pokémon, le sac ou le Pokédex changent ;
  // seul le filtre « disponible » (ni occupé, ni K.O.) suit l'horloge.
  const evolvable = useMemo(
    () => pokemon.data?.filter(hasNewEvolution) ?? [],
    [pokemon.data, hasNewEvolution],
  );
  const finished = expeditions.data?.active.filter((e) => Date.parse(e.endsAt) <= now).length ?? 0;
  const dexCatches = useDexCatches();
  const dexForms = usePokedexForms();
  // Même décompte que la page Pokédex : espèces et formes de ses sections (régionales, Méga…).
  const caught =
    dexCatches.caughtSpeciesIds.size +
    (dexForms.data?.filter((f) => DEX_FORM_KINDS.has(getForm(f.formId)?.kind)).length ?? 0);
  // Collections et complétions à réclamer, Pokémon disponibles prêts à évoluer vers une espèce
  // ou forme qui manque encore au Pokédex (même règle que la pastille « Évol. » du PC).
  const rewardsReady = ctx ? claimableRewardCount(ctx, dexCatches, claimed) : 0;
  const evolutionsReady = evolvable.filter((p) => isUsable(p, now)).length;
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
  const center = ctx && pokemon.data ? centerState(ctx, pokemon.data, now, progress) : null;
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

  // Nom d'un onglet verrouillé caché (« ??? ») pour ne rien dévoiler trop tôt ; pendant le
  // chargement de l'avancement, caché aussi s'il a une condition.
  const progressLoaded = !!(pokedex.data && battles.data && daycare.data && quests.data);
  const tabLabel = (id: TabId) =>
    lockedTabs.has(id) ||
    (!progressLoaded && ctx && tabUnlock(ctx.content.balance, id).type !== 'always')
      ? '???'
      : TAB_LABELS[id];

  // Condition d'un onglet verrouillé affichée au toucher ; un toucher ailleurs la referme.
  const [hint, setHint] = useState<TabId | null>(null);
  useEffect(() => {
    if (!hint) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as Element).closest('[data-tab-hint]')) setHint(null);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [hint]);
  // Onglet à condition : rien d'affiché tant que l'avancement du joueur n'est pas chargé.
  const gated = tab !== WIKI_HASH && !!ctx && tabUnlock(ctx.content.balance, tab).type !== 'always';

  /** Liens des onglets, partagés par la barre latérale et le menu mobile. */
  function tabLinks() {
    // Sans le contenu, on ne sait pas encore quels onglets sont verrouillés.
    if (!ctx) return null;
    return menuSections.map(({ title, tabs }, i) => {
      const open = sectionOpen(title);
      // Section repliée : un point signale qu'un de ses onglets attend le joueur.
      const waiting = !open && tabs.some((id) => !lockedTabs.has(id) && tabPending(id));
      return (
        <div
          key={`${i}:${title}`}
          className={`flex flex-col gap-0.5 ${i > 0 ? 'mt-1 border-t border-slate-200 pt-1 dark:border-slate-800' : ''}`}
        >
          <button
            type="button"
            onClick={() => toggleSection(title)}
            aria-expanded={open}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold tracking-wide text-slate-400 uppercase hover:bg-slate-200/60 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800/60 dark:hover:text-slate-300"
          >
            <span className="min-w-0 flex-1 truncate">{title}</span>
            {waiting && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500" />}
            <svg
              viewBox="0 0 24 24"
              className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          <SectionPanel open={open}>
            {/* Onglets légèrement décalés vers la droite, pour les distinguer du titre de section. */}
            <div className="flex flex-col gap-0.5 pl-3">
              {tabs.map((id) =>
                lockedTabs.has(id) ? (
                  // Onglet verrouillé : pas de page, sa condition au survol (au toucher sur mobile).
                  <div key={id} className="group relative" data-tab-hint>
                    <button
                      type="button"
                      // Au toucher seulement : à la souris, le survol suffit et le clic ne fait rien.
                      onPointerUp={(e) =>
                        e.pointerType !== 'mouse' && setHint(hint === id ? null : id)
                      }
                      aria-expanded={hint === id}
                      className="flex w-full cursor-default items-center rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-400 md:py-2 dark:text-slate-600"
                    >
                      {tabLabel(id)}
                      <span className="ml-auto text-xs" aria-label="Verrouillé">
                        🔒
                      </span>
                    </button>
                    <p
                      role="tooltip"
                      className={`absolute top-full left-3 z-20 mt-1 w-56 rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg md:top-1/2 md:left-full md:mt-0 md:ml-2 md:-translate-y-1/2 dark:bg-slate-700 ${
                        hint === id ? 'block' : 'hidden group-hover:block'
                      }`}
                    >
                      {unlockConditionText(ctx, tabUnlock(ctx.content.balance, id)) ?? 'Bientôt'}
                    </p>
                  </div>
                ) : (
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
                    {tabLabel(id)}
                    {tabBadges(id)}
                    {tab === id && (
                      <span className="absolute inset-y-2 left-0 w-0.5 rounded bg-brand-500" />
                    )}
                  </a>
                ),
              )}
            </div>
          </SectionPanel>
        </div>
      );
    });
  }

  /** Onglet où une action attend le joueur (même règle que le point du menu mobile). */
  function tabPending(id: TabId): boolean {
    switch (id) {
      case 'expeditions':
        return finished > 0;
      case 'battles':
        return !!battles.data?.active;
      case 'dungeons':
        return !!dungeons.data?.active;
      case 'daycare':
        return daycareReady > 0;
      case 'center':
        return koWaiting > 0;
      case 'museum':
        return fossilsReady > 0;
      case 'farm':
        return berriesReady > 0;
      case 'quests':
        return questsReady > 0;
      case 'shop':
        return shopNew > 0;
      case 'pokedex':
        return rewardsReady > 0;
      case 'pc':
        return evolutionsReady > 0;
      default:
        return false;
    }
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
      <RoamerSightingNotice ctx={ctx} expeditions={expeditions.data?.active} />

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
          <span className="min-w-0 flex-1 truncate font-semibold">
            {tab === WIKI_HASH ? PAGE_LABELS[tab] : tabLabel(tab)}
          </span>
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
            <nav className="absolute inset-y-0 left-0 flex w-64 max-w-[80vw] flex-col gap-0.5 overflow-y-auto overscroll-contain bg-slate-50 p-3 shadow-xl dark:bg-slate-950">
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
              {gated && !progressLoaded ? (
                <p className="text-slate-500">Chargement…</p>
              ) : (
                <>
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
                </>
              )}
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

/** Durée de l'animation d'ouverture/fermeture d'une section du menu (ms). */
const SECTION_ANIM_MS = 200;

/**
 * Contenu d'une section du menu, déplié ou replié en douceur (hauteur et opacité). Le contenu
 * reste rendu mais inerte une fois replié ; il ne déborde (infobulles des onglets verrouillés)
 * qu'une fois l'ouverture terminée, pour ne pas chevaucher la section suivante pendant l'animation.
 */
function SectionPanel({ open, children }: { open: boolean; children: ReactNode }) {
  // État (ouvert ou non) auquel l'animation s'est achevée.
  const [settled, setSettled] = useState(open);
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(open), open ? SECTION_ANIM_MS : 0);
    return () => window.clearTimeout(t);
  }, [open]);
  return (
    <div
      inert={!open}
      style={{ transitionDuration: `${SECTION_ANIM_MS}ms` }}
      className={`grid transition-[grid-template-rows,opacity] ease-out motion-reduce:transition-none ${
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      }`}
    >
      <div className={`min-h-0 ${open && settled ? 'overflow-visible' : 'overflow-hidden'}`}>
        {children}
      </div>
    </div>
  );
}
