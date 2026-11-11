import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
} from '../lib/queries';
import { formatMoney, unlockConditionText } from '../lib/labels';
import {
  BattlesPage,
  BuildingsColumn,
  CenterPage,
  DaycarePage,
  DungeonsPage,
  ExpeditionsPage,
  FarmPage,
  GuildPage,
  InventoryPage,
  LeaderboardPage,
  MuseumPage,
  PRELOADED_PAGES,
  PcPage,
  PokedexPage,
  QuestsPage,
  ShopPage,
  TeamsPage,
  TrainerCardPage,
  WikiPage,
} from '../features/pages';
import { WidgetsDialog } from '../features/buildings/WidgetsDialog';
import { preloadWhenIdle } from '../lib/lazy';
import { BUILDING_TABS, WIDGETS, useWidgetSettings, widgetTab } from '../lib/widgets';
import { RoamerSightingNotice } from '../features/expeditions/RoamerSightingNotice';
import { WIKI_HASH, wikiLink } from '../features/wiki/wiki';
import { openChangelog, useUnseenChangelog } from './ChangelogPage';
import { FanDisclaimer, LegalLinks } from './LegalPages';
import { SettingsDialog } from './SettingsDialog';
import { readStoredJson, writeStoredJson } from '../lib/storage';

const TAB_LABELS = Object.fromEntries(MENU_TABS.map((t) => [t.id, t.label])) as Record<
  TabId,
  string
>;

const DEX_FORM_KINDS = new Set<string | undefined>(DEX_FORM_SECTIONS.map((s) => s.kind));

/** Onglet du menu, ou page du wiki (lien de l'en-tête). */
type PageId = TabId | typeof WIKI_HASH;

const PAGE_LABELS: Record<PageId, string> = { ...TAB_LABELS, [WIKI_HASH]: 'Wiki' };

/** Pages découpées en plusieurs fenêtres (une par section) plutôt que tenues dans une seule. */
const WINDOWED_TABS = new Set<PageId>([
  'expeditions',
  'battles',
  'center',
  'daycare',
  'museum',
  'farm',
]);

/** Sections du menu repliées par le joueur (par titre), gardées d'une visite à l'autre. */
const CLOSED_SECTIONS_KEY = 'dexpedition.menuClosedSections';

function readClosedSections(): Set<string> {
  const saved = readStoredJson(CLOSED_SECTIONS_KEY);
  return new Set(Array.isArray(saved) ? saved.filter((t) => typeof t === 'string') : []);
}

const saveClosedSections = (closed: ReadonlySet<string>) =>
  writeStoredJson(CLOSED_SECTIONS_KEY, [...closed]);

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
  const [widgetsOpen, setWidgetsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Sections d'onglets réglées dans l'admin (Menu du jeu), repliables une à une.
  const menuSections = useMemo(() => normalizeMenu(ctx?.content.balance.menu), [ctx]);
  const [closedSections, setClosedSections] = useState(readClosedSections);
  // Onglet sur lequel le joueur a replié la section de l'onglet affiché (sinon elle reste ouverte).
  const [collapsedOn, setCollapsedOn] = useState<PageId | null>(null);
  const unseenChangelog = useUnseenChangelog();
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

  // Hauteur du bandeau sticky du bureau, publiée en `--hud-h` pour que les éléments sticky de la
  // page (menu de gauche…) se calent dessous. 0 sur mobile, où le bandeau est masqué.
  const hudObserver = useRef<ResizeObserver | null>(null);
  const hudRef = useCallback((el: HTMLElement | null) => {
    hudObserver.current?.disconnect();
    hudObserver.current = null;
    if (!el) return;
    const publish = () =>
      document.documentElement.style.setProperty('--hud-h', `${el.offsetHeight}px`);
    publish();
    hudObserver.current = new ResizeObserver(publish);
    hudObserver.current.observe(el);
  }, []);

  // Les autres pages se téléchargent en avance, une fois le jeu affiché.
  useEffect(() => preloadWhenIdle(PRELOADED_PAGES), []);

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
  // Œufs à faire éclore + œufs du sac qu'une place libre de la couveuse attend + pensions où des
  // œufs attendent d'être ramassés.
  const incubatorFree = daycare.data
    ? Math.max(0, daycare.data.maxEggs - daycare.data.eggs.length)
    : 0;
  const daycareReady =
    (daycare.data?.eggs.filter((e) => Date.parse(e.hatchAt) <= now).length ?? 0) +
    Math.min(daycare.data?.bagEggs.length ?? 0, incubatorFree) +
    (ctx && daycare.data
      ? daycare.data.pensions.filter(
          (p) => p.breeds && eggsLaid(ctx, new Date(p.startedAt), new Date(now), p.eggMinutes) > 0,
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

  // Grand écran : les bâtiments affichés en widget dans la colonne de droite (débloqués et non
  // masqués depuis « Widgets ») quittent le menu ; le clic sur le widget ouvre leur page.
  const widgetSettings = useWidgetSettings();
  const widgetTabs = new Set<TabId>(
    progressLoaded
      ? WIDGETS.filter((id) => !widgetSettings.hidden.has(id))
          .map(widgetTab)
          .filter((id) => !lockedTabs.has(id))
      : [],
  );

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
      // Grand écran : section masquée quand tous ses onglets sont des widgets de la colonne.
      // Le menu mobile n'existe pas à cette largeur, la règle ne concerne que la barre latérale.
      const allWidgets = tabs.every((id) => widgetTabs.has(id));
      // Première section affichée en grand écran : pas de séparateur au-dessus.
      const firstOnXl = menuSections
        .slice(0, i)
        .every((s) => s.tabs.every((id) => widgetTabs.has(id)));
      return (
        <div
          key={`${i}:${title}`}
          className={`flex flex-col gap-0.5 ${i > 0 ? 'mt-1 border-t-2 border-dashed border-slate-300 pt-1 dark:border-slate-700' : ''} ${
            allWidgets ? 'xl:hidden' : ''
          } ${i > 0 && firstOnXl ? 'xl:mt-0 xl:border-t-0 xl:pt-0' : ''}`}
        >
          <button
            type="button"
            onClick={() => toggleSection(title)}
            aria-expanded={open}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left font-pixel text-[9px] leading-relaxed tracking-wide text-slate-500 uppercase hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
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
            {/* Onglets précédés de la place du curseur (flèche de l'onglet affiché). */}
            <div className="flex flex-col gap-0.5">
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
                      className="flex w-full cursor-default items-center rounded-md px-2.5 py-2.5 text-left font-medium text-slate-400 md:py-2 dark:text-slate-500"
                    >
                      <MenuCursor shown={false} />
                      {tabLabel(id)}
                      <span className="ml-auto text-xs" aria-label="Verrouillé">
                        🔒
                      </span>
                    </button>
                    <p
                      role="tooltip"
                      className={`absolute top-full left-3 z-20 mt-1 w-56 rounded-md border-2 border-ink bg-slate-900 px-3 py-2 text-xs text-white shadow-lg md:top-1/2 md:left-full md:mt-0 md:ml-3 md:-translate-y-1/2 dark:bg-slate-700 ${
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
                    aria-current={tab === id ? 'page' : undefined}
                    className={`flex items-center rounded-md px-2.5 py-2.5 transition md:py-2 ${
                      widgetTabs.has(id) ? 'xl:hidden' : ''
                    } ${
                      tab === id
                        ? 'bg-selected font-bold text-slate-900 dark:text-slate-100'
                        : 'font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                    }`}
                  >
                    <MenuCursor shown={tab === id} />
                    {tabLabel(id)}
                    {tabBadges(id)}
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
          <span className="ml-1.5 count-badge bg-brand-500 text-white">{finished}</span>
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
          <span className="ml-1.5 count-badge bg-brand-500 text-white">{daycareReady}</span>
        )}
        {id === 'center' && koWaiting > 0 && (
          <span className="ml-1.5 count-badge bg-red-500 text-white" title="Pokémon K.O. à soigner">
            {koWaiting}
          </span>
        )}
        {id === 'museum' && fossilsReady > 0 && (
          <span className="ml-1.5 count-badge bg-brand-500 text-white">{fossilsReady}</span>
        )}
        {id === 'farm' && berriesReady > 0 && (
          <span className="ml-1.5 count-badge bg-brand-500 text-white">{berriesReady}</span>
        )}
        {id === 'quests' && questsReady > 0 && (
          <span
            className="ml-1.5 count-badge bg-[#f8d030] text-[#1a1400]"
            title="Récompenses de quête à réclamer"
          >
            {questsReady}
          </span>
        )}
        {id === 'shop' && shopNew > 0 && (
          <span className="ml-1.5 count-badge bg-[#f8d030] text-[#1a1400]">{shopNew}</span>
        )}
        {id === 'pokedex' && ctx && <span className="ml-1.5 text-xs text-slate-400">{caught}</span>}
        {id === 'pokedex' && rewardsReady > 0 && (
          <span
            className="ml-1.5 count-badge bg-[#f8d030] text-[#1a1400]"
            title="Récompenses à réclamer"
          >
            {rewardsReady}
          </span>
        )}
        {id === 'pc' && evolutionsReady > 0 && (
          <span
            className="ml-1.5 count-badge bg-emerald-500 text-white"
            title="Pokémon prêts à évoluer"
          >
            {evolutionsReady}
          </span>
        )}
      </span>
    );
  }

  /**
   * Liens du compte : en-tête sur ordinateur, bas du menu burger sur mobile. « Widgets » n'est
   * proposé que là où la colonne des widgets s'affiche (bandeau, grand écran).
   */
  function accountLinks(className: string, activeClassName: string, widgetsClassName?: string) {
    return (
      <>
        {me.user.role === 'admin' && (
          <a className={className} href={import.meta.env.VITE_ADMIN_URL ?? 'http://localhost:5174'}>
            Admin
          </a>
        )}
        <button
          className={`${className} relative`}
          onClick={() => {
            setMenuOpen(false);
            openChangelog();
          }}
        >
          Nouveautés
          {unseenChangelog && (
            <span
              className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-ink"
              title="Nouvelle mise à jour"
            />
          )}
        </button>
        <a
          className={`${className} ${tab === WIKI_HASH ? activeClassName : ''}`}
          href={wikiLink()}
          onClick={() => setMenuOpen(false)}
        >
          Wiki
        </a>
        {widgetsClassName !== undefined && (
          <button
            className={`${className} ${widgetsClassName}`}
            onClick={() => setWidgetsOpen(true)}
          >
            Widgets
          </button>
        )}
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
    <div className="pb-10">
      {/* Bureau : bandeau du dresseur sur toute la largeur. */}
      {/* Trois colonnes : infos du dresseur à gauche, titre centré sur la bannière, compte à
          droite. Les colonnes latérales font la même largeur (1fr) pour garder le titre au centre. */}
      <header
        ref={hudRef}
        className="sticky top-0 z-30 hidden grid-cols-[1fr_auto_1fr] items-center gap-x-6 border-b-4 border-brand-500 bg-hud px-6 py-3 text-white md:grid"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <HudPill label="Dresseur">
            <span className="font-bold">{profile.trainerName}</span>
          </HudPill>
          <HudPill label="Argent" title="Poké Dollars">
            <span className="font-bold text-[#f8d030]">{formatMoney(profile.currency)}</span>
          </HudPill>
        </div>
        <a
          href="#expeditions"
          className="font-pixel text-lg text-[#f8d030] [text-shadow:3px_3px_0_#d83828]"
        >
          DEXPEDITION
        </a>
        <nav className="flex flex-wrap items-center justify-end gap-2" aria-label="Compte">
          {accountLinks(
            'cursor-pointer rounded-md border-2 border-hud-line px-3 py-1.5 text-sm text-white transition hover:bg-hud-pill',
            'bg-hud-pill text-[#f8d030]',
            'hidden xl:block',
          )}
        </nav>
      </header>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <WidgetsDialog
        open={widgetsOpen}
        onClose={() => setWidgetsOpen(false)}
        lockedTabs={lockedTabs}
      />
      <RoamerSightingNotice ctx={ctx} expeditions={expeditions.data?.active} />

      <div className="mx-auto max-w-[2200px] px-4 md:flex md:items-start md:gap-5 md:px-6 md:pt-5">
        {/* Mobile : barre avec bouton burger, menu en tiroir depuis la gauche. */}
        <div className="sticky top-0 z-10 -mx-4 mb-4 flex items-center gap-2 border-b-4 border-brand-500 bg-hud px-2 py-2 text-white md:hidden">
          <button
            className="relative rounded-md p-2 text-white hover:bg-hud-pill"
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
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-brand-500 ring-2 ring-hud" />
            )}
          </button>
          <span className="min-w-0 flex-1 truncate font-pixel text-[10px] text-[#f8d030] uppercase">
            {tab === WIKI_HASH ? PAGE_LABELS[tab] : tabLabel(tab)}
          </span>
          <span
            className="shrink-0 rounded-md border-2 border-hud-line bg-hud-pill px-2 py-0.5 text-sm font-bold text-[#f8d030]"
            title="Poké Dollars"
          >
            {formatMoney(profile.currency)}
          </span>
          <span className="max-w-[35%] shrink-0 truncate font-bold">{profile.trainerName}</span>
        </div>
        {menuOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-black/50" onClick={() => setMenuOpen(false)} />
            <nav className="absolute inset-y-0 left-0 flex w-64 max-w-[80vw] flex-col gap-0.5 overflow-y-auto overscroll-contain border-r-4 border-ink bg-win p-3 shadow-xl">
              <div className="mb-2 flex items-center justify-between px-2.5 py-1">
                <span className="font-pixel text-[10px] text-title uppercase">Menu</span>
                <button
                  className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
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
              <div className="mt-2 flex flex-col gap-0.5 border-t-2 border-dashed border-slate-300 pt-2 dark:border-slate-700">
                {accountLinks(
                  'rounded-md px-2.5 py-2.5 text-left font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100',
                  'bg-selected font-bold text-slate-900 dark:text-slate-100',
                )}
              </div>
            </nav>
          </div>
        )}

        {/* Bureau : menu du jeu dans une fenêtre, fixe à gauche (façon menu START). `sticky` crée
            un contexte d'empilement : sans z-index, les infobulles des onglets verrouillés passent
            sous les fenêtres de la page (expéditions en cours…). */}
        <nav className="card sticky top-[calc(var(--hud-h,0px)+1rem)] z-20 hidden w-60 shrink-0 flex-col gap-0.5 p-2.5 md:flex">
          {tabLinks()}
        </nav>

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

/** Affiché le temps que le code d'une page arrive. */
function PageLoading() {
  return <p className="text-slate-600 dark:text-slate-300">Chargement…</p>;
}

/** Pastille du bandeau du dresseur : petit libellé pixel, puis la valeur. */
function HudPill({
  label,
  title,
  children,
}: {
  label: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="flex items-center gap-2.5 rounded-md border-2 border-hud-line bg-hud-pill px-3 py-1.5"
      title={title}
    >
      <span className="font-pixel text-[9px] text-[#b8c8e0] uppercase">{label}</span>
      {children}
    </div>
  );
}

/** Flèche du menu devant l'onglet affiché (place gardée sur les autres, pour l'alignement). */
function MenuCursor({ shown }: { shown: boolean }) {
  return (
    <svg
      viewBox="0 0 4 7"
      width="8"
      height="14"
      shapeRendering="crispEdges"
      aria-hidden
      className={`mr-2 shrink-0 text-brand-500 ${shown ? '' : 'invisible'}`}
    >
      <path d="M0 0h1v1h1v1h1v1h1v1h-1v1h-1v1h-1v1h-1z" fill="currentColor" />
    </svg>
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
