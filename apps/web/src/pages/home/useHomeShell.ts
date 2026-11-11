/**
 * État de la coquille du jeu : onglet affiché (synchronisé avec l'ancre de l'URL), menu mobile,
 * fenêtres des réglages et des widgets, menu et pastilles.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { MeResponse, PlayerProfileDto } from '@poke/shared';
import { useBodyScrollLock } from '../../components/ui';
import { authClient } from '../../lib/auth-client';
import { tabUnlock } from '@poke/content';
import type { MenuTabId as TabId } from '@poke/content';
import { useGameContext } from '../../lib/queries';
import { PRELOADED_PAGES } from '../../features/pages';
import { preloadWhenIdle } from '../../lib/lazy';
import { WIDGETS, useWidgetSettings, widgetTab } from '../../lib/widgets';
import { WIKI_HASH } from '../../features/wiki/wiki';
import { useUnseenChangelog } from '../ChangelogPage';
import { TAB_LABELS, anyPending, tabFromHash } from './menu';
import type { PageId } from './menu';
import { useTabCounts } from './useTabCounts';
import { useMenuSections } from './useMenuSections';

/** Tout ce qu'affichent les pièces de la coquille. */
export type HomeModel = ReturnType<typeof useHomeShell>;

/**
 * Un onglet verrouillé ne s'ouvre pas, même par son adresse : les expéditions à la place. Chaque
 * onglet s'ouvre en haut de page.
 */
export function useHomeShell({ me, profile }: { me: MeResponse; profile: PlayerProfileDto }) {
  const queryClient = useQueryClient();
  const ctx = useGameContext();
  const [hashTab, setTab] = useState<PageId>(tabFromHash);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [widgetsOpen, setWidgetsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const unseenChangelog = useUnseenChangelog();
  const { expeditions, battles, dungeons, lockedTabs, progressLoaded, caught, counts } =
    useTabCounts(ctx);

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
  const { menuSections, sectionOpen, toggleSection } = useMenuSections(ctx, tab);

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

  const pending = anyPending(counts) || unseenChangelog;

  // Nom d'un onglet verrouillé caché (« ??? ») pour ne rien dévoiler trop tôt ; pendant le
  // chargement de l'avancement, caché aussi s'il a une condition.
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

  async function signOut() {
    await authClient.signOut();
    // `clear()` retirerait aussi `['me']` du cache sans prévenir son observateur (App) :
    // l'écran resterait figé. On bascule d'abord `me` à null, puis on vide le reste.
    queryClient.setQueryData(['me'], null);
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
  }

  return {
    me,
    profile,
    ctx,
    tab,
    settingsOpen,
    setSettingsOpen,
    widgetsOpen,
    setWidgetsOpen,
    menuOpen,
    setMenuOpen,
    unseenChangelog,
    lockedTabs,
    progressLoaded,
    counts,
    ...counts,
    caught,
    expeditions,
    battles,
    dungeons,
    menuSections,
    sectionOpen,
    toggleSection,
    hudRef,
    pending,
    tabLabel,
    widgetTabs,
    hint,
    setHint,
    gated,
    signOut,
  };
}
