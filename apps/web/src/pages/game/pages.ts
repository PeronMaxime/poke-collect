import { lazyPage } from '../../lib/lazy';

/**
 * Les pages du jeu, une par onglet, chargées à la demande (voir `lib/lazy.ts`). La coquille
 * (`HomePage`) n'importe que ce fichier : aucun écran n'est dans le code chargé à l'ouverture.
 */

export const ExpeditionsPage = lazyPage(() =>
  import('./ExpeditionsPage').then((m) => m.ExpeditionsPage),
);
export const BattlesPage = lazyPage(() => import('./BattlesPage').then((m) => m.BattlesPage));
export const DungeonsPage = lazyPage(() => import('./DungeonsPage').then((m) => m.DungeonsPage));
export const CenterPage = lazyPage(() => import('./CenterPage').then((m) => m.CenterPage));
export const DaycarePage = lazyPage(() => import('./DaycarePage').then((m) => m.DaycarePage));
export const MuseumPage = lazyPage(() => import('./MuseumPage').then((m) => m.MuseumPage));
export const FarmPage = lazyPage(() => import('./FarmPage').then((m) => m.FarmPage));
export const QuestsPage = lazyPage(() => import('./QuestsPage').then((m) => m.QuestsPage));
export const ShopPage = lazyPage(() => import('./ShopPage').then((m) => m.ShopPage));
export const PcPage = lazyPage(() => import('./PcPage').then((m) => m.PcPage));
export const TeamsPage = lazyPage(() => import('./TeamsPage').then((m) => m.TeamsPage));
export const PokedexPage = lazyPage(() => import('./PokedexPage').then((m) => m.PokedexPage));
export const InventoryPage = lazyPage(() => import('./InventoryPage').then((m) => m.InventoryPage));
export const TrainerCardPage = lazyPage(() =>
  import('./TrainerCardPage').then((m) => m.TrainerCardPage),
);
export const GuildPage = lazyPage(() => import('./GuildPage').then((m) => m.GuildPage));
export const LeaderboardPage = lazyPage(() =>
  import('./LeaderboardPage').then((m) => m.LeaderboardPage),
);
export const WikiPage = lazyPage(() => import('./WikiPage').then((m) => m.WikiPage));

/** Colonne des bâtiments (grand écran seulement). */
export const BuildingsColumn = lazyPage(() =>
  import('./BuildingsColumn').then((m) => m.BuildingsColumn),
);

/**
 * Pages téléchargées en avance, une fois le jeu affiché : changer d'onglet reste immédiat. Le
 * wiki, rarement ouvert et volumineux, attend qu'on le demande.
 */
export const PRELOADED_PAGES = [
  ExpeditionsPage,
  PcPage,
  BattlesPage,
  DungeonsPage,
  CenterPage,
  DaycarePage,
  MuseumPage,
  FarmPage,
  QuestsPage,
  ShopPage,
  TeamsPage,
  PokedexPage,
  InventoryPage,
  TrainerCardPage,
  GuildPage,
  LeaderboardPage,
];
