/**
 * Onglets du menu du jeu : libellés, onglet désigné par l'adresse, sections repliées, onglets
 * verrouillés, et ce qui attend le joueur onglet par onglet (pastilles du menu).
 */
import { DEX_FORM_SECTIONS } from '@poke/data';
import { MENU_TABS } from '@poke/content';
import type { MenuTabId as TabId } from '@poke/content';
import { eggsLaid, isTabUnlocked } from '@poke/game-core';
import { WIKI_HASH } from '../../features/wiki/wiki';
import { readStoredJson, writeStoredJson } from '../../lib/storage';
import type { GameContext, PlayerProgress } from '@poke/game-core';
import type {
  DaycareResponse,
  DungeonsResponse,
  FarmResponse,
  MuseumResponse,
  QuestsResponse,
} from '@poke/shared';

/** Nom de chaque onglet du menu. */
export const TAB_LABELS = Object.fromEntries(MENU_TABS.map((t) => [t.id, t.label])) as Record<
  TabId,
  string
>;

/** Sections du Pokédex dont les formes comptent dans son total (régionales, Méga…). */
export const DEX_FORM_KINDS = new Set<string | undefined>(DEX_FORM_SECTIONS.map((s) => s.kind));

/** Onglet du menu, ou page du wiki (lien de l'en-tête). */
export type PageId = TabId | typeof WIKI_HASH;

/** Nom de chaque page, wiki compris. */
export const PAGE_LABELS: Record<PageId, string> = { ...TAB_LABELS, [WIKI_HASH]: 'Wiki' };

/** Pages découpées en plusieurs fenêtres (une par section) plutôt que tenues dans une seule. */
export const WINDOWED_TABS = new Set<PageId>([
  'expeditions',
  'battles',
  'center',
  'daycare',
  'museum',
  'farm',
]);

/** Sections du menu repliées par le joueur (par titre), gardées d'une visite à l'autre. */
const CLOSED_SECTIONS_KEY = 'dexpedition.menuClosedSections';

/** Sections repliées enregistrées ; rien (tout déplié) si le navigateur n'en garde pas. */
export function readClosedSections(): Set<string> {
  const saved = readStoredJson(CLOSED_SECTIONS_KEY);
  return new Set(Array.isArray(saved) ? saved.filter((t) => typeof t === 'string') : []);
}

/** Enregistre les sections repliées. */
export const saveClosedSections = (closed: ReadonlySet<string>) =>
  writeStoredJson(CLOSED_SECTIONS_KEY, [...closed]);

/** Onglet désigné par l'adresse ; les expéditions si elle n'en désigne aucun. */
export function tabFromHash(): PageId {
  // `#expeditions/<zone>` : l'onglet, suivi d'une cible propre à la page.
  const hash = window.location.hash.slice(1).split('/')[0] ?? '';
  return hash in PAGE_LABELS ? (hash as PageId) : 'expeditions';
}

/** Données du joueur dont dépend le verrouillage des onglets (absentes tant qu'elles chargent). */
interface LockData {
  pokedex: unknown;
  battles: unknown;
  daycare: DaycareResponse | undefined;
  quests: QuestsResponse | undefined;
  museum: MuseumResponse | undefined;
  farm: FarmResponse | undefined;
  dungeons: DungeonsResponse | undefined;
}

/**
 * Onglets verrouillés (condition réglée dans l'admin). Un onglet où le joueur a encore quelque
 * chose en cours reste ouvert, pour le récupérer ; rien n'est verrouillé avant le chargement.
 */
export function lockedTabsOf(
  ctx: GameContext | undefined,
  progress: PlayerProgress,
  data: LockData,
): Set<TabId> {
  const locked = new Set<TabId>();
  if (!ctx || !data.pokedex || !data.battles || !data.daycare || !data.quests) return locked;
  const ongoing: Partial<Record<TabId, boolean>> = {
    daycare: data.daycare.pensions.length > 0 || data.daycare.eggs.length > 0,
    museum: (data.museum?.revivals.length ?? 0) > 0,
    farm: (data.farm?.planted.length ?? 0) > 0,
    dungeons: !!data.dungeons?.active,
    quests: data.quests.quests.some(
      (q) => q.status === 'completed' || (q.status === 'active' && (q.step > 0 || q.count > 0)),
    ),
  };
  for (const { id } of MENU_TABS) {
    if (!ongoing[id] && !isTabUnlocked(ctx, id, progress)) locked.add(id);
  }
  return locked;
}

/**
 * Œufs à faire éclore, œufs du sac qu'une place libre de la couveuse attend, et pensions où des
 * œufs attendent d'être ramassés.
 */
export function daycareReadyCount(
  ctx: GameContext | undefined,
  daycare: DaycareResponse | undefined,
  now: number,
): number {
  const incubatorFree = daycare ? Math.max(0, daycare.maxEggs - daycare.eggs.length) : 0;
  return (
    (daycare?.eggs.filter((e) => Date.parse(e.hatchAt) <= now).length ?? 0) +
    Math.min(daycare?.bagEggs.length ?? 0, incubatorFree) +
    (ctx && daycare
      ? daycare.pensions.filter(
          (p) => p.breeds && eggsLaid(ctx, new Date(p.startedAt), new Date(now), p.eggMinutes) > 0,
        ).length
      : 0)
  );
}

/** Ce qui attend le joueur, onglet par onglet (nombres de choses prêtes, combat en cours). */
export interface TabCounts {
  finished: number;
  battleActive: boolean;
  dungeonActive: boolean;
  daycareReady: number;
  koWaiting: number;
  fossilsReady: number;
  berriesReady: number;
  questsReady: number;
  shopNew: number;
  rewardsReady: number;
  evolutionsReady: number;
}

/** Onglet où une action attend le joueur (même règle que le point du menu mobile). */
export function tabPending(id: TabId, c: TabCounts): boolean {
  switch (id) {
    case 'expeditions':
      return c.finished > 0;
    case 'battles':
      return c.battleActive;
    case 'dungeons':
      return c.dungeonActive;
    case 'daycare':
      return c.daycareReady > 0;
    case 'center':
      return c.koWaiting > 0;
    case 'museum':
      return c.fossilsReady > 0;
    case 'farm':
      return c.berriesReady > 0;
    case 'quests':
      return c.questsReady > 0;
    case 'shop':
      return c.shopNew > 0;
    case 'pokedex':
      return c.rewardsReady > 0;
    case 'pc':
      return c.evolutionsReady > 0;
    default:
      return false;
  }
}

/** Une action attend le joueur quelque part (point sur le bouton du menu mobile). */
export function anyPending(c: TabCounts): boolean {
  return (
    c.finished +
      c.daycareReady +
      c.fossilsReady +
      c.berriesReady +
      c.koWaiting +
      c.questsReady +
      c.shopNew +
      c.rewardsReady +
      c.evolutionsReady >
      0 ||
    c.dungeonActive ||
    c.battleActive
  );
}
